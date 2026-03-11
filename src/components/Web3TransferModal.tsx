import { useState, useEffect, useMemo } from "react";
import { X, ArrowRight, ArrowRightLeft, Loader2, CheckCircle, ChevronDown, Wallet } from "lucide-react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareTransaction, toWei, getContract } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { transfer } from "thirdweb/extensions/erc20";
import { client } from "../client"; 
import type { WalletSlot} from "../services/walletService";
import type { WalletAsset } from "../services/walletService";


interface Props {
  sourceWallet: WalletSlot;       // 보내는 지갑
  targetAddress: string;          // 받는 주소 (자동 입력됨)
  onClose: () => void;
  onSuccess: () => void;
}

// 네트워크 이름과 ChainID 매핑 (확장 가능)
const CHAIN_MAP: Record<string, number> = {
    'Ethereum': 1,
    'Sepolia': 11155111,
    'Polygon': 137,
    'Amoy': 80002,
    'Base': 8453,
    'Arbitrum': 42161,
    'Optimism': 10,
    'Binance Smart Chain': 56,
};

export function Web3TransferModal({ sourceWallet, targetAddress, onClose, onSuccess }: Props) {
  const account = useActiveAccount();
  const { mutate: sendTransaction, isPending } = useSendTransaction();

  // === UI States ===
  const [step, setStep] = useState<'INPUT' | 'RESULT'>('INPUT');
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);
  
  // === Data States ===
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 1. 초기 자산 설정 (잔액 있는 첫 번째 자산)
  useEffect(() => {
    if (sourceWallet.assets && sourceWallet.assets.length > 0) {
        // 잔액이 있는 것 중 첫번째, 없으면 그냥 첫번째
        const firstWithBalance = sourceWallet.assets.find(a => a.balance > 0) || sourceWallet.assets[0];
        setSelectedAsset(firstWithBalance);
    }
  }, [sourceWallet]);

  // 2. 현재 연결된 지갑이 '보내는 지갑'과 일치하는지 체크
  const isCorrectWallet = useMemo(() => {
      if (!account?.address || !sourceWallet.addresses.evm) return false;
      return account.address.toLowerCase() === sourceWallet.addresses.evm.toLowerCase();
  }, [account, sourceWallet]);

  // 3. 전송 실행
  const handleTransfer = async () => {
    if (!amount || !selectedAsset) return;
    setError(null);

    // 지갑 연결 확인
    if (!isCorrectWallet) {
        setError(`지갑이 다릅니다. '${sourceWallet.label}' 지갑으로 연결해주세요.`);
        return;
    }

    try {
      // 체인 설정
      const chainId = CHAIN_MAP[selectedAsset.network];
      if (!chainId) throw new Error(`지원하지 않는 네트워크입니다: ${selectedAsset.network}`);
      
      const chain = defineChain(chainId);
      let transaction;

      // A. Native Token (ETH, POL, BNB...)
      if (selectedAsset.isNative) {
          transaction = prepareTransaction({
            to: targetAddress,
            chain: chain,
            client: client,
            value: toWei(amount),
          });
      } 
      // B. ERC20 Token
      else if (selectedAsset.tokenAddress) {
          const contract = getContract({
              client,
              chain,
              address: selectedAsset.tokenAddress
          });
          
          transaction = transfer({
              contract,
              to: targetAddress,
              amount: amount // ERC20 transfer extension handles decimals automatically usually, or use toUnits
          });
      } else {
          throw new Error("올바르지 않은 자산 정보입니다.");
      }

      // 전송 요청
      sendTransaction(transaction, {
        onSuccess: () => {
            setStep('RESULT');
        },
        onError: (err) => {
            console.error(err);
            // 사용자가 거부했을 때 메시지 처리
            if (err.message.includes("rejected")) {
                setError("사용자가 서명을 거부했습니다.");
            } else {
                setError("전송 실패: " + err.message);
            }
        }
      });

    } catch (e: any) {
      setError(e.message);
    }
  };

  // 자산 목록 (잔액이 있는 것만 보여주거나 전체 보여주거나 선택)
  const availableAssets = sourceWallet.assets || [];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800 shrink-0">
           <h3 className="font-bold text-white flex items-center gap-2">
              <span className="text-cyan-400">Web3</span> 이체
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">채우기 모드</span>
           </h3>
           <button onClick={onClose}><X size={20} className="text-slate-500 hover:text-white"/></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar relative">
           {step === 'INPUT' && (
             <div className="space-y-6">
                {/* 1. From -> To Info */}
                <div className="flex items-center justify-between gap-2 p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="text-center w-5/12 overflow-hidden">
                        <p className="text-xs text-slate-500 mb-1">보내는 곳</p>
                        <p className="text-sm font-bold text-white truncate">{sourceWallet.label}</p>
                    </div>
                    <ArrowRight className="text-slate-600 shrink-0"/>
                    <div className="text-center w-5/12 overflow-hidden">
                        <p className="text-xs text-slate-500 mb-1">받는 곳 (나)</p>
                        <p className="text-sm font-bold text-cyan-400 truncate">내 지갑</p>
                        <p className="text-[9px] text-slate-600 truncate">{targetAddress.slice(0,6)}...{targetAddress.slice(-4)}</p>
                    </div>
                </div>

                {/* 2. 자산 선택 (Asset Selector) */}
                <div>
                  <label className="text-xs font-bold text-slate-400 mb-2 block ml-1">보낼 자산</label>
                  <button 
                    type="button" 
                    onClick={() => setIsAssetSelectorOpen(true)} 
                    className="w-full p-4 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-between hover:border-cyan-500/50 transition-all"
                  >
                     {selectedAsset ? (
                         <div className="flex items-center gap-3">
                             <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white
                                 ${selectedAsset.isNative ? 'bg-slate-700' : 'bg-slate-900 border border-slate-700'}`}>
                                 {selectedAsset.symbol[0]}
                             </div>
                             <div className="text-left">
                                 <p className="text-sm font-bold text-white">{selectedAsset.symbol}</p>
                                 <p className="text-[10px] text-slate-500">{selectedAsset.network} · 잔액: {selectedAsset.balance.toFixed(4)}</p>
                             </div>
                         </div>
                     ) : (
                         <span className="text-slate-500 text-sm">자산을 선택하세요</span>
                     )}
                     <ChevronDown size={16} className="text-slate-500" />
                  </button>
                </div>

                {/* 3. 금액 입력 */}
                <div>
                   <label className="text-xs font-bold text-slate-400 mb-1 block">전송할 수량</label>
                   <div className="relative">
                     <input 
                        type="number" 
                        value={amount} 
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pr-16 text-lg font-bold text-white focus:outline-none focus:border-cyan-500"
                     />
                     <div className="absolute right-2 top-2 bottom-2 flex items-center">
                        <button 
                            onClick={() => selectedAsset && setAmount(selectedAsset.balance.toString())}
                            className="px-2 py-1 bg-slate-800 text-xs text-cyan-400 font-bold rounded-lg hover:bg-slate-700"
                        >
                            MAX
                        </button>
                     </div>
                   </div>
                   {selectedAsset && (
                       <p className="text-right text-xs text-slate-500 mt-1">
                           사용 가능: {selectedAsset.balance.toFixed(6)} {selectedAsset.symbol}
                       </p>
                   )}
                </div>

                {/* 4. Action Button */}
                <button 
                  onClick={handleTransfer} 
                  disabled={isPending || !amount || parseFloat(amount) <= 0 || !isCorrectWallet}
                  className={`w-full py-4 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2
                    ${isCorrectWallet 
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-900/20' 
                        : 'bg-slate-800 cursor-not-allowed text-slate-500'}`}
                >
                   {isPending ? <Loader2 className="animate-spin"/> : <ArrowRightLeft/>} 
                   {isCorrectWallet ? '채우기' : '지갑 연결 필요'}
                </button>
             </div>
           )}

           {/* 결과 화면 */}
           {step === 'RESULT' && (
              <div className="text-center py-10 animate-fade-in">
                 <CheckCircle size={56} className="text-green-500 mx-auto mb-4"/>
                 <h3 className="text-2xl font-bold text-white mb-2">전송 요청 완료!</h3>
                 <p className="text-slate-400 text-sm mb-8">
                    블록체인 네트워크 상황에 따라<br/>
                    자산 도착까지 시간이 걸릴 수 있습니다.
                 </p>
                 <button onClick={onSuccess} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700">
                    확인
                 </button>
              </div>
           )}

           {/* 에러 메시지 */}
           {error && (
             <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 text-center">
                {error}
             </div>
           )}

           {/* === Asset Selector Modal (Overlay) === */}
           {isAssetSelectorOpen && (
               <div className="absolute inset-0 bg-slate-900 z-50 flex flex-col p-6 animate-fade-in-up">
                   <div className="flex justify-between items-center mb-4 shrink-0">
                       <h3 className="text-white font-bold">자산 선택</h3>
                       <button onClick={() => setIsAssetSelectorOpen(false)}><X size={20} className="text-slate-400"/></button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                       {availableAssets.length === 0 ? (
                           <p className="text-slate-500 text-center py-10">보유 자산이 없습니다.</p>
                       ) : (
                           availableAssets.map((asset, idx) => (
                               <button 
                                   key={idx} 
                                   onClick={() => { setSelectedAsset(asset); setIsAssetSelectorOpen(false); }}
                                   className={`w-full p-3 rounded-xl border text-left flex justify-between items-center transition-all
                                   ${selectedAsset?.symbol === asset.symbol && selectedAsset?.network === asset.network
                                       ? 'bg-cyan-500/10 border-cyan-500' 
                                       : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                               >
                                   <div className="flex items-center gap-3">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white
                                           ${asset.isNative ? 'bg-slate-600' : 'bg-slate-900'}`}>
                                           {asset.symbol[0]}
                                       </div>
                                       <div>
                                           <p className="text-sm font-bold text-white">{asset.symbol}</p>
                                           <p className="text-[10px] text-slate-400">{asset.network}</p>
                                       </div>
                                   </div>
                                   <div className="text-right">
                                       <p className="text-sm font-bold text-white">{asset.balance.toFixed(4)}</p>
                                   </div>
                               </button>
                           ))
                       )}
                   </div>
               </div>
           )}
        </div>
      </div>
    </div>
  );
}