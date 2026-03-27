// src/components/WalletDetailView.tsx
// [Phase 6-A] XLOT_SSS 멀티체인 주소 표시 추가

import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Copy, Send, Download, History,
  ArrowUpRight, ArrowDownLeft, Loader2, RefreshCw, Globe,
  Building2, Coins, ShieldCheck, Check
} from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import type { WalletSlot } from "../services/walletService";
import { fetchActivitiesByNetwork, SUPPORTED_NETWORKS } from "../services/activityService";
import type { ActivityItem } from "../services/activityService";
import { fetchUpbitActivity } from "../services/upbitService";
import { UpbitDepositModal } from "./UpbitDepositModal";
import { CompactBadgeRow } from "./KYCBadge";
import type { ClaimType } from "../services/credentialService";

interface Props {
  wallet: WalletSlot;
  onBack: () => void;
  onDeposit: () => void;
  onSend: () => void;
  currencyMode: 'KRW' | 'USD';
  exchangeRate: number;
  onKycRequest?: (type?: ClaimType) => void;
}

// 주소 체인별 설정
const CHAIN_CONFIG: Record<string, { label: string; color: string; bg: string; explorer: string }> = {
  evm: { label: 'EVM',  color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   explorer: 'https://etherscan.io/address/' },
  sol: { label: 'SOL',  color: 'text-green-400',  bg: 'bg-green-500/10',  explorer: 'https://solscan.io/account/' },
  btc: { label: 'BTC',  color: 'text-orange-400', bg: 'bg-orange-500/10', explorer: 'https://mempool.space/address/' },
  trx: { label: 'TRX',  color: 'text-red-400',    bg: 'bg-red-500/10',    explorer: 'https://tronscan.org/#/address/' },
};

