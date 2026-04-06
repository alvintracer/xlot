// ============================================================
// sol-spl-relay — Solana SPL 토큰 가스비 대납 릴레이
//
// 프로토콜 (2-step):
//   1. BUILD  : 릴레이어가 fee payer로 트랜잭션 구성 → 직렬화 반환
//   2. SUBMIT : 프론트가 사용자 서명한 tx를 전달 → 릴레이어 cosign + 브로드캐스트
//
// 수익 구조:
//   - 전송액의 0.2% (최소 0.1 USDC/USDT) → SOL_FEE_VAULT ATA로 원자적 수취
//   - 릴레이어는 가스 SOL만 소모하며 USDC/USDT로 보상받음
//
// 필요 환경변수:
//   SOL_RELAYER_KEY  : 릴레이어 지갑 Base58 비밀키
//   SOL_FEE_VAULT    : 수수료 수취 지갑 주소 (Base58 공개키)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
} from "npm:@solana/web3.js@1.98.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOL_RPC          = 'https://solana-rpc.publicnode.com';
const TOKEN_PROGRAM    = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_PROGRAM    = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bSe');
const SYSTEM_PROGRAM   = new PublicKey('11111111111111111111111111111111');

const FEE_RATE_BPS = 20;       // 0.2%
const MIN_FEE_RAW  = 100_000;  // 0.1 (6 decimals 기준, USDC/USDT)

// ── Base58 디코더 (Deno 내장 없음) ───────────────────────────
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

// ── ATA 주소 파생 ──────────────────────────────────────────
function getATA(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOC_PROGRAM,
  )[0];
}

// ── ATA 생성 instruction (create_idempotent, 실패 없음) ─────
function makeCreateATAIx(
  funder: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOC_PROGRAM,
    keys: [
      { pubkey: funder,         isSigner: true,  isWritable: true  },
      { pubkey: ata,            isSigner: false, isWritable: true  },
      { pubkey: owner,          isSigner: false, isWritable: false },
      { pubkey: mint,           isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM,  isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // create_idempotent
  });
}

// ── TransferChecked instruction (discriminator = 12) ────────
function makeTransferCheckedIx(
  source: PublicKey, mint: PublicKey, dest: PublicKey,
  authority: PublicKey, rawAmount: bigint, decimals: number,
): TransactionInstruction {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(rawAmount, 1);
  data.writeUInt8(decimals, 9);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source,    isSigner: false, isWritable: true  },
      { pubkey: mint,      isSigner: false, isWritable: false },
      { pubkey: dest,      isSigner: false, isWritable: true  },
      { pubkey: authority, isSigner: true,  isWritable: false },
    ],
    data,
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const SOL_RELAYER_KEY = Deno.env.get('SOL_RELAYER_KEY');
    const SOL_FEE_VAULT   = Deno.env.get('SOL_FEE_VAULT');

    if (!SOL_RELAYER_KEY || !SOL_FEE_VAULT) {
      return new Response(
        JSON.stringify({ error: 'Relayer not configured (SOL_RELAYER_KEY / SOL_FEE_VAULT missing)' }),
        { headers: corsHeaders, status: 500 },
      );
    }

    const relayer  = Keypair.fromSecretKey(base58Decode(SOL_RELAYER_KEY));
    const feeVault = new PublicKey(SOL_FEE_VAULT);
    const conn     = new Connection(SOL_RPC, 'confirmed');

    // ──────────────────────────────────────────────────────────
    // BUILD: 트랜잭션 구성 → 미서명 직렬화 반환
    // ──────────────────────────────────────────────────────────
    if (action === 'BUILD') {
      const { userAddress, mintAddress, toAddress, amount, decimals } = body;
      if (!userAddress || !mintAddress || !toAddress || amount == null || decimals == null) {
        throw new Error('Missing required fields: userAddress, mintAddress, toAddress, amount, decimals');
      }

      const userPubkey = new PublicKey(userAddress);
      const toPubkey   = new PublicKey(toAddress);
      const mintPubkey = new PublicKey(mintAddress);

      const totalRaw = BigInt(Math.round(amount * Math.pow(10, decimals)));

      // 수수료 계산 (0.2%, 최소 0.1 토큰)
      const feeRaw  = BigInt(Math.max(MIN_FEE_RAW, Math.floor(Number(totalRaw) * FEE_RATE_BPS / 10000)));
      const sendRaw = totalRaw - feeRaw;

      if (sendRaw <= 0n) throw new Error('금액이 너무 작아 수수료를 차감할 수 없습니다');

      const sourceATA   = getATA(userPubkey, mintPubkey);
      const destATA     = getATA(toPubkey,   mintPubkey);
      const feeVaultATA = getATA(feeVault,   mintPubkey);

      const instructions: TransactionInstruction[] = [];

      // 수신자 ATA 없으면 릴레이어가 생성 (SOL 부담)
      const [destAccInfo, feeAccInfo] = await Promise.all([
        conn.getAccountInfo(destATA),
        conn.getAccountInfo(feeVaultATA),
      ]);
      if (!destAccInfo)  instructions.push(makeCreateATAIx(relayer.publicKey, destATA,     toPubkey, mintPubkey));
      if (!feeAccInfo)   instructions.push(makeCreateATAIx(relayer.publicKey, feeVaultATA, feeVault, mintPubkey));

      // ② 실제 전송: user → recipient
      instructions.push(makeTransferCheckedIx(sourceATA, mintPubkey, destATA,     userPubkey, sendRaw, decimals));
      // ③ 수수료:    user → fee vault (원자적)
      instructions.push(makeTransferCheckedIx(sourceATA, mintPubkey, feeVaultATA, userPubkey, feeRaw,  decimals));

      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey:        relayer.publicKey,   // 릴레이어가 SOL 가스 납부
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      // 미서명 직렬화 (signature 슬롯은 0x00으로 채워짐)
      const tx         = new VersionedTransaction(msg);
      const serialized = Buffer.from(tx.serialize()).toString('base64');

      console.log(`[sol-spl-relay] BUILD ok | send=${Number(sendRaw)} fee=${Number(feeRaw)} user=${userAddress}`);

      return new Response(JSON.stringify({
        success:             true,
        serializedTx:        serialized,
        lastValidBlockHeight,
        feeAmount:           Number(feeRaw)  / Math.pow(10, decimals),
        sendAmount:          Number(sendRaw) / Math.pow(10, decimals),
        relayerAddress:      relayer.publicKey.toBase58(),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ──────────────────────────────────────────────────────────
    // SUBMIT: 사용자 서명된 tx 수신 → 릴레이어 cosign + 브로드캐스트
    // ──────────────────────────────────────────────────────────
    if (action === 'SUBMIT') {
      const { signedTx } = body;
      if (!signedTx) throw new Error('Missing signedTx');

      const txBytes = Buffer.from(signedTx, 'base64');
      const tx      = VersionedTransaction.deserialize(txBytes);

      // 릴레이어 cosign (fee payer 슬롯 채움, 사용자 서명 유지됨)
      tx.sign([relayer]);

      const sig = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight:       false,
        preflightCommitment: 'confirmed',
      });

      // fire-and-forget confirm (타임아웃 오류 방지)
      conn.confirmTransaction(sig, 'confirmed').catch(() => {});

      console.log(`[sol-spl-relay] SUBMIT ok | txHash=${sig}`);

      return new Response(JSON.stringify({
        success: true,
        txHash:  sig,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { headers: corsHeaders, status: 400 },
    );

  } catch (err: any) {
    console.error('[sol-spl-relay] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: corsHeaders, status: 400 },
    );
  }
});
