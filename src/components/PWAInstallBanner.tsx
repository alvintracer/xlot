// ============================================================
// PWAInstallBanner.tsx — PWA 설치 유도 배너
//
// Android: beforeinstallprompt 이벤트 → 네이티브 설치 프롬프트
// iOS:     Safari 감지 → 수동 설치 가이드 (공유→홈화면 추가)
//
// 표시 조건:
//   - 이미 설치된 경우 표시 안 함 (display-mode: standalone)
//   - localStorage에 'pwa_dismissed' 있으면 7일간 숨김
// ============================================================

import { useState, useEffect } from 'react';
import { X, Share, Plus, Download, Smartphone } from 'lucide-react';

type Platform = 'android' | 'ios' | 'none';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  if (isStandalone) return 'none'; // 이미 설치됨
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'none';
}

export function PWAInstallBanner() {
  const [platform, setPlatform]       = useState<Platform>('none');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible]         = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling]   = useState(false);

  useEffect(() => {
    // 7일간 닫기 기록 확인
    const dismissed = localStorage.getItem('pwa_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      // Android: beforeinstallprompt 이벤트 대기
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    } else if (p === 'ios') {
      // iOS: 3초 후 자동 표시
      const t = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setShowIOSGuide(false);
    localStorage.setItem('pwa_dismissed', Date.now().toString());
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      localStorage.setItem('pwa_installed', '1');
    }
    setInstalling(false);
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  // ── Android 배너 ──────────────────────────────────────────
  if (platform === 'android') {
    return (
      <div className="fixed bottom-[72px] left-3 right-3 z-[200] animate-fade-in-up">
        <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(34,211,238,0.15)] flex items-center gap-3">

          {/* 앱 아이콘 */}
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(34,211,238,0.4)] overflow-hidden p-0.5">
            <img src="/icon-192.png" alt="xLOT" className="w-full h-full object-cover rounded-lg" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">xLOT 앱 설치</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              홈화면에 추가하면 더 안전하게 보관돼요
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAndroidInstall}
              disabled={installing}
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500 rounded-xl text-xs font-black text-white hover:bg-cyan-400 transition-all active:scale-95"
            >
              <Download size={13}/>
              {installing ? '설치 중...' : '설치'}
            </button>
            <button onClick={handleDismiss} className="p-1.5 text-slate-600 hover:text-slate-400">
              <X size={16}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── iOS 배너 ─────────────────────────────────────────────
  if (platform === 'ios') {
    return (
      <>
        {/* 메인 배너 */}
        <div className="fixed bottom-[72px] left-3 right-3 z-[200] animate-fade-in-up">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden p-0.5">
                <img src="/icon-192.png" alt="xLOT" className="w-full h-full object-cover rounded-lg" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-white">홈화면에 추가하기</p>
                <p className="text-[11px] text-slate-400">
                  언제든지 편안하게 지갑을 관리하세요.
                </p>
              </div>
              <button onClick={handleDismiss} className="p-1.5 text-slate-600 hover:text-slate-400 shrink-0">
                <X size={16}/>
              </button>
            </div>

            <button
              onClick={() => setShowIOSGuide(true)}
              className="w-full py-2.5 bg-cyan-500/20 border border-cyan-500/30 rounded-xl text-xs font-black text-cyan-400 flex items-center justify-center gap-2"
            >
              <Smartphone size={13}/> 설치 방법 보기
            </button>
          </div>
        </div>

        {/* iOS 가이드 모달 */}
        {showIOSGuide && (
          <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-800 p-6 pb-10 animate-fade-in-up">

              <div className="flex justify-between items-center mb-5">
                <p className="text-base font-black text-white">홈화면에 추가하기</p>
                <button onClick={() => setShowIOSGuide(false)} className="p-2 text-slate-500 hover:text-white">
                  <X size={18}/>
                </button>
              </div>

              <div className="space-y-4">

                {/* Step 1 */}
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 text-xs font-black text-cyan-400">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white mb-1">하단 공유 버튼 탭</p>
                    <p className="text-xs text-slate-500">Safari 하단 가운데의 공유(□↑) 아이콘을 누르세요</p>
                    <div className="mt-2 flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl w-fit">
                      <Share size={16} className="text-blue-400"/>
                      <span className="text-xs text-slate-400">공유 버튼</span>
                    </div>
                  </div>
                </div>

                <div className="w-px h-4 bg-slate-800 ml-4"/>

                {/* Step 2 */}
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 text-xs font-black text-cyan-400">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white mb-1">"홈 화면에 추가" 선택</p>
                    <p className="text-xs text-slate-500">스크롤해서 "홈 화면에 추가"를 탭하세요</p>
                    <div className="mt-2 flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl w-fit">
                      <Plus size={16} className="text-slate-400"/>
                      <span className="text-xs text-slate-400">홈 화면에 추가</span>
                    </div>
                  </div>
                </div>

                <div className="w-px h-4 bg-slate-800 ml-4"/>

                {/* Step 3 */}
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-xs font-black text-emerald-400">
                    ✓
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white mb-1">"추가" 탭</p>
                    <p className="text-xs text-slate-500">
                      우측 상단 "추가"를 누르면 완료!<br/>
                      이후 홈화면 xLOT 아이콘으로 실행하세요.
                    </p>
                  </div>
                </div>
              </div>

              {/* 왜 설치해야 하는지 */}
              <div className="mt-5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                <p className="text-[11px] text-cyan-300/80 leading-relaxed">
                  💡 홈화면 앱으로 실행하면 KYC 정보, 지갑 설정 등 로컬 데이터가
                  <span className="font-bold text-cyan-300"> iOS의 자동 삭제 정책(ITP)으로부터 보호</span>됩니다.
                </p>
              </div>

              <button
                onClick={() => { setShowIOSGuide(false); handleDismiss(); }}
                className="w-full mt-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-400"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}