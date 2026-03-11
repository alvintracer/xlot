import { useState, useEffect } from "react";
import { useActiveWallet, useDisconnect } from "thirdweb/react";
import { getUserEmail } from "thirdweb/wallets/in-app"; 
import { useDisconnect as useWagmiDisconnect } from "wagmi";
import { LogOut, User, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { client } from "../client"; // ✨ [추가] 전역 client import

export function ProfileHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { disconnect: disconnectWagmi } = useWagmiDisconnect();

  useEffect(() => {
    const fetchEmail = async () => {
      if (wallet) {
        try {
          // ✨ [수정] wallet.client가 아니라 import한 client를 사용해야 합니다.
          const emailData = await getUserEmail({ client: client });
          
          // 이메일이 있으면 이메일, 없으면(메타마스크 등) 주소 표시
          setEmail(emailData || `${wallet.getAccount()?.address.slice(0,6)}...`);
        } catch (e) {
          // 이메일 정보가 없는 경우 (외부 지갑 등)
          setEmail(`${wallet.getAccount()?.address.slice(0,6)}...`);
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

  return (
    <div className="relative z-50">
      {/* 프로필 버튼 */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-full pl-3 pr-4 py-2 transition-all shadow-lg group"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-[0_0_10px_rgba(34,211,238,0.3)]">
          {email ? email[0].toUpperCase() : <User size={16} />}
        </div>
        <div className="flex flex-col items-start">
          <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors max-w-[100px] truncate">
            {email?.split("@")[0] || "User"}
          </span>
        </div>
        {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          
          <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-in-up">
            {/* 상단 정보 */}
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/50">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Signed in as</p>
              <p className="text-sm font-bold text-white truncate mb-2">{email}</p>
              <div className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono">
                  {wallet.getAccount()?.address.slice(0, 10)}...
                </span>
                <Copy size={12} className="text-slate-500 cursor-pointer hover:text-white" />
              </div>
            </div>
            
            {/* 메뉴 */}
            <div className="p-2">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-colors font-bold"
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