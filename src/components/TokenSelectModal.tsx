import { X, Search } from "lucide-react";
import type{ Token } from "../constants/tokens"; // Token 타입 임포트

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  tokens?: Token[]; // ✨ 외부에서 주입받도록 수정 (Optional)
}

export function TokenSelectModal({ isOpen, onClose, onSelect, tokens }: Props) {
  if (!isOpen) return null;

  // tokens prop이 없으면 빈 배열 처리
  const displayTokens = tokens || [];

  return (
    <div className="absolute inset-0 z-50 bg-slate-900 animate-fade-in-up flex flex-col rounded-3xl">
      <div className="p-6 pb-2 border-b border-slate-800">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">토큰 선택</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="relative mb-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="이름 검색" 
            className="w-full bg-slate-950 text-white pl-12 pr-4 py-3 rounded-2xl outline-none border border-slate-800 focus:border-cyan-500 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {displayTokens.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            선택 가능한 토큰이 없습니다.
          </div>
        ) : (
          displayTokens.map((token) => (
            <button
              key={`${token.symbol}-${token.chainId}`}
              onClick={() => {
                onSelect(token);
                onClose();
              }}
              className="w-full flex items-center gap-4 p-4 hover:bg-slate-800 rounded-2xl transition-colors text-left group"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-cyan-500 font-bold text-sm group-hover:border-cyan-500/50 group-hover:bg-cyan-500/10">
                {token.symbol[0]}
              </div>
              <div>
                <p className="font-bold text-white">{token.name}</p>
                <p className="text-xs text-slate-500">{token.symbol}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}