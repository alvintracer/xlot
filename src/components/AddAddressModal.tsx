import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { updateWalletAddresses } from "../services/walletService";

interface Props {
  slotId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type ChainType = 'ALL' | 'EVM' | 'SOL' | 'BTC' | 'TRON';

export function AddAddressModal({ slotId, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<ChainType>('ALL'); // 기본값 ALL
  const [loading, setLoading] = useState(false);

  // 입력값 상태 (일괄 입력을 위해 객체로 관리)
  const [inputs, setInputs] = useState({
    evm: "",
    sol: "",
    btc: "",
    trx: ""
  });

  const handleChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // 탭에 따라 저장할 데이터 필터링
      const dataToSave: any = {};
      
      if (tab === 'ALL') {
        if (inputs.evm) dataToSave.evm = inputs.evm;
        if (inputs.sol) dataToSave.sol = inputs.sol;
        if (inputs.btc) dataToSave.btc = inputs.btc;
        if (inputs.trx) dataToSave.trx = inputs.trx;
      } else {
        // 단일 선택
        if (tab === 'EVM' && inputs.evm) dataToSave.evm = inputs.evm;
        if (tab === 'SOL' && inputs.sol) dataToSave.sol = inputs.sol;
        if (tab === 'BTC' && inputs.btc) dataToSave.btc = inputs.btc;
        if (tab === 'TRON' && inputs.trx) dataToSave.trx = inputs.trx;
      }

      if (Object.keys(dataToSave).length === 0) {
        alert("최소 하나의 주소를 입력해주세요.");
        setLoading(false);
        return;
      }

      await updateWalletAddresses(slotId, dataToSave);
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-800 animate-fade-in-up flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-xl font-bold text-white">주소 연결하기</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* 탭 메뉴 */}
        <div className="flex bg-slate-950 p-1 rounded-xl mb-6 shrink-0 overflow-x-auto scrollbar-hide">
          {(['ALL', 'EVM', 'SOL', 'BTC', 'TRON'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={`flex-1 min-w-[50px] py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                tab === c 
                ? 'bg-slate-800 text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 입력 폼 (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-4 pr-1">
          
          {(tab === 'ALL' || tab === 'EVM') && (
            <div>
               <label className="text-xs font-bold text-cyan-500 mb-1 block ml-1">EVM (ETH, Polygon...)</label>
               <input value={inputs.evm} onChange={(e) => handleChange('evm', e.target.value)} placeholder="0x..." className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-cyan-500 text-sm font-mono" />
            </div>
          )}

          {(tab === 'ALL' || tab === 'SOL') && (
            <div>
               <label className="text-xs font-bold text-green-500 mb-1 block ml-1">Solana</label>
               <input value={inputs.sol} onChange={(e) => handleChange('sol', e.target.value)} placeholder="Base58..." className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-green-500 text-sm font-mono" />
            </div>
          )}

          {(tab === 'ALL' || tab === 'BTC') && (
            <div>
               <label className="text-xs font-bold text-blue-500 mb-1 block ml-1">Bitcoin</label>
               <input value={inputs.btc} onChange={(e) => handleChange('btc', e.target.value)} placeholder="1, 3, bc1..." className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-blue-500 text-sm font-mono" />
            </div>
          )}

          {(tab === 'ALL' || tab === 'TRON') && (
            <div>
               <label className="text-xs font-bold text-red-500 mb-1 block ml-1">Tron</label>
               <input value={inputs.trx} onChange={(e) => handleChange('trx', e.target.value)} placeholder="T..." className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-red-500 text-sm font-mono" />
            </div>
          )}
        </div>

        <button 
          onClick={handleSubmit} 
          disabled={loading} 
          className="w-full py-4 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 rounded-2xl font-bold text-white transition-all shrink-0 shadow-lg border border-slate-700"
        >
          {loading ? <Loader2 className="animate-spin mx-auto" /> : "주소 저장하기"}
        </button>

      </div>
    </div>
  );
}