// ============================================================
// kycDeviceService.ts — KYC 정보 통합 관리
//
// 저장 레이어:
//   1. 로컬 localStorage — AES-256-GCM(PIN) — 즉시 사용
//   2. vaultService (클라우드) — 기기간 동기화용 (xlot_kyc 키)
//   3. user_credentials — 수행 여부만 (PII 없음, 배지 표시용)
//
// 흐름:
//   KYC 등록 → 로컬 저장 + vault 동기화 + DB 배지 기록
//   다른 기기 → vault에서 복원 → 로컬 저장
//   KYC 필요 화면 → 로컬 있으면 사용, 없으면 vault 복원 또는 재등록
// ============================================================

import { supabase } from '../lib/supabase';

export interface KYCDeviceData {
  nameKo:   string;  // 한국 실명 (홍길동)
  nameEn:   string;  // 영문명 (HONG GILDONG) — 여권 기준
  dob:      string;  // 생년월일 YYYY-MM-DD
  phone?:   string;  // 휴대폰
  verified: boolean; // OTP 인증 완료 여부
  savedAt:  number;
}

interface StoredKYC {
  iv:         string;
  ciphertext: string;
  salt:       string;
}

const LOCAL_KEY_PREFIX = 'xlot_kyc_';
export const VAULT_KYC_KEY = 'xlot_kyc_data'; // vaultService의 keys 객체 안 키 이름

// ── 유틸 ─────────────────────────────────────────────────────
function asBS(b: Uint8Array): BufferSource { return b as unknown as BufferSource; }
function buf2hex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('');
}
function hex2buf(h: string): Uint8Array {
  const a = new Uint8Array(h.length/2);
  for (let i=0;i<a.length;i++) a[i]=parseInt(h.slice(i*2,i*2+2),16);
  return a;
}

function getDeviceId(): string {
  const k = 'xlot_device_id';
  let id = localStorage.getItem(k);
  if (!id) {
    id = buf2hex(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(k, id);
  }
  return id;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', asBS(new TextEncoder().encode(pin + getDeviceId())),
    'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', hash:'SHA-256', salt:asBS(salt), iterations:100_000 },
    base,
    { name:'AES-GCM', length:256 },
    false, ['encrypt','decrypt'],
  );
}

// ── 로컬 저장/조회 ────────────────────────────────────────────
export async function saveKYCToDevice(
  userId: string,
  data:   KYCDeviceData,
  pin:    string,
): Promise<void> {
  const salt      = crypto.getRandomValues(new Uint8Array(16));
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const key       = await deriveKey(pin, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipher    = await crypto.subtle.encrypt({ name:'AES-GCM', iv:asBS(iv) }, key, asBS(plaintext));
  const stored: StoredKYC = { iv:buf2hex(iv), ciphertext:buf2hex(new Uint8Array(cipher)), salt:buf2hex(salt) };
  localStorage.setItem(LOCAL_KEY_PREFIX + userId, JSON.stringify(stored));
}

export async function loadKYCFromDevice(
  userId: string,
  pin:    string,
): Promise<KYCDeviceData | null> {
  const raw = localStorage.getItem(LOCAL_KEY_PREFIX + userId);
  if (!raw) return null;
  try {
    const { iv, ciphertext, salt } = JSON.parse(raw) as StoredKYC;
    const key  = await deriveKey(pin, hex2buf(salt));
    const plain = await crypto.subtle.decrypt(
      { name:'AES-GCM', iv:asBS(hex2buf(iv)) }, key, asBS(hex2buf(ciphertext)),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as KYCDeviceData;
  } catch { return null; }
}

export function hasKYCOnDevice(userId: string): boolean {
  return !!localStorage.getItem(LOCAL_KEY_PREFIX + userId);
}

export function clearKYCFromDevice(userId: string): void {
  localStorage.removeItem(LOCAL_KEY_PREFIX + userId);
}

// ── Vault 동기화 ─────────────────────────────────────────────
// KYC 등록 시 vaultService와 동일한 passcode로 vault에도 저장
// vault 안에 xlot_kyc_data 키로 JSON 문자열 저장
export async function syncKYCToVault(
  userId:   string,
  data:     KYCDeviceData,
  passcode: string,          // vault 비밀번호 (KYC PIN과 동일하게 쓰거나 별도)
): Promise<void> {
  try {
    const { syncKeyToCloud } = await import('./vaultService');
    const serialized = JSON.stringify(data);
    await syncKeyToCloud(userId, { [VAULT_KYC_KEY]: serialized }, passcode);
  } catch (e) {
    console.error('KYC vault 동기화 실패 (non-blocking):', e);
  }
}

// 다른 기기에서 vault로 KYC 복원
export async function restoreKYCFromVault(
  userId:   string,
  passcode: string,
  localPin: string,    // 이 기기에서 사용할 로컬 PIN
): Promise<KYCDeviceData | null> {
  try {
    const { restoreVault } = await import('./vaultService');
    const keys = await restoreVault(userId, passcode);
    if (!keys || !keys[VAULT_KYC_KEY]) return null;
    const data = JSON.parse(keys[VAULT_KYC_KEY]) as KYCDeviceData;
    // 복원된 데이터를 이 기기에 로컬 저장
    await saveKYCToDevice(userId, data, localPin);
    return data;
  } catch { return null; }
}

// ── DB 배지 기록 (PII 없음, 수행 여부만) ─────────────────────
const CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export async function recordKYCCompletion(userId: string): Promise<void> {
  try {
    // upsert — 이미 있으면 갱신
    await supabase.from('user_credentials').upsert({
      user_id:          userId.toLowerCase(),
      claim_type:       'NON_SANCTIONED',   // DB check 제약 준수
      status:           'ACTIVE',
      issuance_date:    Date.now(),
      expiration_date:  Date.now() + CREDENTIAL_TTL_MS,
      proof_signature:  '0xKYCDevice',      // 로컬 인증 표시
      verifier_address: 'xLOT-KYCDevice-v1',
      chain_id:         0,                  // 온체인 아님
    }, { onConflict: 'user_id,claim_type' });
  } catch (e) {
    console.error('KYC 배지 기록 실패 (non-blocking):', e);
  }
}

// ── KYC 필요 여부 통합 체크 ───────────────────────────────────
export function kycStatus(userId: string): 'local' | 'none' {
  if (hasKYCOnDevice(userId)) return 'local';
  return 'none';
}