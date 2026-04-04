// ============================================================
// shareVaultService.ts — Triple-Shield Share 암호화/저장/조회
//
// Share A: 비밀번호 → PBKDF2(200k iter) → AES-GCM → Supabase
// Share B: 휴대폰 OTP 세션 토큰 → HKDF → AES-GCM → Supabase
// Share C: 이메일 OTP 세션 토큰 → HKDF → AES-GCM → Supabase
//
// v2: localStorage 완전 제거. 셋 다 Supabase 저장.
//
// Trust Boundary:
//   각 share의 복호화 키는 사용자 인증 토큰에서만 파생.
//   서버는 암호문만 보관. 단독 복호화 불가.
//
// 복구 경로 (2-of-3):
//   A+B: 비밀번호 + 휴대폰
//   A+C: 비밀번호 + 이메일
//   B+C: 휴대폰 + 이메일
// ============================================================

import { supabase } from '../lib/supabase';
import type { EncodedShare } from './sssService';

const PBKDF2_ITER = 200_000;
const SALT_LEN    = 32;
const IV_LEN      = 12;

// ── BufferSource 캐스팅 헬퍼 ─────────────────────────────────
function asBS(buf: Uint8Array): BufferSource {
  return buf as unknown as BufferSource;
}

// ── Web Crypto 헬퍼 ──────────────────────────────────────────

async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBS(salt), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  );
}

async function deriveKeyFromToken(
  token: string,
  salt: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = await crypto.subtle.importKey(
    'raw', enc.encode(token), 'HKDF', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: asBS(salt), info: enc.encode(info) },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  );
}

// ── 결정론적 키 파생 ─────────────────────────────────────────
// OTP는 본인 확인용, 실제 암호화 키는 식별자(전화번호/이메일)에서 파생
// → 같은 번호/이메일이면 언제나 동일한 키 → 다른 기기/세션에서도 복원 가능

const DETERMINISTIC_SALT = 'xLOT-vault-v1-deterministic-salt-2026';

export async function deriveShareKeyFromPhone(phone: string): Promise<string> {
  // 전화번호 정규화 (+82 형식)
  const normalized = phone.replace(/[\s\-]/g, '').replace(/^0/, '+82');
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(normalized), 'HKDF', false, ['deriveKey'],
  );
  const derived = await crypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: enc.encode(DETERMINISTIC_SALT),
      info: enc.encode('xLOT-share-B-phone-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', derived);
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2,'0')).join('');
}

export async function deriveShareKeyFromEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(normalized), 'HKDF', false, ['deriveKey'],
  );
  const derived = await crypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: enc.encode(DETERMINISTIC_SALT),
      info: enc.encode('xLOT-share-C-email-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', derived);
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function aesEncrypt(key: CryptoKey, plaintext: string) {
  const iv  = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBS(iv) }, key, enc.encode(plaintext));
  return { iv: buf2hex(iv), ciphertext: buf2hex(new Uint8Array(buf)) };
}

async function aesDecrypt(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBS(hex2buf(iv)) },
    key,
    asBS(hex2buf(ciphertext)),
  );
  return new TextDecoder().decode(buf);
}

// ── Share A: 비밀번호 기반 ────────────────────────────────────

export async function encryptShareA(share: EncodedShare, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key  = await deriveKeyFromPassword(password, salt);
  const { iv, ciphertext } = await aesEncrypt(key, JSON.stringify(share));
  return { iv, ciphertext, salt: buf2hex(salt) };
}

export async function decryptShareA(
  enc: { iv: string; ciphertext: string; salt: string },
  password: string,
): Promise<EncodedShare> {
  const key = await deriveKeyFromPassword(password, hex2buf(enc.salt));
  return JSON.parse(await aesDecrypt(key, enc.iv, enc.ciphertext));
}

// ── Share B: 휴대폰 OTP 세션 토큰 기반 ───────────────────────

export async function encryptShareB(share: EncodedShare, otpToken: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key  = await deriveKeyFromToken(otpToken, salt, 'xLOT-share-B-v1');
  const { iv, ciphertext } = await aesEncrypt(key, JSON.stringify(share));
  return { iv, ciphertext, salt: buf2hex(salt) };
}

export async function decryptShareB(
  enc: { iv: string; ciphertext: string; salt: string },
  otpToken: string,
): Promise<EncodedShare> {
  const key = await deriveKeyFromToken(otpToken, hex2buf(enc.salt), 'xLOT-share-B-v1');
  return JSON.parse(await aesDecrypt(key, enc.iv, enc.ciphertext));
}

// ── Share C: 이메일 OTP 세션 토큰 기반 ───────────────────────

export async function encryptShareC(share: EncodedShare, emailToken: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key  = await deriveKeyFromToken(emailToken, salt, 'xLOT-share-C-v1');
  const { iv, ciphertext } = await aesEncrypt(key, JSON.stringify(share));
  return { iv, ciphertext, salt: buf2hex(salt) };
}

