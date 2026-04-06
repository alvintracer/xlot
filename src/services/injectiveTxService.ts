// ============================================================
// injectiveTxService.ts — Injective 트랜잭션 서명 & 브로드캐스트
//
// Injective SDK를 사용하여 derivative market order를 생성하고
// 서명하여 체인에 전송합니다.
//
// 의존성: @injectivelabs/sdk-ts, @injectivelabs/networks
// ============================================================

import {
  MsgCreateDerivativeMarketOrder,
  MsgBroadcasterWithPk,
  MsgSend,
  getInjectiveAddress as toInjAddress,
} from '@injectivelabs/sdk-ts';
import { OrderTypeMap } from '@injectivelabs/sdk-ts';
import { getNetworkEndpoints, Network } from '@injectivelabs/networks';
import { ethers } from 'ethers';

// ── HD 지갑에서 Injective 개인키 추출 ────────────────────────
function getInjectivePrivateKey(mnemonic: string): string {
  const root = ethers.HDNodeWallet.fromSeed(
    ethers.Mnemonic.fromPhrase(mnemonic).computeSeed()
  );
  const child = root.derivePath("m/44'/60'/0'/0/0");
  // ethers privateKey는 0x 접두사 포함 — SDK는 hex without 0x
  return child.privateKey.slice(2);
}

// ── Injective 주소 파생 (Bech32) ─────────────────────────────
function getInjectiveAddress(mnemonic: string): string {
  const root = ethers.HDNodeWallet.fromSeed(
    ethers.Mnemonic.fromPhrase(mnemonic).computeSeed()
  );
  const child = root.derivePath("m/44'/60'/0'/0/0");
  const evmAddr = new ethers.Wallet(child.privateKey).address;
  return toInjAddress(evmAddr);
}

// ── 파생상품 시장가 주문 실행 ─────────────────────────────────
export interface InjectiveOrderParams {
  mnemonic: string;
  marketId: string;        // 0x... 형태의 마켓 해시
  quantity: string;        // 주문 수량 (토큰 단위)
  direction: 'buy' | 'sell';
  leverage?: number;       // 기본 1x (non-leveraged)
  price?: string;          // 시장가 주문시 worst acceptable price
}

export interface InjectiveOrderResult {
  txHash: string;
  success: boolean;
  orderId?: string;
}

export async function placeInjectiveMarketOrder(
  params: InjectiveOrderParams
): Promise<InjectiveOrderResult> {
  const { mnemonic, marketId, quantity, direction, leverage = 1 } = params;

  const privateKeyHex = getInjectivePrivateKey(mnemonic);
  const injectiveAddress = getInjectiveAddress(mnemonic);
  const endpoints = getNetworkEndpoints(Network.Mainnet);

  // subaccountId: 기본 서브어카운트 (index 0)
  const subaccountId = `${injectiveAddress}${'0'.repeat(24)}`;

  // 시장가 주문의 경우 매우 높은/낮은 price를 설정 (worst price)
  const worstPrice = direction === 'buy' ? '999999' : '0.000001';

  const msg = MsgCreateDerivativeMarketOrder.fromJSON({
    subaccountId,
    injectiveAddress,
    marketId,
    orderType: direction === 'buy' ? OrderTypeMap.BUY : OrderTypeMap.SELL,
    triggerPrice: '0',
    feeRecipient: injectiveAddress,
    price: params.price || worstPrice,
    margin: (parseFloat(quantity) * parseFloat(params.price || '1') / leverage).toFixed(6),
    quantity,
  });

  const broadcaster = new MsgBroadcasterWithPk({
    privateKey: privateKeyHex,
    network: Network.Mainnet,
    endpoints,
  });

  try {
    const txResponse = await broadcaster.broadcast({ msgs: [msg] });
    return {
      txHash: txResponse.txHash,
      success: true,
    };
  } catch (e: any) {
    console.error('[InjectiveTx] Order failed:', e);
    return {
      txHash: '',
      success: false,
    };
  }
}

// ── INJ 네이티브 전송 ────────────────────────────────────────
export async function sendINJ(
  mnemonic: string,
  toAddress: string,
  amountInj: string,
  referenceId?: string,
): Promise<string> {
  const privateKeyHex = getInjectivePrivateKey(mnemonic);
  const injectiveAddress = getInjectiveAddress(mnemonic);
  const endpoints = getNetworkEndpoints(Network.Mainnet);

  // Amount in smallest unit (10^18)
  const amountWei = ethers.parseEther(amountInj).toString();

  const msg = MsgSend.fromJSON({
    srcInjectiveAddress: injectiveAddress,
    dstInjectiveAddress: toAddress,
    amount: { denom: 'inj', amount: amountWei },
  });

  // Travel Rule: memo에 reference ID 포함
  const broadcaster = new MsgBroadcasterWithPk({
    privateKey: privateKeyHex,
    network: Network.Mainnet,
    endpoints,
  });

  const txResponse = await broadcaster.broadcast({
    msgs: [msg],
    memo: referenceId ? `TR:${referenceId}` : undefined,
  });

  return txResponse.txHash;
}
