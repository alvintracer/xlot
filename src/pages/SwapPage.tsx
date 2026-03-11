import { useState, useEffect, useMemo } from "react";
import { X, ArrowRightLeft, ChevronDown, Loader2, Wallet, ShieldCheck, AlertCircle, Check } from "lucide-react"; 
import { useActiveAccount } from "thirdweb/react";
import { getMyWallets } from "../services/walletService";
import type { WalletSlot, WalletAsset } from "../services/walletService"; // ✨ WalletAsset 타입 사용

import { fetchCryptoPrices  } from "../services/priceService";
import type { PriceData } from "../services/priceService";

import { TOKEN_LIST } from "../constants/tokens"; 
import type { Token } from "../constants/tokens"; 
import { TokenSelectModal } from "../components/TokenSelectModal";

// ✨ 입력 모드
type InputMode = 'TOKEN' | 'KRW' | 'USD';

export function SwapPage() {
  const smartAccount = useActiveAccount();
  
  // === Data States ===
  const [wallets, setWallets] = useState<WalletSlot[]>([]);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // === Selection States ===
  const [selectedWallet, setSelectedWallet] = useState<WalletSlot | null>(null);
  
  // 1. 파는 자산 (내 지갑에 있는거)
  const [fromAsset, setFromAsset] = useState<WalletAsset | null>(null); // ✨ WalletAsset 사용
  // 2. 사는 자산 (목록에서 고르는거)
  const [toToken, setToToken] = useState<Token | null>(null);

  // === Input States ===
  const [amountInput, setAmountInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>('TOKEN');

  // === UI Toggles ===
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false); // From Asset
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);       // To Token

  // 1. 초기 데이터 로드
  useEffect(() => {
    const init = async () => {
      if (!smartAccount) return;
      try {
        const [walletList, priceData] = await Promise.all([
          getMyWallets(smartAccount.address),
          fetchCryptoPrices()
        ]);
        // 업비트 제외 (스왑 불가)
        const validWallets = walletList.filter(w => w.wallet_type !== 'UPBIT');
        setWallets(validWallets);
        setPrices(priceData);

        const defaultWallet = validWallets.find(w => w.wallet_type === 'XLOT') || validWallets[0];
        setSelectedWallet(defaultWallet);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    init();
  }, [smartAccount]);

  // 2. 내 지갑에서 '스왑 가능한 자산 목록' 생성
  // ✨ walletService가 준 assets 배열을 그대로 사용합니다.
  const myAssets = useMemo(() => {
    if (!selectedWallet) return [];
    
    // assets 배열이 있으면 그대로 사용
    if (selectedWallet.assets && selectedWallet.assets.length > 0) {
        return selectedWallet.assets;
    }
    
    // Fallback (비어있을 때 가짜 데이터 - SendModal과 동일)
    if (selectedWallet.addresses.evm) {
        return [{
            symbol: 'ETH', name: 'Ethereum', balance: selectedWallet.balances.evm || 0,
            price: prices?.tokens.eth.usd || 0, value: 0, change: 0, network: 'Sepolia', isNative: true
        } as WalletAsset];
    }
    return [];
  }, [selectedWallet, prices]);

  // 자산 목록 바뀌면 첫번째꺼 자동 선택
  useEffect(() => {
    if (myAssets.length > 0) {
      setFromAsset(myAssets[0]);
    }
  }, [selectedWallet]); // myAssets 변경 시마다 재설정되지 않게 selectedWallet 의존성

  // 3. '받을 코인' 목록 필터링
  // 현재 MVP에서는 '같은 네트워크' 내에서의 스왑만 가정하거나, 
  // 단순하게 모든 토큰을 보여주되 나중에 막는 방식을 택할 수 있습니다.
  // 여기서는 SendModal의 논리를 따라 "Amoy에서는 Amoy 토큰만" 보여주는 식의 필터링을 추가합니다.
  const availableBuyTokens = useMemo(() => {
    if (!fromAsset) return TOKEN_LIST;
    
    // fromAsset.network 값에 따라 필터링 (예: 'Amoy' -> chainId 80002)
    // 현재 TOKEN_LIST에 chainId가 있으므로 이를 활용
    let targetChainId = 1; // Default Mainnet
    if (fromAsset.network === 'Amoy') targetChainId = 80002;
    if (fromAsset.network === 'Sepolia') targetChainId = 11155111;
    
    // 같은 체인이고, 자기 자신이 아닌 것만 필터링
    const filtered = TOKEN_LIST.filter(t => 
        (t.chainId === targetChainId || t.chainId === 1) // 1은 메인넷(테스트용 허용)
        && t.symbol !== fromAsset.symbol
    );
    return filtered.length > 0 ? filtered : TOKEN_LIST; // 없으면 전체 보여줌
  }, [fromAsset]);

  // 받는 코인 초기값
  useEffect(() => {
    if (availableBuyTokens.length > 0 && !toToken) {
      const defaultToken = availableBuyTokens.find(t => t.symbol.includes('USD')) || availableBuyTokens[0];
      setToToken(defaultToken);
    }
  }, [availableBuyTokens]);


  // ✨ 4. 금액 계산 로직
  const finalSellAmount = useMemo(() => {
    if (!amountInput || !fromAsset) return "0";
    const val = parseFloat(amountInput);
    if (isNaN(val)) return "0";

    const priceUsd = fromAsset.price || 0;
    const exchangeRate = prices?.exchangeRate || 1450;
    const priceKrw = priceUsd * exchangeRate;

    if (inputMode === 'TOKEN') return amountInput;
    if (inputMode === 'KRW') return priceKrw > 0 ? (val / priceKrw).toFixed(6) : "0";
    if (inputMode === 'USD') return priceUsd > 0 ? (val / priceUsd).toFixed(6) : "0";
    return "0";
  }, [amountInput, inputMode, fromAsset, prices]);

  const convertedDisplay = useMemo(() => {
    if (!finalSellAmount || !fromAsset) return "";
    const amount = parseFloat(finalSellAmount);
    const priceUsd = fromAsset.price || 0;
    const exchangeRate = prices?.exchangeRate || 1450;

    if (inputMode === 'TOKEN') return `≈ ₩ ${(amount * priceUsd * exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    else return `≈ ${finalSellAmount} ${fromAsset.symbol}`;
  }, [finalSellAmount, inputMode, fromAsset, prices]);


  // 5. 예상 수령액 계산
  const estimatedBuyAmount = useMemo(() => {
    if (!finalSellAmount || !fromAsset || !toToken || !prices) return "0.0";
    const sellValueUsd = parseFloat(finalSellAmount) * fromAsset.price;
    
    // 받는 토큰 가격 매핑
    let buyPriceUsd = 0;
    const sym = toToken.symbol.toLowerCase();
    
    // prices 객체에서 매핑 시도
    if (sym.includes('eth')) buyPriceUsd = prices.tokens.eth.usd;
    else if (sym.includes('pol') || sym.includes('matic')) buyPriceUsd = prices.tokens.pol.usd;
    else if (sym.includes('btc')) buyPriceUsd = prices.tokens.btc.usd;
    else if (sym.includes('sol')) buyPriceUsd = prices.tokens.sol.usd;
    else if (sym.includes('usdc') || sym.includes('usdt')) buyPriceUsd = 1.0; 
    else buyPriceUsd = 1.0; // Fallback

    return buyPriceUsd > 0 ? (sellValueUsd / buyPriceUsd).toFixed(4) : "0.0";
  }, [finalSellAmount, fromAsset, toToken, prices]);


  // 스왑 가능 여부 (xLOT, MetaMask만 지원)
  const canSwap = selectedWallet?.wallet_type === 'XLOT' || selectedWallet?.wallet_type === 'METAMASK';

  const getWalletIcon = (type: string) => {
    switch (type) {
      case 'XLOT': return <ShieldCheck size={18} />;
      case 'METAMASK': return '🦊';
      default: return <Wallet size={18} />;
    }
  };

  return (
    <div className="p-6 space-y-4 pb-24 animate-fade-in relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-black text-white  tracking-wide">
          SWAP <span className="text-cyan-400">.</span>
        </h2>
        
        {/* 지갑 선택 버튼 */}
        <button 
          onClick={() => setIsWalletSelectorOpen(true)}
          className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full hover:border-cyan-500/50 transition-all"
        >
           <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${selectedWallet?.wallet_type === 'XLOT' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
             {getWalletIcon(selectedWallet?.wallet_type || '')}
           </div>
           <span className="text-xs font-bold text-slate-200 max-w-[100px] truncate">{selectedWallet?.label || "지갑 선택"}</span>
           <ChevronDown size={12} className="text-slate-500" />
        </button>
      </div>

      {/* 1. Pay Card (보내는 자산) */}
      <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 focus-within:border-cyan-500/50 transition-colors relative">
        <div className="flex justify-between items-center mb-4">
          <label className="text-xs font-bold text-slate-400">지불 (Pay)</label>
          <span className="text-xs text-slate-500">
             보유: <span className="text-slate-300 font-mono">{fromAsset?.balance.toFixed(4) || '0'}</span>
          </span>
        </div>

        <div className="flex gap-3 items-center">
          {/* 자산 선택 버튼 */}
          <button 
            onClick={() => setIsAssetSelectorOpen(true)}
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 p-2 pr-3 rounded-xl border border-slate-800 hover:border-cyan-500/30 transition-all shrink-0"
          >
            {fromAsset ? (
              <>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border
                   ${fromAsset.symbol === 'ETH' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 
                     fromAsset.symbol === 'POL' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                     fromAsset.symbol === 'SOL' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 
                     'bg-slate-700 border-slate-600 text-white'}`}>
                  {fromAsset.symbol[0]}
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold text-white leading-none">{fromAsset.symbol}</span>
                  <span className="text-[10px] text-slate-500">{fromAsset.network}</span>
                </div>
                <ChevronDown size={14} className="text-slate-500 ml-1" />
              </>
            ) : (
              <span className="text-sm text-slate-500 px-2">선택</span>
            )}
          </button>

          {/* 금액 입력 */}
          <div className="flex-1 text-right">
             <input 
               type="number" 
               value={amountInput}
               onChange={(e) => setAmountInput(e.target.value)}
               placeholder="0.0"
               className="w-full bg-transparent text-right text-3xl font-bold text-white outline-none placeholder-slate-700"
             />
          </div>
        </div>

        {/* 입력 모드 전환 & 환산 가치 */}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800/50">
           <button 
              type="button" 
              onClick={() => setInputMode(prev => prev === 'TOKEN' ? 'KRW' : prev === 'KRW' ? 'USD' : 'TOKEN')}
              className="flex items-center gap-1 text-[10px] font-bold bg-slate-800/50 text-cyan-400 px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ArrowRightLeft size={10} />
              {inputMode === 'TOKEN' ? fromAsset?.symbol : inputMode} 기준 입력
            </button>
            <span className="text-xs text-slate-500 font-mono">
              {convertedDisplay}
            </span>
        </div>
      </div>

      {/* Switch Arrow */}
      <div className="flex justify-center -my-6 relative z-10">
        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-slate-400 shadow-xl">
          <ArrowRightLeft size={18} className="rotate-90" strokeWidth={2.5} />
        </div>
      </div>

      {/* 2. Receive Card (받는 자산) */}
      <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 pt-8">
        <label className="text-xs font-bold text-slate-400 block mb-3">받기 (Receive)</label>
        
        <div className="flex gap-3 items-center">
          {/* 토큰 선택 버튼 */}
          <button 
            onClick={() => canSwap && setIsTokenModalOpen(true)}
            disabled={!canSwap || !fromAsset} 
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 p-2 pr-3 rounded-xl border border-slate-800 hover:border-blue-500/30 transition-all shrink-0"
          >
            {toToken ? (
              <>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold border border-slate-700 text-blue-400">
                  {toToken.symbol[0]}
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold text-white leading-none">{toToken.symbol}</span>
                  <span className="text-[10px] text-slate-500">{toToken.name.slice(0,8)}...</span>
                </div>
                <ChevronDown size={14} className="text-slate-500 ml-1" />
              </>
            ) : (
              <span className="text-sm text-slate-500 px-2">선택</span>
            )}
          </button>

          {/* 예상 수령액 (Read Only) */}
          <div className="flex-1 text-right">
             <input 
               type="text" 
               readOnly
               value={estimatedBuyAmount}
               placeholder="0.0"
               className="w-full bg-transparent text-right text-3xl font-bold text-cyan-400 outline-none placeholder-slate-700"
             />
          </div>
        </div>
        <div className="text-right mt-2">
           <span className="text-[10px] text-slate-500">* 예상 수령액 (수수료 제외)</span>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-4">
        {!canSwap && selectedWallet ? (
          <div className="flex flex-col items-center justify-center gap-2 text-xs text-orange-400 bg-orange-500/10 p-6 rounded-2xl border border-orange-500/20 font-bold text-center">
             <AlertCircle size={24} className="mb-2" />
             <p className="text-sm">스왑 미지원 지갑</p>
             <span className="opacity-80 font-normal">
               <b>{selectedWallet.label}</b>은 조회 전용입니다.<br/>
               스왑은 xLOT 및 EVM 지갑에서만 지원합니다.
             </span>
          </div>
        ) : (
          <button 
            disabled={!finalSellAmount || finalSellAmount === "0" || !toToken}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] disabled:opacity-50 disabled:shadow-none transition-all shadow-lg"
          >
            스왑 실행하기
          </button>
        )}
      </div>

      {/* 🛠️ 지갑 선택기 */}
      {isWalletSelectorOpen && (
        <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm z-50 animate-fade-in-up flex flex-col p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-6 shrink-0">
            <h3 className="text-lg font-bold text-white">지갑 선택</h3>
            <button onClick={() => setIsWalletSelectorOpen(false)}><X size={20} className="text-slate-400"/></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {wallets.filter(w => w.wallet_type !== 'UPBIT').map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => { setSelectedWallet(wallet); setIsWalletSelectorOpen(false); }}
                className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all text-left
                  ${selectedWallet?.id === wallet.id ? 'bg-slate-800 border-cyan-500' : 'bg-slate-900 border-slate-800'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${wallet.wallet_type === 'XLOT' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {getWalletIcon(wallet.wallet_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <p className="text-sm font-bold text-white truncate">{wallet.label}</p>
                    {(wallet.wallet_type !== 'XLOT' && wallet.wallet_type !== 'METAMASK') && (
                        <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">불가</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{wallet.balanceDisplay}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🛠️ 보내는 자산 선택 모달 */}
      {isAssetSelectorOpen && (
        <div className="absolute inset-0 bg-slate-900 z-50 animate-fade-in-up flex flex-col p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">보낼 자산 선택</h3>
            <button onClick={() => setIsAssetSelectorOpen(false)}><X size={20} className="text-slate-400"/></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {myAssets.length === 0 ? (
                <p className="text-center text-slate-500 mt-10">스왑 가능한 자산이 없습니다.</p>
            ) : (
                myAssets.map((asset, idx) => (
                  <button
                    key={`${asset.symbol}-${idx}`}
                    onClick={() => { setFromAsset(asset); setIsAssetSelectorOpen(false); }}
                    className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between 
                      ${fromAsset?.symbol === asset.symbol ? 'bg-slate-800 border-cyan-500' : 'bg-slate-900 border-slate-800'}`}
                  >
                     <div className="flex items-center gap-3">
                       <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-slate-800 border border-slate-700 text-white`}>
                         {asset.symbol[0]}
                       </div>
                       <div>
                         <p className="text-sm font-bold text-white flex items-center gap-2">
                           {asset.symbol} <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">{asset.network}</span>
                         </p>
                         <p className="text-xs text-slate-500">
                           ₩ {(asset.value * (prices?.exchangeRate || 1450)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                         </p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className="text-sm font-bold text-white">{asset.balance.toFixed(4)}</p>
                       {fromAsset?.symbol === asset.symbol && <Check size={14} className="text-cyan-400 ml-auto mt-1"/>}
                     </div>
                  </button>
                ))
            )}
          </div>
        </div>
      )}

      {/* 🛠️ 받는 토큰 선택 모달 */}
      <TokenSelectModal 
        isOpen={isTokenModalOpen} 
        onClose={() => setIsTokenModalOpen(false)} 
        onSelect={setToToken} 
        tokens={availableBuyTokens}
      />

    </div>
  );
}