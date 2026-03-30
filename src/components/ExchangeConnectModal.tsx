// ============================================================
// ExchangeConnectModal.tsx — 거래소 개인지갑 등록 모달
//
// 흐름:
//   intro  → SSSSigningModal(인증) → active(10분 카운트다운)
//
// active 상태:
//   - window.ethereum에 xLOT provider 주입 (EIP-1193 + EIP-6963)
//   - 거래소 단축버튼 표시
//   - 10분 후 자동 해제 + cleanup
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Globe, Link2, CheckCircle2, Timer, ShieldAlert, Loader2, Unlink } from 'lucide-react';
import { ethers } from 'ethers';
import { SSSSigningModal } from './SSSSigningModal';
import { SignRequestPopup } from './SignRequestPopup';
import { injectXLOTProvider } from '../services/xlotEthereumProvider';
import type { SignRequest } from '../services/xlotEthereumProvider';

interface Props {
  walletAddress: string;   // EVM address (checksum)
  walletLabel:   string;
  onClose:       () => void;
}

type Step = 'intro' | 'signing' | 'active';

const EXCHANGES = [
  { name: '업비트',    url: 'https://upbit.com' },
  { name: '빗썸',      url: 'https://www.bithumb.com/react/inout/deposit/KRW' },
  { name: '코인원',    url: 'https://coinone.co.kr' },
  { name: '코빗',      url: 'https://korbit.co.kr' },
];

const SESSION_MINUTES = 10;

