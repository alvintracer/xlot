import { useState, useEffect, useMemo } from "react";
import { useActiveAccount } from "thirdweb/react";
import { 
  Loader2, ArrowUpRight, ArrowDownLeft, RefreshCw, 
  History, ArrowRightLeft, Wallet, ExternalLink, Globe 
} from "lucide-react";
import { getMyWallets } from "../services/walletService";
// ✨ [수정] 이제 여기서 fetchActivitiesByNetwork와 SUPPORTED_NETWORKS를 가져옵니다.
import { 
  fetchActivitiesByNetwork, 
  SUPPORTED_NETWORKS 
} from "../services/activityService";
import type { 
  ActivityItem 
} from "../services/activityService";

const getGroupLabel = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "오늘";
  if (date.toDateString() === yesterday.toDateString()) return "어제";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

export function ActivityPage() {
  const smartAccount = useActiveAccount();
  
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // ✨ 기본 선택: 이더리움 메인넷
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>('ETH_MAIN');

  const loadData = async () => {
    if (!smartAccount) return;
    setLoading(true);
    setActivities([]); 

    try {
      const myWallets = await getMyWallets(smartAccount.address);
      
      // ✨ [핵심] 선택된 네트워크 ID만 넘겨서 조회! (이제 에러 안 남)
      const result = await fetchActivitiesByNetwork(myWallets, selectedNetworkId);
      
      setActivities(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [smartAccount, selectedNetworkId]);

  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    activities.forEach(item => {
      const label = getGroupLabel(item.timestamp);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  }, [activities]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'SEND': return <ArrowUpRight size={18} className="text-slate-400" />;
      case 'RECEIVE': return <ArrowDownLeft size={18} className="text-blue-400" />;
      case 'EXECUTE': return <ArrowRightLeft size={18} className="text-purple-400" />;
      default: return <History size={18} className="text-slate-400" />;
    }
  };

  // 현재 선택된 네트워크 이름 찾기
  const currentNetworkName = SUPPORTED_NETWORKS.find(n => n.id === selectedNetworkId)?.name || "Unknown";

  return (
    <div className="p-6 pb-24 animate-fade-in min-h-screen bg-slate-950">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-black text-white tracking-tight">활동 내역</h2>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
               <Globe size={10}/> {currentNetworkName} 조회 중
            </p>
        </div>
        <button onClick={loadData} disabled={loading} className="p-2 bg-slate-900 rounded-full border border-slate-800 text-slate-400 hover:text-white transition-all">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ✨ 네트워크 선택 스크롤바 (가로 스크롤) */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
        {SUPPORTED_NETWORKS.map((net) => {
          const isSelected = selectedNetworkId === net.id;
          return (
            <button
              key={net.id}
              onClick={() => setSelectedNetworkId(net.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all border
                ${isSelected 
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]' 
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}
            >
              {net.name}
            </button>
          );
        })}
      </div>

      {/* Loading & Empty States */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
           <Loader2 className="animate-spin text-cyan-500" size={32} />
           <p className="text-xs">{currentNetworkName} 데이터 가져오는 중...</p>
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-3xl bg-slate-900/50 mt-4">
          <Wallet size={48} className="mx-auto text-slate-700 mb-4"/>
          <p className="text-slate-400 font-bold">내역이 없습니다.</p>
          <p className="text-slate-600 text-xs mt-1">
            {currentNetworkName} 네트워크에 거래 기록이 없어요.
          </p>
        </div>
      ) : (
        <div className="space-y-6 mt-2">
          {Object.entries(groupedActivities).map(([dateLabel, items]) => (
            <div key={dateLabel} className="animate-fade-in-up">
              <h3 className="text-xs font-bold text-slate-500 px-2 mb-3 sticky top-0 bg-slate-950/90 backdrop-blur py-2 z-10">
                {dateLabel}
              </h3>
              
              <div className="space-y-3">
                {items.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => window.open(item.detailUrl, '_blank')}
                    className="relative p-4 rounded-2xl border bg-slate-900 border-slate-800 hover:border-slate-700 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border border-slate-800 shadow-inner bg-slate-800`}>
                          {getActivityIcon(item.type)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-200 text-sm">{item.title}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                            {new Date(item.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`font-bold text-sm ${item.type === 'SEND' ? 'text-slate-200' : 'text-blue-400'}`}>
                          {item.type === 'SEND' ? '-' : item.type === 'RECEIVE' ? '+' : ''} {item.amount === '-' ? '' : parseFloat(item.amount).toFixed(4)}
                        </p>
                        <p className="text-xs text-slate-500 font-bold">{item.symbol}</p>
                      </div>
                    </div>
                    
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <ExternalLink size={12} className="text-slate-600"/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}