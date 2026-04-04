// ============================================================
// travelRuleService.ts — Travel Rule E2E 참조 시스템
//
// 아키텍처: "열쇠 분산 참조 모델"
//
// 1. 송신 시:
//    - AES-256-GCM으로 TR 데이터 암호화
//    - 복호화 키를 송신자/수신자 주소 기반으로 2조각 파생
//    - reference_id를 EVM calldata에 삽입 (원자성)
//    - 서버에 암호문 + 키 조각 저장
//
// 2. 조회 시 (수신자):
//    - reference_id 제출
//    - 서버가 서명 챌린지 발급
//    - 수신자가 지갑 서명 → ecrecover → 주소 검증
//    - key_B 반환 → 클라이언트에서 복호화
//
// 보안 속성:
//    - 제3자: ref_id 알아도 서명 없이 접근 불가
//    - 서버: key_A + key_B 모두 보유하나 server_secret 없인 파생 불가
//    - 규제기관: 마스터키(server_secret)로 복호화 가능
// ============================================================

import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';

// ── 상수 ─────────────────────────────────────────────────────
export const TRAVEL_RULE_THRESHOLD_KRW = 1_000_000;
export const TRAVEL_RULE_THRESHOLD_USD = 700;
export const TR_CALLDATA_PREFIX        = '0x54520000'; // 'TR\x00\x00' — Travel Rule 식별자

// ── 타입 ─────────────────────────────────────────────────────
export type TransferPurpose =
  | 'SELF_TRANSFER'
  | 'PURCHASE'
  | 'INVESTMENT'
  | 'LOAN_REPAYMENT'
  | 'DONATION'
  | 'OTHER';

export const PURPOSE_LABELS: Record<TransferPurpose, string> = {
  SELF_TRANSFER:  '본인 지갑 이전',
  PURCHASE:       '상품·서비스 구매',
  INVESTMENT:     '투자',
  LOAN_REPAYMENT: '차입금 상환',
  DONATION:       '기부',
  OTHER:          '기타',
};

export interface TravelRulePayload {
  // 송신인
  originatorAddress:  string;
  originatorName?:    string;
  originatorUserId:   string;

  // 수취인
  beneficiaryAddress: string;
  beneficiaryName?:   string;
  beneficiaryVasp?:   string;
  isSelfTransfer:     boolean;

  // 전송
  assetSymbol:  string;
  assetNetwork: string;
  amountToken:  number;
  amountUsd?:   number;
  amountKrw?:   number;

  // 목적
  transferPurpose: TransferPurpose;
  purposeDetail?:  string;

  // 메타
  createdAt: number;
}

export interface TravelRuleRecord {
  referenceId:   string;
  ciphertext:    string; // hex
  iv:            string; // hex
  keyAHash:      string; // KECCAK256(sender_addr + ref_id) — 검증용
  keyBHash:      string; // KECCAK256(recv_addr + ref_id)  — 검증용
  // 실제 키 조각은 Edge Function에서 server_secret으로 파생 (클라이언트에 노출 안 함)
}

// ── 임계값 ────────────────────────────────────────────────────
export function requiresTravelRule(amountKrw: number): boolean {
  return amountKrw >= TRAVEL_RULE_THRESHOLD_KRW;
}

export function usdToKrw(usd: number, rate = 1450): number {
  return Math.floor(usd * rate);
}

// ── Reference ID 생성 ────────────────────────────────────────
export function generateReferenceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── EVM Calldata 인코딩 ──────────────────────────────────────
// native transfer data: TR prefix(4) + referenceId(16bytes) = 20 bytes
// gas 비용: 약 320 gas (non-zero bytes 16 * 16 + zero bytes * 4)
export function encodeReferenceIdCalldata(referenceId: string): string {
  // TR\x00\x00 + 16 bytes ref_id = 20 bytes total
  return TR_CALLDATA_PREFIX + referenceId;
}

// calldata에서 referenceId 파싱
export function decodeReferenceIdFromCalldata(data: string): string | null {
  if (!data.startsWith(TR_CALLDATA_PREFIX)) return null;
  return data.slice(TR_CALLDATA_PREFIX.length, TR_CALLDATA_PREFIX.length + 32);
}

// ── AES-256-GCM 암호화 ───────────────────────────────────────
function asBS(buf: Uint8Array): BufferSource {
  return buf as unknown as BufferSource;
}

async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportAESKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

