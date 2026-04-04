import { ConnectButton } from "thirdweb/react";
import { client } from "../client"; // client.ts 경로 확인
import { inAppWallet, createWallet } from "thirdweb/wallets";
import { ShieldCheck, Zap, Lock } from "lucide-react";

// App.tsx와 동일한 지갑 옵션 사용
const wallets = [
  inAppWallet({ auth: { options: ["google", "apple", "email", "passkey"] } }),
  createWallet("io.metamask"),
];

export function WalletSetupModal() {
  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[100] p-6">
      <div className="bg-slate-900 w-full max-w-md rounded-[2rem] p-8 shadow-2xl border border-slate-800 text-center animate-fade-in-up relative overflow-hidden">
        
        {/* 배경 장식 */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400"></div>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* 로고 및 타이틀 */}
        <h2 className="text-3xl font-black  tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 mb-2">
          Welcome to took
        </h2>
        <p className="text-slate-400 text-sm mb-8 font-medium">
          안전한 자산 관리를 위해 지갑을 생성해주세요.
        </p>

        {/* 기능 설명 카드들 */}
        <div className="space-y-4 mb-8 text-left">
          <div className="flex items-center gap-4 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Zap size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">초고속 생성</h3>
              <p className="text-slate-500 text-xs">복잡한 절차 없이 3초 만에 시작</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">강력한 보안</h3>
              <p className="text-slate-500 text-xs">MPC 기술로 개인키 없이 안전하게</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">완벽한 통제권</h3>
              <p className="text-slate-500 text-xs">내 자산은 오직 나만이 관리</p>
            </div>
          </div>
        </div>

        {/* Thirdweb Connect Button (커스텀 스타일링) */}
        <div className="relative z-10">
          <ConnectButton
            client={client}
            wallets={wallets}
            connectModal={{
              size: "compact",
              title: "took 지갑 생성",
              showThirdwebBranding: false,
            }}
            connectButton={{
              label: "took 지갑 생성하기",
              className: "!w-full !py-4 !rounded-2xl !font-bold !text-lg !text-white !bg-gradient-to-r !from-cyan-500 !via-blue-500 !to-indigo-500 hover:!shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all",
            }}
          />
        </div>
        
        <p className="text-[10px] text-slate-600 mt-4">
          '지갑 생성하기'를 누르면 이용약관에 동의하게 됩니다.
        </p>
      </div>
    </div>
  );
}