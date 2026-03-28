import { useState, useEffect, useRef } from "react";
import { useActiveAccount } from "thirdweb/react"; 
import { CompactBadgeRow } from './KYCBadge';
import { hasKYCOnDevice } from '../services/kycDeviceService';
import { KYCRegistrationModal } from './KYCRegistrationModal';
import { 
  Laptop, X, Plus, Trash2, Copy, RefreshCw, ShieldCheck, 
  CloudUpload, CloudDownload, MoreVertical, Monitor, Wallet, Power, 
  TrendingUp, TrendingDown, Check, Loader2
} from "lucide-react";

// Components
import { ActionButtons } from "./ActionButtons";
import { ProfileHeader } from "./ProfileHeader"; 
import { AddWalletModal } from "./AddWalletModal";
import { AddAddressModal } from "./AddAddressModal";
import { SeedBackupModal } from "./AssetSeedBackupModal";
import { SeedImportModal } from "./AssetSeedImportModal";
import { DeviceNameModal } from "./DeviceNameModal"; 
import { WalletSyncModal } from "./WalletSyncModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";

// Utils & Services
import { getSpecificProvider } from "../utils/walletProviderUtils"; 
import { getMyWallets, deleteWallet } from "../services/walletService";
import { fetchCryptoPrices } from "../services/priceService";
import { hasLocalPrivateKey } from "../utils/SolanaLocalWallet";
import { getDeviceId, registerCurrentDevice, getMyDevices } from "../utils/deviceService";
import { getPrivateKeyForAddress } from "../utils/localWalletManager"; 
import { initEIP6963 } from "../utils/eip6963Manager";

// Types
import type { WalletSlot } from "../services/walletService";
import type { PriceData } from "../services/priceService";

import { WalletDetailView } from "./WalletDetailView";
import { DepositDrawer } from "./DepositDrawer";
import { CexWithdrawModal } from "./CexWithdrawModal"; // ✨ [수정 1] 주석 해제 및 활성화
import { Web3TransferModal } from "./Web3TransferModal";

interface AssetsViewProps {
  onSwapClick: () => void; 
}

// ✨ [수정] NATIVE 모드 제거
type CurrencyMode = 'KRW' | 'USD';

