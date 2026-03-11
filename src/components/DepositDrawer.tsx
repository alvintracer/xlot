import { X, Wallet, ArrowRight } from "lucide-react";
import type { WalletSlot } from "../services/walletService";

interface Props {
  myWallets: WalletSlot[];
  currentWalletId: string;
  onClose: () => void;
  onSelectSource: (sourceWallet: WalletSlot) => void;
}

export function DepositDrawer({ myWallets, currentWalletId, onClose, onSelectSource }: Props) {
  // 현재 지갑을 제외한 나머지 지갑 리스트 (소스)
  const sourceOptions = myWallets.filter(w => w.id !== currentWalletId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-slate-900 rounded-t-3xl sm:rounded-3xl p-6 animate-fade-in-up border-t border-slate-800 sm:border shadow-2xl">
        <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-6 sm:hidden" />
        
        <div className="flex justify-between items-center mb-6">
           <h3 className="text-xl font-bold text-white">어디서 채울까요?</h3>
           <button onClick={onClose} className="p-2 bg-slate-800 rounded-full text-slate-400"><X size={18}/></button>
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
           {sourceOptions.length === 0 ? (
             <div className="text-center py-8 text-slate-500">가져올 다른 지갑이 없습니다.</div>
           ) : (
             sourceOptions.map(wallet => (
               <button 
                 key={wallet.id}
                 onClick={() => onSelectSource(wallet)}
                 className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800 transition-all group"
               >
                 <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg 
                       ${wallet.wallet_type === 'UPBIT' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                       {wallet.wallet_type === 'UPBIT' ? 'Up' : wallet.label[0]}
                    </div>
                    <div className="text-left">
                       <p className="font-bold text-white group-hover:text-cyan-400 transition-colors">{wallet.label}</p>
                       <p className="text-xs text-slate-500">{wallet.wallet_type}</p>
                    </div>
                 </div>
                 <ArrowRight size={16} className="text-slate-600 group-hover:text-cyan-400"/>
               </button>
             ))
           )}
        </div>
      </div>
    </div>
  );
}