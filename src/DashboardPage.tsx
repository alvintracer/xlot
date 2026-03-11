import { useState } from "react";
import { Wallet, Repeat, Activity } from "lucide-react";
import { SwapPage } from "./pages/SwapPage";
import { ActivityPage } from "./pages/ActivityPage";
import { AssetsView } from "./components/AssetView";
import { useActiveAccount } from "thirdweb/react"; // ✨ import 추가

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<"assets" | "swap" | "activity">("assets");
  const account = useActiveAccount(); // ✨ 현재 연결된 지갑 확인

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col relative font-sans selection:bg-blue-500 selection:text-white">

      {/* 메인 콘텐츠 영역 (지갑이 없어도 배경은 깔려있음) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === "assets" && (
          <AssetsView onSwapClick={() => setActiveTab("swap")} />
        )}
        {activeTab === "swap" && <SwapPage />}
        {activeTab === "activity" && <ActivityPage />}
      </div>

      {/* 하단 고정 탭바 */}
      <div className="fixed bottom-0 w-full bg-slate-900/80 backdrop-blur-md border-t border-slate-800 pb-safe pt-2 px-6 flex justify-between items-center z-50">
        
        <button 
          onClick={() => setActiveTab("assets")}
          className={`flex flex-col items-center gap-1 p-2 w-16 transition-all duration-300 ${
            activeTab === "assets" ? "text-blue-400 scale-110" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Wallet size={24} strokeWidth={activeTab === "assets" ? 2.5 : 2} />
          <span className="text-[10px] font-bold">자산</span>
        </button>

        <button 
          onClick={() => setActiveTab("swap")}
          className={`flex flex-col items-center gap-1 p-2 w-16 transition-all duration-300 ${
            activeTab === "swap" ? "text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 scale-110" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Repeat size={24} className={activeTab === "swap" ? "text-blue-400" : ""} strokeWidth={activeTab === "swap" ? 2.5 : 2} />
          <span className="text-[10px] font-bold">스왑</span>
        </button>

        <button 
          onClick={() => setActiveTab("activity")}
          className={`flex flex-col items-center gap-1 p-2 w-16 transition-all duration-300 ${
            activeTab === "activity" ? "text-indigo-400 scale-110" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Activity size={24} strokeWidth={activeTab === "activity" ? 2.5 : 2} />
          <span className="text-[10px] font-bold">활동</span>
        </button>
      </div>
    </div>
  );
}