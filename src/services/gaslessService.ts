import { ethers } from 'ethers';
import { supabase } from '../lib/supabase';
import { getContract, prepareContractCall } from "thirdweb";

// ===============================================
// EVM: Permit (EIP-2612) 대납 서비스
// ===============================================

export interface PermitTokenDetails {
  tokenAddress: string;
  name: string;
  version: string;
  chainId: number;
}

// 알려진 주요 스테이블코인들의 EIP-712 도메인 설정
export const PERMIT_SUPPORTED_TOKENS: Record<string, PermitTokenDetails> = {
  // Polygon USDC (lowercase key — 항상 toLowerCase()로 조회)
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", name: "USD Coin", version: "2", chainId: 137 },
  // Ethereum USDC
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", version: "2", chainId: 1 },
  // Ethereum PYUSD
  "0x6c3ea9036406852006290770bede1c0dfbbccbc4": { tokenAddress: "0x6c3ea9036406852006290770bede1c0dfbbccbc4", name: "PayPal USD", version: "1", chainId: 1 },
  // 더 많은 토큰 체인 확장 가능
};

/**
 * EIP-2612 서명을 생성합니다. (가스비 0)
 */
export async function signPermit(
  wallet: ethers.Wallet,
  tokenDetail: PermitTokenDetails,
  spender: string,
  amountWei: string | bigint,
  deadline: number
) {
  // 1. 해당 토큰 컨트랙트에서 현재 nonce 값을 읽어와야 합니다.
  const provider = wallet.provider;
  if (!provider) throw new Error("지갑에 Provider가 연결되어 있지 않습니다.");

  const tokenContract = new ethers.Contract(
    tokenDetail.tokenAddress,
    ["function nonces(address owner) view returns (uint256)"],
    provider
  );
  
  const currentNonce = await tokenContract.nonces(wallet.address);

  // 2. EIP-712 Domain
  const domain = {
    name: tokenDetail.name,
    version: tokenDetail.version,
    chainId: tokenDetail.chainId,
    verifyingContract: tokenDetail.tokenAddress
  };

  // 3. EIP-712 Types
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  // 4. Value
  const value = {
    owner: wallet.address,
    spender,
    value: amountWei.toString(),
    nonce: currentNonce,
    deadline
  };

  // 5. 로컬에서 서명 생성
  const signature = await wallet.signTypedData(domain, types, value);
  const sigBytes = ethers.Signature.from(signature);

  return {
    v: sigBytes.v,
    r: sigBytes.r,
    s: sigBytes.s,
    signature
  };
}

/**
 * 서명된 오프체인 데이터를 Relayer(Edge Function)로 전송하여 온체인 실행을 위임합니다.
 */
export async function relayPermitTransfer(params: {
  network: string;
  tokenAddress: string;
  owner: string;
  toAddress: string;
  amount: string; // token amount formatted (not wei)
  deadline: number;
  v: number;
  r: string;
  s: string;
}) {
  const { data, error } = await supabase.functions.invoke('permit-relay', {
    body: params
  });
  if (error) throw new Error("서버 에러: 대납 전송 실패");
  return data; // { success, txHash }
}

// ===============================================
// Tron: TRX JIT(가스 선지원) 서비스
// ===============================================

export async function requestTronJit(userAddress: string, requiredTrxAmount: number = 5) {
  const { data, error } = await supabase.functions.invoke('tron-jit-gas', {
    body: { userAddress, trxAmount: requiredTrxAmount }
  });
  // HTTP 레벨 에러 (4xx/5xx)
  if (error) throw new Error("TRX JIT 요청 실패: " + (error.message || error));

  // 서버에서 success: false 반환 시 (잔액 부족 등) — 400이 아닌 200으로 옴
  if (data && data.success === false) {
    throw new Error(data.reason || "에너지/TRX 지원 불가 (잔액 부족)");
  }

  return data; // { success: true, method, ... }
}

// ===============================================
// Tron: 수수료 미수금 기록 (off-chain ledger)
// 유저 지갑에 남아있는 USDT를 나중에 일괄 수거
// ===============================================

export async function recordPendingFee(params: {
  userAddress: string;
  tokenSymbol: string;   // 'USDT'
  feeAmount: number;     // 0.5 (USDT 단위)
  txHash: string;        // 본 전송 tx hash
  jitMethod: string;     // 'energy_rental' | 'bandwidth' | 'fallback_trx'
  trxCost: number;       // 실제 TRX 비용 (우리가 지출한)
}) {
  try {
    const { error } = await supabase.from('pending_fees').insert({
      user_address: params.userAddress,
      token_symbol: params.tokenSymbol,
      fee_amount: params.feeAmount,
      tx_hash: params.txHash,
      jit_method: params.jitMethod,
      trx_cost: params.trxCost,
      status: 'pending',     // pending → collected
      created_at: new Date().toISOString(),
    });
    if (error) console.error('[Fee] DB insert failed:', error);
  } catch (e) {
    console.error('[Fee] recordPendingFee failed:', e);
  }
}

// ===============================================
// Solana: SOL JIT(지갑 최초 Rent) 서비스
// ===============================================

export async function checkSolAccountExists(address: string): Promise<boolean> {
  // 잔고 체킹 등으로 대체되지만, 실제 구현 시 Ankr RPC 등에 연결하여 getBalance가 0인지 등을 체크합니다.
  try {
    const res = await fetch('https://solana-rpc.publicnode.com', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address] })
    });
    const result = await res.json();
    return result.result.value > 0;
  } catch (e) {
    return true; // 에러 시 일단은 JIT 안보냄
  }
}

export async function requestSolInit(userAddress: string) {
  const { data, error } = await supabase.functions.invoke('sol-account-init', {
    body: { userAddress }
  });
  if (error) throw new Error("SOL 지갑 초기화(Rent JIT) 요청 실패");
  return data;
}
