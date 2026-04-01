import { useState, useEffect, useMemo } from "react";
import { X, Copy, RefreshCw, Plus, Loader2, Zap, LayoutGrid } from "lucide-react";
import type { WalletSlot } from "../services/walletService";
import { fetchUpbitDepositAddresses, generateUpbitAddress, fetchUpbitStatus } from "../services/upbitService";

interface Props {
  wallet: WalletSlot;
  onClose: () => void;
}

const EVM_SYMBOLS = ['ETH', 'POL', 'BASE', 'ARB', 'OP', 'BNB', 'KAIA'];
const NETWORK_OPTIONS: Record<string, string[]> = {
    'USDT': ['TRX', 'ETH', 'KAIA', 'APT'],
    'USDC': ['SOL', 'ETH'],
    'BTC': ['BTC'], 'XRP': ['XRP'], 'SOL': ['SOL'], 'TRX': ['TRX']
};

export function UpbitDepositModal({ wallet, onClose }: Props) {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [statusList, setStatusList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  
  // ✨ 애니메이션을 위한 등장 상태
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => { setIsVisible(true); }, []);

  const loadData = async () => {
    if (!wallet.api_access_key || !wallet.api_secret_key) return;
    setLoading(true);
    try {
        const [addrData, statData] = await Promise.all([
            fetchUpbitDepositAddresses(wallet.api_access_key, wallet.api_secret_key),
            fetchUpbitStatus(wallet.api_access_key, wallet.api_secret_key)
        ]);
        if (Array.isArray(addrData)) setAddresses(addrData);
        if (Array.isArray(statData)) setStatusList(statData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const processedGroups = useMemo(() => {
    const priorityCoins = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX'];
    const assetSymbols = wallet.assets.map(a => a.symbol);
    const addressSymbols = addresses.map(a => a.currency);
    const allSymbols = Array.from(new Set([...priorityCoins, ...assetSymbols, ...addressSymbols]));

    const evmGroup = {
        symbol: 'EVM Assets',
        isEvm: true,
        possibleNets: EVM_SYMBOLS,
        generated: addresses.filter(a => EVM_SYMBOLS.includes(a.currency)),
        hasAnyAddress: addresses.some(a => EVM_SYMBOLS.includes(a.currency))
    };

    const individualGroups = allSymbols
        .filter(s => !EVM_SYMBOLS.includes(s))
        .map(symbol => {
            const generated = addresses.filter(a => a.currency === symbol);
            const statusNets = statusList.filter(s => s.currency === symbol && s.deposit_state === 'working').map(n => n.net_type);
            const possibleNets = statusNets.length > 0 ? statusNets : (NETWORK_OPTIONS[symbol] || [symbol]);
            return { symbol, isEvm: false, possibleNets, generated, hasAnyAddress: generated.length > 0 };
        });

    const finalGroups = [evmGroup, ...individualGroups];

    // ✨ [정렬 고정] (b - a > 0 이면 b가 위로)
    return finalGroups.sort((a, b) => {
        // 1. 주소 있는 것이 무조건 위 (-1 반환 시 a가 위)
        if (a.hasAnyAddress && !b.hasAnyAddress) return -1;
        if (!a.hasAnyAddress && b.hasAnyAddress) return 1;
        // 2. 둘 다 있거나 없으면 EVM 우선
        if (a.isEvm !== b.isEvm) return a.isEvm ? -1 : 1;
        // 3. 나머지는 알파벳 순
        return a.symbol.localeCompare(b.symbol);
    });
  }, [addresses, statusList, wallet.assets]);

  const handleGenerate = async (currency: string, netType: string) => {
    if (!wallet.api_access_key || !wallet.api_secret_key) return;
    const targetCurrency = currency.toUpperCase();
    const targetNetType = netType.toUpperCase();

    setGeneratingId(`${currency}-${netType}`);
    try {
        const res = await generateUpbitAddress(
            wallet.api_access_key, 
            wallet.api_secret_key, 
            targetCurrency, 
            targetNetType
        );
        
        if (res.success || res.deposit_address) {
            alert(`[${targetCurrency}] 주소 생성 요청 완료!`);
            setTimeout(loadData, 2000);
        }
    } catch (e: any) { 
        alert("생성 실패: " + e.message); 
    } finally { 
        setGeneratingId(null); 
    }
    };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // 내려가는 애니메이션 시간 확보
  };

  return (
    <div className={`fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div 
        className={`w-full max-w-md bg-slate-900 rounded-t-[40px] border-t border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-transform duration-300 ease-out ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Handle Bar (올라오는 모달 느낌 강조) */}
        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mt-4 mb-2 shrink-0" />
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 shrink-0">
           <h3 className="font-bold text-white text-lg">Upbit 입금 관리</h3>
           <div className="flex gap-2">
               <button onClick={loadData} className="p-2 text-slate-400 hover:text-white transition-transform active:scale-90"><RefreshCw size={20} className={loading ? "animate-spin" : ""}/></button>
               <button onClick={handleClose} className="p-2 text-slate-400 hover:text-white transition-transform active:scale-90"><X size={24}/></button>
           </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar pb-12">
            {processedGroups.map((group) => {
                const currentNet = activeTab[group.symbol] || group.possibleNets[0];
                const activeAddress = group.generated.find(a => a.net_type === currentNet) || group.generated[0];

                return (
                    <div key={group.symbol} className={`rounded-3xl border transition-all duration-500 ${group.hasAnyAddress ? 'bg-slate-900/50 border-indigo-500/30' : 'bg-slate-950/30 border-slate-800'}`}>
                        <div className="p-5 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/20">
                            <div className="flex items-center gap-3">
                                {group.isEvm ? <LayoutGrid size={18} className="text-cyan-400"/> : <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[11px] font-bold text-white uppercase">{group.symbol[0]}</div>}
                                <span className="text-white font-bold text-base">{group.isEvm ? 'EVM 통합 주소' : group.symbol}</span>
                            </div>
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="space-y-3">
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Network Status</p>
                                <div className="flex flex-wrap gap-2">
                                    {(group.isEvm ? EVM_SYMBOLS : group.possibleNets).map(net => {
                                        const checkSymbol = group.isEvm ? net : group.symbol;
                                        const isActive = addresses.some(a => a.currency === checkSymbol && a.net_type === net);
                                        const isSelected = currentNet === net;

                                        return (
                                            <button 
                                                key={net}
                                                onClick={() => {
                                                    if (isActive) setActiveTab(prev => ({...prev, [group.symbol]: net}));
                                                    else handleGenerate(checkSymbol, net);
                                                }}
                                                className={`px-4 py-2 rounded-xl text-[11px] font-bold border transition-all duration-200 flex items-center gap-2
                                                    ${isActive ? (isSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20') 
                                                               : 'bg-slate-900 border-slate-800 text-slate-600 hover:border-slate-700'}`}
                                            >
                                                {isActive ? <Zap size={12} className={isSelected ? "fill-white" : "fill-current"}/> : <Plus size={12}/>}
                                                {net}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {activeAddress ? (
                                <div className="pt-2 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <div className="flex justify-center bg-white p-3 rounded-[32px] w-fit mx-auto shadow-2xl">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${activeAddress.deposit_address}`} className="w-32 h-32" />
                                    </div>
                                    <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 group transition-colors hover:border-indigo-500/50">
                                        <div className="flex justify-between items-center gap-3">
                                            <p className="text-xs text-slate-300 font-mono break-all leading-relaxed">{activeAddress.deposit_address}</p>
                                            <button onClick={() => { navigator.clipboard.writeText(activeAddress.deposit_address); alert("복사됨"); }} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-400 transition-colors"><Copy size={16}/></button>
                                        </div>
                                    </div>
                                    {activeAddress.secondary_address && (
                                        <div className="bg-cyan-500/5 border border-cyan-500/20 p-3 rounded-2xl flex justify-between items-center text-xs text-cyan-500 font-medium">
                                            <span>Destination Tag: {activeAddress.secondary_address}</span>
                                            <button onClick={() => navigator.clipboard.writeText(activeAddress.secondary_address)} className="p-1 hover:bg-cyan-500/10 rounded"><Copy size={14}/></button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-10 text-center bg-slate-900/20 rounded-3xl border border-dashed border-slate-800">
                                    <p className="text-xs text-slate-500 leading-relaxed">네트워크 버튼을 눌러<br/>입금 주소를 활성화하세요.</p>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
}