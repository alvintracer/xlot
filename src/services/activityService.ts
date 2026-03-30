import { formatUnits } from "viem";
import type { WalletSlot } from "./walletService";

// === 1. 설정 ===
const CONFIG = {
  ETHERSCAN_KEY: "KEEC1D4R675W1H1G8F58V2DZD3ZK49FAX1", 
  TRONSCAN_KEY: "8cc440ca-a416-4e75-810b-4702879f0837", // 트론은 별도
};

// === 2. [핵심] 지원 네트워크 리스트 (UI에서 쓸 데이터) ===
export const SUPPORTED_NETWORKS = [
  // [EVM 계열]
  { id: 'ETH_MAIN', name: 'Ethereum', type: 'EVM', chainId: 1, currency: 'ETH', explorer: 'https://etherscan.io', apiBase: 'https://api.etherscan.io/api' },
  { id: 'ETH_SEPOLIA', name: 'Sepolia', type: 'EVM', chainId: 11155111, currency: 'ETH', explorer: 'https://sepolia.etherscan.io', apiBase: 'https://api-sepolia.etherscan.io/api' },
  { id: 'POLY_MAIN', name: 'Polygon', type: 'EVM', chainId: 137, currency: 'POL', explorer: 'https://polygonscan.com', apiBase: 'https://api.polygonscan.com/api' },
  { id: 'POLY_AMOY', name: 'Amoy', type: 'EVM', chainId: 80002, currency: 'POL', explorer: 'https://amoy.polygonscan.com', apiBase: 'https://api-amoy.polygonscan.com/api' },
  { id: 'BASE_MAIN', name: 'Base', type: 'EVM', chainId: 8453, currency: 'ETH', explorer: 'https://basescan.org', apiBase: 'https://api.basescan.org/api' },
  { id: 'BSC_MAIN', name: 'BNB Chain', type: 'EVM', chainId: 56, currency: 'BNB', explorer: 'https://bscscan.com', apiBase: 'https://api.bscscan.com/api' },
  { id: 'ARB_MAIN', name: 'Arbitrum', type: 'EVM', chainId: 42161, currency: 'ETH', explorer: 'https://arbiscan.io', apiBase: 'https://api.arbiscan.io/api' },
  
  // [Non-EVM 계열]
  { id: 'SOLANA', name: 'Solana', type: 'SOL', chainId: 0, currency: 'SOL', explorer: 'https://solscan.io', apiBase: null },
  { id: 'TRON', name: 'Tron', type: 'TRON', chainId: 0, currency: 'TRX', explorer: 'https://tronscan.org', apiBase: null },
];

export type ActivityType = 'SEND' | 'RECEIVE' | 'EXECUTE' | 'UNKNOWN';
export type ActivitySource = 'WEB3';

export interface ActivityItem {
  id: string;
  source: ActivitySource;
  type: ActivityType;
  title: string;
  amount: string;
  symbol: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  timestamp: number;
  detailUrl: string;
  counterparty: string;
  network: string;
}

// --- 내부 함수: Relay를 통한 EVM 조회 ---
async function fetchEvmViaRelay(address: string, networkConfig: typeof SUPPORTED_NETWORKS[0]): Promise<ActivityItem[]> {
  try {
    const apiKeyParam = CONFIG.ETHERSCAN_KEY ? `&apikey=${CONFIG.ETHERSCAN_KEY}` : '';
    const txUrl = `https://api.etherscan.io/v2/api?chainid=${networkConfig.chainId}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc${apiKeyParam}`;
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=${networkConfig.chainId}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc${apiKeyParam}`;

    const txRes = await fetch(txUrl);
    const txData = await txRes.json();

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    const activities: ActivityItem[] = [];

    if (txData.status === "1" && Array.isArray(txData.result)) {
      txData.result.forEach((tx: any) => {
        if (tx.value === "0" && tx.input !== "0x") return; 
        const isSent = tx.from.toLowerCase() === address.toLowerCase();
        activities.push({
          id: `${networkConfig.id}-${tx.hash}`,
          source: 'WEB3',
          type: isSent ? 'SEND' : 'RECEIVE',
          title: isSent ? '보냄' : '받음',
          amount: formatUnits(BigInt(tx.value), 18),
          symbol: networkConfig.currency,
          status: tx.isError === "0" ? 'SUCCESS' : 'FAILED',
          timestamp: parseInt(tx.timeStamp),
          detailUrl: `${networkConfig.explorer}/tx/${tx.hash}`,
          counterparty: isSent ? tx.to : tx.from,
          network: networkConfig.name
        });
      });
    }

    if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
      tokenData.result.forEach((tx: any) => {
        const isSent = tx.from.toLowerCase() === address.toLowerCase();
        activities.push({
          id: `${networkConfig.id}-${tx.hash}-${tx.logIndex}`,
          source: 'WEB3',
          type: isSent ? 'SEND' : 'RECEIVE',
          title: isSent ? '보냄' : '받음',
          amount: formatUnits(BigInt(tx.value), parseInt(tx.tokenDecimal || 18)),
          symbol: tx.tokenSymbol,
          status: 'SUCCESS',
          timestamp: parseInt(tx.timeStamp),
          detailUrl: `${networkConfig.explorer}/tx/${tx.hash}`,
          counterparty: isSent ? tx.to : tx.from,
          network: networkConfig.name
        });
      });
    }
    return activities;
  } catch (e) {
    console.warn(`Failed to fetch ${networkConfig.name}:`, e);
    return [];
  }
}

// --- 내부 함수: Solana 조회 ---
async function fetchSolanaHistory(address: string): Promise<ActivityItem[]> {
  try {
    const RPC_URL = "https://api.mainnet-beta.solana.com"; 
    const response = await fetch(RPC_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [ address, { limit: 10 } ] })
    });
    const { result } = await response.json();
    if (!Array.isArray(result)) return [];

    return result.map((tx: any) => ({
      id: tx.signature, source: 'WEB3', type: 'EXECUTE', title: '트랜잭션 실행', amount: '-', symbol: 'SOL',
      status: tx.err ? 'FAILED' : 'SUCCESS', timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
      detailUrl: `https://solscan.io/tx/${tx.signature}`, counterparty: '-', network: 'Solana'
    }));
  } catch (e) { return []; }
}

