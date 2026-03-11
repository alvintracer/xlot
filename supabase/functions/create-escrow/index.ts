import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";

// ✨ 1. 허용할 헤더 정의 (누구나 접근 가능하게 '*')
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone, sender, token, amount } = await req.json();

    // 1. 랜덤 Salt 생성
    const salt = ethers.hexlify(ethers.randomBytes(32));

    // 2. Commitment 해시 생성 (Phone + Salt)
    // 컨트랙트에는 이 해시값만 올라갑니다.
    const coder = new ethers.AbiCoder();
    const commitment = ethers.keccak256(
      coder.encode(['string', 'bytes32'], [phone, salt])
    );

    // 3. Supabase DB 저장 (Service Role 사용)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error } = await supabase.from('phone_escrows').insert({
      commitment,
      salt,
      recipient_phone: phone,
      sender_address: sender,
      token_address: token,
      amount
    });

    if (error) throw error;

    return new Response(JSON.stringify({ commitment }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});