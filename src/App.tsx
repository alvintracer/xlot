import { useEffect, useState, createContext, useContext } from "react";
import { ThirdwebProvider, useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { wagmiConfig } from "./config";
import { Dashboard } from "./DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PhoneClaimModal } from "./components/PhoneClaimModal";

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claim  = params.get("claim");
    if (claim) setClaimCommitment(claim);
  }, []);

  // SSS 온보딩 완료 후 account가 생기면 플래그 해제
  useEffect(() => {
    if (!account) setSSSOnboarding(false);
  }, [account]);

  if (status === "connecting") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
        <p className="text-slate-400 font-bold animate-pulse">xLOT Wallet 불러오는 중...</p>
      </div>
    );
  }

  return (
    <SSSOnboardingContext.Provider value={{ sssOnboarding, setSSSOnboarding }}>
      <div className="relative min-h-screen bg-black text-white">

        {/* account 있어도 SSS 온보딩 중이면 LoginPage(+모달) 유지 */}
        {account && !sssOnboarding ? (
          <Dashboard />
        ) : (
          <LoginPage />
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