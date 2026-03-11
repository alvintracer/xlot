import { useState } from "react";
import { SendModal } from "./AssetSendModal";
import { ReceiveModal } from "./AssetReceiveModal";
import { ArrowRightLeft, Send, Download } from "lucide-react";

interface Props {
  onSwap: () => void;
}

export function ActionButtons({ onSwap }: Props) {
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-4 gap-3 mb-8">
        {/* 1. 스왑 버튼 (가장 왼쪽) */}
        <button 
          onClick={onSwap}
          className="col-span-1 bg-slate-800 text-slate-300 py-3 rounded-2xl font-bold hover:bg-slate-700 hover:text-white transition-all border border-slate-700 flex flex-col items-center justify-center gap-1 group"
        >
          <ArrowRightLeft size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          <span className="text-[10px]">스왑</span>
        </button>

        {/* 2. 보내기 버튼 (메인 - 그라데이션 강조) */}
        {/* from-cyan-400 via-blue-400 to-indigo-400 */}
        <button 
          onClick={() => setIsSendOpen(true)}
          className="col-span-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 text-white py-3 rounded-2xl font-bold hover:shadow-[0_0_20px_rgba(96,165,250,0.4)] transition-all flex flex-col items-center justify-center gap-1 shadow-lg shadow-blue-900/20 border border-white/10"
        >
          <Send size={20} fill="currentColor" />
          <span className="text-xs">보내기</span>
        </button>

        {/* 3. 받기 버튼 */}
        <button 
          onClick={() => setIsReceiveOpen(true)}
          className="col-span-1 bg-slate-800 text-slate-300 py-3 rounded-2xl font-bold hover:bg-slate-700 hover:text-white transition-all border border-slate-700 flex flex-col items-center justify-center gap-1"
        >
          <Download size={18} />
          <span className="text-[10px]">받기</span>
        </button>
      </div>

      {isSendOpen && <SendModal onClose={() => setIsSendOpen(false)} />}
      {isReceiveOpen && <ReceiveModal onClose={() => setIsReceiveOpen(false)} />}
    </>
  );
}