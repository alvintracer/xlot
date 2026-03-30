import { useEffect, useState, createContext, useContext } from "react";
import { ThirdwebProvider, useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { wagmiConfig } from "./config";
import { Dashboard } from "./DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PhoneClaimModal } from "./components/PhoneClaimModal";
import { PWAInstallBanner } from "./components/PWAInstallBanner";

const queryClient = new QueryClient();

// ── SSS 생성 진행 중 플래그 Context ──────────────────────────
// LoginPage에서 SSS 지갑 생성 중일 때 true로 설정
// → account가 생겨도 Dashboard로 전환하지 않음
interface SSSOnboardingCtx {
  sssOnboarding: boolean;
  setSSSOnboarding: (v: boolean) => void;
}
export const SSSOnboardingContext = createContext<SSSOnboardingCtx>({
  sssOnboarding: false,
  setSSSOnboarding: () => {},
});
export const useSSSOnboarding = () => useContext(SSSOnboardingContext);

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

function MainRouter() {
  const account  = useActiveAccount();
  const status   = useActiveWalletConnectionStatus();
  const [claimCommitment, setClaimCommitment] = useState<string | null>(null);
  // SSS 온보딩 진행 중 플래그
  const [sssOnboarding, setSSSOnboarding] = useState(false);

  // ── Bug 2 fix: 잠금 상태 (세션 복원 시 잠금, unlock 시 해제) ──
  // localStorage 기반으로 재방문 여부 판단
  // 새 사용자(첫 방문) → isLocked=false → ConnectButton 후 바로 Dashboard
  // 재방문 사용자 → isLocked=true → LockedScreen → 해제 후 Dashboard
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try { return localStorage.getItem('xlot_visited') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claim  = params.get("claim");
    if (claim) setClaimCommitment(claim);
  }, []);

  // account 변화 감지: 연결 시 방문 기록 저장 / 로그아웃 시 리셋
  useEffect(() => {
    if (account) {
      try { localStorage.setItem('xlot_visited', '1'); } catch {}
    } else {
      // 로그아웃 → 잠금 리셋 + SSS 플래그 정리
      try { localStorage.removeItem('xlot_visited'); } catch {}
      setIsLocked(false);
      setSSSOnboarding(false);
    }
  }, [account]);

  if (status === "connecting") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
      </div>
    );
  }

  // Dashboard 표시 조건:
  //   account 있음 + SSS 온보딩 아님 + 잠금 해제됨
  const showDashboard = !!account && !sssOnboarding && !isLocked;

  return (
    <SSSOnboardingContext.Provider value={{ sssOnboarding, setSSSOnboarding }}>
      <div className="relative min-h-screen bg-black text-white">

        {showDashboard ? (
          <>
            <Dashboard />
            <PWAInstallBanner />
          </>
        ) : (
          // onUnlock: LockedScreen 또는 SSS 완료 시 호출 → isLocked=false → Dashboard
          <LoginPage onUnlock={() => setIsLocked(false)} />
        )}

        {claimCommitment && (
          <PhoneClaimModal
            commitment={claimCommitment}
            onClose={() => setClaimCommitment(null)}
          />
        )}
      </div>
    </SSSOnboardingContext.Provider>
  );
}