export function AssetsView({ onSwapClick }: AssetsViewProps) { 
  const smartAccount = useActiveAccount(); 
  const [showKYCReg, setShowKYCReg]       = useState(false);
  const [kycRegRefresh, setKycRegRefresh] = useState(0);
  
  // === Data States ===
  const [wallets, setWallets] = useState<WalletSlot[]>([]);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(false);
  
  // === Device States ===
  const [currentDeviceName, setCurrentDeviceName] = useState("");
  const [allDevices, setAllDevices] = useState<any[]>([]); 
  const [isDeviceNameModalOpen, setIsDeviceNameModalOpen] = useState(false);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const currentDeviceId = getDeviceId(); 

  // === UI States ===
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSlotIdForAdd, setSelectedSlotIdForAdd] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [mnemonicToBackup, setMnemonicToBackup] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasSolPrivateKey, setHasSolPrivateKey] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // === Wallet Detection State ===
  const [providerAddresses, setProviderAddresses] = useState<Record<string, string | null>>({});
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);

  // === View Mode States ===
  const [mode, setMode] = useState<CurrencyMode>('KRW');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // === Sync Menu States ===
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [syncModalConfig, setSyncModalConfig] = useState<{
    isOpen: boolean;
    mode: 'EXPORT_TO_CLOUD' | 'IMPORT_FROM_CLOUD';
    wallet: WalletSlot | null;
  }>({ isOpen: false, mode: 'EXPORT_TO_CLOUD', wallet: null });

  const [selectedWallet, setSelectedWallet] = useState<WalletSlot | null>(null);
  const [isDepositDrawerOpen, setIsDepositDrawerOpen] = useState(false);

  // 업비트 출금 관련 State
  const [cexWithdrawConfig, setCexWithdrawConfig] = useState<{
    isOpen: boolean;
    sourceWallet: WalletSlot | null;
    targetAddress: string;
  }>({ isOpen: false, sourceWallet: null, targetAddress: '' });

  const [web3TransferConfig, setWeb3TransferConfig] = useState<{
    isOpen: boolean;
    sourceWallet: WalletSlot | null;
    targetAddress: string;
  }>({ isOpen: false, sourceWallet: null, targetAddress: '' });

  // 1. 초기화 및 Provider 감시
  useEffect(() => {
    initEIP6963();

    const init = async () => {
      if (!smartAccount) return;
      const devices = await getMyDevices(smartAccount.address);
      setAllDevices(devices);
      const current = await registerCurrentDevice(smartAccount.address);
      if (current && current.nickname) {
        setCurrentDeviceName(current.nickname);
      } else {
        setIsDeviceNameModalOpen(true);
      }
      setHasSolPrivateKey(hasLocalPrivateKey());
      await refreshData();
    };

    const checkAllProviders = async () => {
        const win = window as any;
        const newStatus: Record<string, string | null> = {};

        // 1. MetaMask (EVM)
        try {
            const provider = getSpecificProvider('METAMASK');
            if (provider) {
                const acc = await provider.request({ method: 'eth_accounts' }).catch(() => []);
                if (acc[0]) newStatus['METAMASK_EVM'] = acc[0].toLowerCase();
            }
        } catch(e) {}

        // 2. OKX
        try {
            const evmProvider = getSpecificProvider('OKX');
            if (evmProvider) {
                const acc = await evmProvider.request({ method: 'eth_accounts' }).catch(() => []);
                if (acc[0]) newStatus['OKX_EVM'] = acc[0].toLowerCase();
            }
            if (win.okxwallet?.solana?.publicKey) newStatus['OKX_SOL'] = win.okxwallet.solana.publicKey.toString();
            if (win.okxwallet?.tronLink?.tronWeb?.defaultAddress?.base58) newStatus['OKX_TRON'] = win.okxwallet.tronLink.tronWeb.defaultAddress.base58;
        } catch(e) {}

        // 3. Phantom
        try {
            const solProvider = win.solana?.isPhantom ? win.solana : win.phantom?.solana;
            if (solProvider?.publicKey) newStatus['PHANTOM_SOL'] = solProvider.publicKey.toString();
            if (win.phantom?.ethereum) {
                const acc = await win.phantom.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
                if (acc[0]) newStatus['PHANTOM_EVM'] = acc[0].toLowerCase();
            }
        } catch(e) {}

        // 4. Rabby & Solflare
        try {
            const provider = getSpecificProvider('RABBY');
            if (provider) {
                const acc = await provider.request({ method: 'eth_accounts' }).catch(() => []);
                if (acc[0]) newStatus['RABBY_EVM'] = acc[0].toLowerCase();
            }
        } catch(e) {}
        try {
            if (win.solflare?.publicKey) newStatus['SOLFLARE_SOL'] = win.solflare.publicKey.toString();
        } catch(e) {}

        setProviderAddresses(prev => {
            let hasChange = false;
            const merged = { ...prev };
            Object.keys(newStatus).forEach(key => {
                if (merged[key] !== newStatus[key]) {
                    merged[key] = newStatus[key];
                    hasChange = true;
                }
            });
            return hasChange ? merged : prev;
        });
        
        if (newStatus['METAMASK_EVM']) setInjectedAddress(newStatus['METAMASK_EVM']);
    };

    init();
    
    const interval = setInterval(checkAllProviders, 2000);
    checkAllProviders(); 
    window.addEventListener('focus', checkAllProviders);

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDeviceMenuOpen(false);
      }
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
      const [list, priceData] = await Promise.all([
        getMyWallets(smartAccount.address),
        fetchCryptoPrices()
      ]);
      // SSS 지갑이 있으면 AA(XLOT) 슬롯 숨김
      // (AA는 user_id 역할만 하고 실제 자산 지갑이 아님)
      const hasSSSWallet = list.some(w => w.wallet_type === 'XLOT_SSS');
      const filtered = hasSSSWallet
        ? list.filter(w => w.wallet_type !== 'XLOT')
        : list;

      // SSS 지갑 맨 앞으로
      const sorted = [
        ...filtered.filter(w => w.wallet_type === 'XLOT_SSS'),
        ...filtered.filter(w => w.wallet_type === 'XLOT'),
        ...filtered.filter(w => !['XLOT_SSS', 'XLOT'].includes(w.wallet_type)),
      ];
      setWallets(sorted);
      setPrices(priceData);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleDeviceNameSet = async () => { setIsDeviceNameModalOpen(false); };
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
      alert("삭제 중 오류가 발생했습니다: " + e.message);
      await refreshData();
    } finally {
      setLoading(false);
      setDeleteTargetId(null);
    }
  };

  const handleForceConnect = async (e: React.MouseEvent, wallet: WalletSlot) => {
    e.stopPropagation();
    const win = window as any;
    
    const isSolana = !!wallet.addresses.sol;
    const isTron = !!wallet.addresses.trx;
    const isEvm = !!wallet.addresses.evm;
    const type = wallet.wallet_type;

    let currentAddress = "";

    try {
        // A. Solana
        if (isSolana) {
            let provider;
            if (type === 'OKX') provider = win.okxwallet?.solana;
            else if (type === 'PHANTOM') provider = win.solana?.isPhantom ? win.solana : win.phantom?.solana;
            else if (type === 'SOLFLARE') provider = win.solflare;
            else provider = win.solflare || win.okxwallet?.solana || win.solana;

            if (!provider) throw new Error("Solana 지갑 객체를 찾을 수 없습니다.");

            const resp = await provider.connect();
            currentAddress = resp.publicKey ? resp.publicKey.toString() : provider.publicKey.toString();
            
            const key = `${type}_SOL`;
            setProviderAddresses(prev => ({ ...prev, [key]: currentAddress }));
            
            if (wallet.addresses.sol?.toLowerCase() !== currentAddress.toLowerCase()) {
                 alert(`⚠️ 주소 불일치!\n현재: ${currentAddress.slice(0,6)}...\n목표: ${wallet.addresses.sol?.slice(0,6)}...`);
            }
            return;
        }
        // B. Tron
        if (isTron) {
            let provider = type === 'OKX' ? win.okxwallet?.tronLink : win.tronLink;
            if (!provider) throw new Error("Tron 지갑을 찾을 수 없습니다.");

            const res = await provider.request({ method: 'tron_requestAccounts' });
            if (res.code === 200) currentAddress = res.address.base58;
            else if (res.length > 0) currentAddress = res[0];

            if (currentAddress) {
                const key = `${type}_TRON`;
                setProviderAddresses(prev => ({ ...prev, [key]: currentAddress }));
            }
            return;
        }
        // C. EVM
        if (isEvm) {
            let targetType = type === 'MANUAL' ? 'METAMASK' : type;
            let provider = getSpecificProvider(targetType);
            
            if (!provider && (targetType === 'METAMASK' || targetType === 'RABBY' || targetType === 'OKX')) {
                console.warn(`${targetType} 전용 객체 없음, Fallback 시도`);
                provider = win.ethereum;
            }

            if (!provider) throw new Error(`${targetType} 지갑을 찾을 수 없습니다.`);

            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            currentAddress = accounts[0].toLowerCase();
            
            const key = `${targetType}_EVM`;
            setProviderAddresses(prev => ({ ...prev, [key]: currentAddress }));
            setInjectedAddress(currentAddress);

            const target = wallet.addresses.evm?.toLowerCase();
            if (target && currentAddress !== target) {
                 try {
                    await provider.request({
                        method: "wallet_requestPermissions",
                        params: [{ eth_accounts: {} }]
                    });
                 } catch (err) {
                     alert(`⚠️ 주소 불일치! 지갑에서 계정을 전환해주세요.\n현재 연결된 계정: ${currentAddress.slice(0,6)}...`);
                 }
            }
        }

    } catch (err: any) {
        console.error("Connect Error:", err);
        alert(`연결 실패: ${err.message}`);
    }
  };

  const isWalletActive = (wallet: WalletSlot) => {
    // 1. CEX & Manual (항상 Active)
    if (['UPBIT', 'BINANCE', 'BITHUMB', 'OKX_CEX', 'MANUAL'].includes(wallet.wallet_type)) {
        return true;
    }

    // 2. XLOT_SSS — 슬롯에 등록됐으면 active (Supabase에 Vault 있음)
    //    서명 시점에 OTP 인증으로 Share 복원하므로 별도 로컬 상태 불필요
    if (wallet.wallet_type === 'XLOT_SSS') return true;

    if (wallet.addresses.evm) {
        const slotAddr = wallet.addresses.evm.toLowerCase();
        if (smartAccount?.address?.toLowerCase() === slotAddr) return true;
        if (!!getPrivateKeyForAddress('EVM', slotAddr)) return true;

        const type = wallet.wallet_type === 'MANUAL' ? 'METAMASK' : wallet.wallet_type;
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

  // 상세 자산 리스트 렌더링
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
                                  ? `$${asset.value.toLocaleString(undefined, {maximumFractionDigits: 2})}` 
                                  : `₩${(asset.value * (prices?.exchangeRate || 1450)).toLocaleString(undefined, {maximumFractionDigits: 0})}`
                               }
                           </p>
                           {asset.change !== 0 && (
                               <span className={`text-[9px] flex items-center ${asset.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                   {asset.change > 0 ? <TrendingUp size={8}/> : <TrendingDown size={8}/>}
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

  // ✨ [수정] 가격 계산 오류 해결
  // walletService에서 이미 정확히 계산된 'total_value_krw'를 최우선으로 사용합니다.
  // 예전처럼 'balances.evm * ethPrice' 식의 부정확한 Fallback 계산을 제거했습니다.
  const getDisplayValue = (wallet: WalletSlot) => {
    // DB/Service에서 계산해준 정확한 KRW 총액
    const totalKrw = wallet.total_value_krw || 0;
    const exchangeRate = prices?.exchangeRate || 1450;

    if (mode === 'USD') {
        const totalUsd = totalKrw / exchangeRate;
        return (
          <>
            <span className="text-lg text-slate-500 mr-1">≈</span>
            $ {totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </>
        );
    } else {
        return (
          <>
            <span className="text-lg text-slate-500 mr-1">≈</span>
            ₩ {totalKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </>
        );
    }
  };

  // ✨ [수정] 전체 자산 합계 표시 (Token 탭 제거 반영)
  const getTotalBalanceDisplay = () => {
    if (!prices) return "...";
    
    // 각 지갑의 정확한 KRW 총액을 합산
    const totalKrw = wallets.reduce((acc, w) => acc + (w.total_value_krw || 0), 0);
    const exchangeRate = prices.exchangeRate || 1450;

    if (mode === 'USD') {
        return (
          <>
            <span className="text-2xl text-slate-500 mr-2">≈</span>
            $ {(totalKrw / exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </>
        );
    } else {
        return (
          <>
            <span className="text-2xl text-slate-500 mr-2">≈</span>
            ₩ {totalKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </>
        );
    }
  };

  const getWalletStyle = (type: string) => {
    switch (type) {
      case 'XLOT': return { bg: 'bg-transparent', text: '', icon: <div className="rounded-full overflow-hidden p-0.5 bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg"><img src="/icon-192.png" alt="xLOT" className="w-9 h-9 object-cover rounded-full bg-slate-900" /></div> };
      case 'XLOT_SSS': return { bg: 'bg-transparent', text: '', icon: <div className="rounded-full overflow-hidden p-0.5 bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg"><img src="/icon-192.png" alt="xLOT SSS" className="w-9 h-9 object-cover rounded-full bg-slate-900" /></div> };
      case 'METAMASK': return { bg: 'bg-orange-500/20', text: 'text-orange-500', icon: <span className="text-lg">🦊</span> };
      case 'RABBY': return { bg: 'bg-blue-500/20', text: 'text-blue-500', icon: <span className="text-lg">🐰</span> };
      case 'PHANTOM': return { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: <span className="text-lg">👻</span> };
      case 'UPBIT': return { bg: 'bg-indigo-500/20', text: 'text-indigo-400', icon: <span className="font-bold text-xs">Up</span> };
      case 'BINANCE': return { bg: 'bg-yellow-500/10', text: 'text-yellow-500', icon: <span className="text-lg">🟡</span> };
      case 'OKX_CEX': return { bg: 'bg-slate-700', text: 'text-white', icon: <span className="font-bold text-[10px]">OKX</span> };
      case 'SOLANA': return { bg: 'bg-green-500/20', text: 'text-green-500', icon: <span className="font-bold text-[10px]">SOL</span> };
      case 'BITCOIN': return { bg: 'bg-orange-600/20', text: 'text-orange-600', icon: <span className="font-bold text-[10px]">BTC</span> };
      case 'TRON': return { bg: 'bg-red-500/20', text: 'text-red-500', icon: <span className="font-bold text-[10px]">TRX</span> };
      case 'OKX': return { bg: 'bg-slate-800', text: 'text-white', icon: <span className="font-bold text-[10px]">OKX</span> };
      case 'SOLFLARE': return { bg: 'bg-orange-400/20', text: 'text-orange-400', icon: <span className="text-lg">☀️</span> };
      default: return { bg: 'bg-slate-800', text: 'text-slate-400', icon: <Wallet size={20} /> };
    }
  };

  // [채우기 버튼 핸들러]
  const handleDetailDeposit = () => {
    // 1. 업비트(CEX)인 경우 -> 앱/사이트 열기
    if (selectedWallet?.wallet_type === 'UPBIT') {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const url = isMobile ? "upbitapp://deposit" : "https://upbit.com/deposit";
        window.open(url, '_blank');
    } 
    // 2. [중요] Web3 지갑인 경우 -> 채우기 서랍(Drawer) 열기
    else {
        setIsDepositDrawerOpen(true); // ✨ 이 줄이 없으면 아무 반응이 없습니다!
    }
  };

// [수정된 핸들러] 채우기 소스 선택
  const handleDepositSourceSelect = (sourceWallet: WalletSlot) => {
    setIsDepositDrawerOpen(false);

    // 타겟 주소 (현재 보고 있는 지갑)
    const targetAddr = selectedWallet?.addresses.evm || selectedWallet?.addresses.sol || "";
    if (!targetAddr) return alert("받을 주소가 없습니다.");

    // CASE 1: 업비트 -> 내 지갑 (CEX 출금)
    if (['UPBIT', 'BINANCE'].includes(sourceWallet.wallet_type)) {
        setCexWithdrawConfig({
            isOpen: true,
            sourceWallet: sourceWallet,
            targetAddress: targetAddr,
        });
    } 
    // CASE 2: Web3 지갑 -> 내 지갑 (Web3 이체) - ✨ 여기를 뚫었습니다!
    else {
        setWeb3TransferConfig({
            isOpen: true,
            sourceWallet: sourceWallet,
            targetAddress: targetAddr
        });
    }
  };

  // [보내기 핸들러] : 상세 페이지에서 '보내기' 클릭 시 실행됨
  const handleSendClick = () => {
    if (!selectedWallet) return;
    
    // 1. 현재 지갑이 업비트라면 -> 업비트 출금 모달 실행
    if (['UPBIT', 'BINANCE'].includes(selectedWallet.wallet_type)) {
        // ✨ [수정 3] 업비트 출금 모달을 '일반 송금 모드'로 엽니다.
        setCexWithdrawConfig({
            isOpen: true,
            sourceWallet: selectedWallet, // 출금할 지갑 (업비트)
            targetAddress: '' // 빈 값 (유저가 직접 입력해야 함)
        });
    } else {
        // 2. 일반 Web3 지갑이라면 -> 기존 로직 (나중에 Web3 전송 모달 연결)
        alert("Web3 보내기 모달을 띄웁니다."); 
    }
  };

  // [RENDER] 상세 페이지 모드
  if (selectedWallet) {
    return (
      <>
        {/* 1. 상세 페이지 (Base Layer: z-[100]) */}
        <WalletDetailView 
          wallet={selectedWallet}
          onBack={() => setSelectedWallet(null)}
          onDeposit={handleDetailDeposit} // 연결 잘 되어 있음!
          onSend={handleSendClick}
          currencyMode={mode}
          exchangeRate={prices?.exchangeRate || 1450}
        />
        
        {/* 2. 채우기 서랍 (Layer: z-[110] - 상세페이지보다 높아야 함!) */}
        {isDepositDrawerOpen && (
           <div className="relative z-[110]"> {/* ✨ 여기를 감싸주세요! */}
             <DepositDrawer 
               myWallets={wallets} 
               currentWalletId={selectedWallet.id}
               onClose={() => setIsDepositDrawerOpen(false)}
               onSelectSource={handleDepositSourceSelect}
             />
           </div>
        )}

        {/* 3. CEX 출금 모달 (Layer: z-[120] - 가장 높게!) */}
        {cexWithdrawConfig.isOpen && cexWithdrawConfig.sourceWallet && (
          <div className="relative z-[120]"> {/* ✨ 여기도 안전하게 감싸주세요! */}
            <CexWithdrawModal 
               sourceWallet={cexWithdrawConfig.sourceWallet}
               targetAddress={cexWithdrawConfig.targetAddress}
               onClose={() => setCexWithdrawConfig({ ...cexWithdrawConfig, isOpen: false })}
               onSuccess={() => {
                   setCexWithdrawConfig({ ...cexWithdrawConfig, isOpen: false });
                   refreshData(); 
                   alert("출금 요청이 완료되었습니다. 업비트 앱에서 승인해주세요.");
               }}
            />
          </div>
        )}

        {/* ✨ [NEW] Web3 이체 모달 */}
        {web3TransferConfig.isOpen && web3TransferConfig.sourceWallet && (
          <div className="relative z-[120]">
             <Web3TransferModal 
               sourceWallet={web3TransferConfig.sourceWallet}
               targetAddress={web3TransferConfig.targetAddress}
               onClose={() => setWeb3TransferConfig({ ...web3TransferConfig, isOpen: false })}
               onSuccess={() => {
                   setWeb3TransferConfig({ ...web3TransferConfig, isOpen: false });
                   refreshData();
                   alert("이체 요청이 완료되었습니다.");
               }}
             />
          </div>
        )}
      </>
    );
  }

  const renderAddressRows = (wallet: WalletSlot) => {
    const list = [];
    if (wallet.wallet_type === 'XLOT' || wallet.wallet_type === 'XLOT_SSS') {
       if (wallet.addresses.evm) list.push({ key: 'EVM', addr: wallet.addresses.evm, color: 'text-cyan-400', bg: 'bg-cyan-500/10' });
       if (wallet.addresses.sol) list.push({ key: 'SOL', addr: wallet.addresses.sol, color: 'text-green-400', bg: 'bg-green-500/10' });
       if (wallet.addresses.btc) list.push({ key: 'BTC', addr: wallet.addresses.btc, color: 'text-orange-400', bg: 'bg-orange-500/10' });
       if (wallet.addresses.trx) list.push({ key: 'TRX', addr: wallet.addresses.trx, color: 'text-red-400', bg: 'bg-red-500/10' });
    }
    else {
       // EVM
       if ((wallet.wallet_type === 'METAMASK' || wallet.wallet_type === 'RABBY' || wallet.wallet_type === 'MANUAL' || wallet.wallet_type === 'OKX') && wallet.addresses.evm) {
           list.push({ key: 'EVM', addr: wallet.addresses.evm, color: 'text-cyan-400', bg: 'bg-cyan-500/10' });
       }
       // SOL
       else if ((wallet.wallet_type === 'SOLANA' || wallet.wallet_type === 'PHANTOM' || wallet.wallet_type === 'SOLFLARE' || wallet.wallet_type === 'OKX') && wallet.addresses.sol) {
           list.push({ key: 'SOL', addr: wallet.addresses.sol, color: 'text-green-400', bg: 'bg-green-500/10' });
       }
       // TRON
       else if ((wallet.wallet_type === 'TRON' || wallet.wallet_type === 'OKX') && wallet.addresses.trx) {
           list.push({ key: 'TRX', addr: wallet.addresses.trx, color: 'text-red-400', bg: 'bg-red-500/10' });
       }
       // BTC
       else if ((wallet.wallet_type === 'BITCOIN' || wallet.wallet_type === 'OKX') && wallet.addresses.btc) {
           list.push({ key: 'BTC', addr: wallet.addresses.btc, color: 'text-orange-400', bg: 'bg-orange-500/10' });
       }
       // Fallback for Manual EVM
       else if (wallet.addresses.evm) {
           list.push({ key: 'EVM', addr: wallet.addresses.evm, color: 'text-cyan-400', bg: 'bg-cyan-500/10' });
       }
    }

    if (list.length === 0) return null;

    return (
      <div className="flex flex-col gap-1 mt-1">
        {list.map((item) => {
          const uniqueId = `${wallet.id}-${item.key}`;
          return (
            <div key={item.key} className="flex items-center gap-2 group/addr min-w-0">
               <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.bg} ${item.color} w-9 text-center shrink-0`}>{item.key}</span>
               <p className="text-xs text-slate-500 font-mono truncate">{item.addr.slice(0, 6)}...{item.addr.slice(-4)}</p>
               <button onClick={(e) => handleCopy(e, item.addr!, uniqueId)} className={`text-slate-500 hover:text-cyan-400 transition-all ${copiedId === uniqueId ? "opacity-100" : "opacity-0 group-hover/addr:opacity-100"}`} title="주소 복사">
                 {copiedId === uniqueId ? <Check size={12} className="text-green-400"/> : <Copy size={12}/>}
               </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 pb-24 animate-fade-in max-w-lg mx-auto"> 
      <header className="mb-6 mt-2">
         {/* Header UI */}
         <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col gap-1">
               <h1 className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400">xLOT</h1>
               <div className="relative" ref={dropdownRef}>
                  <button onClick={() => setIsDeviceMenuOpen(!isDeviceMenuOpen)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-all cursor-pointer group">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                     <span className="text-[10px] font-bold text-slate-300">{currentDeviceName || "기기 설정 필요"} (접속중)</span>
                     <MoreVertical size={10} className="text-slate-500 group-hover:text-white" />
                  </button>
                  {isDeviceMenuOpen && (
                     <div className="absolute top-full left-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-20 p-2 animate-fade-in-up">
                        <p className="text-[10px] font-bold text-slate-500 mb-2 px-2">연결된 기기</p>
                        {allDevices.length <= 1 ? <p className="text-xs text-slate-600 px-2 pb-1">다른 기기 없음</p> : allDevices.filter(d => d.device_uuid !== currentDeviceId).map(d => (
                           <div key={d.id} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded-lg cursor-pointer">
                              <Monitor size={12} className="text-slate-400"/>
                              <div>
                                 <p className="text-xs font-bold text-slate-300">{d.nickname}</p>
                                 <p className="text-[9px] text-slate-600">{new Date(d.last_active).toLocaleDateString()}</p>
                              </div>
                           </div>
                        ))}
                        <div className="border-t border-slate-800 mt-1 pt-1">
                           <button onClick={() => { setIsDeviceNameModalOpen(true); setIsDeviceMenuOpen(false); }} className="w-full text-left text-[10px] text-cyan-400 hover:text-cyan-300 p-2 flex items-center gap-1">
                              <Laptop size={10} /> 이 기기 이름 변경
                           </button>
                        </div>
                     </div>
                  )}
               </div>
            </div>
            <ProfileHeader />
         </div>

         {/* ✨ [수정] Token 탭 제거 (KRW | USD 2개만 유지) */}
         <div className="flex justify-center mb-6">
            <div className="bg-slate-900 p-1 rounded-xl flex border border-slate-800">
               {(['KRW', 'USD'] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === m ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>
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
            <div className="flex items-baseline justify-center sm:justify-start gap-2 relative min-h-[48px]">
               {loading && wallets.length === 0 ? (
                  <div className="flex items-center gap-3 h-full">
                     <Loader2 size={28} className="animate-spin text-cyan-400" />
                  </div>
               ) : (
                 <>
                   <p className="text-4xl font-extrabold text-white tracking-tight">{getTotalBalanceDisplay()}</p>
                   <span className="text-lg text-slate-500 font-bold">{mode === 'KRW' ? 'KRW' : 'USD'}</span>
                 </>
               )}
            </div>
         </div>
         <ActionButtons onSwap={onSwapClick} />
      </header>

      {/* 내 자산 목록 */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-500">내 자산 목록</h2>
          <button onClick={() => setIsAddModalOpen(true)} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-500/10 px-3 py-1.5 rounded-full transition-colors">
            <Plus size={14} /> 슬롯 추가
          </button>
        </div>

        {loading && wallets.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 rounded-2xl border border-slate-800 bg-slate-900 animate-pulse">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-3 w-full">
                    <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0"></div>
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                      <div className="h-3 bg-slate-800 rounded w-2/3"></div>
                      <div className="h-3 bg-slate-800 rounded w-1/2 mt-2"></div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center">
                  <div className="h-8 bg-slate-800 rounded-xl w-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl">
            <p className="text-slate-500 text-sm">자산을 추가해보세요.</p>
          </div>
        ) : (
          wallets.map((wallet) => {
            const isActive = isWalletActive(wallet);
            const style = getWalletStyle(wallet.wallet_type);
            const isMenuOpen = activeMenuId === wallet.id; // ✨ 현재 메뉴가 열려있는지 확인
            
            return (
              <div 
                key={wallet.id} 
                // ✨ [수정 1] 카드 전체를 클릭하면 상세 페이지로 이동
                onClick={() => setSelectedWallet(wallet)}
                // ✨ [수정 2] 마우스를 올렸을 때 클릭 가능하다는 표시 (cursor-pointer)
                className={`cursor-pointer relative p-5 rounded-2xl border shadow-lg group transition-all 
                  ${wallet.wallet_type === 'XLOT' ? 'bg-slate-900 border-cyan-500/30' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}
                  ${isMenuOpen ? 'z-50' : 'z-0'} 
                `}
              >
                
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner shrink-0 ${style.bg} ${style.text}`}>
                        {style.icon}
                     </div>
                     <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                           <h3 className={`font-bold text-sm truncate ${wallet.wallet_type === 'XLOT' ? 'text-cyan-400' : 'text-white'}`}>
                             {wallet.label}
                           </h3>
                           
                           {/* 상태 버튼 */}
                           <button 
                             // ✨ [수정 3] 버튼 클릭 시, 상세 페이지 이동(부모 이벤트)을 막음 (e.stopPropagation)
                             onClick={(e) => {
                               e.stopPropagation(); // 여기가 핵심입니다!
                               if (!isActive) handleForceConnect(e, wallet);
                             }}
                             className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border transition-all shrink-0
                               ${isActive 
                                 ? 'bg-green-500/10 border-green-500/20 text-green-400 cursor-default' 
                                 : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700 hover:text-white hover:border-slate-500 cursor-pointer'}`
                             }
                           >
                             <Power size={8} className={isActive ? "" : "opacity-50"}/>
                             {isActive ? "Active" : "Connect"}
                           </button>
                        </div>
                        {/* renderAddressRows 내부의 복사 버튼들도 e.stopPropagation()이 되어 있어야 합니다 (이전 코드에 이미 적용됨) */}
                        {renderAddressRows(wallet)}
                     </div>
                  </div>

                  {/* 드롭다운 메뉴 */}
                  <div className="relative shrink-0 ml-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); // 기존 코드 유지 (이미 잘 되어 있음)
                          setActiveMenuId(activeMenuId === wallet.id ? null : wallet.id);
                        }}
                        className="p-2 text-slate-500 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {/* ... (드롭다운 메뉴 내부도 e.stopPropagation이 적용되어 있으므로 안심) ... */}
                      {activeMenuId === wallet.id && (
                      <>
                        <div className="fixed inset-0 z-10 cursor-default" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} />
                        
                        {/* ✨ [수정 2] 드롭다운 자체의 z-index도 높게 설정 (z-50) */}
                        <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                          {isActive && (
                            <button onClick={() => setSyncModalConfig({ isOpen: true, mode: 'EXPORT_TO_CLOUD', wallet })} className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                              <CloudUpload size={14} className="text-cyan-400"/> Export to Cloud
                            </button>
                          )}
                          <button onClick={() => setSyncModalConfig({ isOpen: true, mode: 'IMPORT_FROM_CLOUD', wallet })} className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700">
                            <CloudDownload size={14} className="text-green-400"/> Import from Cloud
                          </button>
                          <button onClick={(e) => handleDeleteClick(e, wallet.id)} className="w-full px-4 py-3 text-left text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-t border-slate-700">
                              <Trash2 size={14}/> 슬롯 삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 상세 토큰 리스트 */}
                {renderAssetList(wallet)}

                <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-xl font-bold text-white transition-all duration-300">
                        {getDisplayValue(wallet)}
                      </span>
                    </div>
                </div>

                {/* KYC 배지 — XLOT / XLOT_SSS 공통 */}
                {(wallet.wallet_type === 'XLOT' || wallet.wallet_type === 'XLOT_SSS') && smartAccount && (
                  <div className="mt-3 pt-3 border-t border-slate-800/50"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-2">
                      <CompactBadgeRow
                        key={kycRegRefresh}
                        userId={smartAccount.address}
                        onRequest={() => setShowKYCReg(true)}
                      />
                      {wallet.wallet_type === 'XLOT_SSS' && (
                        hasKYCOnDevice(smartAccount.address)
                          ? <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0">
                              실명 저장됨
                            </span>
                          : <button
                              onClick={() => setShowKYCReg(true)}
                              className="text-[9px] text-slate-500 hover:text-cyan-400 whitespace-nowrap shrink-0 transition-colors">
                              실명 등록 →
                            </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {showKYCReg && (
        <KYCRegistrationModal
          onClose={() => setShowKYCReg(false)}
          onSuccess={() => setKycRegRefresh(r => r + 1)}
        />
      )}
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
    </div>
  );
}