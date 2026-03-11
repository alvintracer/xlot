import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export function DeleteConfirmModal({ onClose, onConfirm, loading }: Props) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-800 animate-fade-in-up">
        
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          
          <h2 className="text-xl font-bold text-white">지갑 삭제</h2>
          
          <div className="space-y-2 text-sm text-slate-400">
            <p>정말 이 지갑 슬롯을 삭제하시겠습니까?</p>
            <p className="text-red-400 font-bold bg-red-500/10 p-2 rounded-lg text-xs">
              ⚠️ 주의: 연결된 API 키와 설정이 모두 삭제되며<br/>복구할 수 없습니다.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button 
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            취소
          </button>
          <button 
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all flex items-center justify-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : "삭제하기"}
          </button>
        </div>

      </div>
    </div>
  );
}