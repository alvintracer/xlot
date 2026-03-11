import { ConnectButton } from "thirdweb/react";
import { client } from "../client"; // client.ts 경로 확인
import { inAppWallet, createWallet } from "thirdweb/wallets";

// ✨ 지갑 옵션 설정 (이메일, 구글, 애플 + 메타마스크)
const wallets = [
  inAppWallet({
    auth: { options: ["google", "apple", "email"] }, // 패스키 등 추가 가능
    metadata: {
      name: "xLOT Wallet", // 지갑 이름 설정
      image: undefined, // 로고 URL (없음)
    },
  }),
  createWallet("io.metamask"),
];

export function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* 배경 장식 (Glow Effects) */}
      <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl animate-fade-in-up flex flex-col items-center">
        
        {/* 헤더 */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black  tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 mb-4 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            xLOT
          </h1>
          <p className="text-slate-300 text-lg font-medium tracking-wide">
            Next Gen Crypto Experience
          </p>
          <div className="h-1 w-20 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full mx-auto mt-6"></div>
        </div>

        {/* ✨ Thirdweb Connect Button (이게 로그인/회원가입/지갑생성 전부 담당) */}
        <div className="w-full transform scale-105">
          <ConnectButton
            client={client}
            wallets={wallets}
            connectModal={{
              size: "compact",
              title: "xLOT 시작하기",
              titleIcon: "", // 로고 URL 넣으면 뜸
              showThirdwebBranding: false,
              welcomeScreen: {
                title: "xLOT Wallet",
                subtitle: "안전하고 간편한 자산 관리의 시작",
              }
            }}
            connectButton={{
              label: "xLOT 시작하기",
              className: "!w-full !py-4 !rounded-2xl !text-lg !font-bold !text-white !bg-gradient-to-r !from-cyan-500 !via-blue-500 !to-indigo-500 hover:!shadow-[0_0_30px_rgba(59,130,246,0.5)] !transition-all !border-none",
            }}
          />
        </div>

        <p className="mt-8 text-xs text-slate-500 text-center leading-relaxed">
          계속 진행하면 xLOT의 <span className="text-slate-400 underline cursor-pointer">이용약관</span> 및 <br/>
          <span className="text-slate-400 underline cursor-pointer">개인정보 처리방침</span>에 동의하게 됩니다.
        </p>

      </div>
    </div>
  );
}