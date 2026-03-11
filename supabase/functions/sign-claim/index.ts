import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.11.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. refreshToken까지 받기
    const { commitment, recipientAddress, token, refreshToken } = await req.json();

    if (!token || !refreshToken) {
        throw new Error("상세에러: 토큰 정보가 부족합니다. (Refresh Token Missing)");
    }

    // 2. Supabase 클라이언트 생성 (헤더 조작 X)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { persistSession: false } } // 세션 저장 끄기
    );

    // 🔥 [핵심 변경] setSession으로 정석 로그인 시도
    const { data: { user }, error: authError } = await supabaseClient.auth.setSession({
      access_token: token,
      refresh_token: refreshToken
    });

    if (authError || !user) {
      console.error("Auth Fail:", authError);
      throw new Error(`상세에러(Auth): ${authError?.message || "유저 세션 생성 실패"}`);
    }
    if (!user.phone) {
      throw new Error("상세에러(Phone): 유저 전화번호가 없습니다.");
    }

    // 3. DB 조회 (Admin 권한)
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

    // 4. 번호 비교 (숫자만 남겨서)
    const normalize = (p: string) => p.replace(/[^0-9]/g, '').replace(/^82/, '0');
    const userPhone = normalize(user.phone);
    const dbPhone = normalize(escrow.recipient_phone);

    if (!userPhone.endsWith(dbPhone.slice(-8))) {
       throw new Error(`상세에러(번호불일치): DB(${escrow.recipient_phone}) vs 인증(${user.phone})`);
    }

    // 5. 서명 생성
    const privateKey = Deno.env.get('SERVER_SIGNER_PRIVATE_KEY');
    if (!privateKey) throw new Error("상세에러(키): 서버 키 미설정");

    const wallet = new ethers.Wallet(privateKey);
    const chainId = 80002; 
    const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'address', 'uint256'],
        [commitment, recipientAddress, chainId]
    );
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    return new Response(JSON.stringify({ signature }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});