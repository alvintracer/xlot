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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-end justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-5 border border-slate-800 flex flex-col max-h-[60vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="font-bold text-white text-sm">받을 자산 선택</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        
        {/* 검색창 */}
        <div className="relative mb-3 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input 
            type="text" 
            placeholder="이름 검색" 
            className="w-full bg-slate-950 text-white pl-9 pr-3 py-2.5 rounded-xl outline-none border border-slate-800 focus:border-cyan-500 text-xs transition-colors"
          />
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
          {displayTokens.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              선택 가능한 토큰이 없습니다.
            </div>
          ) : (
            <div className="space-y-1 pb-2">
              {displayTokens.map((token) => (
                <button
                  key={`${token.symbol}-${token.chainId}`}
                  onClick={() => {
                    onSelect(token);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-blue-400 font-bold text-xs group-hover:border-blue-500/50 group-hover:bg-blue-500/10 transition-colors">
                      {token.symbol[0] || '?'}
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">{token.symbol}</p>
                      <p className="text-[10px] text-slate-500">{token.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}