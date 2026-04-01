import { useState } from "react";
import { X, Unlock, CheckCircle, AlertCircle } from "lucide-react";
import { importLocalSolanaWallet } from "../utils/SolanaLocalWallet";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export function SeedImportModal({ onClose, onSuccess }: Props) {
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState("");

  const handleImport = () => {
    if (!mnemonic) return;
    
    const success = importLocalSolanaWallet(mnemonic.trim());
    if (success) {
      onSuccess();
      onClose();
    } else {
      setError("유효하지 않은 니모닉입니다. 띄어쓰기를 확인해주세요.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl p-8 shadow-2xl border border-slate-800 animate-fade-in-up">
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Unlock className="text-cyan-400" /> 서명 권한 복구
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle className="text-teal-500 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-teal-200/80 leading-relaxed">
            현재 기기에는 <b>보안 키</b>가 없습니다.<br/>
            송금/스왑을 하려면 최초 가입 시 발급받은<br/>
            <b>12자리 구문(니모닉)</b>을 입력하여 키를 복원해야 합니다.
          </div>
        </div>

        <textarea
          value={mnemonic}
          onChange={(e) => { setMnemonic(e.target.value); setError(""); }}
          placeholder="apple banana cat dog ..."
          className="w-full h-32 bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-cyan-500 text-sm font-mono mb-2 resize-none"
        />
        
        {error && <p className="text-red-400 text-xs font-bold mb-4 ml-1">{error}</p>}

        <button 
          onClick={handleImport} 
          className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 rounded-2xl font-bold text-white shadow-lg transition-all"
        >
          지갑 복구하기
        </button>
      </div>
    </div>
  );
}