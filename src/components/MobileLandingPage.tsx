import { useState, useEffect } from "react";
import { Copy, Navigation, ShieldCheck, Cpu, Search, Fingerprint, Layers } from "lucide-react";

interface Props {
  onContinue: () => void;
}

export function MobileLandingPage({ onContinue }: Props) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
        // iOS Safari 안내 메시지 폴백
        const isIos = /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase());
        if (isIos && !(window.navigator as any).standalone) {
            alert("iOS: 하단의 '공유' 아이콘을 누르고 '홈 화면에 추가'를 선택해 앱을 설치하세요!");
        } else {
            alert("이미 설치되어 있거나 PWA 설치를 지원하지 않는 브라우저입니다.");
        }
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        setDeferredPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-y-auto no-scrollbar pb-24">
      {/* Hero Section */}
      <div className="relative pt-20 pb-16 px-6 overflow-hidden min-h-[85vh] flex flex-col justify-center">
         <div className="absolute top-[-10%] right-[-20%] w-[300px] h-[300px] bg-cyan-500/20 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-10%] left-[-20%] w-[300px] h-[300px] bg-blue-600/20 rounded-full blur-[100px]"></div>
         
         <div className="relative z-10 space-y-6 text-center">
          <div className="flex justify-center mb-6">
            <img src="/icon-192.png" className="w-24 h-24 object-contain" alt="took" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter">
            took
          </h1>
            <p className="text-lg text-slate-300 font-medium leading-relaxed px-4">
              모든 지갑과 자산을 하나로 연결하는<br/>
              <span className="text-cyan-400 font-bold">오직 나만의 슈퍼 월렛</span>
            </p>

            <div className="pt-8 w-full max-w-sm mx-auto space-y-3">
               <button 
                 onClick={handleInstallClick}
                 className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl hover:bg-slate-100"
               >
                 took 앱 설치하기
               </button>
               
               <button 
                 onClick={onContinue}
                 className="w-full py-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"
               >
                 웹으로 계속하기
               </button>
            </div>
         </div>
         
         {/* Scroll Indicator */}
         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce text-slate-500">
           <span className="text-xs font-bold mb-1">자세히 알아보기</span>
           <div className="w-1 h-8 bg-gradient-to-b from-slate-500 to-transparent rounded-full"></div>
         </div>
      </div>

      {/* Features Section */}
      <div className="px-6 space-y-24 py-12">
         {/* Identity 1 */}
         <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
               <Layers className="text-cyan-400" size={24} />
            </div>
            <h2 className="text-2xl font-black">
               The Ultimate<br/>
               <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Aggregator</span>
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
               모든 것을 가져오니까, took. 이더리움, 솔라나, 트론, 비트코인 등 흩어진 여러 네트워크의 지갑과 자산을 하나의 매끄러운 인터페이스에서 관리하세요.<br/>(Wallet, DEX, RWA Aggregator)
            </p>
         </div>

         {/* Identity 2 */}
         <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
               <ShieldCheck className="text-emerald-400" size={24} />
            </div>
            <h2 className="text-2xl font-black">
               완벽한 규칙 준수<br/>
               <span className="text-emerald-400">Compliant Wallet</span>
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
               강력한 개인정보 보호(Privacy-Preserving) 기반의 신원 인증. KYC 인증 및 KYT 자금세탁 방지, VASP Travel Rule까지 모두 준수하여 가장 안전한 비수탁 환경을 제공합니다.
            </p>
         </div>

         {/* Identity 3 */}
         <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
               <Fingerprint className="text-purple-400" size={24} />
            </div>
            <h2 className="text-2xl font-black">
               완전 비수탁<br/>
               <span className="text-purple-400">SAR Triple-Shield</span>
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
               중앙 서버에 프라이빗 키를 저장하지 않습니다. 시드 구문을 외울 필요 없이, 기기 비밀번호·휴대폰·이메일을 이용한 다자간 분산 소셜 검증(SAR)으로 완벽하게 자산을 지킵니다.
            </p>
         </div>
      </div>
      
      {/* Footer */}
      <div className="text-center pb-8 pt-10 border-t border-slate-900/50">
        <p className="text-[10px] text-slate-600 font-bold tracking-widest text-uppercase">MADE FOR WEB3</p>
        <p className="text-xs font-bold text-slate-500 mt-1">© 2026 took by traverse.</p>
      </div>
    </div>
  );
}
