// src/components/AssetView.tsx
// [Phase 4] KYC Credential 진입점 추가
// - xLOT 슬롯 카드 하단: CompactBadgeRow (배지 3개)
// - 배지 클릭 or "KYC 인증" 버튼 → PhoneClaimModal
// - 모달은 AssetView에서 관리 (WalletDetailView는 onKycRequest 콜백만 받음)
// - KYC 식별자: smartAccount.address (계정 단위)

import { useState, useEffect, useRef } from "react";
import { useActiveAccount } from "thirdweb/react";
import {
  Laptop, X, Plus, Trash2, Copy, RefreshCw, ShieldCheck,
  CloudUpload, CloudDownload, MoreVertical, Monitor, Wallet, Power,
  TrendingUp, TrendingDown, Check
} from "lucide-react";

// Components
import { ActionButtons }      from "./ActionButtons";
import { ProfileHeader }      from "./ProfileHeader";
import { AddWalletModal }     from "./AddWalletModal";
import { AddAddressModal }    from "./AddAddressModal";
import { SeedBackupModal }    from "./AssetSeedBackupModal";
import { SeedImportModal }    from "./AssetSeedImportModal";
import { DeviceNameModal }    from "./DeviceNameModal";
import { WalletSyncModal }    from "./WalletSyncModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { WalletDetailView }   from "./WalletDetailView";
import { DepositDrawer }      from "./DepositDrawer";
import { CexWithdrawModal }   from "./CexWithdrawModal";
import { Web3TransferModal }  from "./Web3TransferModal";
import { CompactBadgeRow }    from "./KYCBadge";
import { PhoneClaimModal }    from "./PhoneClaimModal";

// Utils & Services
import { getSpecificProvider }    from "../utils/walletProviderUtils";
import { getMyWallets, deleteWallet } from "../services/walletService";
import { fetchCryptoPrices }      from "../services/priceService";
import { hasLocalPrivateKey }     from "../utils/SolanaLocalWallet";
import { getDeviceId, registerCurrentDevice, getMyDevices } from "../utils/deviceService";
import { getPrivateKeyForAddress } from "../utils/localWalletManager";
import { initEIP6963 }            from "../utils/eip6963Manager";

// Types
import type { WalletSlot } from "../services/walletService";
import type { PriceData }  from "../services/priceService";
import type { ClaimType }  from "../services/credentialService";

interface AssetsViewProps {
  onSwapClick: () => void;
}

type CurrencyMode = 'KRW' | 'USD';

