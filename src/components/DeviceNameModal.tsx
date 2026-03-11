import { useState } from "react";
import { Laptop, Save } from "lucide-react";
import { registerCurrentDevice, getDeviceInfoString } from "../utils/deviceService"; // utils 수정 필요(아래 참고)
import { useActiveAccount } from "thirdweb/react";

interface Props {
  onSuccess: () => void;
}

export function DeviceNameModal({ onSuccess }: Props) {
  const smartAccount = useActiveAccount();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const defaultInfo = getDeviceInfoString(); // 예: Mac / Chrome

  const handleSubmit = async () => {
    if (!smartAccount || !nickname) return;
    setLoading(true);
    try {
      // DB에 기기 정보 등록/업데이트
      await registerCurrentDevice(smartAccount.address, nickname);
      onSuccess();
    } catch (e) {
      console.error(e);
      alert("기기 이름 저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[110] p-6">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-800 animate-fade-in-up">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-cyan-500/10 rounded-full flex items-center justify-center text-cyan-400 mb-4">
            <Laptop size={28} />
          </div>
          <h2 className="text-xl font-bold text-white">새로운 기기 감지</h2>
          <p className="text-slate-400 text-sm mt-2 text-center">
            현재 접속하신 환경의 이름을 정해주세요.<br/>
            <span className="text-slate-500 text-xs">({defaultInfo})</span>
          </p>
        </div>

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="예: 내 맥북 프로, 회사 PC"
          className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-cyan-500 text-center font-bold mb-4"
          autoFocus
        />

        <button 
          onClick={handleSubmit} 
          disabled={!nickname || loading}
          className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl font-bold text-white shadow-lg flex items-center justify-center gap-2"
        >
          <Save size={18} /> 이름 저장하기
        </button>
      </div>
    </div>
  );
}