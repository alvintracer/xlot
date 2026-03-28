// ============================================================
// DashboardPage.tsx
// Phase 5-B Step 3 — KYC 탭 연동 추가
// ============================================================

import { useState } from "react";
import { Wallet, Repeat, BarChart2, Activity } from "lucide-react";
import { SwapPage } from "./pages/SwapPage";
import { TradePage } from "./pages/TradePage";
import { ActivityPage } from "./pages/ActivityPage";
import { AssetsView } from "./components/AssetView";
import { useActiveAccount } from "thirdweb/react";
import { SSSTestPanel } from './components/SSSTestPanel';

type TabId = "assets" | "swap" | "trade" | "activity";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("assets");
  const account = useActiveAccount();

  // KYC 요청 핸들러 — Trade에서 KYC 필요 시 assets 탭의 KYC 모달로 이동
  const handleKycRequest = () => {
    setActiveTab("assets");
    // AssetView 내부의 KYC 모달 오픈은 AssetView에서 처리
    // 여기서는 탭만 전환 (사용자가 자산 탭에서 인증 배지 클릭 유도)
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col relative font-sans selection:bg-blue-500 selection:text-white">

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === "assets" && (
          <AssetsView onSwapClick={() => setActiveTab("swap")} />
        )}
        {activeTab === "swap" && <SwapPage />}
        {activeTab === "trade" && (
          <TradePage onKycRequest={handleKycRequest} />
        )}
        {activeTab === "activity" && <ActivityPage />}
      </div>

      {/* {import.meta.env.DEV && <SSSTestPanel />} */}

      {/* 하단 고정 탭바 */}
      <div className="fixed bottom-0 w-full bg-slate-900/80 backdrop-blur-md border-t border-slate-800 pb-safe pt-2 px-4 flex justify-between items-center z-50">

        <TabButton id="assets" active={activeTab} onClick={setActiveTab}
          icon={<Wallet size={22} strokeWidth={activeTab === "assets" ? 2.5 : 2} />}
          label="자산" activeColor="text-blue-400"
        />
        <TabButton id="swap" active={activeTab} onClick={setActiveTab}
          icon={<Repeat size={22} strokeWidth={activeTab === "swap" ? 2.5 : 2} />}
          label="스왑" activeColor="text-cyan-400"
        />
        <TabButton id="trade" active={activeTab} onClick={setActiveTab}
          icon={
            <div className="relative">
              <BarChart2 size={22} strokeWidth={activeTab === "trade" ? 2.5 : 2} />
              {activeTab !== "trade" && (
                <span className="absolute -top-1.5 -right-2 text-[8px] font-black bg-emerald-500 text-white px-1 rounded leading-tight">
                  NEW
                </span>
              )}
            </div>
          }
          label="트레이드" activeColor="text-emerald-400"
        />
        <TabButton id="activity" active={activeTab} onClick={setActiveTab}
          icon={<Activity size={22} strokeWidth={activeTab === "activity" ? 2.5 : 2} />}
          label="활동" activeColor="text-indigo-400"
        />

      </div>
    </div>
  );
}

function TabButton({
  id, active, onClick, icon, label, activeColor,
}: {
  id: TabId;
  active: TabId;
  onClick: (id: TabId) => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
}) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex flex-col items-center gap-0.5 p-2 w-16 transition-all duration-300 ${
        isActive ? `${activeColor} scale-110` : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}