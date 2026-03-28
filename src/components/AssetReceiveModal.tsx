import { useState, useEffect } from "react";
import { X, Copy, Check, ChevronDown, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useActiveAccount } from "thirdweb/react";
import { getMyWallets } from "../services/walletService";
import type { WalletSlot } from "../services/walletService";


export function ReceiveModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const smartAccount = useActiveAccount();
  
  const [wallets, setWallets] = useState<WalletSlot[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletSlot | null>(null);
  
  // ✨ 네트워크 선택 상태 (xLOT용)
  const [selectedNetwork, setSelectedNetwork] = useState<'EVM' | 'SOL' | 'BTC' | 'TRON'>('EVM');
  
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!smartAccount) return;
      const list = await getMyWallets(smartAccount.address);
      const validList = list.filter(w => w.wallet_type !== 'UPBIT');
      setWallets(validList);
      
      const defaultWallet = validList.find(w => w.wallet_type === 'XLOT_SSS') || validList.find(w => w.wallet_type === 'XLOT') || validList[0];
      setSelectedWallet(defaultWallet);
      
      // 지갑 바뀌면 네트워크 초기화
      if(defaultWallet?.wallet_type === 'XLOT' || defaultWallet?.wallet_type === 'XLOT_SSS') setSelectedNetwork('EVM');
      else if(defaultWallet?.wallet_type === 'SOLANA') setSelectedNetwork('SOL');
      else if(defaultWallet?.wallet_type === 'BITCOIN') setSelectedNetwork('BTC');
      else if(defaultWallet?.wallet_type === 'TRON') setSelectedNetwork('TRON');
      else setSelectedNetwork('EVM');
    };
    init();
  }, [smartAccount]);

  // 현재 선택된 주소 가져오기
  const getCurrentAddress = () => {
    if (!selectedWallet) return "";
    if (selectedWallet.wallet_type === 'XLOT' || selectedWallet.wallet_type === 'XLOT_SSS') {
      if (selectedNetwork === 'EVM') return selectedWallet.addresses.evm || "";
      if (selectedNetwork === 'SOL') return selectedWallet.addresses.sol || "";
      if (selectedNetwork === 'BTC') return selectedWallet.addresses.btc || "";
      if (selectedNetwork === 'TRON') return selectedWallet.addresses.trx || "";
    }
    // 단일 지갑들
    if (selectedWallet.addresses.evm) return selectedWallet.addresses.evm;
    if (selectedWallet.addresses.sol) return selectedWallet.addresses.sol;
    if (selectedWallet.addresses.btc) return selectedWallet.addresses.btc;
    if (selectedWallet.addresses.trx) return selectedWallet.addresses.trx;
    return "";
  };

  const currentAddress = getCurrentAddress();

  const handleCopy = () => {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end justify-center z-[100]">
      <div className="bg-slate-900 w-full max-w-lg rounded-t-3xl p-8 shadow-2xl border-t border-x border-slate-800 animate-slide-up flex flex-col items-center max-h-[90vh] overflow-y-auto custom-scrollbar">
        
        <div className="w-full flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">받기</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* 지갑 선택 */}
        <button onClick={() => setIsSelectorOpen(true)} className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-full mb-6 border border-slate-700 hover:bg-slate-700 transition-all">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs text-white overflow-hidden ${(selectedWallet?.wallet_type === 'XLOT' || selectedWallet?.wallet_type === 'XLOT_SSS') ? 'bg-slate-900 border border-slate-700' : 'bg-slate-600'}`}>
            {(selectedWallet?.wallet_type === 'XLOT' || selectedWallet?.wallet_type === 'XLOT_SSS') ? <img src="/icon-192.png" className="w-full h-full object-cover" alt="xLOT" /> : 'W'}
          </div>
          <span className="text-sm font-bold text-white">{selectedWallet?.label}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>

        {/* ✨ 네트워크 선택 칩 (xLOT일 때만 표시) */}
        {(selectedWallet?.wallet_type === 'XLOT' || selectedWallet?.wallet_type === 'XLOT_SSS') && (
          <div className="flex gap-2 mb-6 bg-slate-950 p-1 rounded-xl">
            {['EVM', 'SOL', 'BTC', 'TRON'].map(net => (
              <button
                key={net}
                onClick={() => setSelectedNetwork(net as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${selectedNetwork === net ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {net}
              </button>
            ))}
          </div>
        )}

        {/* QR 코드 */}
        <div className="bg-white p-4 rounded-3xl mb-6">
          {currentAddress ? <QRCodeSVG value={currentAddress} size={180} /> : <div className="w-[180px] h-[180px] bg-gray-200 animate-pulse rounded-xl"></div>}
        </div>

        {/* 주소 표시 */}
        <div className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 mb-2">
          <p className="text-xs text-slate-400 font-mono truncate flex-1">{currentAddress || "주소 없음"}</p>
          <button onClick={handleCopy} className="p-2 hover:bg-slate-800 rounded-lg text-cyan-400">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          <span className="text-cyan-400 font-bold">{selectedNetwork}</span> 네트워크 전용 주소입니다.
        </p>

        {/* 지갑 선택기 (생략 - 기존 코드와 동일 구조 사용) */}
        {isSelectorOpen && (
           <div className="absolute inset-0 bg-slate-900 z-50 p-6">
             {/* ... 지갑 목록 렌더링 ... */}
             <button onClick={() => setIsSelectorOpen(false)} className="absolute top-6 right-6 text-white"><X/></button>
             <div className="mt-10 space-y-3">
               {wallets.map(w => (
                 <button key={w.id} onClick={() => { setSelectedWallet(w); setIsSelectorOpen(false); }} className="w-full p-4 bg-slate-800 rounded-2xl text-left text-white font-bold">
                   {w.label}
                 </button>
               ))}
             </div>
           </div>
        )}
      </div>
    </div>
  );
}