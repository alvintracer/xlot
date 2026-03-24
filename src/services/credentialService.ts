// src/services/credentialService.ts
// Phase 4: Privacy-Preserving Credential Service
//
// 계정 식별자: Thirdweb smartAccount.address (user_id: text)
// Supabase Auth는 OTP 신원확인 전용으로만 사용, 계정 관리와 무관
//
// Credential 종류:
//   ADULT          — 만 19세 이상
//   KOREAN         — 내국인 실명확인
//   NON_SANCTIONED — 비제재 (TranSight KYT)

import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClaimType = 'ADULT' | 'KOREAN' | 'NON_SANCTIONED';

export type CredentialStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING';

// W3C VC / Polygon ID 규격 호환 인터페이스
// proof.type을 'Groth16Proof'로 교체하면 zk-SNARK 업그레이드 가능
export interface VerifiableCredential {
  id:             string;
  type:           ClaimType;
  issuer:         string;        // 'did:ethr:<TranSight 서버 주소>'
  issuanceDate:   number;        // unix ms
  expirationDate: number;        // unix ms (1년)
  status:         CredentialStatus;
  subjectAddress: string;        // Thirdweb 지갑 주소 (= user_id)
  proof: {
    type:               'EIP712Signature' | 'Groth16Proof';
    signature?:         string;  // 현재: EIP-712
    zkProof?:           string;  // 미래: zk-SNARK
    verificationMethod: string;  // TranSight 서버 주소
  };
  chainId: number;
  txHash?: string;
}

export interface CredentialIssueResult {
  success:     boolean;
  credential?: VerifiableCredential;
  error?:      string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const CLAIM_CONFIG: Record<ClaimType, {
  label:       string;
  description: string;
  color:       string;
  icon:        string;
}> = {
  ADULT: {
    label:       '성인 인증',
    description: '만 19세 이상 확인 (행안부 실명확인)',
    color:       'cyan',
    icon:        '🔞',
  },
  KOREAN: {
    label:       '실명 인증',
    description: '내국인 실명확인 (행안부 API)',
    color:       'blue',
    icon:        '🇰🇷',
  },
  NON_SANCTIONED: {
    label:       '비제재 인증',
    description: 'OFAC/UN 제재 대상 아님 (TranSight)',
    color:       'emerald',
    icon:        '🛡️',
  },
};

export const CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Thirdweb address 기준으로 credential 목록 조회
 * user_id = smartAccount.address
 */
export async function getCredentials(userId: string): Promise<VerifiableCredential[]> {
  const { data, error } = await supabase
    .from('user_credentials')
    .select('*')
    .eq('user_id', userId.toLowerCase())
    .order('issuance_date', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id:             row.id,
    type:           row.claim_type as ClaimType,
    issuer:         `did:ethr:${row.verifier_address || 'TranSight'}`,
    issuanceDate:   row.issuance_date,
    expirationDate: row.expiration_date,
    status:         computeStatus(row),
    subjectAddress: row.user_id,
    proof: {
      type:               'EIP712Signature',
      signature:          row.proof_signature,
      verificationMethod: row.verifier_address || 'TranSight-v1',
    },
    chainId: row.chain_id || 80002,
    txHash:  row.tx_hash,
  }));
}

/**
 * 특정 claim 유효 여부 확인
 */
export async function hasValidCredential(
  userId: string,
  claimType: ClaimType,
): Promise<boolean> {
  const creds = await getCredentials(userId);
  return creds.some(c => c.type === claimType && c.status === 'ACTIVE');
}

/**
 * Credential 발급 요청
 * - OTP 세션: 전화번호 소유 증명용
 * - walletAddress: Thirdweb smartAccount.address (계정 식별자)
 */
export async function requestCredential(
  claimType:    ClaimType,
  userId:       string,   // Thirdweb smartAccount.address
  sessionToken: string,   // Supabase OTP 세션 (신원확인 전용)
  refreshToken: string,
  _name?:       string,   // PII — Edge Function에서 즉시 폐기
  _birthdate?:  string,   // PII — Edge Function에서 즉시 폐기
): Promise<CredentialIssueResult> {
  try {
    const { data, error } = await supabase.functions.invoke('sign-claim', {
      body: {
        claimType,
        userId:       userId.toLowerCase(),
        token:        sessionToken,
        refreshToken,
        ...(claimType !== 'NON_SANCTIONED' && _name      ? { _name }      : {}),
        ...(claimType !== 'NON_SANCTIONED' && _birthdate ? { _birthdate } : {}),
      },
    });

    if (error)       throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    return { success: true, credential: data.credential };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(row: any): CredentialStatus {
  if (row.status === 'REVOKED') return 'REVOKED';
  if (Date.now() > row.expiration_date) return 'EXPIRED';
  return row.status as CredentialStatus;
}

export function daysUntilExpiry(cred: VerifiableCredential): number {
  return Math.max(0, Math.floor((cred.expirationDate - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * [미래 인터페이스] Polygon ID / zk-SNARK 업그레이드 시
 * 이 함수만 구현하면 나머지 코드 변경 없음
 */
export async function verifyZKProof(
  _proof:           string,
  _publicSignals:   string[],
  _verifierAddress: string,
): Promise<boolean> {
  throw new Error('ZK proof verification not yet implemented — upgrade to Polygon ID');
}