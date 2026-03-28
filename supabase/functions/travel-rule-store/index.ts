// ============================================================
// travel-rule-store Edge Function
//
// 역할:
//   1. TR 암호화 패키지 저장
//      - 클라이언트가 보낸 AES 키를 server_secret으로 재암호화
//      - 원본 AES 키는 메모리에서만 처리, 절대 평문 저장 안 함
//   2. tx_hash 업데이트
//
// POST body:
//   저장: { reference_id, ciphertext, iv, key_a_check, key_b_check, aes_key, chain }
//   업데이트: { reference_id, tx_hash, action: 'update_tx' }
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── tx_hash 업데이트 ────────────────────────────────────
    if (body.action === 'update_tx') {
      const { error } = await supabase
        .from('travel_rule_records')
        .update({ tx_hash: body.tx_hash, status: 'SUBMITTED' })
        .eq('reference_id', body.reference_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 신규 저장 ────────────────────────────────────────────
    const { reference_id, ciphertext, iv, key_a_check, key_b_check, aes_key, chain } = body;

    // server_secret으로 AES 키 재암호화
    const serverSecret = Deno.env.get('TRAVEL_RULE_SERVER_SECRET');
    if (!serverSecret) throw new Error('SERVER_SECRET not configured');

    // HKDF로 서버 마스터 키 파생
    const enc         = new TextEncoder();
    const rawSecret   = enc.encode(serverSecret);
    const info        = enc.encode('travel-rule-key-encryption-v1');
    const salt        = enc.encode(reference_id);

    const baseKey = await crypto.subtle.importKey(
      'raw', asBS(rawSecret), 'HKDF', false, ['deriveKey'],
    );
    const serverEncKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: asBS(salt), info: asBS(info) },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt'],
    );

    // AES 키 암호화
    const aesKeyBytes    = hex2buf(aes_key);
    const wrapIv         = crypto.getRandomValues(new Uint8Array(12));
    const wrappedKeyBuf  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asBS(wrapIv) },
      serverEncKey,
      asBS(aesKeyBytes),
    );
    const wrappedKey = buf2hex(new Uint8Array(wrappedKeyBuf));
    const wrapIvHex  = buf2hex(wrapIv);

    // DB 저장
    const { error } = await supabase.from('travel_rule_records').insert({
      reference_id,
      ciphertext,
      iv,
      key_a_check,
      key_b_check,
      wrapped_aes_key: wrappedKey,  // 서버 마스터 키로 암호화된 AES 키
      wrap_iv:         wrapIvHex,
      chain:           chain || 'EVM',
      status:          'PENDING',
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, reference_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buf2hex(buf: Uint8Array | ArrayBuffer): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(u8).map(b => b.toString(16).padStart(2,'0')).join('');
}
function hex2buf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return arr;
}
// Deno에서 Uint8Array → BufferSource 캐스팅
function asBS(buf: Uint8Array): BufferSource {
  return buf.buffer as ArrayBuffer;
}