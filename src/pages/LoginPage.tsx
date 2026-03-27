// ============================================================
// LoginPage.tsx — xLOT 온보딩 선택 화면
//
// 1) 스마트 월렛 (Thirdweb AA) — 이메일/구글로 편하게
// 2) 시드 구문 지갑 (SSS 비수탁) — 직접 키 관리
// ============================================================

import { useState } from 'react';
import { ConnectButton } from 'thirdweb/react';
import { client } from '../client';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { ShieldCheck, Zap, ChevronRight, ArrowLeft, KeyRound } from 'lucide-react';
import { XLOTWalletCreateModal } from '../components/XLOTWalletCreateModal';
import { useSSSOnboarding } from '../App';
import { XLOTWalletRecoverModal } from '../components/XLOTWalletRecoverModal';

const wallets = [
  inAppWallet({
    auth: { options: ['google', 'apple', 'email'] },
    metadata: { name: 'xLOT Wallet', image: undefined },
  }),
  createWallet('io.metamask'),
];

type OnboardMode = 'select' | 'smart' | 'seed';

export function LoginPage() {
  const { setSSSOnboarding } = useSSSOnboarding();
  const [mode, setMode]             = useState<OnboardMode>('select');
  const [showCreate, setShowCreate] = useState(false);
  const [showRecover, setShowRecover] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">

      {/* 배경 글로우 */}
      <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[130px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-indigo-500/15 rounded-full blur-[130px] pointer-events-none animate-pulse" />

      <div className="w-full max-w-md relative">

        {/* ── 헤더 (공통) ── */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 mb-3 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            xLOT
          </h1>
          <p className="text-slate-400 text-base font-medium tracking-wide">
            Next Gen Crypto Experience
          </p>
          <div className="h-0.5 w-16 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full mx-auto mt-4" />
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 1: 선택 화면                                 */}
        {/* ══════════════════════════════════════════════════ */}
        {mode === 'select' && (
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 space-y-3 animate-fade-in-up">
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
                    <p className="text-sm font-black text-white">스마트 월렛</p>
                    <span className="text-[9px] bg-cyan-500 text-white px-1.5 py-0.5 rounded font-bold">추천</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    이메일 · 구글로 30초 만에 시작<br/>
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
                <div className="w-11 h-11 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center shrink-0 group-hover:border-slate-500 transition-all">
                  <ShieldCheck size={20} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-white mb-1">시드 구문 지갑</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    완전 비수탁 · Triple-Shield 복구<br/>
                    BTC · ETH · SOL · TRX 멀티체인
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors mt-1" />
              </div>
            </button>

            <p className="text-[10px] text-slate-600 text-center pt-2">
              계속 진행하면 xLOT 이용약관에 동의하게 됩니다
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 2A: 스마트 월렛 (Thirdweb ConnectButton)    */}
        {/* ══════════════════════════════════════════════════ */}
        {mode === 'smart' && (
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 space-y-4 animate-fade-in-up">
            <button
              onClick={() => setMode('select')}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={13} /> 돌아가기
            </button>

            <div className="text-center space-y-1 py-2">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto mb-3">
                <Zap size={22} className="text-cyan-400" />
              </div>
              <p className="text-base font-black text-white">스마트 월렛으로 시작</p>
              <p className="text-xs text-slate-400">이메일이나 소셜 계정으로 30초 만에 생성</p>
            </div>

            <div className="w-full transform scale-100">
              <ConnectButton
                client={client}
                wallets={wallets}
                connectModal={{
                  size: 'compact',
                  title: 'xLOT 시작하기',
                  titleIcon: '',
                  showThirdwebBranding: false,
                  welcomeScreen: {
                    title: 'xLOT Wallet',
                    subtitle: '안전하고 간편한 자산 관리의 시작',
                  },
                }}
                connectButton={{
                  label: '이메일 · 구글로 시작하기',
                  className:
                    '!w-full !py-4 !rounded-2xl !text-base !font-bold !text-white !bg-gradient-to-r !from-cyan-500 !via-blue-500 !to-indigo-500 hover:!shadow-[0_0_30px_rgba(59,130,246,0.5)] !transition-all !border-none',
                }}
              />
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                💡 스마트 월렛은 Thirdweb AA 기반이에요. 가스비를 xLOT이 대납하고,
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
              onClick={() => setMode('select')}
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
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-[10px] text-amber-300/80 leading-relaxed">
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
                  title: '스마트 월렛 연결',
                  titleIcon: '',
                  showThirdwebBranding: false,
                }}
                connectButton={{
                  label: '스마트 월렛도 연결하기',
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
          onSuccess={() => { setShowCreate(false); setSSSOnboarding(false); }}
          loginMode
        />
      )}
      {showRecover && (
        <XLOTWalletRecoverModal
          onClose={() => { setShowRecover(false); setSSSOnboarding(false); }}
          onSuccess={() => { setShowRecover(false); setSSSOnboarding(false); }}
        />
      )}
    </div>
  );
}