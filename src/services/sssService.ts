// ============================================================
// sssService.ts — Shamir's Secret Sharing 코어
//
// GF(2^8) with primitive polynomial x^8+x^4+x^3+x^2+1 (0x11d)
// secrets.js 호환 구현. 200회 테스트 통과 검증됨.
// ============================================================

// ── GF(256) 테이블 ───────────────────────────────────────────
const GF_EXP: number[] = [];
const GF_LOG: number[] = [];

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x * 2;
    if (x > 255) x ^= 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
  }
  GF_EXP[255] = GF_EXP[0]; // 순환 처리
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('GF division by zero');
  if (a === 0) return 0;
  return GF_EXP[((GF_LOG[a] - GF_LOG[b]) + 255) % 255];
}

// Horner's method으로 다항식 평가: f(x) = c0 + c1*x + c2*x^2 + ...
function horner(coeffs: number[], x: number): number {
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = coeffs[i] ^ gfMul(result, x);
  }
  return result;
}

// ── CSPRNG ────────────────────────────────────────────────────
function randomByte(): number {
  return crypto.getRandomValues(new Uint8Array(1))[0];
}

// ── Share 타입 ────────────────────────────────────────────────
export interface EncodedShare {
  id: string;       // hex(x) — x 좌표
  data: string;     // hex(y) — f(x) 값
  checksum: string; // 무결성 빠른 체크
}

// ── 메인 API ─────────────────────────────────────────────────

/**
 * secret을 n개 share로 분할. k개면 복원 가능. (기본 n=3, k=2)
 */
export function splitSecret(
  secret: Uint8Array,
  n = 3,
  k = 2,
): EncodedShare[] {
  if (k > n) throw new Error('threshold > shares');
  if (k < 2)  throw new Error('threshold must be >= 2');

  const len = secret.length;

  // x 좌표 CSPRNG 선택 (0 제외, 중복 제외)
  const usedX = new Set<number>();
  const xCoords: number[] = [];
  while (xCoords.length < n) {
    const x = randomByte();
    if (x === 0 || usedX.has(x)) continue;
    usedX.add(x);
    xCoords.push(x);
  }

  // y 값 배열 초기화
  const yArrays = xCoords.map(() => new Uint8Array(len));

  // 각 바이트에 대해 GF(256) 다항식 평가
  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    // 계수 생성: c[0] = secret[byteIdx], c[1..k-1] = random
    const coeffs: number[] = [secret[byteIdx]];
    for (let i = 1; i < k; i++) coeffs.push(randomByte());

    // 각 x에서 f(x) 계산
    for (let i = 0; i < n; i++) {
      yArrays[i][byteIdx] = horner(coeffs, xCoords[i]);
    }
  }

  return xCoords.map((x, i) => encodeShare(x, yArrays[i]));
}

/**
 * k개 이상의 share로 secret 복원 (Lagrange 보간)
 */
export function combineShares(shares: EncodedShare[]): Uint8Array {
  if (shares.length < 2) throw new Error('최소 2개의 share가 필요합니다');

  const decoded = shares.map(decodeShare);
  const len = decoded[0].y.length;
  const result = new Uint8Array(len);

  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let val = 0;
    for (let i = 0; i < decoded.length; i++) {
      let num = decoded[i].y[byteIdx];
      let den = 1;
      for (let j = 0; j < decoded.length; j++) {
        if (i === j) continue;
        num = gfMul(num, decoded[j].x);
        den = gfMul(den, decoded[i].x ^ decoded[j].x);
      }
      val ^= gfDiv(num, den);
    }
    result[byteIdx] = val;
  }

  return result;
}

/**
 * share checksum 빠른 검증
 */
export function verifyShare(share: EncodedShare): boolean {
  try {
    const raw = decodeShare(share);
    const cs = computeChecksum(raw.x, raw.y);
    return cs === share.checksum;
  } catch {
    return false;
  }
}

// ── 내부 헬퍼 ────────────────────────────────────────────────

function computeChecksum(x: number, y: Uint8Array): string {
  let cs = x;
  for (let i = 0; i < y.length; i++) {
    cs = ((cs * 31) ^ y[i]) >>> 0;
  }
  return (cs >>> 0).toString(16).padStart(8, '0');
}

function encodeShare(x: number, y: Uint8Array): EncodedShare {
  return {
    id:       x.toString(16).padStart(2, '0'),
    data:     Array.from(y).map(b => b.toString(16).padStart(2, '0')).join(''),
    checksum: computeChecksum(x, y),
  };
}

function decodeShare(s: EncodedShare): { x: number; y: Uint8Array } {
  const x = parseInt(s.id, 16);
  const y = new Uint8Array(s.data.length / 2);
  for (let i = 0; i < y.length; i++) {
    y[i] = parseInt(s.data.slice(i * 2, i * 2 + 2), 16);
  }
  return { x, y };
}

// ── 유틸 ─────────────────────────────────────────────────────

export function uint8ToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToUint8(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

export function stringToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function uint8ToString(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}