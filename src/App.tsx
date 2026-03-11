import { useEffect, useState } from "react";
import { ThirdwebProvider, useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Config & Pages
import { wagmiConfig } from "./config";
import { Dashboard } from "./DashboardPage";
import { LoginPage } from "./pages/LoginPage";

// Components
import { PhoneClaimModal } from "./components/PhoneClaimModal"; // ✨ 경로 확인!

const queryClient = new QueryClient();

// 1. 최상위 앱: Provider 설정
export default function App() {
  return (
    <ThirdwebProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <MainRouter />
        </QueryClientProvider>
      </WagmiProvider>
    </ThirdwebProvider>
  );
}

// 2. 메인 라우터: 인증 로직 + 전역 모달(Claim) 처리
function MainRouter() {
  const account = useActiveAccount();
  const status = useActiveWalletConnectionStatus(); // connected, connecting, disconnected
  
  // ✨ 수령할 코드가 있는지 확인하는 상태 변수
  const [claimCommitment, setClaimCommitment] = useState<string | null>(null);

  // ✨ 앱이 켜질 때 URL 파라미터(?claim=...) 검사
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claim = params.get("claim");

    if (claim) {
      console.log("🎁 송금 수령 링크 감지됨:", claim);
      setClaimCommitment(claim);
      // (선택) URL 깔끔하게 정리하고 싶으면 주석 해제
      // window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ------------------------------------------------
  // A. 로딩 화면 (지갑 상태 확인 중)
  // ------------------------------------------------
  if (status === "connecting") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]"></div>
        <p className="text-slate-400 font-bold animate-pulse">xLOT Wallet 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      
      {/* ------------------------------------------------ */}
      {/* B. 메인 화면 분기 (로그인 여부)                  */}
      {/* ------------------------------------------------ */}
      {account ? (
        <Dashboard /> 
      ) : (
        <LoginPage />
      )}

      {/* ------------------------------------------------ */}
      {/* C. 전역 모달: 송금 수령 (로그인 여부 상관없이 띄움) */}
      {/* -> 모달 내부에서 '지갑 연결 필요' 메시지를 보여줌      */}
      {/* ------------------------------------------------ */}
      {claimCommitment && (
        <PhoneClaimModal 
          commitment={claimCommitment} 
          onClose={() => setClaimCommitment(null)} 
        />
      )}
      
    </div>
  );
}