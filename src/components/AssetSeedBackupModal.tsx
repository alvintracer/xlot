import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";

interface Props {
  mnemonic: string;
  onClose: () => void;
}

export function SeedBackupModal({ mnemonic, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const words = mnemonic.split(" ");

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-6">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl p-8 shadow-2xl border border-red-500/30">
        
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-4 animate-pulse">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-2xl font-black text-white">비밀 복구 구문 저장</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            이 12단어는 회원님의 <b>솔라나 지갑 열쇠</b>입니다.<br/>
            xLOT 팀도 회원님의 키를 저장하지 않으므로,<br/>
            <span className="text-red-400 font-bold">잃어버리면 자산을 영구적으로 분실합니다.</span>
          </p>
        </div>

        {/* 니모닉 그리드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {words.map((word, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex items-center gap-2">
              <span className="text-[10px] text-slate-600 font-bold">{idx + 1}</span>
              <span className="text-sm font-bold text-cyan-100">{word}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button 
            onClick={handleCopy}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? <Check size={18} className="text-green-400"/> : <Copy size={18} />}
            {copied ? "복사됨" : "복사하기"}
          </button>
          
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-gradient-to-r from-red-600 to-blue-600 hover:from-red-500 hover:to-blue-500 rounded-2xl font-bold text-white shadow-lg transition-transform active:scale-95"
          >
            저장했습니다
          </button>
        </div>

      </div>
    </div>
  );
}