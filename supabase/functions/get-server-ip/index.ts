import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 💡 이제 복잡한 조회 없이, 우리의 Relay 서버 IP를 바로 알려줍니다.
    // 이 IP를 업비트에 등록하라고 UI에 띄워줍니다.
    const myRelayIp = "49.247.139.241"; 

    return new Response(JSON.stringify({ ip: myRelayIp }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});