import { useEffect, useState, createContext, useContext } from "react";
import { ThirdwebProvider, AutoConnect, useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { inAppWallet, createWallet } from "thirdweb/wallets";

import { client } from "./client";
import { wagmiConfig } from "./config";
import { Dashboard } from "./DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PhoneClaimModal } from "./components/PhoneClaimModal";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { ExtensionRequestPage } from "./extension/ExtensionRequestPage";
import { getSSSEvmAddresses } from "./services/walletService";

// 익스텐션 컨텍스트 여부 (chrome.runtime.id 는 extension page 에서만 정의됨)
const _chromeRuntime = (globalThis as any).chrome?.runtime;
const IS_EXTENSION_CONTEXT = typeof _chromeRuntime !== 'undefined' && !!_chromeRuntime?.id;

// 익스텐션 서명 요청 팝업 모드 감지
const urlParams = new URLSearchParams(window.location.search);
const IS_EXTENSION_REQUEST =
  urlParams.get('mode') === 'extension-request' && !!urlParams.get('requestId');

// 익스텐션에서 새 탭으로 열린 로그인 모드
const IS_EXTENSION_LOGIN = urlParams.get('mode') === 'login';

// 툴바 팝업 모드: 익스텐션이되 로그인 탭/서명요청 팝업이 아닌 경우
const IS_EXT_POPUP = IS_EXTENSION_CONTEXT && !IS_EXTENSION_LOGIN && !IS_EXTENSION_REQUEST;

const AUTO_CONNECT_WALLETS = IS_EXT_POPUP ? [
  inAppWallet({ 
    auth: { options: ['email'] },
    metadata: { name: 'xLOT Wallet', image: undefined }
  })
] : [
  inAppWallet({ 
    auth: { options: ['google', 'apple', 'email'] },
    metadata: { name: 'xLOT Wallet', image: undefined }
  }),
  createWallet('io.metamask'),
];

// ── 익스텐션 chrome.storage.local 동기화 ──────────────────────
// DApp에 노출할 주소(accounts)를 SSS EVM 주소로 설정하고,
// Thirdweb 스마트 계정 주소는 별도로 저장 (SSS Vault 조회용 userId)
function syncExtensionClear() {
  if (!IS_EXTENSION_CONTEXT) return;
  const cs = (globalThis as any).chrome.storage.local;
  cs.set({ accounts: [], xlot_smart_address: '', xlot_all_accounts: [] });
  (globalThis as any).chrome.runtime.sendMessage({ type: 'XLOT_SET_ACCOUNTS', accounts: [] });
}

async function syncExtensionAccounts(smartAddress: string) {
  if (!IS_EXTENSION_CONTEXT) return;
  const cs = (globalThis as any).chrome.storage.local;

  // 1) 스마트 계정 주소 저장 (SSS Vault userId)
  cs.set({ xlot_smart_address: smartAddress });

  // 2) Supabase 에서 SSS EVM 주소 목록 조회
  try {
    const sssWallets = await getSSSEvmAddresses(smartAddress);
    const allAccounts = sssWallets.map(w => w.evm);

    // 3) 현재 선택된 주소 확인. 없으면 첫 번째 SSS 주소로 설정
    const stored = await new Promise<Record<string, any>>(resolve =>
      cs.get(['xlot_active_address'], resolve),
    );
    let activeAddr = stored.xlot_active_address as string | undefined;

    // 활성 주소가 SSS 목록에 없으면 첫 번째 SSS 주소 선택 (없으면 스마트 계정)
    if (!activeAddr || !allAccounts.includes(activeAddr)) {
      activeAddr = allAccounts[0] ?? smartAddress;
    }

    cs.set({
      accounts: [activeAddr],
      xlot_active_address: activeAddr,
      xlot_all_accounts: JSON.stringify(
        sssWallets.map(w => ({ address: w.evm, label: w.label, type: 'XLOT_SSS' }))
          .concat([{ address: smartAddress, label: 'Smart Account', type: 'THIRDWEB_AA' }]),
      ),
    });

    (globalThis as any).chrome.runtime.sendMessage({ type: 'XLOT_SET_ACCOUNTS', accounts: [activeAddr] });
  } catch (e) {
    // SSS 주소 조회 실패 시 스마트 계정 주소를 폴백으로 사용
    console.warn('[xLOT] SSS 주소 조회 실패, 스마트 계정 주소 사용:', e);
    cs.set({ accounts: [smartAddress], xlot_active_address: smartAddress });
    (globalThis as any).chrome.runtime.sendMessage({ type: 'XLOT_SET_ACCOUNTS', accounts: [smartAddress] });
  }
}

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
      {/*
        AutoConnect: 페이지 로드 시마다 저장된 세션으로 자동 재연결.
        팝업을 껐다가 켜도 로그인 유지되는 핵심.
        timeout=15s 안에 연결 안 되면 포기하고 로그인 화면 표시.
      */}
      <AutoConnect
        client={client}
        wallets={AUTO_CONNECT_WALLETS}
        timeout={15000}
      />
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {IS_EXTENSION_REQUEST ? (
            <ExtensionRequestPage />
          ) : (
            <MainRouter extensionLoginMode={IS_EXTENSION_LOGIN} />
          )}
        </QueryClientProvider>
      </WagmiProvider>
    </ThirdwebProvider>
  );
}

function MainRouter({ extensionLoginMode = false }: { extensionLoginMode?: boolean }) {
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
    // 💡 status === "connecting" 일 때는 로그아웃으로 간주하지 않음
    if (status === "connecting") return;

    if (account) {
      try { localStorage.setItem('xlot_visited', '1'); } catch {}

      // 익스텐션 환경: SSS EVM 주소를 조회해서 DApp 연결용으로 설정
      syncExtensionAccounts(account.address);

      // 익스텐션 로그인 탭: 로그인 완료 → 탭 닫기
      if (extensionLoginMode && IS_EXTENSION_CONTEXT) {
        setTimeout(() => window.close(), 800);
      }
    } else if (status === "disconnected") {
      // 명시적 로그아웃/연결 끊김 상태에서만 잠금 리셋
      try { localStorage.removeItem('xlot_visited'); } catch {}
      setIsLocked(false);
      setSSSOnboarding(false);
      syncExtensionClear();
    }
  }, [account, status, extensionLoginMode]);

  if (status === "connecting") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
      </div>
    );
  }

  // Dashboard 표시 조건:
  //   account 있음 + SSS 온보딩 아님 + 잠금 해제됨
  //   익스텐션 팝업 모드에서는 잠금 체크 스킵 (팝업 열기 자체가 사용자 인증)
  const showDashboard = !!account && !sssOnboarding && (!isLocked || IS_EXT_POPUP);

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