export function WalletDetailView({ wallet, onBack, onDeposit, onSend, currencyMode, exchangeRate, onKycRequest }: Props) {
  const smartAccount = useActiveAccount();

  const [activities, setActivities]               = useState<ActivityItem[]>([]);
  const [loading, setLoading]                     = useState(false);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>('');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [copiedKey, setCopiedKey]                 = useState<string | null>(null);
  const [kycRefresh]                              = useState(0);

  const isCex    = ['UPBIT', 'BITHUMB', 'BINANCE'].includes(wallet.wallet_type);
  const isXlot   = wallet.wallet_type === 'XLOT';
  const isSSSWallet = wallet.wallet_type === 'XLOT_SSS';
  const userId   = smartAccount?.address || '';

  // 멀티체인 주소 목록 (XLOT_SSS용)
  const multiChainAddresses = useMemo(() => {
    if (!isSSSWallet) return [];
    return Object.entries({
      evm: wallet.addresses.evm,
      sol: wallet.addresses.sol,
      btc: wallet.addresses.btc,
      trx: wallet.addresses.trx,
    })
      .filter(([, addr]) => !!addr)
      .map(([key, addr]) => ({ key, addr: addr!, ...CHAIN_CONFIG[key] }));
  }, [isSSSWallet, wallet.addresses]);

  const availableNetworks = useMemo(() => {
    if (isCex) return [];
    return SUPPORTED_NETWORKS.filter(net => {
      if (net.type === 'EVM'  && wallet.addresses.evm) return true;
      if (net.type === 'SOL'  && wallet.addresses.sol) return true;
      if (net.type === 'TRON' && wallet.addresses.trx) return true;
      return false;
    });
  }, [wallet, isCex]);

  useEffect(() => {
    if (!isCex && availableNetworks.length > 0 && !selectedNetworkId) {
      setSelectedNetworkId(availableNetworks[0].id);
    }
  }, [availableNetworks, selectedNetworkId, isCex]);

  const loadHistory = async () => {
    setLoading(true); setActivities([]);
    try {
      if (isCex && wallet.wallet_type === 'UPBIT') {
        if (wallet.api_access_key && wallet.api_secret_key) {
          setActivities(await fetchUpbitActivity(wallet.api_access_key, wallet.api_secret_key));
        }
      } else if (selectedNetworkId) {
        setActivities(await fetchActivitiesByNetwork([wallet], selectedNetworkId));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isCex || selectedNetworkId) loadHistory();
  }, [wallet, selectedNetworkId, isCex]);

  const totalValue   = wallet.total_value_krw || 0;
  const displayValue = currencyMode === 'KRW'
    ? `₩ ${totalValue.toLocaleString()}`
    : `$ ${(totalValue / exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const mainAddress = wallet.addresses.evm || wallet.addresses.sol || "";

  const handleCopy = (addr: string, key: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const getActivityIcon = (type: string) => {
    if (type === 'RECEIVE') return <ArrowDownLeft size={18} className="text-blue-400" />;
    if (type === 'SEND')    return <ArrowUpRight  size={18} className="text-slate-400" />;
    return <History size={18} className="text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-fade-in">

      {/* HEADER */}
      <div className={`flex items-center justify-between p-4 border-b backdrop-blur z-10 safe-area-top
          ${isCex ? 'bg-indigo-950/20 border-indigo-500/20' : 'bg-slate-950/90 border-slate-900'}`}>
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h2 className="font-bold text-lg text-white flex items-center gap-2">
          {isCex       && <Building2  size={18} className="text-indigo-400" />}
          {isSSSWallet && <ShieldCheck size={18} className="text-cyan-400"  />}
          {wallet.label}
        </h2>
        <button onClick={loadHistory} disabled={loading} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32">

        {/* 1. 상단 카드 */}
        <div className={`text-center py-8 rounded-3xl mb-6 border relative overflow-hidden
            ${isCex ? 'bg-gradient-to-b from-indigo-900/20 to-slate-900 border-indigo-500/30'
            : isSSSWallet ? 'bg-gradient-to-b from-cyan-900/10 to-slate-900 border-cyan-500/20'
            : 'bg-slate-900 border-slate-800'}`}>

          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-2xl mb-4 relative z-10
              ${isSSSWallet ? 'bg-cyan-500/20 border-2 border-cyan-500/30 text-cyan-400'
              : isCex ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-slate-800 text-white'}`}>
            {isSSSWallet ? <ShieldCheck size={28} /> : wallet.label[0]}
          </div>

          <p className="text-slate-500 text-sm font-bold mb-1 relative z-10">총 보유 자산</p>
          <h1 className="text-4xl font-extrabold text-white tracking-tight relative z-10">{displayValue}</h1>

          {/* SSS 지갑 배지 */}
          {isSSSWallet && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
                Triple-Shield
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full">
                비수탁
              </span>
            </div>
          )}

          {/* 일반 지갑 단일 주소 */}
          {!isCex && !isSSSWallet && mainAddress && (
            <button onClick={() => handleCopy(mainAddress, 'main')}
              className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-slate-950/50 rounded-full border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-cyan-500/50 transition-all relative z-10">
              {mainAddress.slice(0, 6)}...{mainAddress.slice(-4)}
              {copiedKey === 'main' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          )}

          {isCex && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] font-bold text-green-400 relative z-10">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> API Connected
            </div>
          )}

          {/* KYC 배지 (XLOT 전용) */}
          {isXlot && userId && (
            <div className="mt-5 px-6 relative z-10">
              <CompactBadgeRow key={kycRefresh} userId={userId} onRequest={onKycRequest} />
            </div>
          )}
        </div>

        {/* ── XLOT_SSS 멀티체인 주소 섹션 ── */}
        {isSSSWallet && multiChainAddresses.length > 0 && (
          <div className="mb-6 bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={14} className="text-cyan-400" />
              <span className="text-sm font-bold text-white">멀티체인 주소</span>
            </div>
            {multiChainAddresses.map(({ key, addr, label, color, bg, explorer }) => (
              <div key={key} className={`${bg} border border-slate-800 rounded-2xl p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-black ${color}`}>{label}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => window.open(explorer + addr, '_blank')}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                      탐색기 ↗
                    </button>
                    <button onClick={() => handleCopy(addr, key)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors">
                      {copiedKey === key
                        ? <><Check size={10} className="text-emerald-400" /> 복사됨</>
                        : <><Copy size={10} /> 복사</>}
                    </button>
                  </div>
                </div>
                <p className="text-xs font-mono text-slate-300 break-all leading-relaxed">
                  {addr}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* KYC 섹션 (XLOT 전용) */}
        {isXlot && userId && (
          <div className="mb-6 bg-slate-900 border border-slate-800 rounded-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-cyan-400" />
                <span className="text-sm font-bold text-white">KYC 인증</span>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                  Privacy-Preserving
                </span>
              </div>
              <button onClick={() => onKycRequest?.(undefined)}
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300">
                인증 관리 →
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              개인정보 저장 없이 성인·실명·비제재 인증을 완료하세요.
            </p>
          </div>
        )}

        {/* CEX 자산 리스트 */}
        {isCex && wallet.assets.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-indigo-200 mb-3 px-1 flex items-center gap-2">
              <Coins size={14} /> 보유 코인
            </h3>
            <div className="space-y-2">
              {wallet.assets.map((asset, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-300 w-8">{asset.symbol}</span>
                    <span className="text-[10px] text-slate-500">{asset.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-white">{asset.balance.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500">
                      ≈ {currencyMode === 'KRW' ? '₩' : '$'}{(currencyMode === 'KRW' ? asset.value : asset.value / exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 활동 내역 */}
        <div>
          <div className="flex justify-between items-end mb-4 px-1">
            <h3 className="text-sm font-bold text-slate-400">
              {isCex ? '최근 입출금' : '최근 활동'}
            </h3>
            {!isCex && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Globe size={10} /> {SUPPORTED_NETWORKS.find(n => n.id === selectedNetworkId)?.name}
              </span>
            )}
          </div>

          {!isCex && (
            <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
              {availableNetworks.map(net => (
                <button key={net.id} onClick={() => setSelectedNetworkId(net.id)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border
                    ${selectedNetworkId === net.id
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                  {net.name}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="animate-spin text-cyan-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500">조회 중...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
              <History className="text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-slate-500">기록이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map(item => (
                <div key={item.id}
                  onClick={() => !isCex && item.detailUrl && window.open(item.detailUrl, '_blank')}
                  className={`flex justify-between items-center p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50 transition-all
                    ${!isCex ? 'hover:bg-slate-900 cursor-pointer' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center
                        ${item.type === 'RECEIVE' ? 'bg-blue-500/10' : 'bg-slate-800'}`}>
                      {getActivityIcon(item.type)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-300">{item.title}</p>
                      <p className="text-[10px] text-slate-600 font-mono">
                        {new Date(item.timestamp * 1000).toLocaleDateString()}
                        {isCex && (
                          <span className={`ml-1 ${item.status === 'SUCCESS' ? 'text-green-500' : 'text-yellow-500'}`}>
                            · {item.status}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${item.type === 'SEND' ? 'text-slate-300' : 'text-blue-400'}`}>
                      {item.type === 'SEND' ? '-' : '+'} {parseFloat(item.amount).toFixed(4)}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold">{item.symbol}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTIONS */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-8 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent z-20">
        <div className="flex gap-4 max-w-md mx-auto">
          <button onClick={() => isCex && wallet.wallet_type === 'UPBIT' ? setIsDepositModalOpen(true) : onDeposit()}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg border border-slate-700">
            <Download size={20} className={isCex ? "text-indigo-400" : "text-cyan-400"} /> 채우기
          </button>
          <button onClick={onSend}
            className={`flex-1 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg
              ${isCex ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500'}`}>
            <Send size={20} /> 보내기
          </button>
        </div>
      </div>

      {isDepositModalOpen && (
        <UpbitDepositModal wallet={wallet} onClose={() => setIsDepositModalOpen(false)} />
      )}
    </div>
  );
}