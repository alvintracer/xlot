import { useState, useEffect } from "react";
import { X, Copy, ShieldCheck, Timer, ArrowRight } from "lucide-react";
import { syncKeyToCloud, restoreVault } from "../services/vaultService";
import { useActiveAccount } from "thirdweb/react";
import { SecureKeypad } from "./SecureKeypad"; // ✨ 보안 키패드 임포트

type Mode = 'EXPORT_TO_CLOUD' | 'IMPORT_FROM_CLOUD';
type Step = 'INPUT_KEY' | 'INPUT_PASSCODE' | 'SHOW_KEY';

interface Props {
  mode: Mode;
  walletLabel: string;
  walletAddress: string;
  chain: 'EVM' | 'SOL';
  onClose: () => void;
  onSuccess?: () => void;
}

export function WalletSyncModal({ mode, walletLabel, walletAddress, chain, onClose, onSuccess }: Props) {
  const smartAccount = useActiveAccount();
  const [step, setStep] = useState<Step>(mode === 'EXPORT_TO_CLOUD' ? 'INPUT_KEY' : 'INPUT_PASSCODE');
  
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [revealedKey, setRevealedKey] = useState("");
  const [countdown, setCountdown] = useState(0);

  // 타이머 로직
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && revealedKey) {
      setRevealedKey("");
      alert("보안을 위해 키 표시가 종료되었습니다.");
      onClose();
    }
  }, [countdown, revealedKey, onClose]);

  // ✨ 키패드 입력 완료 시 호출되는 함수
  const handlePasscodeComplete = async (passcode: string) => {
    if (!smartAccount) return;

    try {
      // 대소문자 이슈 방지 (lowercase)
      const keyId = `xlot_sk_${chain}_${walletAddress.toLowerCase()}`;

      if (mode === 'EXPORT_TO_CLOUD') {
        if (!privateKeyInput) {
            alert("프라이빗 키가 입력되지 않았습니다.");
            return;
        }
        // 번들링 및 전송
        const bundle = { [keyId]: privateKeyInput };
        const res = await syncKeyToCloud(smartAccount.address, bundle, passcode);
        
        if (res === 'WRONG_PASSWORD') {
            alert("❌ 비밀번호가 틀렸습니다. 다시 시도해주세요.");
            return; // 키패드 유지
        }
        
        alert("✅ 클라우드 금고에 안전하게 백업되었습니다.");
        if (onSuccess) onSuccess();
        onClose();
      } 
      else {
        // Import: 키 복원
        const keys = await restoreVault(smartAccount.address, passcode);
        if (!keys) {
            alert("❌ 비밀번호가 틀렸거나 금고가 비어있습니다.");
            return;
        }
        
        const targetKey = keys[keyId];
        if (!targetKey) {
            alert("⚠️ 이 지갑의 키는 클라우드에 없습니다.");
            onClose();
            return;
        }

        setRevealedKey(targetKey);
        setStep('SHOW_KEY'); // 키 보여주는 화면으로 이동
        setCountdown(10);
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(revealedKey);
    alert("복사되었습니다. 메타마스크에 붙여넣으세요!");
  };

  // --- 렌더링 ---

  // 1. 보안 키패드 모드
  if (step === 'INPUT_PASSCODE') {
    return (
      <SecureKeypad
        title={mode === 'EXPORT_TO_CLOUD' ? "보안 백업" : "금고 잠금 해제"}
        description="통합 금고 비밀번호 6자리를 입력하세요."
        maxLength={6}
        onClose={onClose}
        onComplete={handlePasscodeComplete}
      />
    );
  }

  // 2. 일반 모달 (키 입력 or 키 표시)
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-fade-in-up">
        
        {/* 헤더 */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className={mode === 'EXPORT_TO_CLOUD' ? "text-cyan-400" : "text-green-400"} size={20}/>
            <h2 className="text-sm font-bold text-white">
              {mode === 'EXPORT_TO_CLOUD' ? "Cloud Export" : "Cloud Import"}
            </h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-500 hover:text-white"/></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-bold text-white mb-1">{walletLabel}</h3>
            <p className="text-xs text-slate-400 font-mono bg-slate-800/50 py-1 px-2 rounded inline-block">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          </div>

          {/* [Step] 키 표시 (Import 완료) */}
          {step === 'SHOW_KEY' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl text-center">
                <p className="text-xs text-green-400 font-bold mb-2">Private Key</p>
                <p className="font-mono text-sm text-white break-all blur-sm hover:blur-none transition-all cursor-pointer" title="마우스를 올리면 보입니다">
                    {revealedKey}
                </p>
              </div>
              
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 bg-slate-950 p-3 rounded-lg">
                <span className="flex items-center gap-2 text-red-400">
                  <Timer size={14} className="animate-pulse"/> {countdown}초 후 파기
                </span>
                <button onClick={copyToClipboard} className="flex items-center gap-1 hover:text-white">
                  <Copy size={14}/> 복사하기
                </button>
              </div>
              {/* 타이머 바 */}
              <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full transition-all duration-1000 ease-linear" style={{ width: `${(countdown / 10) * 100}%` }} />
              </div>
            </div>
          )}

          {/* [Step] 키 입력 (Export 시작) */}
          {step === 'INPUT_KEY' && (
            <div className="space-y-4">
               <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">백업할 프라이빗 키 입력</label>
                  <input
                    type="password"
                    value={privateKeyInput}
                    onChange={(e) => setPrivateKeyInput(e.target.value)}
                    placeholder="0x... 또는 Base58 키"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:border-cyan-500 outline-none font-mono"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500">
                    * 메타마스크 등에서 추출한 키를 붙여넣으세요.<br/>
                    * 다음 단계에서 금고 비밀번호를 입력하면 암호화됩니다.
                  </p>
                </div>
                <button
                  onClick={() => {
                      if(!privateKeyInput) return alert("키를 입력해주세요");
                      setStep('INPUT_PASSCODE'); // -> 키패드로 이동
                  }}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2"
                >
                  다음 단계 <ArrowRight size={16}/>
                </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}