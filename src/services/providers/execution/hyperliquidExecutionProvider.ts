// ============================================================
// HyperliquidExecutionProvider — Perp Order Execution
//
// STATUS: LIVE (read) / SCAFFOLD (write)
// Read: L2 book quotes, slippage estimation
// Write: EIP-712 signed order placement (requires wallet)
//
// Hyperliquid uses Arbitrum for deposits, but trading happens
// on their own L2. Users need to:
// 1. Bridge USDC from Arbitrum → Hyperliquid
// 2. Place orders via EIP-712 signed messages
// ============================================================

import type { ExecutionProvider, ExecutionQuote, PlaceOrderRequest, OrderPlacementResult } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';
import { encode as encodeMsgpack } from '@msgpack/msgpack';
import { ethers } from 'ethers';
import { getHyperliquidL2, getHyperliquidCoinData, getHyperliquidAssetIndex } from '../market/hyperliquidProvider';

// Hyperliquid chain constants
export const HL_CHAIN_ID = 42161; // Arbitrum (deposit chain)
export const HL_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'; // Hyperliquid bridge on Arbitrum
export const HL_USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // USDC on Arbitrum
const HYPERLIQUID_EXCHANGE_API = 'https://api.hyperliquid.xyz/exchange';

// Map instrument ID → Hyperliquid coin
const COIN_MAP: Record<string, string> = {
  'hl-paxg-perp': 'PAXG',
  'hl-ondo-perp': 'ONDO',
};

/** Estimate fill price and slippage from L2 book */
async function estimateFill(coin: string, sizeUsd: number, isBuy: boolean): Promise<{
  avgPrice: number;
  qty: number;
  worstPrice: number;
  slippagePct: number;
} | null> {
  const book = await getHyperliquidL2(coin, 20);
  if (!book) return null;

  const levels = isBuy ? book.asks : book.bids;
  if (levels.length === 0) return null;

  let remainingUsd = sizeUsd;
  let totalCost = 0;
  let totalQty = 0;
  let worstPrice = levels[0][0];

  for (const [px, sz] of levels) {
    const levelUsd = px * sz;
    const fillUsd = Math.min(remainingUsd, levelUsd);
    const fillQty = fillUsd / px;
    totalCost += fillUsd;
    totalQty += fillQty;
    remainingUsd -= fillUsd;
    worstPrice = px;
    if (remainingUsd <= 0) break;
  }

  if (remainingUsd > 0 || totalQty <= 0) {
    // Not enough liquidity
    return null;
  }

  const avgPrice = totalCost / totalQty;
  const midPrice = levels[0][0];
  const slippagePct = Math.abs((worstPrice - midPrice) / midPrice) * 100;

  return { avgPrice, qty: totalQty, worstPrice, slippagePct };
}

export const HyperliquidExecutionProvider: ExecutionProvider = {
  name: 'Hyperliquid',
  supportedChainIds: [HL_CHAIN_ID],
  isLive: true,

  async getQuote(params): Promise<ExecutionQuote> {
    const coin = COIN_MAP[params.instrument.id];
    if (!coin) throw new Error(`Unknown Hyperliquid instrument: ${params.instrument.id}`);

    const [coinData, fillEstimate] = await Promise.all([
      getHyperliquidCoinData(coin),
      estimateFill(coin, parseFloat(params.amountWei) / (10 ** params.fromDecimals), true),
    ]);

    if (!coinData) throw new Error('Failed to fetch Hyperliquid market data');

    const sizeUsd = parseFloat(params.amountWei) / (10 ** params.fromDecimals);
    const markPx = fillEstimate?.avgPrice ?? coinData.markPx;
    const estimatedQty = fillEstimate?.qty ?? (sizeUsd / markPx);
    const slippage = fillEstimate?.slippagePct ?? 0.05;

    return {
      provider: 'Hyperliquid',
      toAmount: Math.floor(estimatedQty * 10 ** Math.min(coinData.szDecimals, 6)).toString(),
      toAmountDisplay: estimatedQty.toFixed(Math.min(coinData.szDecimals, 6)),
      estimatedGasUsd: 0, // No gas for L2 orders
      priceImpact: slippage,
      route: [{ name: 'Hyperliquid Perp', part: 100 }],
      score: 80 - slippage * 10, // Base score minus slippage penalty
      // tx is not provided — perp orders use EIP-712 signing, not standard tx
    };
  },
};