async function importAESKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBS(keyBytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBS(iv) }, key, enc.encode(plaintext));
  return {
    iv:         buf2hex(iv),
    ciphertext: buf2hex(new Uint8Array(buf)),
  };
}

async function aesDecrypt(keyBytes: Uint8Array, iv: string, ciphertext: string): Promise<string> {
  const key = await importAESKey(keyBytes);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBS(hex2buf(iv)) },
    key,
    asBS(hex2buf(ciphertext)),
  );
  return new TextDecoder().decode(buf);
}

// ── 키 조각 파생 (클라이언트 측) ────────────────────────────
// key_A_check = KECCAK256(senderAddr + refId) — 서버 검증용 해시
// key_B_check = KECCAK256(receiverAddr + refId) — 서버 검증용 해시
// 실제 AES 키는 서버가 server_secret으로 파생해서 보관
export function deriveKeyHash(address: string, referenceId: string): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(address.toLowerCase() + ':' + referenceId)
  );
}

// ── 암호화된 TR 데이터 패키징 ────────────────────────────────
export interface EncryptedTRPackage {
  referenceId:    string;
  ciphertext:     string;
  iv:             string;
  keyACheck:      string; // 송신자 검증용 해시
  keyBCheck:      string; // 수신자 검증용 해시
  aesKeyHex:      string; // 서버로 전송할 AES 키 (서버에서만 보관)
}

export async function encryptTravelRuleData(
  payload:           TravelRulePayload,
  referenceId:       string,
): Promise<EncryptedTRPackage> {
  // AES-256-GCM 키 생성
  const aesKey     = await generateAESKey();
  const aesKeyBytes = await exportAESKey(aesKey);

  // 데이터 암호화
  const { ciphertext, iv } = await aesEncrypt(aesKey, JSON.stringify(payload));

  // 키 검증 해시 생성 (주소 소유권 증명용)
  const keyACheck = deriveKeyHash(payload.originatorAddress,  referenceId);
  const keyBCheck = deriveKeyHash(payload.beneficiaryAddress, referenceId);

  return {
    referenceId,
    ciphertext,
    iv,
    keyACheck,
    keyBCheck,
    aesKeyHex: buf2hex(aesKeyBytes), // 서버로 전송 (HTTPS)
  };
}

// ── Supabase 저장 (Edge Function 경유) ──────────────────────
export async function saveTravelRulePackage(
  pkg:       EncryptedTRPackage,
  txHash?:   string,
  chain?:    string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('travel-rule-store', {
    body: {
      reference_id:  pkg.referenceId,
      ciphertext:    pkg.ciphertext,
      iv:            pkg.iv,
      key_a_check:   pkg.keyACheck,
      key_b_check:   pkg.keyBCheck,
      aes_key:       pkg.aesKeyHex, // 서버가 server_secret으로 재암호화 후 보관
      tx_hash:       txHash || null,
      chain:         chain || 'EVM',
    },
  });
  if (error) throw new Error(`Travel Rule 저장 실패: ${error.message}`);
}

// tx_hash 업데이트 (전송 완료 후)
export async function updateTravelRuleTxHash(
  referenceId: string,
  txHash:      string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('travel-rule-store', {
    body: { reference_id: referenceId, tx_hash: txHash, action: 'update_tx' },
  });
  if (error) console.error('tx_hash 업데이트 실패 (non-blocking):', error);
}

// ── 조회 (수신자 서명 인증) ──────────────────────────────────
export interface TRRetrieveResult {
  payload:   TravelRulePayload;
  txHash?:   string;
  chain?:    string;
  createdAt: string;
}

// Step 1: 챌린지 요청
export async function requestTRChallenge(referenceId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('travel-rule-challenge', {
    body: { reference_id: referenceId, action: 'request' },
  });
  if (error || !data?.challenge) throw new Error('챌린지 요청 실패');
  return data.challenge as string;
}

// Step 2: 서명 제출 → 복호화된 데이터 반환
export async function submitTRSignature(
  referenceId: string,
  challenge:   string,
  signature:   string,
  signerAddress: string,
): Promise<TRRetrieveResult> {
  const { data, error } = await supabase.functions.invoke('travel-rule-challenge', {
    body: {
      reference_id:   referenceId,
      action:         'verify',
      challenge,
      signature,
      signer_address: signerAddress,
    },
  });
  if (error || !data?.aes_key) throw new Error('인증 실패');

  // 서버에서 받은 AES 키로 복호화
  const aesKeyBytes = hex2buf(data.aes_key);
  const { ciphertext, iv } = data;
  const plaintext = await aesDecrypt(aesKeyBytes, iv, ciphertext);
  return {
    payload:   JSON.parse(plaintext) as TravelRulePayload,
    txHash:    data.tx_hash,
    chain:     data.chain,
    createdAt: data.created_at,
  };
}