export async function decryptShareC(
  enc: { iv: string; ciphertext: string; salt: string },
  emailToken: string,
): Promise<EncodedShare> {
  const key = await deriveKeyFromToken(emailToken, hex2buf(enc.salt), 'xLOT-share-C-v1');
  return JSON.parse(await aesDecrypt(key, enc.iv, enc.ciphertext));
}

// ── Supabase DB 저장/조회 ────────────────────────────────────

export interface VaultRecord {
  user_id:            string;
  wallet_address:     string;
  share_a_iv:         string;
  share_a_ciphertext: string;
  share_a_salt:       string;
  share_b_iv:         string;
  share_b_ciphertext: string;
  share_b_salt:       string;
  share_c_iv:         string;
  share_c_ciphertext: string;
  share_c_salt:       string;
  evm_address:        string;
  sol_address?:       string;
  created_at?:        string;
  key_share_a_iv?:         string;
  key_share_a_ciphertext?: string;
  key_share_a_salt?:       string;
  key_share_b_iv?:         string;
  key_share_b_ciphertext?: string;
  key_share_b_salt?:       string;
  key_share_c_iv?:         string;
  key_share_c_ciphertext?: string;
  key_share_c_salt?:       string;
}

export async function saveVaultToSupabase(
  userId:      string,
  walletAddr:  string,
  shareAEnc:   { iv: string; ciphertext: string; salt: string },
  shareBEnc:   { iv: string; ciphertext: string; salt: string },
  shareCEnc:   { iv: string; ciphertext: string; salt: string },
  addresses:   { evm: string; sol?: string },
): Promise<void> {
  const { error } = await supabase.from('xlot_sss_vaults').upsert({
    user_id:            userId,
    wallet_address:     walletAddr.toLowerCase(),
    share_a_iv:         shareAEnc.iv,
    share_a_ciphertext: shareAEnc.ciphertext,
    share_a_salt:       shareAEnc.salt,
    share_b_iv:         shareBEnc.iv,
    share_b_ciphertext: shareBEnc.ciphertext,
    share_b_salt:       shareBEnc.salt,
    share_c_iv:         shareCEnc.iv,
    share_c_ciphertext: shareCEnc.ciphertext,
    share_c_salt:       shareCEnc.salt,
    evm_address:        addresses.evm.toLowerCase(),
    sol_address:        addresses.sol || null,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id,wallet_address' });

  if (error) throw new Error(`Vault 저장 실패: ${error.message}`);
}

export async function loadVaultFromSupabase(
  userId:        string,
  walletAddress: string,
): Promise<VaultRecord | null> {
  const { data, error } = await supabase
    .from('xlot_sss_vaults')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Vault 조회 실패: ${error.message}`);
  return data as VaultRecord | null;
}

export async function getUserVaults(userId: string): Promise<VaultRecord[]> {
  const { data, error } = await supabase
    .from('xlot_sss_vaults')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as VaultRecord[];
}

// ── 비밀번호 강도 검증 ────────────────────────────────────────

export function validatePassword(password: string): {
  valid: boolean;
  score: number;
  feedback: string;
} {
  let score = 0;
  const issues: string[] = [];

  if (password.length >= 8) score++;
  else issues.push('8자 이상 필요');

  if (password.length >= 12) score++;

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else issues.push('대소문자 혼합 필요');

  const hasNumber  = /[0-9]/.test(password);
  if (hasNumber) score++;
  else issues.push('숫자 필요');

  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  if (!hasSpecial) issues.push('특수문자 필요');

  const valid =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    hasNumber &&
    hasSpecial;

  return {
    valid,
    score: Math.min(score, 4),
    feedback: issues.length > 0 ? issues[0] : '안전한 비밀번호',
  };
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

// ============================================================
// Import Key SSS 저장/복원 — Triple-Shield 2-of-3
//
// 외부 지갑 프라이빗 키 / 니모닉을 SSS로 분산 저장
//   Share A: PBKDF2(PIN)        → xlot_sss_vaults.key_share_a_*
//   Share B: HKDF(휴대폰 OTP)  → xlot_sss_vaults.key_share_b_*
//   Share C: HKDF(이메일 OTP)  → xlot_sss_vaults.key_share_c_*
//
// wallet_address = "imp_{addr}" → 기존 XLOT_SSS row와 충돌 방지
// 복구: 2-of-3 (PIN+휴대폰 / PIN+이메일 / 휴대폰+이메일)
// ============================================================

export interface ImportedKeyMap {
  mnemonic?: string; // BIP-39 니모닉 (12/24 단어) — 있으면 우선 사용
  EVM?: string;
  SOL?: string;
  BTC?: string;
  TRX?: string;
}

export async function saveImportedKeysToVaultSSS(
  userId:      string,
  walletAddr:  string,
  keys:        ImportedKeyMap,
  pin:         string,
  phoneToken:  string,
  emailToken:  string,
): Promise<void> {
  const { splitSecret } = await import('./sssService');

  const plaintext = keys.mnemonic ? keys.mnemonic : JSON.stringify(keys);
  const secret    = new TextEncoder().encode(plaintext);
  const shares    = splitSecret(secret, 3, 2);

  const [shareAEnc, shareBEnc, shareCEnc] = await Promise.all([
    encryptShareA(shares[0] as EncodedShare, pin),
    encryptShareB(shares[1] as EncodedShare, phoneToken),
    encryptShareC(shares[2] as EncodedShare, emailToken),
  ]);

  // "imp_{addr}" 로 저장 — XLOT_SSS 지갑 row와 충돌 방지
  const importRowAddr = `imp_${walletAddr.toLowerCase()}`;

  const { error } = await supabase.from('xlot_sss_vaults').upsert({
    user_id:                 userId,
    wallet_address:          importRowAddr,
    evm_address:             walletAddr.toLowerCase(),
    // NOT NULL 제약 컬럼 — key_ 값과 동일하게 채움
    share_a_iv:              shareAEnc.iv,
    share_a_ciphertext:      shareAEnc.ciphertext,
    share_a_salt:            shareAEnc.salt,
    share_b_iv:              shareBEnc.iv,
    share_b_ciphertext:      shareBEnc.ciphertext,
    share_b_salt:            shareBEnc.salt,
    share_c_iv:              shareCEnc.iv,
    share_c_ciphertext:      shareCEnc.ciphertext,
    share_c_salt:            shareCEnc.salt,
    // key_ 컬럼 — 복원 시 이쪽에서 조회
    key_share_a_iv:          shareAEnc.iv,
    key_share_a_ciphertext:  shareAEnc.ciphertext,
    key_share_a_salt:        shareAEnc.salt,
    key_share_b_iv:          shareBEnc.iv,
    key_share_b_ciphertext:  shareBEnc.ciphertext,
    key_share_b_salt:        shareBEnc.salt,
    key_share_c_iv:          shareCEnc.iv,
    key_share_c_ciphertext:  shareCEnc.ciphertext,
    key_share_c_salt:        shareCEnc.salt,
  }, { onConflict: 'user_id,wallet_address' });

  if (error) throw new Error(`Import Key SAR 저장 실패: ${error.message}`);
}

export async function restoreImportedKeysFromVaultSSS(
  userId:     string,
  walletAddr: string,
  shares: {
    pin?:        string;
    phoneToken?: string;
    emailToken?: string;
  },
): Promise<ImportedKeyMap | null> {
  const importRowAddr = `imp_${walletAddr.toLowerCase()}`;

  const { data } = await supabase
    .from('xlot_sss_vaults')
    .select([
      'key_share_a_iv','key_share_a_ciphertext','key_share_a_salt',
      'key_share_b_iv','key_share_b_ciphertext','key_share_b_salt',
      'key_share_c_iv','key_share_c_ciphertext','key_share_c_salt',
    ].join(','))
    .eq('user_id', userId)
    .eq('wallet_address', importRowAddr)
    .maybeSingle();

  if (!data) return null;
  const vData = data as unknown as VaultRecord;

  const decoded: EncodedShare[] = [];

  if (shares.pin && vData.key_share_a_iv) {
    try {
      decoded.push(await decryptShareA(
        { iv: vData.key_share_a_iv, ciphertext: vData.key_share_a_ciphertext!, salt: vData.key_share_a_salt! },
        shares.pin,
      ));
    } catch (e) { console.warn('Share A 복호화 실패', e); }
  }
  if (shares.phoneToken && vData.key_share_b_iv) {
    try {
      decoded.push(await decryptShareB(
        { iv: vData.key_share_b_iv, ciphertext: vData.key_share_b_ciphertext!, salt: vData.key_share_b_salt! },
        shares.phoneToken,
      ));
    } catch (e) { console.warn('Share B 복호화 실패', e); }
  }
  if (shares.emailToken && vData.key_share_c_iv) {
    try {
      decoded.push(await decryptShareC(
        { iv: vData.key_share_c_iv, ciphertext: vData.key_share_c_ciphertext!, salt: vData.key_share_c_salt! },
        shares.emailToken,
      ));
    } catch (e) { console.warn('Share C 복호화 실패', e); }
  }

  if (decoded.length < 2) return null;

  const { combineShares } = await import('./sssService');
  const secretBytes = combineShares(decoded);
  const secretStr   = new TextDecoder().decode(secretBytes).trim();

  // 니모닉(12 or 24 단어)인지 JSON인지 자동 판별
  const words = secretStr.split(' ');
  if (words.length === 12 || words.length === 24) {
    return { mnemonic: secretStr } as ImportedKeyMap;
  }
  return JSON.parse(secretStr) as ImportedKeyMap;
}