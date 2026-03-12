// supabase/functions/sign-claim/index.ts
//
// [모드 A] claimType 없음 — 기존 에스크로 서명 (전화번호로 코인 받기)
//   commitment + recipientAddress → phone_escrows 조회 → 서명 반환
//
// [모드 B] claimType 있음 — Phase 4 KYC Credential 발급
//   OTP 세션: 전화번호 소유 증명 전용
//   userId: Thirdweb smartAccount.address (계정 식별자, 앱 전체 기준)
//   행안부 실명확인 → EIP-712 서명 → user_credentials 저장

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers }       from "https://esm.sh/ethers@6.11.1";

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
};

const CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const EIP712_DOMAIN = { name: 'xLOT-KYC', version: '1', chainId: 80002 };

type ClaimType = 'ADULT' | 'KOREAN' | 'NON_SANCTIONED';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { token, refreshToken } = body;

    if (!token || !refreshToken) {
      throw new Error("상세에러: 토큰 정보가 부족합니다. (Refresh Token Missing)");
    }

    // ── Supabase Auth OTP 세션 검증 (전화번호 소유 확인 전용) ─────────────────
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.setSession({
      access_token:  token,
      refresh_token: refreshToken,
    });

    if (authError || !user) {
      throw new Error(`상세에러(Auth): ${authError?.message || "유저 세션 생성 실패"}`);
    }
    if (!user.phone) {
      throw new Error("상세에러(Phone): 전화번호 인증이 완료되지 않았습니다.");
    }

    // ── 모드 분기 ─────────────────────────────────────────────────────────────
    if (body.claimType) {
      return await handleCredentialIssue(body, user.phone);
    } else {
      return await handleEscrowSign(body, user);
    }

  } catch (error: any) {
    console.error("[sign-claim] 오류:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: CORS }
    );
  }
});

// ─── 모드 A: 기존 에스크로 서명 (변경 없음) ──────────────────────────────────

async function handleEscrowSign(body: any, user: any): Promise<Response> {
  const { commitment, recipientAddress } = body;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: escrow, error: dbError } = await supabaseAdmin
    .from('phone_escrows')
    .select('*')
    .eq('commitment', commitment)
    .single();

  if (dbError || !escrow) {
    throw new Error(`상세에러(DB): 송금 정보 없음 (${dbError?.message})`);
  }

  const normalize = (p: string) => p.replace(/[^0-9]/g, '').replace(/^82/, '0');
  if (!normalize(user.phone).endsWith(normalize(escrow.recipient_phone).slice(-8))) {
    throw new Error(`상세에러(번호불일치): DB(${escrow.recipient_phone}) vs 인증(${user.phone})`);
  }

  const privateKey = Deno.env.get('SERVER_SIGNER_PRIVATE_KEY');
  if (!privateKey) throw new Error("상세에러(키): 서버 키 미설정");

  const wallet      = new ethers.Wallet(privateKey);
  const messageHash = ethers.solidityPackedKeccak256(
    ['bytes32', 'address', 'uint256'],
    [commitment, recipientAddress, 80002]
  );
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));

  return new Response(JSON.stringify({ signature }), { headers: CORS });
}

// ─── 모드 B: KYC Credential 발급 ─────────────────────────────────────────────