export function ExchangeConnectModal({ walletAddress, walletLabel, onClose }: Props) {
  const [step, setStep]           = useState<Step>('intro');
  const [wallet, setWallet]       = useState<ethers.Wallet | null>(null);
  const [remaining, setRemaining] = useState(SESSION_MINUTES * 60);
  const [signRequest, setSignRequest] = useState<SignRequest | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<string>(EXCHANGES[0].url);

  const cleanupRef     = useRef<(() => void) | null>(null);
  const pendingSignRef = useRef<{ resolve: (s: string) => void; reject: (e: Error) => void } | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 언마운트 시 provider 정리 ──────────────────────────────
  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      cleanupRef.current?.();
      pendingSignRef.current?.reject(new Error('Modal closed'));
      pendingSignRef.current = null;
    };
  }, []);

  // ── 카운트다운 (active 단계에서만) ─────────────────────────
  useEffect(() => {
    if (step !== 'active') return;
    timerRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          handleDisconnect();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { timerRef.current && clearInterval(timerRef.current); };
  }, [step]);

  // ── 서명 요청 콜백 (Promise → React state 브릿지) ─────────
  const onSignRequest = useCallback((request: SignRequest): Promise<string> => {
    return new Promise((resolve, reject) => {
      pendingSignRef.current = { resolve, reject };
      setSignRequest(request);
    });
  }, []);

  // ── SSS 인증 완료 → provider 주입 ─────────────────────────
  const handleSigned = (result: { wallet: ethers.Wallet; cleanup: () => void }) => {
    const { wallet: w, cleanup: sssCleanup } = result;
    setWallet(w);

    const cleanup = injectXLOTProvider({
      address:     w.address,
      chainId:     1,
      walletLabel,
      onSignRequest,
    });

    cleanupRef.current = () => {
      cleanup();
      sssCleanup();
    };

    setRemaining(SESSION_MINUTES * 60);
    setStep('active');
  };

  // ── 연결 해제 ──────────────────────────────────────────────
  const handleDisconnect = () => {
    timerRef.current && clearInterval(timerRef.current);
    cleanupRef.current?.();
    cleanupRef.current = null;
    setWallet(null);
    onClose();
  };

  // ── 서명 팝업 응답 ─────────────────────────────────────────
  const handleSignApprove = (signature: string) => {
    pendingSignRef.current?.resolve(signature);
    pendingSignRef.current = null;
    setSignRequest(null);
  };

  const handleSignReject = () => {
    pendingSignRef.current?.reject(new Error('User rejected the request.'));
    pendingSignRef.current = null;
    setSignRequest(null);
  };

  // ── 타이머 포맷 ────────────────────────────────────────────
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <>
      {/* ── 메인 모달 ───────────────────────────────────────── */}
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/85 backdrop-blur-sm">
        <div className="w-full max-w-md bg-slate-950 border-t border-slate-800 rounded-t-3xl shadow-2xl animate-slide-up">

          {/* 헤더 */}
          <div className="flex items-start justify-between p-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                <Link2 size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white">거래소 개인지갑 등록</p>
                <p className="text-[10px] text-slate-500">window.ethereum 주입 · EIP-1193/6963</p>
              </div>
            </div>
            <button
              onClick={step === 'active' ? handleDisconnect : onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">

            {/* ── INTRO ─────────────────────────────────────── */}
            {step === 'intro' && (
              <>
                {/* 지갑 정보 */}
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center overflow-hidden">
                      <img src="/icon-192.png" alt="xLOT" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-white">{walletLabel}</p>
                      <p className="text-[10px] text-slate-500">XLOT SSS 지갑</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">EVM 주소</p>
                    <p className="text-xs font-mono text-cyan-400 break-all">{walletAddress}</p>
                  </div>
                </div>

                {/* 거래소 선택 및 절차 안내 */}
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2">1. 연동할 거래소를 선택하세요</p>
                    <div className="relative">
                      <select 
                        value={selectedExchange} 
                        onChange={e => setSelectedExchange(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 text-sm text-white font-bold appearance-none outline-none focus:border-blue-500"
                      >
                        {EXCHANGES.map(ex => (
                          <option key={ex.name} value={ex.url}>{ex.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Globe size={16} className="text-slate-500" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2">2. 연동 안내</p>
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 space-y-3 flex flex-col justify-center">
                      <p className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-blue-400 font-bold shrink-0">①</span> SSS 인증 후, 선택한 거래소가 열립니다.
                      </p>
                      <p className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-blue-400 font-bold shrink-0">②</span> 거래소 PC 웹 화면에서 지갑 등록 시 <b>"메타마스크(MetaMask)"</b> 연결을 선택하세요.
                      </p>
                      <p className="text-[11px] text-amber-400/80 mt-2 flex items-start gap-2 p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                        <ShieldAlert size={12} className="shrink-0 mt-0.5" /> 자산 전송은 불가능하며, 오직 거래소 본인인증(개인지갑 등록)을 위한 서명만 가능합니다.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStep('signing')}
                  className="w-full py-4 rounded-2xl font-black text-sm text-white
                    bg-gradient-to-r from-blue-600 to-cyan-600
                    hover:shadow-[0_0_20px_rgba(59,130,246,0.35)] transition-all
                    flex items-center justify-center gap-2"
                >
                  <Link2 size={16} /> SSS 인증 후 연결
                </button>
              </>
            )}

            {/* ── SIGNING (SSSSigningModal 대기 중) ─────────── */}
            {step === 'signing' && (
              <div className="flex flex-col items-center gap-4 py-10">
                <Loader2 size={32} className="animate-spin text-blue-400" />
                <p className="text-sm font-black text-white">SSS 인증 대기 중...</p>
                <p className="text-[10px] text-slate-500">아래 인증 창을 완료해 주세요.</p>
              </div>
            )}

            {/* ── ACTIVE ────────────────────────────────────── */}
            {step === 'active' && (
              <>
                {/* 연결 상태 배지 */}
                <div className="p-4 bg-emerald-500/8 border border-emerald-500/25 rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-black text-emerald-400">window.ethereum 연결됨</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                      <Timer size={12} className="text-amber-400" />
                      <span className={remaining < 60 ? 'text-red-400' : 'text-amber-400'}>
                        {mm}:{ss}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 break-all">{walletAddress}</p>
                </div>

                {/* 거래소 바로가기 */}
                <div>
                  <button
                    onClick={() => window.open(selectedExchange, '_blank')}
                    className="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold text-white transition-all flex items-center justify-center gap-2 mb-3 shadow-lg"
                  >
                    <Globe size={18} className="text-blue-400" />
                    선택한 거래소 접속하기
                  </button>

                  <div className="flex items-start gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800">
                    <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      열린 탭에서 "메타마스크(MetaMask)" 연결을 클릭하세요. 메타마스크 대신 xLOT 팝업이 뜨고 서명을 진행할 수 있습니다.
                    </p>
                  </div>
                </div>

                {/* 연결 해제 버튼 */}
                <button
                  onClick={handleDisconnect}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-slate-300
                    bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all
                    flex items-center justify-center gap-2"
                >
                  <Unlink size={15} /> 연결 해제
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── SSS 인증 모달 (signing 단계) ─────────────────────── */}
      {step === 'signing' && (
        <div className="relative z-[250]">
          <SSSSigningModal
            walletAddress={walletAddress}
            purpose="거래소 개인지갑 등록 (window.ethereum 연결)"
            onSigned={(result) => handleSigned(result)}
            onCancel={() => { setStep('intro'); }}
          />
        </div>
      )}

      {/* ── 서명 요청 팝업 (active 단계에서만) ──────────────── */}
      {signRequest && wallet && (
        <div className="relative z-[350]">
          <SignRequestPopup
            request={signRequest}
            wallet={wallet}
            onSign={handleSignApprove}
            onReject={handleSignReject}
          />
        </div>
      )}
    </>
  );
}
