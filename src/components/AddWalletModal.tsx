import { useState, useEffect } from "react";
import { X, Loader2, Edit2, AlertTriangle, KeyRound, CheckCircle2, Copy, ExternalLink, ShieldCheck, ArrowRight } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { 
  addWeb3Wallet, 
  addCexWallet, 
  addSolanaWallet, 
  addBitcoinWallet, 
  addTronWallet 
} from "../services/walletService";
import { validateAndDeriveAddress } from "../utils/keyManager"; 
import { saveImportedKey } from "../utils/localWalletManager"; 
import { saveImportedKeysToVaultSSS, deriveShareKeyFromPhone, deriveShareKeyFromEmail } from "../services/shareVaultService";
import { SecureKeypad } from "./SecureKeypad";
import { getSpecificProvider } from "../utils/walletProviderUtils";
import { supabase } from "../lib/supabase";
import { XLOTWalletCreateModal } from "./XLOTWalletCreateModal";
import { XLOTWalletRecoverModal } from "./XLOTWalletRecoverModal";

interface Props {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

// === CONSTANTS ===
const WEB3_WALLETS = [
  { id: 'METAMASK',  name: 'MetaMask',   icon: '🦊',  bg: 'bg-blue-500/10', color: 'text-blue-500', supported: ['EVM'] },
  { id: 'RABBY',     name: 'Rabby',       icon: '🐰',  bg: 'bg-blue-500/10',   color: 'text-blue-500',   supported: ['EVM'] },
  { id: 'PHANTOM',   name: 'Phantom',     icon: '👻',  bg: 'bg-purple-500/10', color: 'text-purple-500', supported: ['SOL', 'EVM', 'BTC'] },
  { id: 'SOLFLARE',  name: 'Solflare',    icon: '☀️',  bg: 'bg-blue-400/10', color: 'text-blue-400', supported: ['SOL'] },
  { id: 'OKX',       name: 'OKX Wallet',  icon: 'X',   bg: 'bg-slate-800',     color: 'text-white',      supported: ['EVM', 'SOL', 'TRON', 'BTC'] },
  { id: 'TRONLINK',  name: 'TronLink',    icon: '⚡',  bg: 'bg-red-500/10',    color: 'text-red-400',    supported: ['TRON'] },
];

const CEX_LIST = [
  { id: 'UPBIT', name: 'Upbit', icon: 'Up', bg: 'bg-indigo-500/10', color: 'text-indigo-500', url: "https://upbit.com/mypage/open_api_management" },
  { id: 'BITHUMB', name: 'Bithumb', icon: 'Bi', bg: 'bg-blue-500/10', color: 'text-blue-500', url: "https://www.bithumb.com/react/api-support/management-api" },
  { id: 'BINANCE', name: 'Binance', icon: '🟡', bg: 'bg-teal-500/10', color: 'text-teal-500', url: "https://www.binance.com/en/my/settings/api-management" },
  { id: 'OKX_CEX', name: 'OKX', icon: 'OK', bg: 'bg-white/10', color: 'text-white', url: "https://www.okx.com/account/users/api" },
];

const CHAINS = [
  { id: 'EVM', label: 'Ethereum', color: 'cyan' },
  { id: 'SOL', label: 'Solana', color: 'purple' },
  { id: 'TRON', label: 'Tron', color: 'red' },
  { id: 'BTC', label: 'Bitcoin', color: 'blue' },
];

export function AddWalletModal({ onClose, onSuccess }: Props) {
  const activeAccount = useActiveAccount();
  
  // Tabs
  const [mainTab, setMainTab] = useState<"WEB3" | "CEX" | "IMPORT">("WEB3");
  // SSS 지갑 모달
  const [showSSSCreate, setShowSSSCreate]   = useState(false);
  const [showSSSRecover, setShowSSSRecover] = useState(false);
  const [web3Mode, setWeb3Mode] = useState<"CONNECT" | "MANUAL">("CONNECT");
  const [targetChain, setTargetChain] = useState<'EVM' | 'SOL' | 'TRON' | 'BTC'>('EVM');

  // Inputs
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  
  // CEX Inputs
  const [selectedCex, setSelectedCex] = useState<string>("UPBIT");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  
  // Import Inputs
  const [privateKeyInput, setPrivateKeyInput] = useState(""); 
  const [importStep, setImportStep]           = useState<'input'|'phone'|'email'|'pin'>('input');
  const [importPhoneOtp, setImportPhoneOtp]   = useState('');
  const [importPhoneOtpSent, setImportPhoneOtpSent] = useState(false);
  const [importPhoneToken, setImportPhoneToken] = useState('');
  const [importEmailInput, setImportEmailInput] = useState('');
  const [importEmailToken, setImportEmailToken] = useState('');
  const [importEmailOtpSent, setImportEmailOtpSent] = useState(false);
  const [importPin, setImportPin]             = useState('');
  const [showImportKeypad, setShowImportKeypad] = useState(false);
  const [importDerivedAddr, setImportDerivedAddr] = useState('');
  const [importFormattedKey, setImportFormattedKey] = useState('');
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // IP Logic
  const [currentIp, setCurrentIp] = useState<string>("로딩 중...");
  const [ipCopied, setIpCopied] = useState(false);

  // ✨ 서버 IP 가져오기 (CEX 탭 진입 시 또는 모달 열릴 때)
  useEffect(() => {
    const fetchServerIp = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-server-ip');
        if (error) throw error;
        setCurrentIp(data.ip || "49.247.139.241"); // Fallback IP (iwinv)
      } catch (e) {
        console.error("IP Check Failed:", e);
        setCurrentIp("49.247.139.241"); // 에러 시 기본값
      }
    };
    fetchServerIp();
  }, []);

  const handleCopyIp = () => {
    navigator.clipboard.writeText(currentIp);
    setIpCopied(true);
    setTimeout(() => setIpCopied(false), 2000);
  };

  const openCexPage = () => {
    const target = CEX_LIST.find(c => c.id === selectedCex);
    if (target?.url) {
        window.open(target.url, '_blank');
    }
  };

  // --- Web3 Logic (기존 유지) ---
  const handleConnectWallet = async (walletId: string) => {
    const walletInfo = WEB3_WALLETS.find(w => w.id === walletId);
    if (!walletInfo?.supported.includes(targetChain)) {
        alert(`${walletInfo?.name} 지갑은 ${targetChain} 네트워크를 지원하지 않습니다.`);
        return;
    }

    setLoading(true);
    setAddress(""); 

    try {
      const win = window as any;
      let addr = '';
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const currentUrlEnc = encodeURIComponent(window.location.href);
      const targetHost = window.location.host + window.location.pathname;

      if (walletId === 'OKX') {
         if (!win.okxwallet) {
            if (isMobile) { window.location.href = `okx://wallet/dapp/url?dappUrl=${currentUrlEnc}`; return; }
            throw new Error("OKX Wallet이 설치되어 있지 않습니다.");
         }
         if (targetChain === 'EVM') {
             const res = await win.okxwallet.request({ method: 'eth_requestAccounts' });
             addr = res[0];
         } else if (targetChain === 'SOL') {
             const res = await win.okxwallet.solana.connect();
             addr = res.publicKey.toString();
         } else if (targetChain === 'TRON') {
             const res = await win.okxwallet.tronLink.request({ method: 'tron_requestAccounts' }); 
             if (res.code === 200) addr = res.address.base58;
             else if (res && res.length > 0) addr = res[0];
         } else if (targetChain === 'BTC') {
             const res = await win.okxwallet.bitcoin.connect();
             addr = res.address;
         }
      }
      else if (walletId === 'PHANTOM') {
          const provider = win.solana?.isPhantom ? win.solana : win.phantom?.solana;
          if (!provider) {
             if (isMobile) { window.location.href = `https://phantom.app/ul/browse/${currentUrlEnc}`; return; }
             throw new Error("Phantom 지갑을 찾을 수 없습니다.");
          }

          if (targetChain === 'SOL') {
              const res = await provider.connect();
              addr = res.publicKey.toString();
          } else if (targetChain === 'EVM') {
              const ethProvider = win.phantom?.ethereum;
              if (ethProvider) {
                  const res = await ethProvider.request({ method: 'eth_requestAccounts' });
                  addr = res[0];
              }
          } else if (targetChain === 'BTC') {
              const btcProvider = win.phantom?.bitcoin;
              if (btcProvider) {
                  const res = await btcProvider.requestAccounts();
                  addr = res[0].address; 
              }
          }
      }
      else if (walletId === 'METAMASK' || walletId === 'RABBY') {
          const provider = getSpecificProvider(walletId);
          if (!provider) {
             if (isMobile && walletId === 'METAMASK') { window.location.href = `https://metamask.app.link/dapp/${targetHost}`; return; }
             throw new Error(`${walletId} 지갑을 찾을 수 없습니다.`);
          }
          const res = await provider.request({ method: 'eth_requestAccounts' });
          addr = res[0];
      }
      else if (walletId === 'SOLFLARE') {
          if (!win.solflare) throw new Error("Solflare 지갑이 없습니다.");
          await win.solflare.connect();
          addr = win.solflare.publicKey.toString();
      }
      else if (walletId === 'TRONLINK') {
          // ── TronLink 주입 대기 ──────────────────────────────
          const tronLinkReady = await new Promise<boolean>((resolve) => {
              if (win.tronLink || win.tronWeb) { resolve(true); return; }
              let attempts = 0;
              const timer = setInterval(() => {
                  attempts++;
                  if (win.tronLink || win.tronWeb) { clearInterval(timer); resolve(true); }
                  else if (attempts >= 30) { clearInterval(timer); resolve(false); }
              }, 100);
          });

          if (!tronLinkReady) {
              if (isMobile) { window.location.href = `okx://wallet/dapp/url?dappUrl=${currentUrlEnc}`; return; } // TronLink fallback
              throw new Error("TronLink 지갑을 찾을 수 없습니다.\nChrome 확장 프로그램이 설치되어 있는지 확인하고,\n페이지를 새로고침 후 다시 시도해주세요.");
          }

          // ── 연결 요청 ───────────────────────────────────────
          if (win.tronLink?.request) {
              const res = await win.tronLink.request({ method: 'tron_requestAccounts' });
              if (res?.code === 4001) throw new Error("TronLink 연결이 거절되었습니다.");
              await new Promise(r => setTimeout(r, 300));
          }

          const tronWeb = win.tronWeb;
          const base58 = tronWeb?.defaultAddress?.base58;
          if (!base58) {
              throw new Error(
                  win.tronLink?.ready === false
                  ? "TronLink 지갑이 잠겨 있습니다. 잠금을 해제한 후 다시 시도해주세요."
                  : "TronLink 주소를 가져오지 못했습니다. 잠금 해제 후 다시 시도해주세요."
              );
          }
          addr = base58;
      }

      if (!addr) throw new Error("주소를 가져오지 못했습니다.");

      setAddress(addr);
      setDetectedType(walletId);
      setLabel(`${walletId} (${targetChain})`);

    } catch (e: any) {
      console.error(e);
      alert("연결 실패: " + (e.message || "알 수 없는 오류"));
    } finally {
      setLoading(false);
    }
  };

  // --- Add Handler ---
  const handleAdd = async () => {
    if (!activeAccount) return alert("로그인이 필요합니다.");
    setLoading(true);

    try {
      if (mainTab === "WEB3") {
        if (!address) throw new Error("주소가 입력되지 않았습니다.");
        if (targetChain === 'EVM') await addWeb3Wallet(activeAccount.address, address, label || "EVM Wallet", detectedType || "MANUAL");
        else if (targetChain === 'SOL') await addSolanaWallet(activeAccount.address, address, label || "Solana Wallet");
        else if (targetChain === 'TRON') await addTronWallet(activeAccount.address, address, label || "Tron Wallet", detectedType || "TRON");
        else if (targetChain === 'BTC') await addBitcoinWallet(activeAccount.address, address, label || "Bitcoin Wallet");
      } 
      else if (mainTab === "CEX") {
        if (!accessKey || !secretKey) throw new Error("API Key를 입력해주세요.");
        await addCexWallet(activeAccount.address, selectedCex, accessKey, secretKey, label || selectedCex);
      }
      await onSuccess();
      onClose();
    } catch (e: any) {
        // 사용자 친화적인 에러 메시지 처리
        let msg = e.message;
        if (msg.includes("IP")) msg = "IP 등록이 안 된 것 같습니다. 허용 IP를 확인해주세요.";
        else if (msg.includes("Key")) msg = "API Key가 올바르지 않습니다.";
        alert("추가 실패: " + msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Import Handler (Step 1: 키 검증) ---
  const handleImportValidate = async () => {
    if (!activeAccount) return alert("로그인이 필요합니다.");
    if (!privateKeyInput) return alert("프라이빗 키를 입력해주세요.");
    setLoading(true);
    try {
      const result = await validateAndDeriveAddress(targetChain, privateKeyInput);
      if (!result?.isValid || !result.address) throw new Error("유효하지 않은 프라이빗 키입니다.");
      setImportDerivedAddr(result.address);
      setImportFormattedKey(result.formattedKey);
      setImportStep('phone'); // SSS 인증 시작
    } catch (e: any) { alert("키 검증 실패: " + e.message); }
    finally { setLoading(false); }
  };

  // Step 2: 휴대폰 OTP 전송
  const handleImportPhoneOtp = async () => {
    setLoading(true);
    try {
      const formatted = importPhoneOtp.startsWith('+') ? importPhoneOtp : '+82' + importPhoneOtp.replace(/^0/,'');
      const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
      if (error) throw error;
      setImportPhoneOtpSent(true);
    } catch(e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  // Step 2b: 휴대폰 OTP 검증 → 전화번호 기반 결정론적 키 파생
  const handleImportPhoneVerify = async (otpCode: string) => {
    try {
      const formatted = importPhoneOtp.startsWith('+') ? importPhoneOtp : '+82' + importPhoneOtp.replace(/^0/,'');
      const { data, error } = await supabase.auth.verifyOtp({ phone: formatted, token: otpCode, type: 'sms' });
      if (error) throw error;
      // 전화번호에서 결정론적 키 파생 — 같은 번호면 언제나 동일
      const pKey = await deriveShareKeyFromPhone(importPhoneOtp);
      setImportPhoneToken(pKey);
      setImportStep('email');
    } catch(e: any) { alert('휴대폰 OTP 실패: ' + (e as any).message); }
  };

  // Step 3: 이메일 OTP 전송
  const handleImportEmailOtp = async () => {
    setLoading(true);
    try {
      await supabase.auth.signInWithOtp({ email: importEmailInput });
      setImportEmailOtpSent(true);
    } catch(e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  // Step 4: PIN 설정 후 최종 SSS 저장
  const handleImportSave = async (pin: string) => {
    if (!activeAccount) return;
    setImportPin(pin); setShowImportKeypad(false);
    setLoading(true);
    try {
      // 로컬 저장 (기존 방식, 즉시 서명용)
      saveImportedKey(targetChain, importDerivedAddr, importFormattedKey, pin);

      // SSS 3조각으로 Vault 저장
      await saveImportedKeysToVaultSSS(
        activeAccount.address, activeAccount.address,
        { [targetChain]: importFormattedKey } as any,
        pin, importPhoneToken, importEmailToken,
      );

      // DB에 지갑 등록
      const walletLabel = label || `${targetChain} Import Wallet`;
      if (targetChain === 'EVM') await addWeb3Wallet(activeAccount.address, importDerivedAddr, walletLabel, "MANUAL");
      else if (targetChain === 'SOL') await addSolanaWallet(activeAccount.address, importDerivedAddr, walletLabel);
      else if (targetChain === 'TRON') await addTronWallet(activeAccount.address, importDerivedAddr, walletLabel);
      else if (targetChain === 'BTC') await addBitcoinWallet(activeAccount.address, importDerivedAddr, walletLabel);

      alert("✅ 가져오기 성공! (SSS Triple-Shield로 보호됨)");
      await onSuccess(); onClose();
    } catch (e: any) { alert("저장 실패: " + e.message); }
    finally { setLoading(false); }
  };

  const handleImport = handleImportValidate; // 기존 호출부 호환용

  return (
    <>
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-800 animate-fade-in-up max-h-[90vh] overflow-y-auto custom-scrollbar">
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">지갑 슬롯 추가</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* 메인 탭 */}
        <div className="flex gap-2 mb-6 border-b border-slate-800 pb-2">
          <button onClick={() => setMainTab("WEB3")} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-all ${mainTab === "WEB3" ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-500"}`}>Web3 지갑</button>
          <button onClick={() => setMainTab("CEX")} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-all ${mainTab === "CEX" ? "border-indigo-400 text-indigo-400" : "border-transparent text-slate-500"}`}>거래소</button>
          <button onClick={() => setMainTab("IMPORT")} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-all ${mainTab === "IMPORT" ? "border-emerald-400 text-emerald-400" : "border-transparent text-slate-500"}`}>가져오기</button>
        </div>

        {/* === TAB 1: WEB3 === */}
        {mainTab === "WEB3" && (
          <div className="space-y-4">

            {/* ── xLOT SSS 비수탁 지갑 카드 ── */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-cyan-400" />
                <p className="text-sm font-black text-white">took 비수탁 지갑</p>
                <span className="text-[9px] bg-cyan-500 text-white px-1.5 py-0.5 rounded font-bold">NEW</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                비밀번호 + 휴대폰으로 언제든 복구 · BIP-39 표준 · 완전 비수탁 · Triple-Shield 2-of-3
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSSSCreate(true)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-[0_0_16px_rgba(34,211,238,0.3)] transition-all"
                >
                  새 지갑 만들기
                </button>
                <button
                  onClick={() => setShowSSSRecover(true)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all"
                >
                  기존 지갑 복구
                </button>
              </div>
            </div>

            {/* 구분선 */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-600 font-bold">또는 외부 지갑 연결</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

             <div className="flex bg-slate-950 p-1 rounded-xl mb-4">
              <button onClick={() => setWeb3Mode("CONNECT")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${web3Mode === "CONNECT" ? "bg-slate-800 text-cyan-400 shadow-sm" : "text-slate-500"}`}>지갑 연결 감지</button>
              <button onClick={() => setWeb3Mode("MANUAL")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${web3Mode === "MANUAL" ? "bg-slate-800 text-white shadow-sm" : "text-slate-500"}`}>주소 직접 입력</button>
            </div>
            {/* 체인 선택 */}
            <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-bold ml-1">네트워크(체인) 선택</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {CHAINS.map(c => (
                    <button key={c.id} onClick={() => { setTargetChain(c.id as any); setAddress(""); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap flex-1 ${targetChain === c.id ? `bg-${c.color}-500/20 border-${c.color}-500/50 text-${c.color}-400` : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}>{c.label}</button>
                  ))}
                </div>
            </div>
            {web3Mode === "CONNECT" ? (
              <div className="space-y-3 pt-2">
                 <p className="text-[10px] text-slate-500 font-bold ml-1">연결할 지갑 선택 ({targetChain})</p>
                 <div className="grid grid-cols-2 gap-3">
                   {WEB3_WALLETS.map((wallet) => {
                     const isSupported = wallet.supported.includes(targetChain);
                     return (
                       <button key={wallet.id} onClick={() => handleConnectWallet(wallet.id)} disabled={loading || !isSupported} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all gap-2 group relative overflow-hidden ${detectedType === wallet.id && address ? 'ring-2 ring-cyan-500 bg-slate-800 border-transparent' : 'bg-slate-900 border-slate-800'} ${!isSupported ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:border-slate-600 hover:bg-slate-800'}`}>
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${wallet.bg} ${wallet.color}`}>{wallet.icon}</div>
                         <span className="text-xs font-bold text-slate-300">{wallet.name}</span>
                       </button>
                     );
                   })}
                 </div>
                 {address && (
                    <div className="mt-4 animate-fade-in bg-slate-950 p-4 rounded-xl border border-cyan-500/30">
                       <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-cyan-400 flex items-center gap-1"><CheckCircle2 size={12}/> 주소 감지됨</span>
                          <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded">{detectedType}</span>
                       </div>
                       <div className="relative">
                           <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-slate-900 text-white p-3 pr-8 rounded-lg outline-none border border-slate-800 focus:border-cyan-400 text-xs font-mono" />
                       </div>
                    </div>
                 )}
              </div>
            ) : (
              <div className="space-y-3 animate-fade-in pt-2">
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`${targetChain} 주소 직접 입력`} className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-cyan-500 text-sm font-mono" />
              </div>
            )}
            {address && (
              <div className="space-y-4 animate-fade-in-up pt-4 border-t border-slate-800 mt-4">
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="지갑 별칭 (선택)" className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-cyan-500 text-sm" />
                <button onClick={handleAdd} disabled={loading} className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl font-bold text-white shadow-lg">
                  {loading ? <Loader2 className="animate-spin mx-auto"/> : "지갑 슬롯 추가"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================================== */}
        {/* === TAB 2: CEX (UX 리뉴얼 됨) === */}
        {/* ================================== */}
        {mainTab === "CEX" && (
            <div className="space-y-4 animate-fade-in">
                {/* 1. 거래소 선택 그리드 */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                    {CEX_LIST.map(cex => (
                        <button 
                            key={cex.id} 
                            onClick={() => setSelectedCex(cex.id)}
                            className={`flex flex-col items-center justify-center p-2 py-3 rounded-xl border transition-all gap-1 relative
                                ${selectedCex === cex.id ? 'bg-indigo-500/20 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-950 border-slate-800 hover:border-slate-600 opacity-60 hover:opacity-100'}`}
                        >
                            <span className={`font-bold ${cex.color} text-lg`}>{cex.icon}</span>
                            <span className="text-[10px] text-slate-300 font-medium">{cex.name}</span>
                            {selectedCex === cex.id && <div className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full"/>}
                        </button>
                    ))}
                </div>

                {/* 2. 가이드 카드 (Step by Step) */}
                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 space-y-4">
                    
                    {/* Step A: IP 복사 */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                <span className="bg-slate-800 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px]">1</span>
                                허용 IP 등록
                            </span>
                            <span className="text-[10px] text-indigo-400">필수</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-indigo-300 font-mono text-xs text-center">
                                {currentIp}
                            </code>
                            <button onClick={handleCopyIp} className={`p-2.5 rounded-lg border transition-all ${ipCopied ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
                                {ipCopied ? <CheckCircle2 size={16}/> : <Copy size={16}/>}
                            </button>
                        </div>
                    </div>

                    {/* Step B: 이동 및 키 발급 */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                <span className="bg-slate-800 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px]">2</span>
                                API 키 발급
                            </span>
                        </div>
                        <button onClick={openCexPage} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-700">
                             {CEX_LIST.find(c => c.id === selectedCex)?.name} 설정 페이지 열기 <ExternalLink size={12}/>
                        </button>
                        <p className="text-[10px] text-slate-500 mt-2 text-center">
                            * '자산 조회' 권한만 체크해주세요.
                        </p>
                    </div>
                </div>

                {/* 3. 키 입력 폼 */}
                <div className="pt-2 border-t border-slate-800">
                    <div className="space-y-3">
                        <div className="relative">
                            <ShieldCheck size={14} className="absolute left-3 top-4 text-slate-500"/>
                            <input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} type="text" placeholder="Access Key" className="w-full bg-slate-950 text-white p-3 pl-9 rounded-xl outline-none border border-slate-800 focus:border-indigo-500 text-xs font-mono" />
                        </div>
                        <div className="relative">
                            <KeyRound size={14} className="absolute left-3 top-4 text-slate-500"/>
                            <input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} type="password" placeholder="Secret Key" className="w-full bg-slate-950 text-white p-3 pl-9 rounded-xl outline-none border border-slate-800 focus:border-indigo-500 text-xs font-mono" />
                        </div>
                    </div>
                </div>

                <button onClick={handleAdd} disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-white shadow-lg text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  {loading ? <Loader2 className="animate-spin" size={18}/> : <>연결하기 <ArrowRight size={16}/></>}
                </button>
            </div>
        )}
        
        {/* ======================= */}
        {/* === TAB 3: IMPORT === */}
        {/* ======================= */}
        {mainTab === "IMPORT" && (
          <div className="space-y-4 animate-fade-in">
            {/* Step 헤더 */}
            <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
              <h3 className="text-emerald-400 font-bold text-sm flex items-center gap-2 mb-1">
                <KeyRound size={16}/> Triple-Shield 키 가져오기
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                프라이빗 키를 SAR 2-of-3으로 분할해 비밀번호·휴대폰·이메일로 보호합니다.
              </p>
            </div>

            {/* Step 인디케이터 */}
            <div className="flex items-center gap-1">
              {['키 입력','휴대폰','이메일','PIN'].map((s, i) => {
                const cur = {input:0,phone:1,email:2,pin:3}[importStep] ?? 0;
                return (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${cur > i ? 'bg-emerald-500 text-white' : cur === i ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                      {cur > i ? '✓' : i+1}
                    </div>
                    {i < 3 && <div className={`flex-1 h-px ${cur > i ? 'bg-emerald-500':'bg-slate-800'}`}/>}
                  </div>
                );
              })}
            </div>

            {/* Step 1: 키 입력 */}
            {importStep === 'input' && (
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {CHAINS.map(c => (
                    <button key={c.id} onClick={() => setTargetChain(c.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap flex-1 ${targetChain === c.id ? `bg-${c.color}-500/20 border-${c.color}-500/50 text-${c.color}-400` : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <textarea value={privateKeyInput} onChange={e => setPrivateKeyInput(e.target.value)}
                  placeholder="0x... 또는 Base58 키 입력"
                  className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-emerald-500 text-xs font-mono h-24 resize-none"/>
                <input value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="지갑 별칭"
                  className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border border-slate-800 focus:border-emerald-500 text-sm"/>
                <button onClick={handleImportValidate} disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="animate-spin" size={16}/> : <><CheckCircle2 size={16}/>키 검증 및 다음</>}
                </button>
              </div>
            )}

            {/* Step 2: 휴대폰 OTP (Share B) */}
            {importStep === 'phone' && (
              <div className="space-y-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
                  <p className="font-bold text-white mb-1">주소 확인됨</p>
                  <p className="font-mono text-slate-500 truncate">{importDerivedAddr}</p>
                </div>
                <p className="text-xs text-slate-400">휴대폰 인증 (Share B — 복구 수단 1)</p>
                <input value={importPhoneOtp} onChange={e => setImportPhoneOtp(e.target.value)}
                  placeholder="010-1234-5678"
                  className="w-full bg-slate-950 text-white p-3 rounded-xl border border-slate-800 text-sm outline-none focus:border-emerald-500/50"/>
                {!importPhoneOtpSent ? (
                  <button onClick={handleImportPhoneOtp} disabled={loading || !importPhoneOtp}
                    className="w-full py-3 bg-slate-800 border border-slate-700 rounded-xl font-bold text-sm text-white disabled:opacity-40">
                    {loading ? '전송 중...' : 'OTP 전송'}
                  </button>
                ) : importPhoneToken ? (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                    <CheckCircle2 size={12}/> 휴대폰 인증 완료 → 이메일 인증으로 이동
                  </div>
                ) : (
                  <input placeholder="인증번호 6자리" maxLength={6}
                    className="w-full bg-slate-950 text-white p-3 rounded-xl border border-slate-800 text-sm text-center font-mono outline-none focus:border-emerald-500/50"
                    onChange={e => { if(e.target.value.length===6) handleImportPhoneVerify(e.target.value); }}/>
                )}
              </div>
            )}

            {/* Step 3: 이메일 OTP (Share C) */}
            {importStep === 'email' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">이메일 인증 (Share C — 복구 수단 2)</p>
                <input value={importEmailInput} onChange={e => setImportEmailInput(e.target.value)}
                  type="email" placeholder="your@email.com"
                  className="w-full bg-slate-950 text-white p-3 rounded-xl border border-slate-800 text-sm outline-none focus:border-emerald-500/50"/>
                <button onClick={handleImportEmailOtp} disabled={loading || importEmailOtpSent}
                  className="w-full py-3 bg-slate-800 border border-slate-700 rounded-xl font-bold text-sm text-white disabled:opacity-40">
                  {importEmailOtpSent ? '전송됨 (아래에 입력)' : loading ? '전송 중...' : '이메일 OTP 전송'}
                </button>
                {importEmailOtpSent && (
                  <input type="text" placeholder="6자리 인증번호" maxLength={6}
                    className="w-full bg-slate-950 text-white p-3 rounded-xl border border-slate-800 text-sm text-center font-mono outline-none focus:border-emerald-500/50"
                    onChange={async e => {
                      if (e.target.value.length === 6) {
                        try {
                          const { data, error } = await supabase.auth.verifyOtp({
                            email: importEmailInput, token: e.target.value, type: 'email'
                          });
                          if (error) throw error;
                          const eKey = await deriveShareKeyFromEmail(importEmailInput);
                          setImportEmailToken(eKey);
                          setImportStep('pin');
                        } catch(err: any) { alert('이메일 OTP 실패: ' + err.message); }
                      }
                    }}/>
                )}
              </div>
            )}

            {/* Step 4: PIN 설정 */}
            {importStep === 'pin' && (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-[11px] text-emerald-300/80">
                  ✅ 휴대폰 + 이메일 인증 완료<br/>
                  이제 PIN을 설정하면 SAR 저장이 완료됩니다.
                </div>
                <button onClick={() => setShowImportKeypad(true)}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl font-bold text-white flex items-center justify-center gap-2">
                  <KeyRound size={16}/> PIN 설정 및 저장 완료
                </button>
              </div>
            )}
          </div>
        )}

        {/* Import SecureKeypad */}
        {showImportKeypad && (
          <SecureKeypad
            title="Import 키 PIN 설정"
            description="이 기기에서 키를 꺼낼 때 사용하는 PIN"
            onClose={() => setShowImportKeypad(false)}
            onComplete={handleImportSave}
          />
        )}

      </div>
    </div>

    {showSSSCreate && (
      <XLOTWalletCreateModal
        onClose={() => setShowSSSCreate(false)}
        onSuccess={async () => { await onSuccess(); onClose(); }}
      />
    )}

    {showSSSRecover && (
      <XLOTWalletRecoverModal
        onClose={() => setShowSSSRecover(false)}
        onSuccess={async () => { await onSuccess(); onClose(); }}
      />
    )}
    </>
  );
}