export function AssetsView({ onSwapClick }: AssetsViewProps) {
  const smartAccount = useActiveAccount();

  // === Data States ===
  const [wallets, setWallets]   = useState<WalletSlot[]>([]);
  const [prices, setPrices]     = useState<PriceData | null>(null);
  const [loading, setLoading]   = useState(false);

  // === Device States ===
  const [currentDeviceName, setCurrentDeviceName] = useState("");
  const [allDevices, setAllDevices]               = useState<any[]>([]);
  const [isDeviceNameModalOpen, setIsDeviceNameModalOpen] = useState(false);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen]   = useState(false);
  const currentDeviceId = getDeviceId();

  // === UI States ===
  const [isAddModalOpen, setIsAddModalOpen]               = useState(false);
  const [selectedSlotIdForAdd, setSelectedSlotIdForAdd]   = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen]         = useState(false);
  const [mnemonicToBackup, setMnemonicToBackup]           = useState<string | null>(null);
  const [copiedId, setCopiedId]                           = useState<string | null>(null);
  const [hasSolPrivateKey, setHasSolPrivateKey]           = useState(false);
  const [deleteTargetId, setDeleteTargetId]               = useState<string | null>(null);

  // === Wallet Detection State ===
  const [providerAddresses, setProviderAddresses] = useState<Record<string, string | null>>({});
  const [injectedAddress, setInjectedAddress]     = useState<string | null>(null);

  // === View Mode States ===
  const [mode, setMode]     = useState<CurrencyMode>('KRW');
  const dropdownRef         = useRef<HTMLDivElement>(null);

  // === Sync Menu States ===
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [syncModalConfig, setSyncModalConfig] = useState<{
    isOpen: boolean;
    mode: 'EXPORT_TO_CLOUD' | 'IMPORT_FROM_CLOUD';
    wallet: WalletSlot | null;
  }>({ isOpen: false, mode: 'EXPORT_TO_CLOUD', wallet: null });

  const [selectedWallet, setSelectedWallet]     = useState<WalletSlot | null>(null);
  const [isDepositDrawerOpen, setIsDepositDrawerOpen] = useState(false);

  const [cexWithdrawConfig, setCexWithdrawConfig] = useState<{
    isOpen: boolean; sourceWallet: WalletSlot | null; targetAddress: string;
  }>({ isOpen: false, sourceWallet: null, targetAddress: '' });

  const [web3TransferConfig, setWeb3TransferConfig] = useState<{
    isOpen: boolean; sourceWallet: WalletSlot | null; targetAddress: string;
  }>({ isOpen: false, sourceWallet: null, targetAddress: '' });

  // === Phase 4: KYC Modal (계정 단위, smartAccount.address 기준) ===
  const [kycModalOpen, setKycModalOpen]         = useState(false);
  const [kycInitialType, setKycInitialType]     = useState<ClaimType | undefined>(undefined);
  const [kycBadgeRefresh, setKycBadgeRefresh]   = useState(0);

  // userId = Thirdweb smartAccount.address (계정 식별자)
  const userId = smartAccount?.address || '';

  const handleKycRequest = (type?: ClaimType) => {
    setKycInitialType(type);
    setKycModalOpen(true);
  };

  const handleKycSuccess = () => {
    setKycModalOpen(false);
    setKycBadgeRefresh(n => n + 1); // xLOT 카드 배지 즉시 갱신
  };

  // 1. 초기화 및 Provider 감시
  useEffect(() => {
    initEIP6963();

    const init = async () => {
      if (!smartAccount) return;
      const devices = await getMyDevices(smartAccount.address);
      setAllDevices(devices);
      const current = await registerCurrentDevice(smartAccount.address);
      if (current?.nickname) setCurrentDeviceName(current.nickname);
      else setIsDeviceNameModalOpen(true);
      setHasSolPrivateKey(hasLocalPrivateKey());
      await refreshData();
    };

    const checkAllProviders = async () => {
      const win = window as any;
      const newStatus: Record<string, string | null> = {};

      try {
        const provider = getSpecificProvider('METAMASK');
        if (provider) {
          const acc = await provider.request({ method: 'eth_accounts' }).catch(() => []);
          if (acc[0]) newStatus['METAMASK_EVM'] = acc[0].toLowerCase();
        }
      } catch (e) {}

      try {
        const evmProvider = getSpecificProvider('OKX');
        if (evmProvider) {
          const acc = await evmProvider.request({ method: 'eth_accounts' }).catch(() => []);
          if (acc[0]) newStatus['OKX_EVM'] = acc[0].toLowerCase();
        }
        if (win.okxwallet?.solana?.publicKey) newStatus['OKX_SOL'] = win.okxwallet.solana.publicKey.toString();
        if (win.okxwallet?.tronLink?.tronWeb?.defaultAddress?.base58) newStatus['OKX_TRON'] = win.okxwallet.tronLink.tronWeb.defaultAddress.base58;
      } catch (e) {}

      try {
        const solProvider = win.solana?.isPhantom ? win.solana : win.phantom?.solana;
        if (solProvider?.publicKey) newStatus['PHANTOM_SOL'] = solProvider.publicKey.toString();
        if (win.phantom?.ethereum) {
          const acc = await win.phantom.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
          if (acc[0]) newStatus['PHANTOM_EVM'] = acc[0].toLowerCase();
        }
      } catch (e) {}

      try {
        const provider = getSpecificProvider('RABBY');
        if (provider) {
          const acc = await provider.request({ method: 'eth_accounts' }).catch(() => []);
          if (acc[0]) newStatus['RABBY_EVM'] = acc[0].toLowerCase();
        }
      } catch (e) {}

      try {
        if (win.solflare?.publicKey) newStatus['SOLFLARE_SOL'] = win.solflare.publicKey.toString();
      } catch (e) {}

      setProviderAddresses(prev => {
        const merged = { ...prev };
        let changed = false;
        Object.keys(newStatus).forEach(key => {
          if (merged[key] !== newStatus[key]) { merged[key] = newStatus[key]; changed = true; }
        });
        return changed ? merged : prev;
      });

      if (newStatus['METAMASK_EVM']) setInjectedAddress(newStatus['METAMASK_EVM']);
    };

    init();
    const interval = setInterval(checkAllProviders, 2000);
    checkAllProviders();
    window.addEventListener('focus', checkAllProviders);

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setIsDeviceMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkAllProviders);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [smartAccount]);

  const refreshData = async () => {
    if (!smartAccount) return;
    setLoading(true);
    try {
      const [list, priceData] = await Promise.all([getMyWallets(smartAccount.address), fetchCryptoPrices()]);
      setWallets(list);
      setPrices(priceData);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleDeviceNameSet = () => setIsDeviceNameModalOpen(false);

  const handleCopy = (e: React.MouseEvent, text: string, uniqueId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(uniqueId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveMenuId(null);
    setDeleteTargetId(id);
  };

  const executeDelete = async () => {
    if (!deleteTargetId) return;
    setLoading(true);
    setWallets(prev => prev.filter(w => w.id !== deleteTargetId));
    try {
      await deleteWallet(deleteTargetId);
      await refreshData();
    } catch (e: any) {
      alert("삭제 중 오류: " + e.message);
      await refreshData();
    } finally { setLoading(false); setDeleteTargetId(null); }
  };

  const handleForceConnect = async (e: React.MouseEvent, wallet: WalletSlot) => {
    e.stopPropagation();
    const win = window as any;
    const isSolana = !!wallet.addresses.sol;
    const isTron   = !!wallet.addresses.trx;
    const isEvm    = !!wallet.addresses.evm;
    const type     = wallet.wallet_type;
    let currentAddress = "";

    try {
      if (isSolana) {
        let provider;
        if (type === 'OKX')      provider = win.okxwallet?.solana;
        else if (type === 'PHANTOM')  provider = win.solana?.isPhantom ? win.solana : win.phantom?.solana;
        else if (type === 'SOLFLARE') provider = win.solflare;
        else provider = win.solflare || win.okxwallet?.solana || win.solana;
        if (!provider) throw new Error("Solana 지갑 객체를 찾을 수 없습니다.");
        const resp = await provider.connect();
        currentAddress = resp.publicKey ? resp.publicKey.toString() : provider.publicKey.toString();
        setProviderAddresses(prev => ({ ...prev, [`${type}_SOL`]: currentAddress }));
        if (wallet.addresses.sol?.toLowerCase() !== currentAddress.toLowerCase())
          alert(`⚠️ 주소 불일치!\n현재: ${currentAddress.slice(0, 6)}...\n목표: ${wallet.addresses.sol?.slice(0, 6)}...`);
        return;
      }
      if (isTron) {
        const provider = type === 'OKX' ? win.okxwallet?.tronLink : win.tronLink;
        if (!provider) throw new Error("Tron 지갑을 찾을 수 없습니다.");
        const res = await provider.request({ method: 'tron_requestAccounts' });
        if (res.code === 200) currentAddress = res.address.base58;
        else if (res.length > 0) currentAddress = res[0];
        if (currentAddress) setProviderAddresses(prev => ({ ...prev, [`${type}_TRON`]: currentAddress }));
        return;
      }
      if (isEvm) {
        const targetType = type === 'MANUAL' ? 'METAMASK' : type;
        let provider = getSpecificProvider(targetType);
        if (!provider) provider = win.ethereum;
        if (!provider) throw new Error(`${targetType} 지갑을 찾을 수 없습니다.`);
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        currentAddress = accounts[0].toLowerCase();
        setProviderAddresses(prev => ({ ...prev, [`${targetType}_EVM`]: currentAddress }));
        setInjectedAddress(currentAddress);
        const target = wallet.addresses.evm?.toLowerCase();
        if (target && currentAddress !== target) {
          try { await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }); }
          catch { alert(`⚠️ 주소 불일치! 지갑에서 계정을 전환해주세요.\n현재: ${currentAddress.slice(0, 6)}...`); }
        }
      }
    } catch (err: any) { alert(`연결 실패: ${err.message}`); }
  };

  const isWalletActive = (wallet: WalletSlot) => {
    if (['UPBIT', 'BINANCE', 'BITHUMB', 'OKX_CEX', 'MANUAL'].includes(wallet.wallet_type)) return true;
    if (wallet.addresses.evm) {
      const slotAddr = wallet.addresses.evm.toLowerCase();
      if (smartAccount?.address?.toLowerCase() === slotAddr) return true;
      if (!!getPrivateKeyForAddress('EVM', slotAddr)) return true;
      const type       = wallet.wallet_type === 'MANUAL' ? 'METAMASK' : wallet.wallet_type;
      const activeAddr = providerAddresses[`${type}_EVM`];
      if (activeAddr && activeAddr === slotAddr) return true;
      if (injectedAddress === slotAddr) return true;
    }
    if (wallet.addresses.sol) {
      if (wallet.wallet_type === 'XLOT' && hasSolPrivateKey) return true;
      if (!!getPrivateKeyForAddress('SOL', wallet.addresses.sol)) return true;
      const activeAddr = providerAddresses[`${wallet.wallet_type}_SOL`];
      if (activeAddr && activeAddr === wallet.addresses.sol) return true;
    }
    if (wallet.addresses.trx) {
      if (!!getPrivateKeyForAddress('TRON', wallet.addresses.trx)) return true;
      const activeAddr = providerAddresses[`${wallet.wallet_type}_TRON`];
      if (activeAddr && activeAddr === wallet.addresses.trx) return true;
    }
    return false;
  };

  const renderAssetList = (wallet: WalletSlot) => {
    if (!wallet.assets || wallet.assets.length === 0) return null;
    return (
      <div className="mt-3 flex flex-col gap-2">
        {wallet.assets.map((asset, idx) => (
          <div key={idx} className="flex justify-between items-center bg-slate-950/30 p-2 rounded-lg border border-slate-800/50 hover:bg-slate-950/50 transition-colors">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                ${asset.symbol === 'ETH' ? 'bg-slate-700 text-white' :
                  asset.symbol === 'POL' ? 'bg-purple-500/20 text-purple-400' :
                  asset.symbol === 'SOL' ? 'bg-green-500/20 text-green-400' :
                  'bg-slate-800 text-slate-400'}`}>
                {asset.symbol[0]}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">{asset.name}</p>
                <p className="text-[10px] text-slate-500">{asset.network}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-white">
                {asset.balance.toFixed(4)} <span className="text-[10px] text-slate-400">{asset.symbol}</span>
              </p>
              <div className="flex items-center justify-end gap-1">
                <p className="text-[10px] text-slate-500">
                  {mode === 'USD'
                    ? `$${asset.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `₩${(asset.value * (prices?.exchangeRate || 1450)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </p>
                {asset.change !== 0 && (
                  <span className={`text-[9px] flex items-center ${asset.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {asset.change > 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                    {Math.abs(asset.change).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const getDisplayValue = (wallet: WalletSlot) => {
    const totalKrw   = wallet.total_value_krw || 0;
    const rate       = prices?.exchangeRate || 1450;
    if (mode === 'USD') return <><span className="text-lg text-slate-500 mr-1">≈</span>$ {(totalKrw / rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>;
    return <><span className="text-lg text-slate-500 mr-1">≈</span>₩ {totalKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>;
  };

  const getTotalBalanceDisplay = () => {
    if (!prices) return "...";
    const totalKrw = wallets.reduce((acc, w) => acc + (w.total_value_krw || 0), 0);
    const rate     = prices.exchangeRate || 1450;
    if (mode === 'USD') return <><span className="text-2xl text-slate-500 mr-2">≈</span>$ {(totalKrw / rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>;
    return <><span className="text-2xl text-slate-500 mr-2">≈</span>₩ {totalKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>;
  };

  const getWalletStyle = (type: string) => {
    switch (type) {
      case 'XLOT':     return { bg: 'bg-gradient-to-br from-cyan-500 to-blue-500', text: 'text-white',      icon: <ShieldCheck size={20} /> };
      case 'METAMASK': return { bg: 'bg-orange-500/20',  text: 'text-orange-500',  icon: <span className="text-lg">🦊</span> };
      case 'RABBY':    return { bg: 'bg-blue-500/20',    text: 'text-blue-500',    icon: <span className="text-lg">🐰</span> };
      case 'PHANTOM':  return { bg: 'bg-purple-500/20',  text: 'text-purple-400',  icon: <span className="text-lg">👻</span> };
      case 'UPBIT':    return { bg: 'bg-indigo-500/20',  text: 'text-indigo-400',  icon: <span className="font-bold text-xs">Up</span> };
      case 'BINANCE':  return { bg: 'bg-yellow-500/10',  text: 'text-yellow-500',  icon: <span className="text-lg">🟡</span> };
      case 'OKX_CEX':  return { bg: 'bg-slate-700',      text: 'text-white',       icon: <span className="font-bold text-[10px]">OKX</span> };
      case 'SOLANA':   return { bg: 'bg-green-500/20',   text: 'text-green-500',   icon: <span className="font-bold text-[10px]">SOL</span> };
      case 'BITCOIN':  return { bg: 'bg-orange-600/20',  text: 'text-orange-600',  icon: <span className="font-bold text-[10px]">BTC</span> };
      case 'TRON':     return { bg: 'bg-red-500/20',     text: 'text-red-500',     icon: <span className="font-bold text-[10px]">TRX</span> };
      case 'OKX':      return { bg: 'bg-slate-800',      text: 'text-white',       icon: <span className="font-bold text-[10px]">OKX</span> };
      case 'SOLFLARE': return { bg: 'bg-orange-400/20',  text: 'text-orange-400',  icon: <span className="text-lg">☀️</span> };
      default:         return { bg: 'bg-slate-800',      text: 'text-slate-400',   icon: <Wallet size={20} /> };
    }
  };

  const handleDetailDeposit = () => {
    if (selectedWallet?.wallet_type === 'UPBIT') {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      window.open(isMobile ? "upbitapp://deposit" : "https://upbit.com/deposit", '_blank');
    } else {
      setIsDepositDrawerOpen(true);
    }
  };

  const handleDepositSourceSelect = (sourceWallet: WalletSlot) => {
    setIsDepositDrawerOpen(false);
    const targetAddr = selectedWallet?.addresses.evm || selectedWallet?.addresses.sol || "";
    if (!targetAddr) return alert("받을 주소가 없습니다.");
    if (['UPBIT', 'BINANCE'].includes(sourceWallet.wallet_type)) {
      setCexWithdrawConfig({ isOpen: true, sourceWallet, targetAddress: targetAddr });
    } else {
      setWeb3TransferConfig({ isOpen: true, sourceWallet, targetAddress: targetAddr });
    }
  };

  const handleSendClick = () => {
    if (!selectedWallet) return;
    if (['UPBIT', 'BINANCE'].includes(selectedWallet.wallet_type)) {
      setCexWithdrawConfig({ isOpen: true, sourceWallet: selectedWallet, targetAddress: '' });
    } else {
      alert("Web3 보내기 모달을 띄웁니다.");
    }
  };

  const renderAddressRows = (wallet: WalletSlot) => {
    const list: { key: string; addr: string; color: string; bg: string }[] = [];
    if (wallet.wallet_type === 'XLOT') {
      if (wallet.addresses.evm) list.push({ key: 'EVM', addr: wallet.addresses.evm, color: 'text-cyan-400',   bg: 'bg-cyan-500/10' });
      if (wallet.addresses.sol) list.push({ key: 'SOL', addr: wallet.addresses.sol, color: 'text-purple-400', bg: 'bg-purple-500/10' });
    } else {
      if (['METAMASK', 'RABBY', 'MANUAL', 'OKX'].includes(wallet.wallet_type) && wallet.addresses.evm)
        list.push({ key: 'EVM', addr: wallet.addresses.evm, color: 'text-cyan-400', bg: 'bg-cyan-500/10' });
      else if (['SOLANA', 'PHANTOM', 'SOLFLARE', 'OKX'].includes(wallet.wallet_type) && wallet.addresses.sol)
        list.push({ key: 'SOL', addr: wallet.addresses.sol, color: 'text-green-400', bg: 'bg-green-500/10' });
      else if (['TRON', 'OKX'].includes(wallet.wallet_type) && wallet.addresses.trx)
        list.push({ key: 'TRX', addr: wallet.addresses.trx, color: 'text-red-400', bg: 'bg-red-500/10' });
      else if (['BITCOIN', 'OKX'].includes(wallet.wallet_type) && wallet.addresses.btc)
        list.push({ key: 'BTC', addr: wallet.addresses.btc, color: 'text-orange-400', bg: 'bg-orange-500/10' });
      else if (wallet.addresses.evm)
        list.push({ key: 'EVM', addr: wallet.addresses.evm, color: 'text-cyan-400', bg: 'bg-cyan-500/10' });
    }
    if (list.length === 0) return null;
    return (
      <div className="flex flex-col gap-1 mt-1">
        {list.map(item => {
          const uid = `${wallet.id}-${item.key}`;
          return (
            <div key={item.key} className="flex items-center gap-2 group/addr min-w-0">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.bg} ${item.color} w-9 text-center shrink-0`}>{item.key}</span>
              <p className="text-xs text-slate-500 font-mono truncate">{item.addr.slice(0, 6)}...{item.addr.slice(-4)}</p>
              <button onClick={(e) => handleCopy(e, item.addr, uid)}
                className={`text-slate-500 hover:text-cyan-400 transition-all ${copiedId === uid ? "opacity-100" : "opacity-0 group-hover/addr:opacity-100"}`}>
                {copiedId === uid ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // [RENDER] 상세 페이지 모드
  if (selectedWallet) {
    return (
      <>
        <WalletDetailView
          wallet={selectedWallet}
          onBack={() => setSelectedWallet(null)}
          onDeposit={handleDetailDeposit}
          onSend={handleSendClick}
          currencyMode={mode}
          exchangeRate={prices?.exchangeRate || 1450}
          onKycRequest={handleKycRequest}
        />
        {isDepositDrawerOpen && (
          <div className="relative z-[110]">
            <DepositDrawer
              myWallets={wallets}
              currentWalletId={selectedWallet.id}
              onClose={() => setIsDepositDrawerOpen(false)}
              onSelectSource={handleDepositSourceSelect}
            />
          </div>
        )}
        {cexWithdrawConfig.isOpen && cexWithdrawConfig.sourceWallet && (
          <div className="relative z-[120]">
            <CexWithdrawModal
              sourceWallet={cexWithdrawConfig.sourceWallet}
              targetAddress={cexWithdrawConfig.targetAddress}
              onClose={() => setCexWithdrawConfig({ ...cexWithdrawConfig, isOpen: false })}
              onSuccess={() => { setCexWithdrawConfig({ ...cexWithdrawConfig, isOpen: false }); refreshData(); alert("출금 요청 완료. 업비트 앱에서 승인해주세요."); }}
            />
          </div>
        )}
        {web3TransferConfig.isOpen && web3TransferConfig.sourceWallet && (
          <div className="relative z-[120]">
            <Web3TransferModal
              sourceWallet={web3TransferConfig.sourceWallet}
              targetAddress={web3TransferConfig.targetAddress}
              onClose={() => setWeb3TransferConfig({ ...web3TransferConfig, isOpen: false })}
              onSuccess={() => { setWeb3TransferConfig({ ...web3TransferConfig, isOpen: false }); refreshData(); alert("이체 요청 완료."); }}
            />
          </div>
        )}
        {/* KYC 모달 — 상세 페이지에서도 접근 가능 */}
        {kycModalOpen && (
          <PhoneClaimModal
            initialClaimType={kycInitialType}
            onClose={() => setKycModalOpen(false)}
            onSuccess={handleKycSuccess}
          />
        )}
      </>
    );
  }

  // [RENDER] 메인 자산 목록
  return (
    <div className="p-6 pb-24 animate-fade-in">
      <header className="mb-6 mt-2">
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400">xLOT</h1>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setIsDeviceMenuOpen(!isDeviceMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-all cursor-pointer group">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-300">{currentDeviceName || "기기 설정 필요"} (접속중)</span>
                <MoreVertical size={10} className="text-slate-500 group-hover:text-white" />
              </button>
              {isDeviceMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-20 p-2 animate-fade-in-up">
                  <p className="text-[10px] font-bold text-slate-500 mb-2 px-2">연결된 기기</p>
                  {allDevices.length <= 1
                    ? <p className="text-xs text-slate-600 px-2 pb-1">다른 기기 없음</p>
                    : allDevices.filter(d => d.device_uuid !== currentDeviceId).map(d => (
                      <div key={d.id} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded-lg cursor-pointer">
                        <Monitor size={12} className="text-slate-400" />
                        <div>
                          <p className="text-xs font-bold text-slate-300">{d.nickname}</p>
                          <p className="text-[9px] text-slate-600">{new Date(d.last_active).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  <div className="border-t border-slate-800 mt-1 pt-1">
                    <button onClick={() => { setIsDeviceNameModalOpen(true); setIsDeviceMenuOpen(false); }}
                      className="w-full text-left text-[10px] text-cyan-400 hover:text-cyan-300 p-2 flex items-center gap-1">
                      <Laptop size={10} /> 이 기기 이름 변경
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <ProfileHeader />
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-slate-900 p-1 rounded-xl flex border border-slate-800">
            {(['KRW', 'USD'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === m ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <p className="text-slate-400 text-sm font-bold">총 보유 자산</p>
            <button onClick={refreshData} disabled={loading} className="text-slate-500 hover:text-cyan-400 transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="flex items-baseline justify-center sm:justify-start gap-2">
            <p className="text-4xl font-extrabold text-white tracking-tight">{getTotalBalanceDisplay()}</p>
            <span className="text-lg text-slate-500 font-bold">{mode}</span>
          </div>
        </div>
        <ActionButtons onSwap={onSwapClick} />
      </header>

      {/* 자산 목록 */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-500">내 자산 목록</h2>
          <button onClick={() => setIsAddModalOpen(true)}
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-500/10 px-3 py-1.5 rounded-full transition-colors">
            <Plus size={14} /> 슬롯 추가
          </button>
        </div>

        {wallets.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl">
            <p className="text-slate-500 text-sm">자산을 추가해보세요.</p>
          </div>
        ) : (
          wallets.map(wallet => {
            const isActive   = isWalletActive(wallet);
            const style      = getWalletStyle(wallet.wallet_type);
            const isMenuOpen = activeMenuId === wallet.id;
            const isXlot     = wallet.wallet_type === 'XLOT';

            return (
              <div key={wallet.id} onClick={() => setSelectedWallet(wallet)}
                className={`cursor-pointer relative p-5 rounded-2xl border shadow-lg group transition-all
                  ${isXlot ? 'bg-slate-900 border-cyan-500/30' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}
                  ${isMenuOpen ? 'z-50' : 'z-0'}`}>

                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner shrink-0 ${style.bg} ${style.text}`}>
                      {style.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-bold text-sm truncate ${isXlot ? 'text-cyan-400' : 'text-white'}`}>
                          {wallet.label}
                        </h3>
                        <button
                          onClick={e => { e.stopPropagation(); if (!isActive) handleForceConnect(e, wallet); }}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border transition-all shrink-0
                            ${isActive
                              ? 'bg-green-500/10 border-green-500/20 text-green-400 cursor-default'
                              : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700 hover:text-white hover:border-slate-500 cursor-pointer'}`}>
                          <Power size={8} className={isActive ? "" : "opacity-50"} />
                          {isActive ? "Active" : "Connect"}
                        </button>
                      </div>
                      {renderAddressRows(wallet)}
                    </div>
                  </div>

                  {/* 드롭다운 메뉴 */}
                  <div className="relative shrink-0 ml-2">
                    <button onClick={e => { e.stopPropagation(); setActiveMenuId(activeMenuId === wallet.id ? null : wallet.id); }}
                      className="p-2 text-slate-500 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
                      <MoreVertical size={18} />
                    </button>
                    {activeMenuId === wallet.id && (
                      <>
                        <div className="fixed inset-0 z-10 cursor-default" onClick={e => { e.stopPropagation(); setActiveMenuId(null); }} />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                          {isActive && (
                            <button onClick={() => setSyncModalConfig({ isOpen: true, mode: 'EXPORT_TO_CLOUD', wallet })}
                              className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                              <CloudUpload size={14} className="text-cyan-400" /> Export to Cloud
                            </button>
                          )}
                          <button onClick={() => setSyncModalConfig({ isOpen: true, mode: 'IMPORT_FROM_CLOUD', wallet })}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700">
                            <CloudDownload size={14} className="text-green-400" /> Import from Cloud
                          </button>
                          <button onClick={e => handleDeleteClick(e, wallet.id)}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-t border-slate-700">
                            <Trash2 size={14} /> 슬롯 삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {renderAssetList(wallet)}

                <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-end">
                  <span className="text-xl font-bold text-white">{getDisplayValue(wallet)}</span>
                </div>

                {/* ── Phase 4: xLOT 슬롯 하단 KYC 배지 ── */}
                {isXlot && userId && (
                  <div className="mt-3 pt-3 border-t border-slate-800/50" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <ShieldCheck size={10} className="text-cyan-400" /> KYC 인증
                      </span>
                      <button onClick={() => handleKycRequest(undefined)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold transition-colors">
                        인증 관리 →
                      </button>
                    </div>
                    <CompactBadgeRow
                      key={kycBadgeRefresh}
                      userId={userId}
                      onRequest={handleKycRequest}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {isAddModalOpen && <AddWalletModal onClose={() => setIsAddModalOpen(false)} onSuccess={refreshData} />}
      {selectedSlotIdForAdd && <AddAddressModal slotId={selectedSlotIdForAdd} onClose={() => setSelectedSlotIdForAdd(null)} onSuccess={refreshData} />}
      {mnemonicToBackup && <SeedBackupModal mnemonic={mnemonicToBackup} onClose={() => setMnemonicToBackup(null)} />}
      {isImportModalOpen && <SeedImportModal onClose={() => setIsImportModalOpen(false)} onSuccess={() => { setHasSolPrivateKey(true); refreshData(); }} />}
      {isDeviceNameModalOpen && <DeviceNameModal onSuccess={handleDeviceNameSet} />}
      {syncModalConfig.isOpen && syncModalConfig.wallet && (
        <WalletSyncModal
          mode={syncModalConfig.mode}
          walletLabel={syncModalConfig.wallet.label}
          walletAddress={syncModalConfig.wallet.addresses.evm || syncModalConfig.wallet.addresses.sol || ""}
          chain={syncModalConfig.wallet.wallet_type === 'SOLANA' ? 'SOL' : 'EVM'}
          onClose={() => setSyncModalConfig({ ...syncModalConfig, isOpen: false })}
          onSuccess={refreshData}
        />
      )}
      {deleteTargetId && (
        <DeleteConfirmModal loading={loading} onClose={() => setDeleteTargetId(null)} onConfirm={executeDelete} />
      )}

      {/* Phase 4: KYC 모달 (계정 단위) */}
      {kycModalOpen && (
        <PhoneClaimModal
          initialClaimType={kycInitialType}
          onClose={() => setKycModalOpen(false)}
          onSuccess={handleKycSuccess}
        />
      )}
    </div>
  );
}