// ─── Order Types (for future execution) ──────────────────────
export interface HyperliquidOrderRequest {
  asset: number;
  isBuy: boolean;
  sz: string;         // size in base units
  limitPx: string;    // limit price
  orderType: { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' } } | { trigger: { triggerPx: string; isMarket: boolean; tpsl: 'tp' | 'sl' } };
  reduceOnly: boolean;
}

export interface HyperliquidSignature {
  r: string;
  s: string;
  v: number;
}

function getTif(timeInForce?: PlaceOrderRequest['timeInForce']): 'Gtc' | 'Ioc' | 'Alo' {
  if (timeInForce === 'IOC' || timeInForce === 'FOK') return 'Ioc';
  if (timeInForce === 'ALO' || timeInForce === 'POST_ONLY') return 'Alo';
  return 'Gtc';
}

type TypedDataSignerLike = {
  address: string;
  signTypedData: (payload: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<string>;
};

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u64ToBytes(value: number): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(value), false);
  return buf;
}

function addressToBytes(address: string): Uint8Array {
  return ethers.getBytes(address as `0x${string}`);
}

function actionHash(action: unknown, vaultAddress: string | undefined, nonce: number): `0x${string}` {
  const encoded = encodeMsgpack(action);
  const nonceBytes = u64ToBytes(nonce);
  const vaultPrefix = new Uint8Array([vaultAddress ? 1 : 0]);
  const vaultBytes = vaultAddress ? addressToBytes(vaultAddress) : new Uint8Array([]);
  const packed = concatBytes(encoded, nonceBytes, vaultPrefix, vaultBytes);
  return ethers.keccak256(packed) as `0x${string}`;
}

function getPhantomAgent(hash: `0x${string}`) {
  return {
    source: 'a',
    connectionId: hash,
  };
}

function getL1TypedData(hash: `0x${string}`) {
  return {
    domain: {
      chainId: 1337,
      name: 'Exchange',
      verifyingContract: '0x0000000000000000000000000000000000000000',
      version: '1',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ] as { name: string; type: string }[],
    },
    primaryType: 'Agent',
    message: getPhantomAgent(hash),
  };
}

/**
 * Build an EIP-712 order action for signing.
 * The wallet must sign this typed data and POST to Hyperliquid exchange API.
 *
 * Usage flow:
 * 1. Call buildOrderAction() to get the typed data
 * 2. Sign with wallet (smart account EIP-712)
 * 3. POST signed payload to https://api.hyperliquid.xyz/exchange
 */
export function buildOrderAction(orders: HyperliquidOrderRequest[], grouping: 'na' | 'normalTpsl' | 'positionTpsl' = 'na') {
  return {
    type: 'order',
    orders: orders.map(o => ({
      a: o.asset,
      b: o.isBuy,
      p: o.limitPx,
      s: o.sz,
      r: o.reduceOnly,
      t: o.orderType,
    })),
    grouping,
  };
}

export function buildHyperliquidOrderPayload(params: PlaceOrderRequest): {
  action: ReturnType<typeof buildOrderAction>;
  nonce: number;
  vaultAddress?: string;
  typedData?: ReturnType<typeof getL1TypedData>;
} {
  throw new Error('buildHyperliquidOrderPayload requires async asset lookup. Use buildHyperliquidOrderPayloadAsync instead.');
}