// --- 내부 함수: Tron 조회 ---
async function fetchTronHistory(address: string): Promise<ActivityItem[]> {
  try {
    const BASE_URL = "https://apilist.tronscanapi.com/api/transaction";
    const headers: any = {};
    if (CONFIG.TRONSCAN_KEY) headers["TRON-PRO-API-KEY"] = CONFIG.TRONSCAN_KEY;
    const url = `${BASE_URL}?sort=-timestamp&count=true&limit=20&start=0&address=${address}`;
    const response = await fetch(url, { headers });
    const json = await response.json();
    if (!json.data || !Array.isArray(json.data)) return [];

    return json.data.map((tx: any) => {
      const isSent = tx.ownerAddress === address;
      const amount = tx.amount ? formatUnits(BigInt(tx.amount), 6) : (tx.trigger_info?.call_value ? formatUnits(BigInt(tx.trigger_info.call_value), 6) : "0");
      return {
        id: tx.hash, source: 'WEB3', type: isSent ? 'SEND' : 'RECEIVE',
        title: tx.contractType === 1 ? '보냄' : (tx.contractType === 2 ? '받음' : '실행'),
        amount: amount, symbol: 'TRX', status: tx.result === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        timestamp: Math.floor(tx.timestamp / 1000), detailUrl: `https://tronscan.org/#/transaction/${tx.hash}`,
        counterparty: tx.toAddress || '-', network: 'Tron'
      };
    });
  } catch (e) { return []; }
}

// ==========================================================
// ✨ [NEW] 선택한 네트워크만 쏙 골라서 조회하는 함수
// ==========================================================
export async function fetchActivitiesByNetwork(wallets: WalletSlot[], networkId: string): Promise<ActivityItem[]> {
  
  // 1. 선택된 네트워크 정보 찾기
  const targetNetwork = SUPPORTED_NETWORKS.find(n => n.id === networkId);
  if (!targetNetwork) return [];

  const promises: Promise<ActivityItem[]>[] = [];

  // 2. 내 지갑들 중, 해당 네트워크에 맞는 주소가 있는 지갑만 필터링해서 요청
  wallets.forEach(wallet => {
    
    // Case A: EVM 네트워크를 선택했다면 -> EVM 주소가 있는 지갑만 조회
    if (targetNetwork.type === 'EVM' && wallet.addresses.evm) {
      promises.push(fetchEvmViaRelay(wallet.addresses.evm, targetNetwork));
    }
    
    // Case B: Solana 선택 -> Sol 주소가 있는 지갑만 조회
    else if (targetNetwork.type === 'SOL' && wallet.addresses.sol) {
      promises.push(fetchSolanaHistory(wallet.addresses.sol));
    }

    // Case C: Tron 선택 -> Trx 주소가 있는 지갑만 조회
    else if (targetNetwork.type === 'TRON' && wallet.addresses.trx) {
      promises.push(fetchTronHistory(wallet.addresses.trx));
    }
  });

  // 3. 결과 병합
  const results = await Promise.allSettled(promises);
  const allActivities: ActivityItem[] = [];

  results.forEach(res => {
    if (res.status === 'fulfilled') {
      allActivities.push(...res.value);
    }
  });

  // 최신순 정렬
  return allActivities.sort((a, b) => b.timestamp - a.timestamp);
}