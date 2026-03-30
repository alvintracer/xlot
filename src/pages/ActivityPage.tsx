// ============================================================
// ActivityPage.tsx — Compliant 활동 통합 대시보드
//
// 탭 구성:
//   A. 활동 내역   — 온체인 tx + TR 뱃지 통합
//   B. Travel Rule — 100만원↑ 송금 레코드 조회/내보내기
//   C. 세금·소명   — 과세 계산, PDF/CSV, 거래소 소명서
//
// PC: 좌(프로필+탭) / 우(컨텐츠) 2컬럼
// Mobile: 상(프로필카드) / 하(탭+컨텐츠) 단일 컬럼
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import {
  Loader2, ArrowUpRight, ArrowDownLeft, RefreshCw,
  History, ArrowRightLeft, ExternalLink, Globe,
  ShieldCheck, ShieldAlert, FileText, Download,
  Search, Calendar, ChevronDown, ChevronRight,
  Copy, Check, Printer, TableProperties, BarChart3,
  AlertCircle, User, Wallet, Activity, Scale,
} from 'lucide-react';
import { getMyWallets } from '../services/walletService';
import type { WalletSlot } from '../services/walletService';
import { fetchActivitiesByNetwork, SUPPORTED_NETWORKS } from '../services/activityService';
import type { ActivityItem } from '../services/activityService';
import { getCredentials } from '../services/credentialService';
import type { VerifiableCredential } from '../services/credentialService';
import { hasKYCOnDevice } from '../services/kycDeviceService';
import {
  requestTRChallenge, submitTRSignature,
  generateTRCsv, generateTRPdfHtml,
  PURPOSE_LABELS,
} from '../services/travelRuleService';
import type { TravelRulePayload } from '../services/travelRuleService';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { KYCRegistrationModal } from '../components/KYCRegistrationModal';

// ── 탭 타입 ──────────────────────────────────────────────────
type MainTab = 'activity' | 'travel_rule' | 'tax';

// ── 날짜 그룹 라벨 ────────────────────────────────────────────
function getGroupLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '오늘';
  if (d.toDateString() === yesterday.toDateString()) return '어제';
  return `${d.getMonth()+1}월 ${d.getDate()}일`;
}

// ── TR 히스토리 아이템 ────────────────────────────────────────
interface TRHistoryItem {
  referenceId: string;
  chain:       string;
  txHash?:     string;
  status:      string;
  createdAt:   string;
  payload?:    TravelRulePayload;
}

