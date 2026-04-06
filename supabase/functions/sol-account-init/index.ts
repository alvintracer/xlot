// ============================================================
// sol-account-init — Solana 신규 계정 Rent JIT 지원
//
// SPL relay와 달리 이 함수는 "순수 SOL 전송"만 담당.
// 용도: 아직 SOL이 전혀 없는 새 주소에 최소 0.002 SOL 지원.
// (ATA 생성 rent 0.00203928 SOL 커버)
//
// 필요 환경변수:
//   SOL_RELAYER_KEY : 릴레이어 지갑 Base58 비밀키
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "npm:@solana/web3.js@1.98.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOL_RPC      = 'https://solana-rpc.publicnode.com';
const INIT_LAMPORTS = 2_039_280; // 0.00203928 SOL — ATA 1개 rent-exempt 최소치

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const c of str) {
    const idx = B58.indexOf(c);
    if (idx < 0) throw new Error(`Invalid Base58 char: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  const leading = (str.match(/^1*/)?.[0] ?? '').length;
  return new Uint8Array([...new Array(leading).fill(0), ...bytes]);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userAddress } = await req.json();
    if (!userAddress) throw new Error('Missing userAddress');

    const SOL_RELAYER_KEY = Deno.env.get('SOL_RELAYER_KEY');
    if (!SOL_RELAYER_KEY) {
      // 개발 환경 Mock
      console.log(`[sol-account-init] Mock: would send ${INIT_LAMPORTS / LAMPORTS_PER_SOL} SOL to ${userAddress}`);
      return new Response(JSON.stringify({
        success: true,
        txHash:  'mock_sol_init',
        message: 'SOL_RELAYER_KEY not set — mock response',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const relayer   = Keypair.fromSecretKey(base58Decode(SOL_RELAYER_KEY));
    const conn      = new Connection(SOL_RPC, 'confirmed');
    const toPubkey  = new PublicKey(userAddress);

    // 이미 잔액 있으면 스킵 (중복 전송 방지)
    const balance = await conn.getBalance(toPubkey);
    if (balance >= INIT_LAMPORTS) {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        message: `Already has ${balance} lamports — init skipped`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { blockhash } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey:        relayer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: relayer.publicKey,
          toPubkey,
          lamports:   INIT_LAMPORTS,
        }),
      ],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    tx.sign([relayer]);

    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight:       false,
      preflightCommitment: 'confirmed',
    });
    conn.confirmTransaction(sig, 'confirmed').catch(() => {});

    console.log(`[sol-account-init] Sent ${INIT_LAMPORTS} lamports to ${userAddress} | tx=${sig}`);

    return new Response(JSON.stringify({
      success: true,
      txHash:  sig,
      lamports: INIT_LAMPORTS,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[sol-account-init] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: corsHeaders, status: 400 },
    );
  }
});
