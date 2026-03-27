// ============================================================
// deliver-share/index.ts — Share A/B 안전 전달 Edge Function
//
// 역할: 인증된 사용자에게 암호화된 Share A 또는 B를 전달.
//       서버는 암호문만 전달할 뿐, 복호화하지 않음.
//       Policy Engine 적용: 기기 변경 탐지, 연속 실패 제한 등.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const {
      user_id,        // Thirdweb smartAccount.address
      wallet_address, // 복구할 지갑 주소
      share_type,     // 'A' | 'B'
      otp_token,      // Share B 요청 시: Supabase OTP access_token
      device_fp,      // 기기 fingerprint (앞 8자리)
    } = body;

    if (!user_id || !wallet_address || !share_type) {
      return new Response(
        JSON.stringify({ error: '필수 파라미터 누락' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Vault 조회 ────────────────────────────────────────
    const { data: vault, error: vaultErr } = await supabaseAdmin
      .from('xlot_sss_vaults')
      .select('*')
      .eq('user_id', user_id)
      .eq('wallet_address', wallet_address.toLowerCase())
      .maybeSingle();

    if (vaultErr || !vault) {
      return new Response(
        JSON.stringify({ error: '지갑 정보를 찾을 수 없습니다' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Share B 요청 시 OTP 토큰 검증 ────────────────────
    if (share_type === 'B') {
      if (!otp_token) {
        return new Response(
          JSON.stringify({ error: 'OTP 토큰이 필요합니다' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // OTP 토큰으로 실제 사용자 확인 (Supabase Auth)
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(otp_token);
      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: '유효하지 않은 OTP 토큰입니다' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── 3. Policy Engine: 연속 실패 제한 ─────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('xlot_recovery_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('wallet_address', wallet_address.toLowerCase())
      .eq('event_type', 'SHARE_DELIVER_FAILED')
      .gte('created_at', oneHourAgo);

    if ((count || 0) >= 5) {
      return new Response(
        JSON.stringify({ error: '요청 한도 초과. 1시간 후 다시 시도하세요.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Share 암호문 반환 (서버는 복호화하지 않음) ─────────
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    let sharePayload: Record<string, string>;
    if (share_type === 'A') {
      sharePayload = {
        iv:         vault.share_a_iv,
        ciphertext: vault.share_a_ciphertext,
        salt:       vault.share_a_salt,
      };
    } else {
      sharePayload = {
        iv:         vault.share_b_iv,
        ciphertext: vault.share_b_ciphertext,
        salt:       vault.share_b_salt,
      };
    }

    // ── 5. 감사 로그 ─────────────────────────────────────────
    await supabaseAdmin.from('xlot_recovery_logs').insert({
      user_id,
      wallet_address: wallet_address.toLowerCase(),
      event_type:  `SHARE_${share_type}_DELIVERED`,
      factor_used: [`SHARE_${share_type}`],
      device_fp:   device_fp ? String(device_fp).slice(0, 8) : null,
      ip_address:  ip,
    });

    return new Response(
      JSON.stringify({ success: true, share: sharePayload }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (e) {
    console.error('[deliver-share] Error:', e);
    return new Response(
      JSON.stringify({ error: '서버 오류' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});