// ── 유효성 검사 ──────────────────────────────────────────────
export function validateTRPayload(data: Partial<TravelRulePayload>): {
  valid: boolean; errors: string[];
} {
  const errors: string[] = [];
  if (!data.isSelfTransfer && !data.beneficiaryName?.trim())
    errors.push('수취인 이름을 입력해주세요');
  if (!data.transferPurpose)
    errors.push('전송 목적을 선택해주세요');
  if (data.transferPurpose === 'OTHER' && !data.purposeDetail?.trim())
    errors.push('기타 목적을 입력해주세요');
  return { valid: errors.length === 0, errors };
}

// ── 알려진 VASP 목록 ─────────────────────────────────────────
export function getKnownVasps() {
  return [
    { id: 'upbit',    name: '업비트 (Dunamu)' },
    { id: 'bithumb',  name: '빗썸 (Bithumb Korea)' },
    { id: 'coinone',  name: '코인원' },
    { id: 'korbit',   name: '코빗' },
    { id: 'binance',  name: 'Binance' },
    { id: 'coinbase', name: 'Coinbase' },
    { id: 'okx',      name: 'OKX' },
    { id: 'bybit',    name: 'Bybit' },
    { id: 'kraken',   name: 'Kraken' },
  ];
}

// ── 유틸 ─────────────────────────────────────────────────────
function buf2hex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hex2buf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++)
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

// ── 기간별 TR 내역 조회 (Edge Function 경유) ─────────────────
export interface TRHistoryItem {
  referenceId:  string;
  chain:        string;
  txHash?:      string;
  status:       string;
  createdAt:    string;
  // 복호화된 payload는 별도 서명 인증 후 획득
}

export async function getTRHistory(
  signerAddress: string,
  fromDate?: string,  // ISO string
  toDate?:   string,
): Promise<TRHistoryItem[]> {
  // key_a_check 또는 key_b_check에 해당하는 레코드 조회
  // 단, 복호화 없이 메타데이터만 반환 (payload는 별도 서명 필요)
  const { data, error } = await supabase
    .from('travel_rule_records')
    .select('reference_id, chain, tx_hash, status, created_at, key_a_check, key_b_check')
    .or(
      `key_a_check.eq.${deriveKeyHash(signerAddress, '*')},` +
      `key_b_check.eq.${deriveKeyHash(signerAddress, '*')}`
    )
    .gte('created_at', fromDate || '2020-01-01T00:00:00Z')
    .lte('created_at', toDate   || new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(r => ({
    referenceId: r.reference_id,
    chain:       r.chain,
    txHash:      r.tx_hash,
    status:      r.status,
    createdAt:   r.created_at,
  }));
}

// ── CSV 생성 ──────────────────────────────────────────────────
export function generateTRCsv(records: TravelRulePayload[], meta: {
  txHash?: string; createdAt?: string; referenceId?: string;
}[]): string {
  const headers = [
    '날짜', '레퍼런스ID', 'Tx Hash', '체인',
    '송신인', '수신인', '수신 VASP', '자산', '수량',
    'KRW 금액', '전송 목적'
  ];

  const rows = records.map((p, i) => [
    meta[i]?.createdAt ? new Date(meta[i].createdAt!).toLocaleDateString('ko-KR') : '',
    meta[i]?.referenceId || '',
    meta[i]?.txHash || '',
    p.assetNetwork,
    p.originatorName || p.originatorAddress.slice(0,10) + '...',
    p.isSelfTransfer ? '본인' : (p.beneficiaryName || p.beneficiaryAddress.slice(0,10) + '...'),
    p.beneficiaryVasp || '개인 지갑',
    p.assetSymbol,
    p.amountToken.toString(),
    p.amountKrw ? Math.floor(p.amountKrw).toLocaleString() : '',
    PURPOSE_LABELS[p.transferPurpose] + (p.purposeDetail ? ` (${p.purposeDetail})` : ''),
  ]);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [
    '﻿', // BOM for Excel
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(','))
  ].join('\\n');
}

