import { useState, useEffect } from "react";
import { X, Delete, ShieldCheck, RefreshCw } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  maxLength?: number;
  onClose: () => void;
  onComplete: (password: string) => void;
}

export function SecureKeypad({ title, description, maxLength = 6, onClose, onComplete }: Props) {
  const [input, setInput] = useState("");
  const [keys, setKeys] = useState<string[]>([]);

  // 1. 키패드 랜덤 셔플 (금융앱 방식)
  useEffect(() => {
    const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    // Fisher-Yates Shuffle
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    setKeys(nums);
  }, []); // 마운트 될 때마다 실행

  // 2. 입력 핸들러
  const handlePress = (key: string) => {
    if (input.length >= maxLength) return;
    const nextInput = input + key;
    setInput(nextInput);
    
    // 목표 길이 도달 시 자동 완료 처리 (선택사항)
    // if (nextInput.length === maxLength) onComplete(nextInput); 
  };

  // 3. 지우기
  const handleDelete = () => {
    setInput(prev => prev.slice(0, -1));
  };

  // 4. 전체 삭제
  const handleClear = () => {
    setInput("");
  };

  // 5. 완료 버튼
  const handleSubmit = () => {
    if (input.length < 4) {
        alert("비밀번호는 최소 4자리 이상이어야 합니다.");
        return;
    }
    onComplete(input);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center animate-fade-in">
      
      {/* 배경 장식 (보안 느낌) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-80" />
      
      {/* 메인 컨테이너 (모바일 사이즈 제한) */}
      <div className="relative w-full max-w-md h-full sm:h-auto sm:min-h-[600px] bg-slate-900 sm:rounded-3xl sm:border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        
        {/* 상단 헤더 */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-cyan-400">
            <ShieldCheck size={20} />
            <span className="text-xs font-bold tracking-widest">SECURE KEYPAD</span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* 디스플레이 영역 */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {description && <p className="text-sm text-slate-400">{description}</p>}
          </div>

          {/* 비밀번호 도트 표시 (비밀번호 숨김) */}
          <div className="flex gap-4 min-h-[40px]">
            {Array.from({ length: maxLength }).map((_, i) => (
              <div 
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-300 ${
                  i < input.length 
                    ? "bg-cyan-400 shadow-[0_0_10px_#22d3ee]" 
                    : "bg-slate-800 border border-slate-700"
                }`}
              />
            ))}
          </div>
          
          <p className="text-xs text-slate-500 font-mono">
            {input.length} / {maxLength} Digits
          </p>
        </div>

        {/* 키패드 영역 */}
        <div className="bg-slate-950 p-6 pb-10 rounded-t-3xl border-t border-slate-800">
          
          {/* 재배열 안내 */}
          <div className="flex justify-center items-center gap-2 mb-4 text-[10px] text-slate-500">
            <RefreshCw size={10} />
            <span>보안을 위해 키패드 위치가 무작위로 변경됩니다.</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* 숫자 키들 (랜덤 배치된 keys 배열 사용) */}
            {keys.map((key) => (
              <button
                key={key}
                onClick={() => handlePress(key)}
                className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-500/20 active:scale-95 transition-all text-2xl font-bold text-white shadow-lg border-b-4 border-slate-900 active:border-0"
              >
                {key}
              </button>
            ))}

            {/* 기능키: 전체 삭제 */}
            <button
              onClick={handleClear}
              className="h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 text-sm font-bold text-slate-400 transition-all"
            >
              전체삭제
            </button>

            {/* 기능키: 0번 (랜덤 배열에 포함되어 있으므로 여기선 제외하거나, keys 배열 로직에 따라 조정) */}
            {/* 위 useEffect 로직상 0~9가 keys에 다 들어있으므로, 여기엔 빈 공간이나 0을 넣을 필요 없음.
                하지만 3열 그리드면 10개 숫자 + 2개 기능키 = 12칸이 딱 맞음.
                keys 배열 순서를 섞되, 마지막 줄 양옆에 기능키를 두려면 keys를 렌더링할 때 인덱스 조절 필요.
            */}
            
            {/* 기능키: 한 글자 삭제 */}
            <button
              onClick={handleDelete}
              className="h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 text-slate-400 flex items-center justify-center transition-all"
            >
              <Delete size={24} />
            </button>
          </div>

          {/* 완료 버튼 (입력 다 했을 때 활성화) */}
          <button 
             onClick={handleSubmit}
             disabled={input.length === 0}
             className="w-full mt-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            입력 완료
          </button>
        </div>
      </div>
    </div>
  );
}