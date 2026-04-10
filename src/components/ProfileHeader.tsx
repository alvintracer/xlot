import { useState, useEffect } from "react";
import { useActiveWallet, useDisconnect } from "thirdweb/react";
import { getUserEmail } from "thirdweb/wallets/in-app"; 
import { useDisconnect as useWagmiDisconnect } from "wagmi";
import { LogOut, User, Laptop, Monitor, CheckCircle2, ShieldCheck, Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { client } from "../client";
import type { WalletSlot } from "../services/walletService";

interface Props {
  wallets: WalletSlot[];
  activeWalletId: string | null;
  onSelectActiveWallet: (id: string) => void;
  // Device parts
  allDevices: any[];
  currentDeviceName: string;
  currentDeviceId: string;
  onDeviceRename: () => void;
}

export function ProfileHeader({
  wallets, activeWalletId, onSelectActiveWallet,
  allDevices, currentDeviceName, currentDeviceId, onDeviceRename
}: Props) {
  const [email, setEmail] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAllDevices, setShowAllDevices] = useState(false);

  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { disconnect: disconnectWagmi } = useWagmiDisconnect();

  useEffect(() => {
    const fetchEmail = async () => {
      if (wallet) {
        try {
          const emailData = await getUserEmail({ client: client });
          setEmail(emailData || "User");
        } catch (e) {
          setEmail("User");
        }
      }
    };
    fetchEmail();
  }, [wallet]);

  const handleLogout = () => {
    localStorage.removeItem("upbit_access");
    localStorage.removeItem("upbit_secret");

    if (wallet) disconnect(wallet);
    disconnectWagmi();
    
    window.location.reload();
  };

  if (!wallet) return null;

  const otherDevices = allDevices.filter(d => d.device_uuid !== currentDeviceId);

  return (
    <div className="relative z-50">
      {/* 프로필 버튼 */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-full p-1.5 transition-all shadow-lg group w-11 h-11 shrink-0"
      >
        <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-[0_0_10px_rgba(34,211,238,0.3)] shrink-0 text-sm">
          {email && email !== "User" ? email[0].toUpperCase() : <User size={18} />}
        </div>
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          
          <div className="absolute right-0 mt-3 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-in-up">
            {/* 상단 정보 */}
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/50">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Account</p>
              <p className="text-sm font-bold text-white truncate">{email}</p>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* 1. 사용 지갑(Active Slot) 설정 */}
              <div className="p-3 border-b border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 mb-2 px-2">디앱 연결용 지갑 (Active Wallet)</p>
                <div className="space-y-1">
                  {wallets.length === 0 ? (
                    <p className="text-xs text-slate-600 px-2 py-1">지갑을 먼저 추가해주세요</p>
                  ) : (
                    wallets.map(w => {
                      const isActive = w.id === activeWalletId;
                      const isSss = w.wallet_type === 'XLOT_SSS';
                      const isMpc = w.wallet_type === 'XLOT';
                      return (
                        <button 
                          key={w.id}
                          onClick={() => { onSelectActiveWallet(w.id); setIsOpen(false); }}
                          className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-colors
                            ${isActive ? 'bg-cyan-500/15 border border-cyan-500/30' : 'hover:bg-slate-800 border border-transparent'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isSss ? <ShieldCheck size={14} className={isActive ? "text-emerald-400" : "text-slate-500"}/> 
                             : <Wallet size={14} className={isActive ? "text-cyan-400" : "text-slate-500"}/>}
                            <div className="truncate">
                              <p className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                                {w.label}
                                {isSss && <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] bg-cyan-500/20 text-cyan-400 font-bold tracking-wider">SAR</span>}
                                {isMpc && <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] bg-cyan-500/20 text-cyan-400">MPC</span>}
                              </p>
                            </div>
                          </div>
                          {isActive && <CheckCircle2 size={14} className="text-cyan-400 shrink-0"/>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. 기기 관리 */}
              <div className="p-3 border-b border-slate-800">
                <div className="flex items-center justify-between mb-2 px-2">
                  <p className="text-[10px] font-bold text-slate-500">현재 접속 기기</p>
                  {otherDevices.length > 0 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowAllDevices(!showAllDevices); }}
                      className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded-full transition-colors"
                    >
                      목록 {showAllDevices ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white">
                        {currentDeviceName || "기기 설정 필요"}
                      </p>
                      <p className="text-[9px] text-slate-400">현재 사용 중 (This Device)</p>
                    </div>
                  </div>
                  {showAllDevices && otherDevices.map(d => (
                    <div key={d.id} className="p-2 flex items-center gap-2">
                       <Monitor size={12} className="text-slate-500 shrink-0"/>
                       <div>
                         <p className="text-xs font-bold text-slate-400">{d.nickname}</p>
                       </div>
                    </div>
                  ))}
                  <button onClick={() => { onDeviceRename(); setIsOpen(false); }} className="w-full text-left text-[10px] text-cyan-400 hover:text-cyan-300 pt-2 px-2 flex items-center gap-1">
                    <Laptop size={10} /> 이 기기 이름 변경
                  </button>
                </div>
              </div>
            </div>
            
            {/* 하단 메뉴 */}
            <div className="p-2 bg-slate-950/50">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-colors font-bold"
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}