async function handleCredentialIssue(body: any, verifiedPhone: string): Promise<Response> {
  const {
    claimType,
    userId,   // Thirdweb smartAccount.address — 계정 식별자
  }: { claimType: ClaimType; userId: string } = body;

  if (!userId) throw new Error('userId(지갑 주소) 누락');

  // ClaimType별 추가 검증
  if (claimType === 'ADULT' || claimType === 'KOREAN') {
    await verifyIdentity(body._name || '', body._birthdate || '', verifiedPhone, claimType);
    // PII 즉시 폐기
    delete body._name;
    delete body._birthdate;
  } else if (claimType === 'NON_SANCTIONED') {
    await verifyNonSanctioned(userId);
  } else {
    throw new Error(`알 수 없는 claimType: ${claimType}`);
  }

  // EIP-712 서명
  const privateKey = Deno.env.get('SERVER_SIGNER_PRIVATE_KEY');
  if (!privateKey) throw new Error('서명 키 미설정');

  const signer    = new ethers.Wallet(privateKey);
  const issuedAt  = Date.now();
  const expiresAt = issuedAt + CREDENTIAL_TTL_MS;

  const signature = await signer.signTypedData(
    EIP712_DOMAIN,
    {
      KYCCredential: [
        { name: 'claimType',  type: 'string'  },
        { name: 'userId',     type: 'address' }, // Thirdweb address
        { name: 'issuedAt',   type: 'uint256' },
        { name: 'expiresAt',  type: 'uint256' },
        { name: 'issuer',     type: 'address' },
      ],
    },
    {
      claimType,
      userId:    userId.toLowerCase(),
      issuedAt,
      expiresAt,
      issuer:    signer.address,
    },
  );

  // DB 저장
  // user_id = Thirdweb address (user_wallets, user_devices 등과 동일한 식별자)
  // PII 없음 — 서명값만 저장
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: saved, error: dbError } = await supabaseAdmin
    .from('user_credentials')
    .upsert({
      user_id:          userId.toLowerCase(),  // Thirdweb address
      claim_type:       claimType,
      status:           'ACTIVE',
      issuance_date:    issuedAt,
      expiration_date:  expiresAt,
      proof_signature:  signature,
      verifier_address: signer.address,
      chain_id:         80002,
    }, { onConflict: 'user_id,claim_type' })  // 계정 단위 upsert
    .select()
    .single();

  if (dbError) throw new Error('Credential DB 저장 실패: ' + dbError.message);

  console.log(`[sign-claim] Credential 발급: ${claimType} → ${userId.slice(0, 10)}...`);

  return new Response(JSON.stringify({
    credential: {
      id:             saved.id,
      type:           claimType,
      issuer:         `did:ethr:${signer.address}`,
      issuanceDate:   issuedAt,
      expirationDate: expiresAt,
      status:         'ACTIVE',
      subjectAddress: userId.toLowerCase(),
      proof: {
        type:               'EIP712Signature',
        signature,
        verificationMethod: signer.address,
      },
      chainId: 80002,
    },
  }), { headers: CORS });
}

// ─── 행안부 실명확인 ──────────────────────────────────────────────────────────

async function verifyIdentity(
  name: string, birthdate: string, phone: string, claimType: 'ADULT' | 'KOREAN',
): Promise<void> {
  if (!name || birthdate.length !== 8) {
    throw new Error('이름 또는 생년월일 형식 오류 (YYYYMMDD)');
  }

  const MOIS_URL = Deno.env.get('MOIS_API_URL');
  const MOIS_KEY = Deno.env.get('MOIS_API_KEY');

  // DEV MOCK
  if (!MOIS_URL || !MOIS_KEY) {
    console.warn('[sign-claim] 행안부 API 미설정 — DEV MOCK');
    const year  = parseInt(birthdate.slice(0, 4));
    const month = parseInt(birthdate.slice(4, 6)) - 1;
    const day   = parseInt(birthdate.slice(6, 8));
    const now   = new Date();
    let age     = now.getFullYear() - year;
    if (now < new Date(now.getFullYear(), month, day)) age--;
    if (claimType === 'ADULT' && age < 19) throw new Error('만 19세 미만');
    if (name === '테스트') throw new Error('[MOCK] 실명확인 불일치 시뮬레이션');
    return;
  }

  const res = await fetch(`${MOIS_URL}/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MOIS_KEY}` },
    body:    JSON.stringify({ name, birthdate, phone: phone.replace(/[^0-9]/g, '') }),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `행안부 API 오류 (${res.status})`);
  }

  const data = await res.json();
  if (!data.verified)                          throw new Error('실명확인 불일치');
  if (claimType === 'ADULT'  && !data.isAdult)  throw new Error('만 19세 미만');
  if (claimType === 'KOREAN' && !data.isKorean) throw new Error('내국인 확인 실패');
}

// ─── TranSight 비제재 확인 ────────────────────────────────────────────────────

async function verifyNonSanctioned(userId: string): Promise<void> {
  const TRANSIGHT_URL = Deno.env.get('TRANSIGHT_API_URL');
  const TRANSIGHT_KEY = Deno.env.get('TRANSIGHT_API_KEY');

  if (!TRANSIGHT_URL || !TRANSIGHT_KEY) {
    console.warn('[sign-claim] TranSight 미설정 — NON_SANCTIONED MOCK 통과');
    return;
  }

  const res = await fetch(`${TRANSIGHT_URL}/v1/address/screen`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': TRANSIGHT_KEY },
    body:    JSON.stringify({ address: userId, asset: 'ETH', direction: 'out' }),
    signal:  AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error('TranSight API 오류');

  const data = await res.json();
  if (data.is_sanctioned)   throw new Error('제재 대상 — Credential 발급 불가');
  if (data.risk_score >= 75) throw new Error('고위험 주소 — Credential 발급 불가');
}