// ============================================================
// sssE2ETest.ts — SSS 복구 3경로 E2E 테스트 유틸리티
//
// v2: Share C = 이메일 OTP 기반 (localStorage 제거)
//
// 사용법 (브라우저 콘솔):
//   import { runSSSE2ETests } from './utils/sssE2ETest';
//   runSSSE2ETests();
// ============================================================

import { ethers } from 'ethers';
import {
  splitSecret, combineShares,
  stringToUint8, uint8ToString,
} from '../services/sssService';
import {
  encryptShareA, decryptShareA,
  encryptShareB, decryptShareB,
  encryptShareC, decryptShareC,
  validatePassword,
} from '../services/shareVaultService';

interface TestResult {
  name:    string;
  passed:  boolean;
  ms:      number;
  error?:  string;
}

const PASS = '%c✅'; const PS = 'color:#10b981';
const FAIL = '%c❌'; const FS = 'color:#ef4444';
const SEC  = '%c▶'; const SS = 'font-weight:bold;color:#3b82f6';

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const t = Date.now();
  try {
    await fn();
    console.log(`${PASS} ${name} (${Date.now()-t}ms)`, PS);
    return { name, passed: true, ms: Date.now()-t };
  } catch (e: any) {
    console.log(`${FAIL} ${name} — ${e.message}`, FS);
    return { name, passed: false, ms: Date.now()-t, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 — SSS 코어
// ══════════════════════════════════════════════════════════════
async function testSSSCore(): Promise<TestResult[]> {
  console.log(`${SEC} [1] SSS Core`, SS);
  const results: TestResult[] = [];
  const secret = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const bytes  = stringToUint8(secret);
  let shares: ReturnType<typeof splitSecret>;

  results.push(await run('splitSecret → 3개 share 생성', async () => {
    shares = splitSecret(bytes, 3, 2);
    if (shares.length !== 3) throw new Error(`share 수: ${shares.length}`);
    if (!shares[0].id || !shares[0].data || !shares[0].checksum) throw new Error('share 구조 오류');
  }));

  results.push(await run('combineShares A+B', async () => {
    if (uint8ToString(combineShares([shares[0], shares[1]])) !== secret) throw new Error('복원 불일치');
  }));

  results.push(await run('combineShares A+C', async () => {
    if (uint8ToString(combineShares([shares[0], shares[2]])) !== secret) throw new Error('복원 불일치');
  }));

  results.push(await run('combineShares B+C', async () => {
    if (uint8ToString(combineShares([shares[1], shares[2]])) !== secret) throw new Error('복원 불일치');
  }));

  results.push(await run('split→combine 10회 반복 일관성', async () => {
    for (let i = 0; i < 10; i++) {
      const s = splitSecret(bytes, 3, 2);
      if (uint8ToString(combineShares([s[0], s[2]])) !== secret) throw new Error(`${i}번째 실패`);
    }
  }));

  results.push(await run('share 1개 단독 → 에러 (보안)', async () => {
    try {
      combineShares([shares[0]]);
      throw new Error('에러가 발생해야 함');
    } catch (e: any) {
      if (e.message === '에러가 발생해야 함') throw e;
    }
  }));

  return results;
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — Share 암호화/복호화
// ══════════════════════════════════════════════════════════════
async function testShareEncryption(): Promise<TestResult[]> {
  console.log(`${SEC} [2] Share 암호화/복호화`, SS);
  const results: TestResult[] = [];

  const secret     = stringToUint8('test mnemonic twelve words abandon abandon abandon abandon abandon abandon abandon about');
  const [sA, sB, sC] = splitSecret(secret, 3, 2);
  const password   = 'TestPw@1234!';
  const phoneToken = 'fake_phone_token_' + Date.now();
  const emailToken = 'fake_email_token_' + Date.now();
  let aEnc: any, bEnc: any, cEnc: any;

  // ── Share A ──
  results.push(await run('Share A 암호화 (비밀번호→PBKDF2→AES)', async () => {
    aEnc = await encryptShareA(sA, password);
    if (!aEnc.iv || !aEnc.ciphertext || !aEnc.salt) throw new Error('필드 누락');
  }));

  results.push(await run('Share A 복호화 — 올바른 비밀번호', async () => {
    const dec = await decryptShareA(aEnc, password);
    if (dec.id !== sA.id || dec.data !== sA.data) throw new Error('데이터 불일치');
  }));

  results.push(await run('Share A 복호화 — 틀린 비밀번호 → 에러 (보안)', async () => {
    try {
      await decryptShareA(aEnc, 'WrongPassword!99');
      throw new Error('틀린 비밀번호로 복호화 성공 → 보안 오류');
    } catch (e: any) {
      if (e.message.includes('보안 오류')) throw e;
    }
  }));

  // ── Share B ──
  results.push(await run('Share B 암호화 (휴대폰 OTP 토큰→HKDF→AES)', async () => {
    bEnc = await encryptShareB(sB, phoneToken);
    if (!bEnc.iv || !bEnc.ciphertext || !bEnc.salt) throw new Error('필드 누락');
  }));

  results.push(await run('Share B 복호화 — 올바른 토큰', async () => {
    const dec = await decryptShareB(bEnc, phoneToken);
    if (dec.id !== sB.id) throw new Error('데이터 불일치');
  }));

  results.push(await run('Share B 복호화 — 틀린 토큰 → 에러 (보안)', async () => {
    try {
      await decryptShareB(bEnc, 'wrong_token_abc');
      throw new Error('틀린 토큰으로 복호화 성공 → 보안 오류');
    } catch (e: any) {
      if (e.message.includes('보안 오류')) throw e;
    }
  }));

  // ── Share C (이메일 OTP) ──
  results.push(await run('Share C 암호화 (이메일 OTP 토큰→HKDF→AES)', async () => {
    cEnc = await encryptShareC(sC, emailToken);
    if (!cEnc.iv || !cEnc.ciphertext || !cEnc.salt) throw new Error('필드 누락');
  }));

  results.push(await run('Share C 복호화 — 올바른 토큰', async () => {
    const dec = await decryptShareC(cEnc, emailToken);
    if (dec.id !== sC.id || dec.data !== sC.data) throw new Error('데이터 불일치');
  }));

  results.push(await run('Share C 복호화 — 틀린 토큰 → 에러 (보안)', async () => {
    try {
      await decryptShareC(cEnc, 'wrong_email_token');
      throw new Error('틀린 토큰으로 복호화 성공 → 보안 오류');
    } catch (e: any) {
      if (e.message.includes('보안 오류')) throw e;
    }
  }));

  results.push(await run('Share B/C info string 독립성 — 교차 복호화 불가', async () => {
    // Share B로 암호화한 것을 Share C 키로 복호화하면 실패해야 함
    try {
      await decryptShareC(bEnc, phoneToken); // B를 C 키로 복호화 시도
      throw new Error('교차 복호화 성공 → 보안 오류');
    } catch (e: any) {
      if (e.message.includes('보안 오류')) throw e;
      // 정상: info string 다르면 다른 키 파생 → 복호화 실패
    }
  }));

  return results;
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — 전체 E2E (지갑 생성 → 3경로 복구)
// ══════════════════════════════════════════════════════════════
async function testFullE2E(): Promise<TestResult[]> {
  console.log(`${SEC} [3] 전체 E2E: 생성 → 3경로 복구`, SS);
  const results: TestResult[] = [];

  const testWallet   = ethers.Wallet.createRandom();
  const mnemonic     = testWallet.mnemonic!.phrase;
  const address      = testWallet.address.toLowerCase();
  const secretBytes  = stringToUint8(mnemonic);

  const password   = 'E2E@TestPass1!';
  const phoneToken = 'e2e_phone_token_' + Date.now();
  const emailToken = 'e2e_email_token_' + Date.now();
  let aEnc: any, bEnc: any, cEnc: any;

  results.push(await run('지갑 생성 — SSS 3분할 + A/B/C 암호화', async () => {
    const [sA, sB, sC] = splitSecret(secretBytes, 3, 2);
    [aEnc, bEnc, cEnc] = await Promise.all([
      encryptShareA(sA, password),
      encryptShareB(sB, phoneToken),
      encryptShareC(sC, emailToken),
    ]);
    if (!aEnc || !bEnc || !cEnc) throw new Error('암호화 실패');
  }));

  // A+B: 비밀번호 + 휴대폰
  results.push(await run('복구 A+B (비밀번호 + 휴대폰)', async () => {
    const [dA, dB] = await Promise.all([
      decryptShareA(aEnc, password),
      decryptShareB(bEnc, phoneToken),
    ]);
    const restored = uint8ToString(combineShares([dA, dB]));
    if (restored !== mnemonic) throw new Error('니모닉 불일치');
    const w = new ethers.Wallet(ethers.Wallet.fromPhrase(restored).privateKey);
    if (w.address.toLowerCase() !== address) throw new Error(`주소 불일치: ${w.address}`);
  }));

  // A+C: 비밀번호 + 이메일
  results.push(await run('복구 A+C (비밀번호 + 이메일)', async () => {
    const [dA, dC] = await Promise.all([
      decryptShareA(aEnc, password),
      decryptShareC(cEnc, emailToken),
    ]);
    const restored = uint8ToString(combineShares([dA, dC]));
    if (restored !== mnemonic) throw new Error('니모닉 불일치');
    const w = new ethers.Wallet(ethers.Wallet.fromPhrase(restored).privateKey);
    if (w.address.toLowerCase() !== address) throw new Error(`주소 불일치`);
  }));

  // B+C: 휴대폰 + 이메일
  results.push(await run('복구 B+C (휴대폰 + 이메일)', async () => {
    const [dB, dC] = await Promise.all([
      decryptShareB(bEnc, phoneToken),
      decryptShareC(cEnc, emailToken),
    ]);
    const restored = uint8ToString(combineShares([dB, dC]));
    if (restored !== mnemonic) throw new Error('니모닉 불일치');
    const w = new ethers.Wallet(ethers.Wallet.fromPhrase(restored).privateKey);
    if (w.address.toLowerCase() !== address) throw new Error(`주소 불일치`);
  }));

  // 보안: 틀린 비밀번호
  results.push(await run('보안 — 틀린 비밀번호 → 복구 실패', async () => {
    try {
      const dA = await decryptShareA(aEnc, 'WrongPassword!00');
      const dC = await decryptShareC(cEnc, emailToken);
      const restored = uint8ToString(combineShares([dA, dC]));
      const w = new ethers.Wallet(ethers.Wallet.fromPhrase(restored).privateKey);
      if (w.address.toLowerCase() === address) {
        throw new Error('보안 오류: 틀린 비밀번호로 올바른 주소 복원');
      }
    } catch (e: any) {
      if (e.message.startsWith('보안 오류')) throw e;
      // 정상: 복호화 실패 또는 다른 주소
    }
  }));

  // 보안: 틀린 이메일 토큰
  results.push(await run('보안 — 틀린 이메일 토큰 → 복구 실패', async () => {
    try {
      await decryptShareC(cEnc, 'wrong_email_token_xyz');
      throw new Error('보안 오류: 틀린 토큰으로 Share C 복호화 성공');
    } catch (e: any) {
      if (e.message.startsWith('보안 오류')) throw e;
    }
  }));

  return results;
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — 비밀번호 강도
// ══════════════════════════════════════════════════════════════
async function testPasswordStrength(): Promise<TestResult[]> {
  console.log(`${SEC} [4] 비밀번호 강도`, SS);
  const results: TestResult[] = [];

  results.push(await run('강도 케이스 6개 검증', async () => {
    const { validatePassword } = await import('../services/shareVaultService');
    const cases: [string, boolean, string][] = [
      ['abc',           false, '너무 짧음'],
      ['password',      false, '너무 단순'],
      ['Password1',     false, '특수문자 없음'],
      ['P@ss1',         false, '8자 미만'],
      ['Password@1',    true,  '통과'],
      ['MyStr0ng!Pass', true,  '통과'],
    ];
    for (const [pw, expected, desc] of cases) {
      const { valid } = validatePassword(pw);
      if (valid !== expected)
        throw new Error(`"${pw}" (${desc}): valid=${valid}, expected=${expected}`);
    }
  }));

  return results;
}

// ══════════════════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════════════════
export async function runSSSE2ETests(): Promise<TestResult[]> {
  const t0 = Date.now();
  console.log('%c\n╔══════════════════════════════════╗', 'color:#3b82f6;font-weight:bold');
  console.log('%c  xLOT SSS E2E 테스트 v2', 'color:#3b82f6;font-weight:bold;font-size:14px');
  console.log('%c╚══════════════════════════════════╝\n', 'color:#3b82f6;font-weight:bold');

  const all: TestResult[] = [
    ...await testSSSCore(),
    ...await testShareEncryption(),
    ...await testFullE2E(),
    ...await testPasswordStrength(),
  ];

  const passed  = all.filter(r => r.passed).length;
  const failed  = all.filter(r => !r.passed).length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('\n%c────────────────────────────────────', 'color:#475569');
  console.log(
    `%c  ${failed === 0 ? '🎉 전체 통과' : '⚠ 실패 있음'}  ${passed}/${all.length}  (${elapsed}s)`,
    `font-weight:bold;font-size:13px;color:${failed === 0 ? '#10b981' : '#ef4444'}`
  );
  if (failed > 0) {
    console.log('%c\n  실패 목록:', 'color:#ef4444;font-weight:bold');
    all.filter(r => !r.passed).forEach(r =>
      console.log(`%c  ❌ ${r.name}\n     ${r.error}`, 'color:#ef4444')
    );
  }
  console.log('%c────────────────────────────────────\n', 'color:#475569');

  if (failed > 0) {
    const detail = all.filter(r => !r.passed).map(r => `${r.name}: ${r.error}`).join(' | ');
    throw new Error(`테스트 ${failed}개 실패: ${detail}`);
  }
  return all;
}

export async function testPath(path: 'A+B' | 'A+C' | 'B+C'): Promise<void> {
  const all = await testFullE2E();
  const r   = all.find(t => t.name.includes(path));
  if (!r) { console.log('경로를 찾을 수 없음'); return; }
  r.passed
    ? console.log(`%c✅ ${path} 통과`, 'color:#10b981;font-weight:bold')
    : console.log(`%c❌ ${path} 실패: ${r.error}`, 'color:#ef4444;font-weight:bold');
}