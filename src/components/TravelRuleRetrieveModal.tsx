// ============================================================
// TravelRuleRetrieveModal.tsx
// Travel Rule 조회 + 기간별 내역 + CSV/PDF 내보내기
// ============================================================

import { useState, useRef } from 'react';
import {
  X, ShieldCheck, Loader2, Check, AlertCircle,
  Search, FileText, User, Building2, Download,
  Calendar, ChevronDown, ChevronRight, Printer,
  TableProperties,
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { ethers } from 'ethers';
import {
  requestTRChallenge, submitTRSignature,
  PURPOSE_LABELS,
  generateTRCsv, generateTRPdfHtml,
} from '../services/travelRuleService';
import type {
  TravelRulePayload
} from '../services/travelRuleService';

interface Props {
  onClose:       () => void;
  prefillRefId?: string;
}

type Tab  = 'lookup' | 'history';
type Step = 'input' | 'challenge' | 'signing' | 'result' | 'error';

// 히스토리 아이템 (복호화 전 메타데이터)
interface HistoryItem {
  referenceId: string;
  chain:       string;
  txHash?:     string;
  status:      string;
  createdAt:   string;
  payload?:    TravelRulePayload; // 서명 인증 후 채워짐
}

export function TravelRuleRetrieveModal({ onClose, prefillRefId }: Props) {
  const smartAccount = useActiveAccount();

  // 탭
  const [tab, setTab] = useState<Tab>('lookup');

  // 조회 상태
  const [step, setStep]           = useState<Step>('input');
  const [refId, setRefId]         = useState(prefillRefId || '');
  const [challenge, setChallenge] = useState('');
  const [result, setResult]       = useState<{
    payload: TravelRulePayload; txHash?: string;
    chain?: string; createdAt: string; role: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');
  const [copied, setCopied]       = useState(false);

  // 기간별 조회
  const [fromDate, setFromDate]   = useState('');
  const [toDate, setToDate]       = useState('');
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState('');
  const [expanded, setExpanded]   = useState<string | null>(null);

  // PDF iframe ref
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  // ── Step 1: 챌린지 요청 ────────────────────────────────────
  const handleRequestChallenge = async () => {
    if (!refId.trim()) { setError('Reference ID를 입력해주세요'); return; }
    setIsLoading(true); setError('');
    try {
      const ch = await requestTRChallenge(refId.trim());
      setChallenge(ch);
      setStep('challenge');
    } catch (e: any) { setError(e.message || '조회 실패'); }
    finally { setIsLoading(false); }
  };

  // ── Step 2: 서명 + 검증 ────────────────────────────────────
  const handleSign = async () => {
    if (!smartAccount) { setError('지갑 연결이 필요합니다'); return; }
    setIsLoading(true); setError(''); setStep('signing');
    try {
      const win = window as any;
      let signature = '';
      if (win.ethereum) {
        const provider = new ethers.BrowserProvider(win.ethereum);
        const signer   = await provider.getSigner();
        signature = await signer.signMessage(challenge);
      } else {
        throw new Error('서명 가능한 지갑을 찾을 수 없습니다');
      }
      const data = await submitTRSignature(
        refId.trim(), challenge, signature, smartAccount.address,
      );
      setResult({
        payload:   data.payload,
        txHash:    data.txHash,
        chain:     data.chain,
        createdAt: data.createdAt,
        role:      (data as any).role || 'unknown',
      });
      setStep('result');
    } catch (e: any) {
      setError(e.message || '서명 검증 실패');
      setStep('error');
    } finally { setIsLoading(false); }
  };

  // ── CSV 다운로드 ───────────────────────────────────────────
  const handleDownloadCsv = () => {
    if (!result) return;
    const csv  = generateTRCsv([result.payload], [{
      txHash: result.txHash, createdAt: result.createdAt, referenceId: refId,
    }]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `TR_${refId.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── PDF 출력 ───────────────────────────────────────────────
  const handlePrint = (purpose: 'tax' | 'exchange') => {
    if (!result) return;
    const html = generateTRPdfHtml(
      result.payload, refId, result.txHash, result.createdAt, purpose,
    );
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { alert('팝업 차단을 해제해주세요'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  // ── 기간별 내역 조회 ─────────────────────────────────────
  const handleLoadHistory = async () => {
    if (!smartAccount) { setHistError('지갑 연결 필요'); return; }
    setHistLoading(true); setHistError(''); setHistory([]);
    try {
      // key_a_check / key_b_check로 직접 조회
      // 주소 해시 계산
      const { deriveKeyHash } = await import('../services/travelRuleService');
      const { supabase }      = await import('../lib/supabase');
      const addr = smartAccount.address.toLowerCase();

      // 날짜 기본값
      const from = fromDate || '2020-01-01T00:00:00Z';
      const to   = toDate
        ? new Date(toDate + 'T23:59:59Z').toISOString()
        : new Date().toISOString();

      // 주소가 포함된 레코드 조회
      // key_a_check, key_b_check는 특정 ref_id와 결합된 해시라
      // 주소만으로 OR 조회가 어려움 → access_logs로 조회
      const { data, error } = await supabase
        .from('travel_rule_access_logs')
        .select('reference_id, accessor_role, accessed_at')
        .eq('accessor_address', addr)
        .order('accessed_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // access_logs의 reference_id로 records 조회
      const refIds = [...new Set((data || []).map((r: any) => r.reference_id))];
      if (refIds.length === 0) { setHistory([]); return; }

      const { data: records, error: recErr } = await supabase
        .from('travel_rule_records')
        .select('reference_id, chain, tx_hash, status, created_at')
        .in('reference_id', refIds)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      if (recErr) throw recErr;
      setHistory((records || []).map((r: any) => ({
        referenceId: r.reference_id,
        chain:       r.chain,
        txHash:      r.tx_hash,
        status:      r.status,
        createdAt:   r.created_at,
      })));
      void deriveKeyHash; // suppress unused warning
    } catch (e: any) { setHistError(e.message); }
    finally { setHistLoading(false); }
  };

  // ── 내역 CSV 전체 다운로드 ────────────────────────────────
  const handleDownloadHistoryCsv = () => {
    const decoded = history.filter(h => h.payload);
    if (decoded.length === 0) { alert('먼저 각 항목을 조회해주세요'); return; }
    const csv  = generateTRCsv(
      decoded.map(h => h.payload!),
      decoded.map(h => ({ txHash: h.txHash, createdAt: h.createdAt, referenceId: h.referenceId })),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `TR_history_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const p = result?.payload;

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t md:border border-slate-800 rounded-t-3xl md:rounded-3xl flex flex-col max-h-[92vh]">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Search size={18} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Travel Rule 조회</p>
              <p className="text-xs text-slate-500 mt-0.5">지갑 서명 인증 · CSV/PDF 내보내기</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mx-6 mb-4 bg-slate-900 p-1 rounded-xl shrink-0">
          <button onClick={() => setTab('lookup')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'lookup' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'}`}>
            <Search size={12} /> 단건 조회
          </button>
          <button onClick={() => setTab('history')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'history' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'}`}>
            <Calendar size={12} /> 기간별 내역
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-8 space-y-5">

          {/* ══ TAB 1: 단건 조회 ══ */}
          {tab === 'lookup' && (
            <>
              {/* STEP: input */}
              {step === 'input' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 font-bold mb-1 block">Reference ID</label>
                    <input type="text" value={refId} onChange={e => setRefId(e.target.value)}
                      placeholder="트랜잭션 calldata의 32자리 hex ID"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 font-mono" />
                    <p className="text-[10px] text-slate-500 mt-1">
                      EVM: calldata에서 0x54520000 뒤 32자리 · SOL: Memo의 TR: 뒤 값
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-500 space-y-1">
                    <p className="font-bold text-slate-400 mb-1">조회 가능 대상</p>
                    <p>• 해당 트랜잭션의 <span className="text-cyan-400">송신자</span> (지갑 서명 필요)</p>
                    <p>• 해당 트랜잭션의 <span className="text-cyan-400">수신자</span> (지갑 서명 필요)</p>
                  </div>
                  {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
                  <button onClick={handleRequestChallenge} disabled={isLoading || !refId.trim()}
                    className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40">
                    {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>조회 중...</span> : '조회 시작'}
                  </button>
                </div>
              )}

              {/* STEP: challenge */}
              {step === 'challenge' && (
                <div className="space-y-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-400">서명할 메시지</p>
                    <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{challenge}</pre>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0"/>
                    <p className="text-[10px] text-amber-300/80">개인키 전송 없음 · 자산 이동 없음 · 신원 확인 목적만</p>
                  </div>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <button onClick={handleSign} disabled={isLoading}
                    className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40">
                    {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>서명 중...</span> : '지갑으로 서명하기'}
                  </button>
                </div>
              )}

              {/* STEP: signing */}
              {step === 'signing' && (
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 size={36} className="animate-spin text-cyan-400"/>
                  <p className="text-sm font-black text-white">서명 검증 중...</p>
                  <p className="text-xs text-slate-500">ecrecover → 권한 확인 → 복호화</p>
                </div>
              )}

              {/* STEP: result */}
              {step === 'result' && p && (
                <div className="space-y-4">
                  {/* 역할 배지 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-emerald-400"/>
                      <span className="text-sm font-black text-white">검증 완료</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      result?.role === 'originator'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
                      {result?.role === 'originator' ? '송신자' : '수신자'}
                    </span>
                  </div>

                  {/* 거래 요약 */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                    {[
                      ['전송 금액', `${p.amountToken} ${p.assetSymbol}${p.amountKrw ? ` (≈₩${Math.floor(p.amountKrw).toLocaleString()})` : ''}`],
                      ['네트워크', p.assetNetwork],
                      ['날짜', result?.createdAt ? new Date(result.createdAt).toLocaleDateString('ko-KR') : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-start">
                        <span className="text-xs text-slate-500">{k}</span>
                        <span className="text-xs text-white font-bold text-right max-w-[60%]">{v}</span>
                      </div>
                    ))}
                    {result?.txHash && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Tx Hash</span>
                        <button onClick={() => handleCopy(result.txHash!)}
                          className="text-xs text-cyan-400 font-mono flex items-center gap-1">
                          {result.txHash.slice(0,10)}...
                          {copied ? <Check size={10}/> : null}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 송신인 */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                      <User size={10}/> 송신인 (Originator)
                    </p>
                    <p className="text-sm font-bold text-white">{p.originatorName || '—'}</p>
                    <p className="text-[10px] font-mono text-slate-400 break-all">{p.originatorAddress}</p>
                    <p className="text-[10px] text-slate-500">VASP: xLOT</p>
                  </div>

                  {/* 수취인 */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                      <User size={10}/> 수취인 (Beneficiary)
                      {p.isSelfTransfer && <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded ml-1">본인</span>}
                    </p>
                    <p className="text-sm font-bold text-white">{p.beneficiaryName || '—'}</p>
                    <p className="text-[10px] font-mono text-slate-400 break-all">{p.beneficiaryAddress}</p>
                    {p.beneficiaryVasp && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Building2 size={9}/> {p.beneficiaryVasp}
                      </p>
                    )}
                  </div>

                  {/* 목적 */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                      <FileText size={10}/> 전송 목적
                    </p>
                    <p className="text-sm font-bold text-white">{PURPOSE_LABELS[p.transferPurpose]}</p>
                    {p.purposeDetail && <p className="text-xs text-slate-400">{p.purposeDetail}</p>}
                  </div>

                  {/* ── 내보내기 버튼 ── */}
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] text-slate-500 font-bold">내보내기</p>
                    <div className="grid grid-cols-1 gap-2">
                      <button onClick={handleDownloadCsv}
                        className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                          <TableProperties size={14} className="text-emerald-400"/>
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-white">과세 신고용 CSV</p>
                          <p className="text-[10px] text-slate-500">국세청 가상자산 거래 명세 형식</p>
                        </div>
                        <Download size={14} className="text-slate-500 ml-auto"/>
                      </button>

                      <button onClick={() => handlePrint('tax')}
                        className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                          <Printer size={14} className="text-blue-400"/>
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-white">과세 신고용 PDF</p>
                          <p className="text-[10px] text-slate-500">출력 또는 PDF 저장</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-500 ml-auto"/>
                      </button>

                      <button onClick={() => handlePrint('exchange')}
                        className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <ShieldCheck size={14} className="text-amber-400"/>
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-white">거래소 소명용 PDF</p>
                          <p className="text-[10px] text-slate-500">출금 소명 확인서 (거래소 제출용)</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-500 ml-auto"/>
                      </button>
                    </div>
                  </div>

                  <button onClick={() => { setStep('input'); setResult(null); setRefId(''); }}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-slate-400 bg-slate-900 border border-slate-800">
                    다른 건 조회
                  </button>
                </div>
              )}

              {/* STEP: error */}
              {step === 'error' && (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <AlertCircle size={32} className="text-red-400"/>
                  <p className="text-sm font-black text-white">조회 실패</p>
                  <p className="text-xs text-slate-400">{error}</p>
                  <button onClick={() => { setStep('input'); setError(''); }}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-white bg-slate-800 border border-slate-700">
                    다시 시도
                  </button>
                </div>
              )}
            </>
          )}

          {/* ══ TAB 2: 기간별 내역 ══ */}
          {tab === 'history' && (
            <div className="space-y-4">
              {/* 기간 선택 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold mb-1 block">시작일</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50"/>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold mb-1 block">종료일</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50"/>
                </div>
              </div>

              <button onClick={handleLoadHistory} disabled={histLoading}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40 flex items-center justify-center gap-2">
                {histLoading ? <><Loader2 size={14} className="animate-spin"/>조회 중...</> : <><Calendar size={14}/>내역 조회</>}
              </button>

              {histError && <p className="text-xs text-red-400">{histError}</p>}

              {/* 내역 목록 */}
              {history.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-bold">{history.length}건 조회됨</p>
                    <button onClick={handleDownloadHistoryCsv}
                      className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold hover:text-emerald-300">
                      <Download size={12}/> 전체 CSV
                    </button>
                  </div>

                  <div className="space-y-2">
                    {history.map(item => (
                      <div key={item.referenceId}
                        className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpanded(expanded === item.referenceId ? null : item.referenceId)}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-800/50 transition-all">
                          <div className="text-left">
                            <p className="text-xs font-bold text-white font-mono">
                              {item.referenceId.slice(0,8)}...
                              <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                item.status === 'SUBMITTED' ? 'bg-emerald-500/20 text-emerald-400'
                                : item.status === 'BLOCKED'  ? 'bg-red-500/20 text-red-400'
                                : 'bg-slate-800 text-slate-400'}`}>
                                {item.status}
                              </span>
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {new Date(item.createdAt).toLocaleDateString('ko-KR')} · {item.chain}
                            </p>
                          </div>
                          <ChevronDown size={14} className={`text-slate-500 transition-transform ${expanded === item.referenceId ? 'rotate-180' : ''}`}/>
                        </button>

                        {expanded === item.referenceId && (
                          <div className="border-t border-slate-800 p-3 space-y-2">
                            {item.payload ? (
                              // 복호화된 데이터 표시
                              <div className="space-y-1.5 text-[11px]">
                                {[
                                  ['송신인', item.payload.originatorName || '—'],
                                  ['수취인', item.payload.isSelfTransfer ? '본인' : (item.payload.beneficiaryName || '—')],
                                  ['자산', `${item.payload.amountToken} ${item.payload.assetSymbol}`],
                                  ['금액', item.payload.amountKrw ? `₩${Math.floor(item.payload.amountKrw).toLocaleString()}` : '—'],
                                  ['목적', PURPOSE_LABELS[item.payload.transferPurpose]],
                                ].map(([k, v]) => (
                                  <div key={k} className="flex justify-between">
                                    <span className="text-slate-500">{k}</span>
                                    <span className="text-white font-bold">{v}</span>
                                  </div>
                                ))}
                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={() => {
                                      const csv = generateTRCsv([item.payload!], [{ txHash: item.txHash, createdAt: item.createdAt, referenceId: item.referenceId }]);
                                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url; a.download = `TR_${item.referenceId.slice(0,8)}.csv`; a.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-1">
                                    <Download size={10}/> CSV
                                  </button>
                                  <button
                                    onClick={() => {
                                      const html = generateTRPdfHtml(item.payload!, item.referenceId, item.txHash, item.createdAt, 'tax');
                                      const w = window.open('', '_blank', 'width=800,height=900');
                                      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
                                    }}
                                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 flex items-center justify-center gap-1">
                                    <Printer size={10}/> 과세PDF
                                  </button>
                                  <button
                                    onClick={() => {
                                      const html = generateTRPdfHtml(item.payload!, item.referenceId, item.txHash, item.createdAt, 'exchange');
                                      const w = window.open('', '_blank', 'width=800,height=900');
                                      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
                                    }}
                                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center gap-1">
                                    <ShieldCheck size={10}/> 소명PDF
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // 미복호화 — 서명 인증 유도
                              <div className="space-y-2">
                                <p className="text-[10px] text-slate-500">내용을 보려면 서명 인증이 필요합니다</p>
                                <button
                                  onClick={() => {
                                    setTab('lookup');
                                    setRefId(item.referenceId);
                                    setStep('input');
                                  }}
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

              {history.length === 0 && !histLoading && (
                <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
                  <Calendar size={24} className="text-slate-600 mx-auto mb-2"/>
                  <p className="text-sm text-slate-500">조회된 내역이 없습니다</p>
                  <p className="text-[10px] text-slate-600 mt-1">기간을 선택하고 내역 조회를 눌러주세요</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 숨김 iframe (print용) */}
        <iframe ref={printFrameRef} className="hidden" title="print-frame"/>
      </div>
    </div>
  );
}