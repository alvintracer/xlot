// ============================================================
// LoginPage.tsx — xLOT 온보딩 선택 화면
//
// 1) 스마트 월렛 (Thirdweb AA) — 이메일/구글로 편하게
// 2) 시드 구문 지갑 (SSS 비수탁) — 직접 키 관리
// ============================================================

import { useState, useEffect } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { ConnectButton } from 'thirdweb/react';
import { client } from '../client';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { ShieldCheck, Zap, ChevronRight, ArrowLeft, KeyRound, Power, Lock } from 'lucide-react';
import { XLOTWalletCreateModal } from '../components/XLOTWalletCreateModal';
import { useSSSOnboarding } from '../App';
import { XLOTWalletRecoverModal } from '../components/XLOTWalletRecoverModal';
import { ExtensionInlineLogin } from '../extension/ExtensionInlineLogin';

const _cr = (globalThis as any).chrome?.runtime;
export const IS_EXT_POPUP = typeof _cr !== 'undefined' && !!_cr?.id
  && !new URLSearchParams(window.location.search).get('mode');

const wallets = IS_EXT_POPUP ? [
  inAppWallet({
    auth: { options: ['email'] },
    metadata: { name: 'took Wallet', image: undefined },
  })
] : [
  inAppWallet({
    auth: { options: ['google', 'apple', 'email'] },
    metadata: { name: 'took Wallet', image: undefined },
  }),
  createWallet('io.metamask'),
];

type OnboardMode = 'main' | 'create_select' | 'smart' | 'seed';

// 익스텐션 툴바 팝업 컨텍스트 여부는 위에서 선언됨