// ============================================================
export function ActivityPage() {
  const smartAccount  = useActiveAccount();
  const [mainTab, setMainTab] = useState<MainTab>('activity');

  // 프로필 데이터
  const [wallets, setWallets]         = useState<WalletSlot[]>([]);
  const [credential, setCredential]   = useState<VerifiableCredential | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // 활동 내역
  const [activities, setActivities]   = useState<ActivityItem[]>([]);
  const [actLoading, setActLoading]   = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('ETH_MAIN');

  // Travel Rule
  const [trHistory, setTrHistory]     = useState<TRHistoryItem[]>([]);
  const [trLoading, setTrLoading]     = useState(false);
  const [trFromDate, setTrFromDate]   = useState('');
  const [trToDate, setTrToDate]       = useState('');
  const [expandedTR, setExpandedTR]   = useState<string | null>(null);
  const [copiedRef, setCopiedRef]     = useState<string | null>(null);

  // TR 단건 조회 (서명 인증)
  const [lookupRefId, setLookupRefId] = useState('');
  const [lookupStep, setLookupStep]   = useState<'idle'|'challenging'|'signing'|'done'|'error'>('idle');
  const [lookupChallenge, setLookupChallenge] = useState('');
  const [lookupResult, setLookupResult] = useState<TRHistoryItem | null>(null);
  const [lookupError, setLookupError] = useState('');

  // 세금
  const [taxYear, setTaxYear]         = useState(new Date().getFullYear() - 1);
  const [taxLoading, setTaxLoading]   = useState(false);
  const [showKYCReg, setShowKYCReg]   = useState(false);

  const userId = smartAccount?.address || '';

  // ── PC 판별 ──────────────────────────────────────────────
  const [isPC, setIsPC] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const h = () => setIsPC(window.innerWidth >= 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // ── 프로필 초기 로드 ─────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setProfileLoading(true);
    Promise.all([
      getMyWallets(userId),
      getCredentials(userId),
    ]).then(([ws, creds]) => {
      setWallets(ws);
      setCredential(creds.find(c => c.type === 'NON_SANCTIONED' && c.status === 'ACTIVE') || null);
    }).finally(() => setProfileLoading(false));
  }, [userId]);

  // ── 활동 내역 로드 ───────────────────────────────────────
  const loadActivities = async () => {
    if (!userId) return;
    setActLoading(true); setActivities([]);
    try {
      const ws = wallets.length > 0 ? wallets : await getMyWallets(userId);
      setActivities(await fetchActivitiesByNetwork(ws, selectedNetwork));
    } catch (e) { console.error(e); }
    finally { setActLoading(false); }
  };

  useEffect(() => {
    if (mainTab === 'activity') loadActivities();
  }, [mainTab, selectedNetwork, userId]);

  // ── TR 내역 로드 ─────────────────────────────────────────
  const loadTRHistory = async () => {
    if (!userId) return;
    setTrLoading(true); setTrHistory([]);
    try {
      const { data } = await supabase
        .from('travel_rule_access_logs')
        .select('reference_id, accessor_role, accessed_at')
        .eq('accessor_address', userId.toLowerCase())
        .order('accessed_at', { ascending: false })
        .limit(100);

      const refIds = [...new Set((data || []).map((r: any) => r.reference_id))];
      if (refIds.length === 0) return;

      const from = trFromDate || '2020-01-01T00:00:00Z';
      const to   = trToDate ? new Date(trToDate + 'T23:59:59Z').toISOString() : new Date().toISOString();

      const { data: records } = await supabase
        .from('travel_rule_records')
        .select('reference_id, chain, tx_hash, status, created_at')
        .in('reference_id', refIds)
        .gte('created_at', from).lte('created_at', to)
        .order('created_at', { ascending: false });

      setTrHistory((records || []).map((r: any) => ({
        referenceId: r.reference_id,
        chain:       r.chain,
        txHash:      r.tx_hash,
        status:      r.status,
        createdAt:   r.created_at,
      })));
    } catch (e) { console.error(e); }
    finally { setTrLoading(false); }
  };

  useEffect(() => {
    if (mainTab === 'travel_rule') loadTRHistory();
  }, [mainTab, userId]);

  // ── TR 단건 서명 조회 ────────────────────────────────────
  const handleTRLookup = async () => {
    if (!lookupRefId.trim()) return;
    setLookupStep('challenging'); setLookupError('');
    try {
      const ch = await requestTRChallenge(lookupRefId.trim());
      setLookupChallenge(ch); setLookupStep('signing');
    } catch (e: any) { setLookupError(e.message); setLookupStep('error'); }
  };

  const handleTRSign = async () => {
    setLookupStep('signing');
    try {
      const win = window as any;
      const provider = new ethers.BrowserProvider(win.ethereum);
      const signer   = await provider.getSigner();
      const sig      = await signer.signMessage(lookupChallenge);
      const data     = await submitTRSignature(lookupRefId.trim(), lookupChallenge, sig, userId);
      setLookupResult({
        referenceId: lookupRefId.trim(),
        chain:       data.chain || 'EVM',
        txHash:      data.txHash,
        status:      'SUBMITTED',
        createdAt:   data.createdAt,
        payload:     data.payload,
      });
      setLookupStep('done');
    } catch (e: any) { setLookupError(e.message); setLookupStep('error'); }
  };

  // ── CSV 다운로드 ─────────────────────────────────────────
  const handleDownloadCSV = (items: TRHistoryItem[]) => {
    const decoded = items.filter(i => i.payload);
    if (!decoded.length) { alert('먼저 항목을 조회해주세요'); return; }
    const csv  = generateTRCsv(decoded.map(i => i.payload!), decoded.map(i => ({
      txHash: i.txHash, createdAt: i.createdAt, referenceId: i.referenceId,
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `TR_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = (item: TRHistoryItem, purpose: 'tax' | 'exchange') => {
    if (!item.payload) return;
    const html = generateTRPdfHtml(item.payload, item.referenceId, item.txHash, item.createdAt, purpose);
    const w = window.open('', '_blank', 'width=800,height=900');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  // ── 활동 내역 그룹핑 ────────────────────────────────────
  const grouped = useMemo(() => {
    const g: Record<string, ActivityItem[]> = {};
    activities.forEach(a => {
      const k = getGroupLabel(a.timestamp);
      if (!g[k]) g[k] = [];
      g[k].push(a);
    });
    return g;
  }, [activities]);

  // ── 세금 요약 (간단 모의계산) ───────────────────────────
  const taxSummary = useMemo(() => {
    // TR 레코드 기반 간단 집계 (실제로는 취득가액 데이터 필요)
    const sends    = trHistory.filter(i => i.payload?.transferPurpose !== 'SELF_TRANSFER');
    const totalKrw = sends.reduce((s, i) => s + (i.payload?.amountKrw || 0), 0);
    const deduction = 2_500_000;
    const taxBase  = Math.max(totalKrw - deduction, 0);
    const taxAmount = Math.floor(taxBase * 0.22);
    return { totalKrw, deduction, taxBase, taxAmount, count: sends.length };
  }, [trHistory]);

  // ── 프로필 카드 ─────────────────────────────────────────
  const ProfileCard = () => {
    const hasKYCLocal = hasKYCOnDevice(userId);
    const totalValue  = wallets.reduce((s, w) => s + (w.total_value_krw || 0), 0);
    const sssWallet   = wallets.find(w => w.wallet_type === 'XLOT_SSS');
    const mainWallet  = wallets.find(w => w.wallet_type === 'XLOT') || wallets[0];

    return (
      <div className={`bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 ${isPC ? '' : 'mb-4'}`}>

        {/* 계정 헤더 */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <User size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">내 계정</p>
            <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
              {userId.slice(0,10)}...{userId.slice(-6)}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">{wallets.length}개 지갑 슬롯</p>
          </div>
          {/* 총 자산 */}
          <div className="text-right shrink-0">
            <p className="text-[10px] text-slate-500">총 자산</p>
            <p className="text-base font-black text-white">
              ₩{(totalValue / 10000).toFixed(0)}만
            </p>
          </div>
        </div>

        {/* KYC 상태 */}
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
          credential
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : hasKYCLocal
            ? 'bg-cyan-500/10 border-cyan-500/20'
            : 'bg-slate-800/50 border-slate-700 border-dashed cursor-pointer hover:bg-slate-800 transition-colors'
        }`} onClick={() => !credential && !hasKYCLocal && setShowKYCReg(true)}>
          {credential
            ? <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
            : hasKYCLocal
            ? <ShieldCheck size={14} className="text-cyan-400 shrink-0" />
            : <ShieldAlert size={14} className="text-slate-500 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-bold ${
              credential ? 'text-emerald-400' : hasKYCLocal ? 'text-cyan-400' : 'text-slate-500'}`}>
              {credential ? 'KYC Verified' : hasKYCLocal ? '실명 등록됨 (로컬)' : 'KYC 미인증'}
            </p>
            {credential && (
              <p className="text-[9px] text-slate-600 font-mono">
                만료: {new Date(credential.expirationDate).toLocaleDateString('ko-KR')}
              </p>
            )}
          </div>
          {!credential && !hasKYCLocal && (
            <span className="text-[9px] text-slate-600 shrink-0">Travel Rule 필수</span>
          )}
        </div>

        {/* 지갑 요약 */}
        <div className="space-y-2">
          {sssWallet && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-xl">
              <div className="w-5 h-5 rounded-full overflow-hidden p-[1px] bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm shrink-0">
                <img src="/icon-192.png" alt="xLOT SSS" className="w-full h-full object-cover rounded-full bg-slate-900" />
              </div>
              <p className="text-[11px] font-bold text-emerald-400 flex-1 truncate">{sssWallet.label}</p>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">SSS</span>
            </div>
          )}
          {mainWallet && mainWallet !== sssWallet && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-xl">
              <div className="w-5 h-5 rounded-full overflow-hidden p-[1px] bg-gradient-to-br from-cyan-500 to-blue-500 shadow-sm shrink-0">
                <img src="/icon-192.png" alt="xLOT" className="w-full h-full object-cover rounded-full bg-slate-900" />
              </div>
              <p className="text-[11px] font-bold text-cyan-400 flex-1 truncate">{mainWallet.label}</p>
              <span className="text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded-full">AA</span>
            </div>
          )}
        </div>

        {/* 탭 (PC에서 사이드바에 위치) */}
        {isPC && (
          <div className="pt-2 border-t border-slate-800 space-y-1">
            {([
              { id: 'activity', label: '활동 내역', icon: Activity },
              { id: 'travel_rule', label: 'Travel Rule', icon: ShieldCheck },
              { id: 'tax', label: '세금 · 소명', icon: Scale },
            ] as { id: MainTab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setMainTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mainTab === id
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}>
                <Icon size={16} />
                {label}
                {mainTab === id && <ChevronRight size={12} className="ml-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── 탭 A: 활동 내역 ─────────────────────────────────────
  const ActivityTab = () => (
    <div className="space-y-4">
      {/* 네트워크 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {SUPPORTED_NETWORKS.map(net => (
          <button key={net.id} onClick={() => setSelectedNetwork(net.id)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
              selectedNetwork === net.id
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
            }`}>
            {net.name}
          </button>
        ))}
      </div>

      {/* 새로고침 */}
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Globe size={10}/>
          {SUPPORTED_NETWORKS.find(n => n.id === selectedNetwork)?.name}
        </p>
        <button onClick={loadActivities} disabled={actLoading}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-white">
          <RefreshCw size={12} className={actLoading ? 'animate-spin' : ''}/> 새로고침
        </button>
      </div>

      {/* 리스트 */}
      {actLoading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="animate-spin text-cyan-500" size={28}/>
          <p className="text-xs text-slate-500">조회 중...</p>
        </div>
      ) : activities.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl">
          <History size={32} className="text-slate-700 mx-auto mb-3"/>
          <p className="text-sm text-slate-500">내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([label, items]) => (
            <div key={label}>
              <p className="text-[11px] font-bold text-slate-600 px-1 mb-2 sticky top-0 bg-slate-950/90 backdrop-blur py-1 z-10">
                {label}
              </p>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id}
                    onClick={() => item.detailUrl && window.open(item.detailUrl, '_blank')}
                    className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-700 cursor-pointer transition-all group">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      item.type === 'RECEIVE' ? 'bg-blue-500/15' : 'bg-slate-800'}`}>
                      {item.type === 'SEND'    && <ArrowUpRight size={16} className="text-slate-400"/>}
                      {item.type === 'RECEIVE' && <ArrowDownLeft size={16} className="text-blue-400"/>}
                      {item.type === 'EXECUTE' && <ArrowRightLeft size={16} className="text-purple-400"/>}
                      {item.type === 'UNKNOWN' && <History size={16} className="text-slate-500"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-200 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                        {new Date(item.timestamp * 1000).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${item.type === 'RECEIVE' ? 'text-blue-400' : 'text-slate-300'}`}>
                        {item.type === 'RECEIVE' ? '+' : ''}{parseFloat(item.amount).toFixed(4)}
                      </p>
                      <p className="text-[10px] text-slate-500">{item.symbol}</p>
                    </div>
                    <ExternalLink size={12} className="text-slate-700 group-hover:text-slate-500 shrink-0"/>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── 탭 B: Travel Rule ────────────────────────────────────
  const TravelRuleTab = () => (
    <div className="space-y-5">

      {/* 단건 조회 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-white flex items-center gap-2">
          <Search size={13} className="text-cyan-400"/> 단건 조회 (서명 인증)
        </p>
        <div className="flex gap-2">
          <input value={lookupRefId} onChange={e => setLookupRefId(e.target.value)}
            placeholder="Reference ID (32자리 hex)"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono outline-none focus:border-cyan-500/50"/>
          <button onClick={handleTRLookup}
            disabled={lookupStep === 'challenging' || !lookupRefId.trim()}
            className="px-4 py-2.5 bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-xs font-bold text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-40">
            {lookupStep === 'challenging' ? <Loader2 size={14} className="animate-spin"/> : '조회'}
          </button>
        </div>

        {lookupStep === 'signing' && (
          <div className="space-y-2">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 mb-1">서명 메시지</p>
              <p className="text-[10px] text-slate-300 font-mono break-all line-clamp-3">{lookupChallenge}</p>
            </div>
            <button onClick={handleTRSign}
              className="w-full py-2.5 bg-amber-500/20 border border-amber-500/30 rounded-xl text-xs font-bold text-amber-400">
              지갑으로 서명하기
            </button>
          </div>
        )}
        {lookupStep === 'error' && (
          <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{lookupError}</p>
        )}
        {lookupStep === 'done' && lookupResult?.payload && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Check size={13} className="text-emerald-400"/>
              <p className="text-xs font-bold text-emerald-400">조회 완료</p>
            </div>
            <div className="text-[11px] space-y-1">
              {[
                ['송신인', lookupResult.payload.originatorName || '—'],
                ['수취인', lookupResult.payload.isSelfTransfer ? '본인' : (lookupResult.payload.beneficiaryName || '—')],
                ['금액', `${lookupResult.payload.amountToken} ${lookupResult.payload.assetSymbol}`],
                ['목적', PURPOSE_LABELS[lookupResult.payload.transferPurpose]],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-white font-bold">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handlePrint(lookupResult, 'tax')}
                className="flex-1 py-2 rounded-lg text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 flex items-center justify-center gap-1">
                <Printer size={10}/> 과세 PDF
              </button>
              <button onClick={() => handlePrint(lookupResult, 'exchange')}
                className="flex-1 py-2 rounded-lg text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center gap-1">
                <FileText size={10}/> 소명 PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 기간별 조회 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-white flex items-center gap-2">
          <Calendar size={13} className="text-cyan-400"/> 기간별 내역
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">시작일</label>
            <input type="date" value={trFromDate} onChange={e => setTrFromDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/50"/>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">종료일</label>
            <input type="date" value={trToDate} onChange={e => setTrToDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/50"/>
          </div>
        </div>
        <button onClick={loadTRHistory} disabled={trLoading}
          className="w-full py-2.5 bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-xs font-bold text-cyan-400 disabled:opacity-40 flex items-center justify-center gap-2">
          {trLoading ? <><Loader2 size={12} className="animate-spin"/>조회 중...</> : <><Calendar size={12}/>내역 조회</>}
        </button>

        {trHistory.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-500">{trHistory.length}건</p>
              <button onClick={() => handleDownloadCSV(trHistory)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold hover:text-emerald-300">
                <Download size={11}/> 전체 CSV
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
              {trHistory.map(item => (
                <div key={item.referenceId} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedTR(expandedTR === item.referenceId ? null : item.referenceId)}
                    className="w-full p-3 flex items-center justify-between hover:bg-slate-900/50">
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-white font-mono flex items-center gap-2">
                        {item.referenceId.slice(0,10)}...
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          item.status === 'SUBMITTED' ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'}`}>{item.status}</span>
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(item.createdAt).toLocaleDateString('ko-KR')} · {item.chain}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(item.referenceId); setCopiedRef(item.referenceId); setTimeout(() => setCopiedRef(null), 1500); }}
                        className="p-1.5 text-slate-600 hover:text-slate-400">
                        {copiedRef === item.referenceId ? <Check size={11} className="text-emerald-400"/> : <Copy size={11}/>}
                      </button>
                      <ChevronDown size={12} className={`text-slate-600 transition-transform ${expandedTR === item.referenceId ? 'rotate-180' : ''}`}/>
                    </div>
                  </button>

                  {expandedTR === item.referenceId && (
                    <div className="border-t border-slate-800 p-3">
                      {item.payload ? (
                        <div className="space-y-2">
                          <div className="text-[11px] space-y-1">
                            {[
                              ['송신인', item.payload.originatorName || '—'],
                              ['수취인', item.payload.isSelfTransfer ? '본인' : (item.payload.beneficiaryName || '—')],
                              ['금액', `${item.payload.amountToken} ${item.payload.assetSymbol}` + (item.payload.amountKrw ? ` (≈₩${Math.floor(item.payload.amountKrw).toLocaleString()})` : '')],
                              ['목적', PURPOSE_LABELS[item.payload.transferPurpose]],
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-slate-500">{k}</span>
                                <span className="text-white font-bold">{v}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            <button onClick={() => { handleDownloadCSV([item]); }}
                              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-1">
                              <TableProperties size={9}/> CSV
                            </button>
                            <button onClick={() => handlePrint(item, 'tax')}
                              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 flex items-center justify-center gap-1">
                              <Printer size={9}/> 과세
                            </button>
                            <button onClick={() => handlePrint(item, 'exchange')}
                              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center gap-1">
                              <FileText size={9}/> 소명
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-500">내용 확인은 서명 인증 필요</p>
                          <button onClick={() => { setLookupRefId(item.referenceId); setMainTab('travel_rule'); setLookupStep('idle'); }}
                            className="w-full py-2 rounded-lg text-[11px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20">
                            이 건 조회하기 →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {trHistory.length === 0 && !trLoading && (
          <div className="py-8 text-center border border-dashed border-slate-800 rounded-xl">
            <ShieldCheck size={24} className="text-slate-700 mx-auto mb-2"/>
            <p className="text-xs text-slate-500">기간을 선택하고 조회하세요</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── 탭 C: 세금·소명 ─────────────────────────────────────
  const TaxTab = () => (
    <div className="space-y-4">

      {/* 과세 연도 선택 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-white flex items-center gap-2">
            <BarChart3 size={13} className="text-emerald-400"/> 가상자산 양도소득 (모의)
          </p>
          <select value={taxYear} onChange={e => setTaxYear(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>

        <div className="bg-slate-950 rounded-xl overflow-hidden">
          {[
            ['Total TR 전송액', `₩${Math.floor(taxSummary.totalKrw / 10000).toLocaleString()}만`, 'text-white'],
            ['기본 공제', `-₩${(taxSummary.deduction / 10000).toFixed(0)}만`, 'text-slate-400'],
            ['과세 표준 (예상)', `₩${Math.floor(taxSummary.taxBase / 10000).toLocaleString()}만`, 'text-amber-400'],
            ['예상 세액 (22%)', `₩${Math.floor(taxSummary.taxAmount / 10000).toLocaleString()}만`, 'text-red-400 font-black'],
          ].map(([k, v, cls]) => (
            <div key={k} className="flex justify-between items-center px-4 py-3 border-b border-slate-900/50 last:border-0">
              <span className="text-[11px] text-slate-500">{k}</span>
              <span className={`text-sm ${cls}`}>{v}</span>
            </div>
          ))}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={12} className="text-amber-400 mt-0.5 shrink-0"/>
          <p className="text-[10px] text-amber-300/80 leading-relaxed">
            TR 전송액 기준 모의 계산입니다. 취득가액, 수수료 등 실제 세금 계산은
            세무사 확인을 권장합니다. 한국 기준 22% (지방세 포함).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => handleDownloadCSV(trHistory)}
            className="py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400 flex items-center justify-center gap-2">
            <TableProperties size={13}/> 과세 CSV
          </button>
          <button onClick={() => {
            if (trHistory.length === 0 || !trHistory[0].payload) { alert('먼저 Travel Rule 탭에서 내역을 조회해주세요'); return; }
            handlePrint(trHistory[0], 'tax');
          }}
            className="py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs font-bold text-blue-400 flex items-center justify-center gap-2">
            <Printer size={13}/> 과세 PDF
          </button>
        </div>
      </div>

      {/* 거래소 소명 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-white flex items-center gap-2">
          <FileText size={13} className="text-amber-400"/> 거래소 출금 소명
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          거래소 출금 정지 해제, 자금 출처 소명에 활용할 수 있는 확인서를 발급합니다.
          Reference ID로 조회 후 PDF를 생성하세요.
        </p>
        <button onClick={() => setMainTab('travel_rule')}
          className="w-full py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs font-bold text-amber-400 flex items-center justify-center gap-2">
          <ShieldCheck size={13}/> Travel Rule 탭에서 소명서 발급 →
        </button>

        <div className="bg-slate-950 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-bold text-slate-400">소명서 활용 가이드</p>
          {[
            '① Travel Rule 탭 → 해당 거래 조회 (지갑 서명)',
            '② "소명 PDF" 버튼 클릭 → 확인서 생성',
            '③ 거래소 고객센터에 PDF 제출',
            '④ Reference ID 제시 → 거래소가 온체인 검증 가능',
          ].map(s => (
            <p key={s} className="text-[10px] text-slate-600">{s}</p>
          ))}
        </div>
      </div>
    </div>
  );

  // ── 메인 렌더 ────────────────────────────────────────────
  const tabContent = {
    activity:     <ActivityTab />,
    travel_rule:  <TravelRuleTab />,
    tax:          <TaxTab />,
  }[mainTab];

  return (
    <div className={`animate-fade-in min-h-screen bg-slate-950 ${
      isPC ? 'flex gap-6 p-6' : 'p-4 pb-24'
    }`}>

      {/* PC: 좌측 사이드바 */}
      {isPC && (
        <div className="w-72 shrink-0">
          {profileLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex items-center justify-center h-48">
              <Loader2 size={20} className="animate-spin text-slate-600"/>
            </div>
          ) : <ProfileCard />}
        </div>
      )}

      {/* 컨텐츠 영역 */}
      <div className={isPC ? 'flex-1 min-w-0' : ''}>

        {/* Mobile: 프로필 카드 */}
        {!isPC && (
          profileLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 flex items-center justify-center h-24">
              <Loader2 size={16} className="animate-spin text-slate-600"/>
            </div>
          ) : <ProfileCard />
        )}

        {/* Mobile: 탭 바 */}
        {!isPC && (
          <div className="flex gap-1 bg-slate-900 p-1 rounded-2xl border border-slate-800 mb-4">
            {([
              { id: 'activity', label: '내역', icon: Activity },
              { id: 'travel_rule', label: 'TR', icon: ShieldCheck },
              { id: 'tax', label: '세금', icon: Scale },
            ] as { id: MainTab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setMainTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  mainTab === id ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'
                }`}>
                <Icon size={13}/>{label}
              </button>
            ))}
          </div>
        )}

        {/* PC: 탭 헤더 */}
        {isPC && (
          <div className="mb-5">
            <h2 className="text-xl font-black text-white">
              {{ activity: '활동 내역', travel_rule: 'Travel Rule', tax: '세금 · 소명' }[mainTab]}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {{ activity: '온체인 트랜잭션 기록', travel_rule: '100만원↑ 송금 레코드 관리', tax: '과세 신고 및 거래소 소명 자료' }[mainTab]}
            </p>
          </div>
        )}

        {/* 탭 컨텐츠 */}
        {tabContent}

        {showKYCReg && (
          <KYCRegistrationModal
            onClose={() => setShowKYCReg(false)}
            onSuccess={() => window.location.reload()}
          />
        )}
      </div>
    </div>
  );
}