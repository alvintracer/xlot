import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⚠️ [중요] 아까 복사한 iwinv IP를 저기 숫자에 넣어주세요!
// 예: http://123.45.67.89:3000/upbit/accounts
const RELAY_SERVER_URL = "http://49.247.139.241:3000/upbit/accounts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { accessKey, secretKey } = await req.json();

    if (!accessKey || !secretKey) {
        throw new Error("API Key가 필요합니다.");
    }

    console.log("🚀 Calling Relay Server...");

    // Supabase -> iwinv Relay Server -> Upbit
    const response = await fetch(RELAY_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKey, secretKey }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Relay Error: ${errText}`);
        throw new Error(`중계 서버 오류: ${errText}`);
    }

    const result = await response.json();
    console.log(`✅ Success! Data received.`);

    return new Response(JSON.stringify({ data: result.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Critical Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});