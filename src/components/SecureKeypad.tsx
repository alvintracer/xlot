import { useState, useEffect } from "react";
import { X, Delete, ShieldCheck, RefreshCw } from "lucide-react";

interface Props {
  title:       string;
  description?: string;
  maxLength?:  number;
  onClose:     () => void;
  onComplete:  (password: string) => void;
}

export function SecureKeypad({ title, description, maxLength = 6, onClose, onComplete }: Props) {
  const [input, setInput] = useState("");
  const [keys, setKeys]   = useState<string[]>([]);

  useEffect(() => {
    const nums = ['1','2','3','4','5','6','7','8','9','0'];
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    setKeys(nums);
  }, []);

  const handlePress = (key: string) => {
    if (input.length >= maxLength) return;
    setInput(prev => prev + key);
  };

  const handleSubmit = () => {
    if (input.length < 4) { alert("최소 4자리 이상 입력해주세요"); return; }
    onComplete(input);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-80" />
      <div className="relative w-full max-w-md h-full sm:h-auto sm:min-h-[600px] bg-slate-900 sm:rounded-3xl sm:border border-slate-800 shadow-2xl flex flex-col overflow-hidden">

        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-cyan-400">
            <ShieldCheck size={20} />
            <span className="text-xs font-bold tracking-widest">SECURE KEYPAD</span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {description && <p className="text-sm text-slate-400">{description}</p>}
          </div>
          <div className="flex gap-4 min-h-[40px]">
            {Array.from({ length: maxLength }).map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${
                i < input.length
                  ? "bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
                  : "bg-slate-800 border border-slate-700"}`} />
            ))}
          </div>
          <p className="text-xs text-slate-500 font-mono">{input.length} / {maxLength} Digits</p>
        </div>

        <div className="bg-slate-950 p-6 pb-10 rounded-t-3xl border-t border-slate-800">
          <div className="flex justify-center items-center gap-2 mb-4 text-[10px] text-slate-500">
            <RefreshCw size={10} />
            <span>보안을 위해 키패드 위치가 무작위로 변경됩니다.</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {keys.map(key => (
              <button key={key} onClick={() => handlePress(key)}
                className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-500/20 active:scale-95 transition-all text-2xl font-bold text-white shadow-lg border-b-4 border-slate-900 active:border-0">
                {key}
              </button>
            ))}
            <button onClick={() => setInput("")}
              className="h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 text-sm font-bold text-slate-400 transition-all">
              전체삭제
            </button>
            <button onClick={() => setInput(prev => prev.slice(0, -1))}
              className="h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 text-slate-400 flex items-center justify-center transition-all">
              <Delete size={24} />
            </button>
          </div>
          <button onClick={handleSubmit} disabled={input.length === 0}
            className="w-full mt-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
            입력 완료
          </button>
        </div>
      </div>
    </div>
  );
}