export function LoginPage({ onUnlock }: { onUnlock: () => void }) {
  const { setSSSOnboarding } = useSSSOnboarding();
  const account = useActiveAccount();
  const [mode, setMode]             = useState<OnboardMode>('main');
  const [showCreate, setShowCreate] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [agreed, setAgreed] = useState(false); // 약관 동의 상태 추가

  // 이미 로그인된 상태 (세션 복원)
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Bug 1 fix: SSS 모달이 열려있으면 account가 생겨도 LockedScreen으로 이탈하지 않음
  const isReturningUser = !!account && !showCreate && !showRecover;

  // 이미 로그인된 경우 → 잠금 화면
  if (isReturningUser) {
    return (
      <LockedScreen
        account={account}
        isUnlocking={isUnlocking}
        onUnlock={() => {
          setIsUnlocking(true);
          // Bug 2 fix: App.tsx의 isLocked=false → Dashboard로 전환
          onUnlock();
          setTimeout(() => setIsUnlocking(false), 800);
        }}
      />
    );
  }

  // ── 익스텐션 툴바 팝업도 기존과 동일한 로그인 화면 사용 ──

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">

      {/* 배경 글로우 */}
      <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[130px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-indigo-500/15 rounded-full blur-[130px] pointer-events-none animate-pulse" />

      <div className="w-full max-w-md relative">

        {/* ── 헤더 (공통) ── */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden flex items-center justify-center p-1">
              <img src="/icon-192.png" alt="took Logo" className="w-full h-full object-contain rounded-xl" />
            </div>
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 mb-3 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            took
          </h1>
          <p className="text-slate-400 text-base font-medium tracking-wide">
            Next Gen Crypto Experience
          </p>
          <div className="h-0.5 w-16 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full mx-auto mt-4" />
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* MAIN: 전원 버튼 + 지갑 생성 분기               */}
        {/* ══════════════════════════════════════════════════ */}
        {mode === 'main' && (
          <div className="flex flex-col items-center animate-fade-in-up">

            {/* 전원 버튼 — Thirdweb ConnectButton */}
            <div className={`relative flex items-center justify-center mb-8 transition-opacity duration-300 ${!agreed ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              {/* 외부 글로우 링 */}
              <div className="absolute w-[200px] h-[200px] rounded-full border border-cyan-500/10 animate-pulse" />
              <div className="absolute w-[160px] h-[160px] rounded-full border border-cyan-500/20" />

              {/* ConnectButton을 전원 버튼처럼 스타일링 */}
              <div className="relative z-10">
                <ConnectButton
                  client={client}
                  wallets={wallets}
                  connectModal={{
                    size: 'compact',
                    title: 'took 시작하기',
                    titleIcon: '',
                    showThirdwebBranding: false,
                    termsOfServiceUrl: 'https://traverse.kr',
                    privacyPolicyUrl: '/privacy.html',
                    welcomeScreen: {
                      title: 'took Wallet',
                      subtitle: '안전하고 간편한 자산 관리의 시작',
                    },
                  }}
                  connectButton={{
                    label: (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Power size={40} strokeWidth={1.5}
                          className="text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                        <span className="text-xs font-bold tracking-widest text-cyan-200/80">
                          LOGIN
                        </span>
                      </div>
                    ) as any,
                    className: [
                      '!w-[120px] !h-[120px] !rounded-full !flex !flex-col !items-center !justify-center',
                      '!bg-gradient-to-br !from-slate-900 !to-slate-950',
                      '!border-2 !border-cyan-500/50',
                      '!shadow-[0_0_30px_rgba(34,211,238,0.25),inset_0_0_20px_rgba(34,211,238,0.05)]',
                      'hover:!shadow-[0_0_50px_rgba(34,211,238,0.5),inset_0_0_30px_rgba(34,211,238,0.1)]',
                      'hover:!border-cyan-400/80',
                      'active:!scale-95',
                      '!transition-all !duration-300',
                    ].join(' '),
                  }}
                />
              </div>
            </div>

            <p className="text-slate-500 text-sm mb-2">이메일 · 구글로 로그인</p>
            <p className="text-slate-700 text-[11px] mb-6">
              이미 계정이 있으시면 로긴 버튼을 누르세요
            </p>

            {/* 약관 동의 체크박스 */}
            <label className="flex items-center justify-center gap-2 mb-8 cursor-pointer select-none">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="peer appearance-none w-5 h-5 border-2 border-slate-600 rounded-md bg-slate-900 checked:bg-cyan-500 checked:border-cyan-500 transition-all cursor-pointer"
                />
                <svg className="absolute w-3 h-3 text-slate-950 pointer-events-none opacity-0 peer-checked:opacity-100 left-1 top-1" viewBox="0 0 14 10" fill="none">
                  <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-xs text-slate-400">
                <a href="/privacy.html" target="_blank" className="text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2 transition-colors" onClick={e => e.stopPropagation()}>개인정보처리방침</a> 및 필수 약관 동의
              </span>
            </label>

            {/* 구분선 */}
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[11px] text-slate-600 font-bold">처음이신가요?</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* 지갑 생성하기 버튼 → create_select로 */}
            <button
              onClick={() => setMode('create_select')}
              disabled={!agreed}
              className={`w-full py-4 rounded-2xl font-bold text-sm bg-slate-900 border transition-all flex items-center justify-center gap-2 group ${!agreed ? 'opacity-50 border-slate-800 text-slate-600 cursor-not-allowed' : 'border-slate-800 hover:border-slate-600 text-slate-300 hover:text-white'}`}
            >
              <KeyRound size={16} className={`transition-colors ${!agreed ? 'text-slate-600' : 'text-slate-500 group-hover:text-cyan-400'}`} />
              지갑 생성하기
              <ChevronRight size={14} className={`transition-colors ${!agreed ? 'text-slate-600' : 'text-slate-600 group-hover:text-cyan-400'}`} />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 1: 지갑 유형 선택 (생성 분기)               */}
        {/* ══════════════════════════════════════════════════ */}
        {mode === 'create_select' && (
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 space-y-3 animate-fade-in-up">
            <button
              onClick={() => setMode('main')}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-2"
            >
              <ArrowLeft size={13} /> 돌아가기
            </button>

            <p className="text-xs text-slate-500 text-center font-bold mb-4 tracking-widest uppercase">
              지갑 유형 선택
            </p>

            {/* 옵션 1: 스마트 월렛 */}
            <button
              onClick={() => setMode('smart')}
              className="w-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 hover:border-cyan-500/60 rounded-2xl p-5 text-left transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 group-hover:border-cyan-500/60 transition-all">
                  <Zap size={20} className="text-cyan-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-black text-white">스마트 이더리움 월렛</p>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    EVM 체인 전용 · 이메일·구글로 30초 만에 시작<br/>
                    가스비 대납 · 배치 트랜잭션 지원
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-cyan-400 transition-colors mt-1" />
              </div>
            </button>

            {/* 옵션 2: 시드 구문 비수탁 지갑 */}
            <button
              onClick={() => setMode('seed')}
              className="w-full bg-slate-800/50 border border-slate-700 hover:border-slate-600 rounded-2xl p-5 text-left transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center shrink-0 group-hover:border-slate-500 transition-all overflow-hidden p-[2px]">
                  <img src="/icon-192.png" className="w-full h-full rounded-lg object-contain" alt="took" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-white mb-1">SAR 시드 구문 지갑</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    완전 비수탁 · SAR(소셜 인증 복구)<br/>
                    BTC · ETH · SOL · TRX 멀티체인
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors mt-1" />
              </div>
            </button>

            <p className="text-[10px] text-slate-600 text-center pt-2">
              계속 진행하면 took 이용약관에 동의하게 됩니다
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 2A: 스마트 월렛 (Thirdweb ConnectButton)    */}
        {/* ══════════════════════════════════════════════════ */}
        {mode === 'smart' && (
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 space-y-4 animate-fade-in-up">
            <button
              onClick={() => setMode('create_select')}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={13} /> 돌아가기
            </button>

            <div className="text-center space-y-1 py-2">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto mb-3 overflow-hidden p-[2px]">
                <img src="/icon-192.png" className="w-full h-full rounded-xl object-contain" alt="took" />
              </div>
              <p className="text-base font-black text-white">스마트 이더리움 월렛으로 시작</p>
              <p className="text-xs text-slate-400">이메일이나 소셜 계정으로 30초 만에 생성</p>
            </div>

            <div className="w-full transform scale-100">
              <ConnectButton
                client={client}
                wallets={wallets}
                connectModal={{
                  size: 'compact',
                  title: 'took 시작하기',
                  titleIcon: '',
                  showThirdwebBranding: false,
                  welcomeScreen: {
                    title: 'took Wallet',
                    subtitle: '안전하고 간편한 자산 관리의 시작',
                  },
                }}
                connectButton={{
                  label: '이메일 · 구글로 시작하기 (Ethereum)',
                  className:
                    '!w-full !py-4 !rounded-2xl !text-base !font-bold !text-white !bg-gradient-to-r !from-cyan-500 !via-blue-500 !to-indigo-500 hover:!shadow-[0_0_30px_rgba(59,130,246,0.5)] !transition-all !border-none',
                }}
              />
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                💡 스마트 이더리움 월렛은 <span className="text-cyan-400 font-bold">EVM 전용</span>이에요. 가스비를 took이 대납하고,
                시드 구문 없이도 사용할 수 있어요. 나중에 SSS 비수탁 지갑도 추가할 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 2B: 시드 구문 비수탁 지갑                   */}
        {/* ══════════════════════════════════════════════════ */}
        {mode === 'seed' && (
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 space-y-4 animate-fade-in-up">
            <button
              onClick={() => setMode('create_select')}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={13} /> 돌아가기
            </button>

            <div className="text-center space-y-1 py-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck size={22} className="text-emerald-400" />
              </div>
              <p className="text-base font-black text-white">비수탁 지갑으로 시작</p>
              <p className="text-xs text-slate-400">내 키, 내 자산 — Triple-Shield 2-of-3 복구</p>
            </div>

            {/* 새 지갑 생성 */}
            <button
              onClick={() => { setShowCreate(true); setSSSOnboarding(true); }}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck size={18} />
              새 지갑 생성하기
            </button>

            {/* 기존 지갑 복구 */}
            <button
              onClick={() => { setShowRecover(true); setSSSOnboarding(true); }}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all flex items-center justify-center gap-2"
            >
              <KeyRound size={16} />
              기존 지갑 복구
            </button>

            {/* 스마트 월렛도 필요한 경우 안내 */}
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
              <p className="text-[10px] text-cyan-300/80 leading-relaxed">
                ⚠️ 비수탁 지갑은 비밀번호와 휴대폰 번호가 복구 수단이 됩니다.
                반드시 기억할 수 있는 정보로 설정하세요.
              </p>
            </div>

            <div className="relative flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-600">또는</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* 스마트 월렛도 연결 */}
            <div className="w-full">
              <ConnectButton
                client={client}
                wallets={wallets}
                connectModal={{
                  size: 'compact',
                  title: '스마트 이더리움 월렛 연결',
                  titleIcon: '',
                  showThirdwebBranding: false,
                }}
                connectButton={{
                  label: '스마트 이더리움 월렛 연결하기 (EVM)',
                  className:
                    '!w-full !py-3 !rounded-2xl !text-sm !font-bold !text-slate-400 !bg-slate-800/50 !border !border-slate-700 hover:!border-slate-600 !transition-all',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SSS 생성 모달 — 로그인 전이라 smartAccount 없음.
          XLOTWalletCreateModal 내부에서 smartAccount 없을 때 처리 필요 */}
      {showCreate && (
        <XLOTWalletCreateModal
          onClose={() => { setShowCreate(false); setSSSOnboarding(false); }}
          onSuccess={() => {
            setShowCreate(false);
            setSSSOnboarding(false);
            onUnlock(); // SSS 생성 완료 → 잠금 해제 후 Dashboard로
          }}
          loginMode
        />
      )}
      {showRecover && (
        <XLOTWalletRecoverModal
          onClose={() => { setShowRecover(false); setSSSOnboarding(false); }}
          onSuccess={() => {
            setShowRecover(false);
            setSSSOnboarding(false);
            onUnlock(); // SSS 복구 완료 → 잠금 해제 후 Dashboard로
          }}
        />
      )}
    </div>
  );
}


// ============================================================
// LockedScreen — 이미 로그인된 세션 복원 화면
// ============================================================
function LockedScreen({
  account,
  isUnlocking,
  onUnlock,
}: {
  account: { address: string };
  isUnlocking: boolean;
  onUnlock: () => void;
}) {
  const [pressed, setPressed]     = useState(false);
  const [fillPct, setFillPct]     = useState(0);
  const [unlocked, setUnlocked]   = useState(false);
  const [holdTimer, setHoldTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  // 꾹 누르기: 0 → 100% 채우기 (1초)
  const startHold = () => {
    if (unlocked) return;
    setPressed(true);
    let pct = 0;
    const t = setInterval(() => {
      pct += 5;
      setFillPct(pct);
      if (pct >= 100) {
        clearInterval(t);
        setUnlocked(true);
        onUnlock();
      }
    }, 50);
    setHoldTimer(t);
  };

  const cancelHold = () => {
    if (holdTimer) clearInterval(holdTimer);
    setHoldTimer(null);
    setPressed(false);
    if (!unlocked) setFillPct(0);
  };

  const addr = account.address;
  const shortAddr = addr.slice(0,6) + '...' + addr.slice(-4);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* 배경 글로우 */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${unlocked ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'radial-gradient(circle at center, rgba(34,211,238,0.15) 0%, transparent 70%)' }} />
      <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[130px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[130px] pointer-events-none" />

      {/* 로고 */}
      <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 mb-2 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
        took
      </h1>
      <p className="text-slate-500 text-sm mb-12">Welcome back</p>

      {/* 주소 */}
      <div className="mb-10 px-4 py-2 bg-slate-900 border border-slate-800 rounded-full flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-slate-400 font-mono">{shortAddr}</span>
      </div>

      {/* 전원 버튼 */}
      <div className="relative flex items-center justify-center mb-10 select-none">

        {/* 외부 링 — 채우기 애니메이션 */}
        <svg
          className="absolute"
          width="180" height="180"
          viewBox="0 0 180 180"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* 배경 링 */}
          <circle cx="90" cy="90" r="80"
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
          {/* 채우기 링 */}
          <circle cx="90" cy="90" r="80"
            fill="none"
            stroke="url(#powerGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 80}`}
            strokeDashoffset={`${2 * Math.PI * 80 * (1 - fillPct / 100)}`}
            style={{ transition: unlocked ? 'none' : 'stroke-dashoffset 0.05s linear' }}
          />
          <defs>
            <linearGradient id="powerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>

        {/* 두 번째 외부 pulse 링 */}
        {(pressed || unlocked) && (
          <div className={`absolute w-[170px] h-[170px] rounded-full border border-cyan-500/30 
            ${unlocked ? 'animate-ping' : 'animate-pulse'}`} />
        )}

        {/* 버튼 본체 */}
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          className={`relative w-32 h-32 rounded-full flex items-center justify-center
            transition-all duration-300 cursor-pointer outline-none
            ${unlocked
              ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_60px_rgba(34,211,238,0.8)]'
              : pressed
              ? 'bg-gradient-to-br from-cyan-600/40 to-blue-700/40 shadow-[0_0_40px_rgba(34,211,238,0.4)] scale-95'
              : 'bg-slate-900 border-2 border-slate-700 shadow-[0_0_20px_rgba(34,211,238,0.15)] hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:border-cyan-500/50'
            }`}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {/* 버튼 내부 링 */}
          <div className={`absolute inset-3 rounded-full border transition-all duration-300
            ${unlocked ? 'border-white/30' : 'border-slate-700/50'}`} />

          {/* 아이콘 */}
          {unlocked ? (
            <ShieldCheck
              size={40}
              className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              strokeWidth={1.5}
            />
          ) : (
            <Power
              size={36}
              className={`transition-all duration-300 ${
                pressed ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'text-slate-500'
              }`}
              strokeWidth={1.5}
            />
          )}
        </button>
      </div>

      {/* 안내 텍스트 */}
      <p className={`text-sm font-bold transition-all duration-500 ${
        unlocked ? 'text-cyan-400' : pressed ? 'text-slate-300' : 'text-slate-600'
      }`}>
        {unlocked ? '잠금 해제됨' : pressed ? `${fillPct}%` : '꾹 눌러서 열기'}
      </p>

      {/* 점 인디케이터 */}
      {!unlocked && (
        <div className="flex gap-2 mt-6">
          {[0,1,2].map(i => (
            <div key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                fillPct > i * 33
                  ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
      )}

      {/* Lock 아이콘 — 상태 표시 */}
      <div className="mt-8 flex items-center gap-2 text-slate-700">
        <Lock size={12} />
        <span className="text-[10px] font-mono">SESSION LOCKED</span>
      </div>
    </div>
  );
}

// ============================================================
// ExtensionPopupLoginGate
//
// 흐름:
//  1) 팝업 열림 → chrome.storage.local.accounts 확인
//  2) 저장된 주소 있음 + 이번 세션에 재연결 미시도
//     → sessionStorage 플래그 세팅 후 reload → Thirdweb auto-connect
//  3) 저장된 주소 있음 + 이미 재연결 시도했지만 account=null
//     → 5초 스피너 후 수동 로그인 게이트
//  4) 저장된 주소 없음 → 로그인 게이트 바로 표시
//  5) 로그인 탭 열기 → 완료 후 팝업을 다시 열면 1)번 흐름으로 자동 연결
// ============================================================
function ExtensionPopupLoginGate() {
  type Phase = 'checking' | 'reconnecting' | 'waiting' | 'no-account';
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    const chromeAny = (globalThis as any).chrome;
    if (!chromeAny?.storage?.local) { setPhase('no-account'); return; }

    chromeAny.storage.local.get('accounts', (result: { accounts?: string[] }) => {
      const hasAccount = (result.accounts?.length ?? 0) > 0;
      if (!hasAccount) { setPhase('no-account'); return; }

      const alreadyTried = sessionStorage.getItem('xlot_reconnect_tried') === '1';
      if (!alreadyTried) {
        // 첫 시도: 리로드 → Thirdweb auto-connect
        sessionStorage.setItem('xlot_reconnect_tried', '1');
        window.location.reload();
      } else {
        // 재시도: 5초 대기 후 수동 게이트로 전환
        setPhase('reconnecting');
        setTimeout(() => {
          sessionStorage.removeItem('xlot_reconnect_tried');
          setPhase('no-account');
        }, 5000);
      }
    });
  }, []);

  const openLoginTab = () => {
    const chromeAny = (globalThis as any).chrome;
    if (chromeAny?.tabs?.create) {
      chromeAny.tabs.create({
        url: chromeAny.runtime.getURL('index.html?mode=login'),
        active: true, // 탭 열리면 팝업이 닫힘 — 의도된 동작
      });
    }
    setPhase('waiting');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden">
        <img src="/icon-192.png" alt="took" className="w-full h-full object-contain rounded-xl" />
      </div>

      {(phase === 'checking' || phase === 'reconnecting') && (
        <>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400" />
          <div className="space-y-1">
            <p className="text-white font-semibold text-sm">자동 연결 중...</p>
            <p className="text-slate-500 text-xs">이전 로그인 세션을 복원하고 있습니다.</p>
          </div>
        </>
      )}

      {phase === 'waiting' && (
        <>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400" />
          <div className="space-y-2">
            <p className="text-white font-semibold text-sm">로그인 탭에서 완료해 주세요</p>
            <p className="text-slate-500 text-xs">
              로그인 완료 후 탭이 닫히면<br />
              팝업 아이콘을 한 번 더 클릭하세요.
            </p>
          </div>
        </>
      )}

      {phase === 'no-account' && (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              took Wallet
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Google · 이메일 로그인은<br />새 탭에서 진행합니다.
            </p>
            <p className="text-slate-600 text-xs">
              Chrome 팝업 보안 정책으로 인해<br />OAuth가 이 창에서는 동작하지 않습니다.
            </p>
          </div>
          <button
            onClick={openLoginTab}
            className="w-full max-w-xs py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-bold text-sm hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all"
          >
            새 탭에서 로그인 열기
          </button>
          <p className="text-slate-700 text-[11px]">
            로그인 완료 후 팝업 아이콘을 다시 클릭하세요.
          </p>
        </>
      )}
    </div>
  );
}