// ── PDF HTML 생성 ────────────────────────────────────────────
export function generateTRPdfHtml(
  payload:     TravelRulePayload,
  referenceId: string,
  txHash?:     string,
  createdAt?:  string,
  purpose:     'tax' | 'exchange' = 'tax',
): string {
  const date = createdAt
    ? new Date(createdAt).toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' })
    : new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });

  const title = purpose === 'tax'
    ? '가상자산 거래 소명 확인서 (과세 신고용)'
    : '가상자산 출금 소명 확인서 (거래소 제출용)';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
  body { color: #1a1a1a; font-size: 12pt; line-height: 1.6; }
  h1 { font-size: 16pt; text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 24px; }
  h2 { font-size: 12pt; background: #f5f5f5; padding: 6px 10px; margin: 20px 0 8px; border-left: 4px solid #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  td { padding: 8px 10px; border: 1px solid #ddd; vertical-align: top; }
  td:first-child { width: 35%; background: #fafafa; font-weight: bold; }
  .ref { font-family: monospace; font-size: 10pt; color: #444; word-break: break-all; }
  .footer { margin-top: 40px; font-size: 10pt; color: #666; border-top: 1px solid #ccc; padding-top: 16px; }
  .stamp { float: right; border: 2px solid #333; padding: 8px 16px; text-align: center; font-weight: bold; }
  @media print { button { display: none; } }
</style>
</head>
<body>
<h1>${title}</h1>

<h2>거래 개요</h2>
<table>
  <tr><td>발급일</td><td>${date}</td></tr>
  <tr><td>레퍼런스 ID</td><td class="ref">${referenceId}</td></tr>
  ${txHash ? `<tr><td>트랜잭션 해시</td><td class="ref">${txHash}</td></tr>` : ''}
  <tr><td>블록체인 네트워크</td><td>${payload.assetNetwork}</td></tr>
  <tr><td>가상자산 종류</td><td>${payload.assetSymbol}</td></tr>
  <tr><td>전송 수량</td><td>${payload.amountToken} ${payload.assetSymbol}</td></tr>
  ${payload.amountKrw ? `<tr><td>원화 환산 금액</td><td>₩${Math.floor(payload.amountKrw).toLocaleString()}</td></tr>` : ''}
</table>

<h2>송신인 정보 (Originator)</h2>
<table>
  <tr><td>성명</td><td>${payload.originatorName || '—'}</td></tr>
  <tr><td>가상자산 주소</td><td class="ref">${payload.originatorAddress}</td></tr>
  <tr><td>VASP</td><td>took</td></tr>
</table>

<h2>수취인 정보 (Beneficiary)</h2>
<table>
  <tr><td>성명</td><td>${payload.isSelfTransfer ? '본인 (자기 지갑 이전)' : (payload.beneficiaryName || '—')}</td></tr>
  <tr><td>가상자산 주소</td><td class="ref">${payload.beneficiaryAddress}</td></tr>
  <tr><td>VASP</td><td>${payload.beneficiaryVasp || '개인 지갑 / 알 수 없음'}</td></tr>
</table>

<h2>전송 목적</h2>
<table>
  <tr><td>목적 구분</td><td>${PURPOSE_LABELS[payload.transferPurpose]}</td></tr>
  ${payload.purposeDetail ? `<tr><td>상세 내용</td><td>${payload.purposeDetail}</td></tr>` : ''}
</table>

${purpose === 'exchange' ? `
<h2>소명 내용</h2>
<table>
  <tr><td>소명 사유</td><td>${
    payload.isSelfTransfer
      ? '본인 소유의 개인 가상자산 지갑 간 이전으로, 외부 거래가 아닌 자산 관리 목적의 이동입니다.'
      : `${PURPOSE_LABELS[payload.transferPurpose]} 목적으로 ${payload.beneficiaryName || '수취인'}에게 전송한 거래입니다.`
  }</td></tr>
</table>` : ''}

<div class="footer">
  <div class="stamp">took<br/>전자 확인</div>
  <p>본 확인서는 took 비수탁 지갑 서비스의 Travel Rule 시스템에 의해 자동 생성된 문서입니다.</p>
  <p>특정금융정보법 제5조의2에 따른 가상자산 이전 기록이며, 당사 서버에 암호화 보관됩니다.</p>
  <p>문의: support@xlot.io</p>
</div>
</body>
</html>`;
}