export async function buildHyperliquidOrderPayloadAsync(params: PlaceOrderRequest): Promise<{
  action: ReturnType<typeof buildOrderAction>;
  nonce: number;
  vaultAddress?: string;
  typedData: ReturnType<typeof getL1TypedData>;
}> {
  const coin = COIN_MAP[params.instrument.id];
  if (!coin) throw new Error(`Unknown Hyperliquid instrument: ${params.instrument.id}`);
  const asset = await getHyperliquidAssetIndex(coin);
  if (asset == null) throw new Error(`Could not resolve Hyperliquid asset index for ${coin}`);

  const nonce = Date.now();
  const vaultAddress = typeof params.extras?.vaultAddress === 'string' ? params.extras.vaultAddress : undefined;
  const action = buildOrderAction([{
    asset,
    isBuy: params.side === 'buy',
    sz: params.size,
    limitPx: params.price ?? '0',
    orderType: { limit: { tif: getTif(params.timeInForce) } },
    reduceOnly: params.reduceOnly ?? false,
  }]);
  const hash = actionHash(action, vaultAddress, nonce);

  return {
    action,
    nonce,
    vaultAddress,
    typedData: getL1TypedData(hash),
  };
}

export async function submitHyperliquidOrder(
  payload: Awaited<ReturnType<typeof buildHyperliquidOrderPayloadAsync>>,
  signature: HyperliquidSignature,
): Promise<unknown> {
  const res = await fetch(HYPERLIQUID_EXCHANGE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: payload.action,
      nonce: payload.nonce,
      signature,
      ...(payload.vaultAddress ? { vaultAddress: payload.vaultAddress } : {}),
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Hyperliquid order failed (${res.status})`);
  return json;
}

export async function signHyperliquidOrder(
  signer: TypedDataSignerLike,
  params: PlaceOrderRequest,
): Promise<{
  payload: Awaited<ReturnType<typeof buildHyperliquidOrderPayloadAsync>>;
  signature: HyperliquidSignature;
  rawSignature: string;
}> {
  const payload = await buildHyperliquidOrderPayloadAsync(params);
  const rawSignature = await signer.signTypedData(payload.typedData);
  const parsed = ethers.Signature.from(rawSignature);

  return {
    payload,
    signature: {
      r: parsed.r,
      s: parsed.s,
      v: parsed.v,
    },
    rawSignature,
  };
}

/**
 * Build a USDC deposit action (Arbitrum → Hyperliquid L2).
 * This is a standard ERC-20 approve + contract call on Arbitrum.
 */
export function getDepositInfo() {
  return {
    chainId: HL_CHAIN_ID,
    bridgeAddress: HL_BRIDGE_ADDRESS,
    usdcAddress: HL_USDC_ARBITRUM,
    description: 'Approve USDC and deposit to Hyperliquid L2 via Arbitrum bridge',
  };
}

HyperliquidExecutionProvider.placeOrder = async function placeOrder(params: PlaceOrderRequest): Promise<OrderPlacementResult> {
  try {
    const signer = params.extras?.signer as TypedDataSignerLike | undefined;
    let payload: Awaited<ReturnType<typeof buildHyperliquidOrderPayloadAsync>>;
    let signature = params.extras?.hyperliquidSignature as HyperliquidSignature | undefined;

    if (signer?.signTypedData) {
      const signed = await signHyperliquidOrder(signer, params);
      payload = signed.payload;
      signature = signed.signature;
    } else {
      payload = await buildHyperliquidOrderPayloadAsync(params);
    }

    if (!signature?.r || !signature?.s || typeof signature.v !== 'number') {
      return {
        status: 'requires_signature',
        venue: 'Hyperliquid',
        request: payload,
        error: 'Provide extras.signer with signTypedData support, or extras.hyperliquidSignature for a pre-signed Hyperliquid payload.',
      };
    }

    const response = await submitHyperliquidOrder(payload, signature);
    return {
      status: 'submitted',
      venue: 'Hyperliquid',
      response,
    };
  } catch (error) {
    return {
      status: 'unsupported',
      venue: 'Hyperliquid',
      error: error instanceof Error ? error.message : 'Unknown Hyperliquid order error',
    };
  }
};
