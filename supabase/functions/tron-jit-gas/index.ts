import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userAddress, trxAmount = 5 } = await req.json();

    if (!userAddress) {
      throw new Error("Missing userAddress parameter.");
    }

    // 서버 측 어드민 지갑 프라이빗 키 (Supabase Secrets에서 불러옴)
    const TRON_RELAYER_KEY = Deno.env.get("TRON_RELAYER_KEY");

    if (!TRON_RELAYER_KEY) {
      // 프라이빗 키가 없으면 (로컬테스트 등) 모의 응답
      console.log(`[Mock] Received JIT Request: ${trxAmount} TRX to ${userAddress}`);
      return new Response(JSON.stringify({ 
        success: true, 
        txHash: "mock_tx_hash_jit", 
        message: "TRON_RELAYER_KEY not configured. Mock JIT success." 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // TODO: TronWeb Pkg를 불러와 실제 TRX 전송 
    // 예: const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey: TRON_RELAYER_KEY });
    // const tx = await tronWeb.trx.sendTransaction(userAddress, trxAmount * 1000000);
    // return new Response({ success: true, txHash: tx.txid }, ...);

    console.log(`JIT TRX Executed (Skeleton): ${trxAmount} TRX to ${userAddress}`);
    return new Response(
      JSON.stringify({ success: true, message: `JIT ${trxAmount} TRX requested for ${userAddress}.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error("JIT Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error occurred" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
