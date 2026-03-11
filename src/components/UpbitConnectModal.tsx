import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { fetchUpbitAccounts } from "../services/upbitService";
import { supabase } from "../lib/supabase"; // ✨ DB 연동
import { useActiveAccount } from "thirdweb/react"; // 내 지갑 주소 알기 위해

interface Props {
  onClose: () => void;
  onConnect: (accounts: any[]) => void;
}

export function UpbitConnectModal({ onClose, onConnect }: Props) {
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const smartAccount = useActiveAccount(); // 현재 로그인된 xLOT 지갑

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. API 호출 테스트 (유효한 키인지 확인)
      const accounts = await fetchUpbitAccounts(accessKey, secretKey);
      
      // 2. 유효하다면 DB에 저장 (Upsert: 있으면 수정, 없으면 추가)
      if (smartAccount?.address) {
        const { error: dbError } = await supabase
          .from('user_api_keys')
          .upsert({ 
            wallet_address: smartAccount.address, // PK
            upbit_access: accessKey,
            upbit_secret: secretKey
          });

        if (dbError) {
          console.error("DB 저장 실패:", dbError);
          // DB 실패해도 일단 연동은 진행 (UX 우선)
        } else {
          console.log("✅ 업비트 키가 안전하게(?) 서버에 저장되었습니다.");
        }
      }

      onConnect(accounts);
      onClose();
    } catch (err) {
      setError("연동 실패! 키를 확인하거나 IP 허용 설정을 체크하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-800">
        
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold text-white">업비트 연동</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          한 번 연결하면 다음 로그인부터는 자동으로 연동됩니다.
          <br/> <span className="text-cyan-400 font-bold">* 테스트 서버에 저장됩니다.</span>
        </p>

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 ml-1">Access Key</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-800 text-sm placeholder-slate-600"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Access Key"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 ml-1">Secret Key</label>
            <input 
              type="password" 
              className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-800 text-sm placeholder-slate-600"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Secret Key"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-xs text-red-400 font-bold text-center">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-800 py-3 rounded-2xl font-bold text-slate-300 hover:bg-slate-700 transition-colors">
              취소
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-[2] bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-2xl font-bold hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] disabled:opacity-50 transition-all flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18}/> : "저장 및 연동"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}