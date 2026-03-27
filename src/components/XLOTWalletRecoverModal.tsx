// ============================================================
// XLOTWalletRecoverModal.tsx
// Triple-Shield 2-of-3 복구
//
// 복구 경로:
//   A+B: 비밀번호 + 휴대폰 OTP
//   A+C: 비밀번호 + 이메일 OTP
//   B+C: 휴대폰 OTP + 이메일 OTP
// ============================================================

import { useState } from 'react';
import {
  X, ShieldCheck, KeyRound, Loader2, Check,
  AlertCircle, ChevronRight, Lock, Phone, Mail
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';

import { combineShares, uint8ToString } from '../services/sssService';
import {
  decryptShareA, decryptShareB, decryptShareC,
  loadVaultFromSupabase, getUserVaults,
} from '../services/shareVaultService';
import { addWeb3Wallet } from '../services/walletService';

type RecoveryPath = 'A+B' | 'A+C' | 'B+C';
type Step = 'select_path' | 'select_wallet' | 'input' | 'otp' | 'recovering' | 'done' | 'error';

interface Props {
  onClose:   () => void;
  onSuccess: () => void;
}

export function XLOTWalletRecoverModal({ onClose, onSuccess }: Props) {
  const smartAccount = useActiveAccount();

  const [step, setStep]                 = useState<Step>('select_path');
  const [path, setPath]                 = useState<RecoveryPath>('A+B');
  const [wallets, setWallets]           = useState<any[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<any>(null);
  const [password, setPassword]         = useState('');
  const [phone, setPhone]               = useState('');
  const [phoneOtp, setPhoneOtp]         = useState('');
  const [phoneToken, setPhoneToken]     = useState('');
  const [email, setEmail]               = useState('');
  const [emailOtp, setEmailOtp]         = useState('');
  const [emailToken, setEmailToken]     = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState('');
  // OTP 진행 상태: 'phone' | 'email' | 'both_phone' | 'both_email' (B+C)
  const [otpTarget, setOtpTarget]       = useState<'phone'|'email'>('phone');

  const pathInfo = {
    'A+B': { title: '비밀번호 + 휴대폰', desc: '기기를 분실했을 때', icon: <Lock size={18} className="text-amber-400"/>, needs: ['비밀번호','휴대폰 OTP'] },
    'A+C': { title: '비밀번호 + 이메일', desc: '휴대폰을 변경했을 때', icon: <Mail size={18} className="text-cyan-400"/>,  needs: ['비밀번호','이메일 OTP'] },
    'B+C': { title: '휴대폰 + 이메일',  desc: '비밀번호를 잊었을 때', icon: <Phone size={18} className="text-emerald-400"/>, needs: ['휴대폰 OTP','이메일 OTP'] },
  };

  const needsPassword = path === 'A+B' || path === 'A+C';
  const needsPhone    = path === 'A+B' || path === 'B+C';
  const needsEmail    = path === 'A+C' || path === 'B+C';

  // ── 경로 선택 후 지갑 목록 로드 ──────────────────────────
  const handlePathSelect = async (p: RecoveryPath) => {
    if (!smartAccount) return;
    setPath(p);
    setIsLoading(true);
    try {
      const vaults = await getUserVaults(smartAccount.address);
      setWallets(vaults);
      if (vaults.length === 1) { setSelectedWallet(vaults[0]); setStep('input'); }
      else setStep('select_wallet');
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  // ── OTP 전송 ─────────────────────────────────────────────
  const handleSendOtp = async (target: 'phone' | 'email') => {
    setIsLoading(true); setError('');
    try {
      if (target === 'phone') {
        if (!phone.match(/^010\d{8}$/)) throw new Error('올바른 번호 입력');
        const { error } = await supabase.auth.signInWithOtp({ phone: `+82${phone.slice(1)}` });
        if (error) throw error;
      } else {
        if (!email.includes('@')) throw new Error('올바른 이메일 입력');
        const { error } = await supabase.auth.signInWithOtp({ 
  email,
  options: {
    shouldCreateUser: false, // 신규 가입 방지
  }
});
        if (error) throw error;
      }
      setOtpTarget(target);
      setStep('otp');
    } catch (e: any) { setError(e.message || 'OTP 전송 실패'); }
    finally { setIsLoading(false); }
  };

  // ── OTP 검증 ─────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const otp = otpTarget === 'phone' ? phoneOtp : emailOtp;
    if (otp.length !== 6) { setError('6자리 OTP 입력'); return; }
    setIsLoading(true); setError('');
    try {
      if (otpTarget === 'phone') {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: `+82${phone.slice(1)}`, token: phoneOtp, type: 'sms',
        });
        if (error || !data.session) throw new Error('OTP 인증 실패');
        setPhoneToken(data.session.access_token);
        // B+C면 이메일도 필요
        if (path === 'B+C') { setStep('input'); }
        else { await doRecover(data.session.access_token, emailToken); }
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          email, token: emailOtp, type: 'email',
        });
        if (error || !data.session) throw new Error('이메일 OTP 인증 실패');
        setEmailToken(data.session.access_token);
        // A+C면 바로 복구, B+C면 phoneToken이 이미 있음
        await doRecover(phoneToken, data.session.access_token);
      }
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  // ── 복구 실행 ─────────────────────────────────────────────
  const doRecover = async (pToken: string, eToken: string) => {
    if (!smartAccount || !selectedWallet) return;
    setStep('recovering');
    try {
      const vault = await loadVaultFromSupabase(smartAccount.address, selectedWallet.wallet_address);
      if (!vault) throw new Error('Vault를 찾을 수 없습니다');

      let shareX: any, shareY: any;

      if (path === 'A+B') {
        shareX = await decryptShareA({ iv: vault.share_a_iv, ciphertext: vault.share_a_ciphertext, salt: vault.share_a_salt }, password);
        shareY = await decryptShareB({ iv: vault.share_b_iv, ciphertext: vault.share_b_ciphertext, salt: vault.share_b_salt }, pToken);
      } else if (path === 'A+C') {
        shareX = await decryptShareA({ iv: vault.share_a_iv, ciphertext: vault.share_a_ciphertext, salt: vault.share_a_salt }, password);
        shareY = await decryptShareC({ iv: vault.share_c_iv, ciphertext: vault.share_c_ciphertext, salt: vault.share_c_salt }, eToken);
      } else { // B+C
        shareX = await decryptShareB({ iv: vault.share_b_iv, ciphertext: vault.share_b_ciphertext, salt: vault.share_b_salt }, pToken);
        shareY = await decryptShareC({ iv: vault.share_c_iv, ciphertext: vault.share_c_ciphertext, salt: vault.share_c_salt }, eToken);
      }

      const mnemonic = uint8ToString(combineShares([shareX, shareY]));
      const hdWallet = ethers.Wallet.fromPhrase(mnemonic);
      const wallet   = new ethers.Wallet(hdWallet.privateKey);

      if (wallet.address.toLowerCase() !== selectedWallet.evm_address.toLowerCase()) {
        throw new Error('복구된 주소가 일치하지 않습니다. 입력 정보를 확인하세요.');
      }
      setStep('done');
    } catch (e: any) {
      setError(e.message || '복구 실패');
      setStep('error');
    }
  };

  // ── input 단계에서 "다음" 처리 ────────────────────────────
  const handleInputNext = async () => {
    // B+C: 휴대폰 먼저
    if (path === 'B+C' && !phoneToken) { await handleSendOtp('phone'); return; }
    // B+C: 휴대폰 완료 후 이메일
    if (path === 'B+C' && phoneToken && !emailToken) { await handleSendOtp('email'); return; }
    // A+B: 휴대폰 OTP
    if (path === 'A+B') { await handleSendOtp('phone'); return; }
    // A+C: 이메일 OTP
    if (path === 'A+C') { await handleSendOtp('email'); return; }
  };

  const inputValid = () => {
    if (needsPassword && !password) return false;
    if (needsPhone && !phone) return false;
    if (needsEmail && path !== 'B+C' && !email) return false;
    if (path === 'B+C' && !phone && !email) return false;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t md:border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 pb-10 space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <KeyRound size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">지갑 복구</p>
              <p className="text-xs text-slate-500">2-of-3 Triple-Shield 복구</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* ══ 경로 선택 ══ */}
        {step === 'select_path' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">어떤 방법으로 복구하시겠습니까?</p>
            {(Object.entries(pathInfo) as [RecoveryPath, any][]).map(([key, info]) => (
              <button key={key} onClick={() => handlePathSelect(key)} disabled={isLoading}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left hover:border-slate-700 transition-all flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  {info.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{info.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{info.desc}</p>
                  <div className="flex gap-1.5 mt-1.5">
                    {info.needs.map((n: string) => (
                      <span key={n} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{n}</span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            ))}
          </div>
        )}

        {/* ══ 지갑 선택 ══ */}
        {step === 'select_wallet' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">복구할 지갑을 선택하세요</p>
            {wallets.map(w => (
              <button key={w.id} onClick={() => { setSelectedWallet(w); setStep('input'); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-left hover:border-slate-700 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                  <ShieldCheck size={14} className="text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{w.evm_address?.slice(0,8)}...{w.evm_address?.slice(-6)}</p>
                  <p className="text-[10px] text-slate-500">{new Date(w.created_at).toLocaleDateString()}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ══ 입력 단계 ══ */}
        {step === 'input' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <p className="text-[10px] text-slate-500">복구 경로: {pathInfo[path].title}</p>
              <p className="text-xs font-bold text-white mt-0.5">
                {selectedWallet?.evm_address?.slice(0,10)}...{selectedWallet?.evm_address?.slice(-8)}
              </p>
            </div>

            {needsPassword && (
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">비밀번호</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50"
                  placeholder="지갑 생성 시 설정한 비밀번호" />
              </div>
            )}

            {needsPhone && (
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">
                  휴대폰 번호 {path === 'B+C' && phoneToken && <span className="text-emerald-400">✓ 인증됨</span>}
                </label>
                <div className="flex gap-2">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-400 shrink-0">+82</div>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))}
                    disabled={path === 'B+C' && !!phoneToken}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50 disabled:opacity-50"
                    placeholder="01012345678" maxLength={11} />
                </div>
              </div>
            )}

            {needsEmail && (
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">이메일</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50"
                  placeholder="your@email.com" />
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button onClick={handleInputNext} disabled={isLoading || !inputValid()}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-amber-500 to-orange-500 disabled:opacity-40 transition-all">
              {isLoading
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>처리 중...</span>
                : 'OTP 전송'}
            </button>
          </div>
        )}

        {/* ══ OTP 입력 ══ */}
        {step === 'otp' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              {otpTarget === 'phone' ? `${phone}으로 발송된` : `${email}로 발송된`} 6자리
            </p>
            <input type="number"
              value={otpTarget === 'phone' ? phoneOtp : emailOtp}
              onChange={e => otpTarget === 'phone'
                ? setPhoneOtp(e.target.value.slice(0,6))
                : setEmailOtp(e.target.value.slice(0,6))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 text-2xl font-black text-white text-center outline-none focus:border-amber-500/50 tracking-widest"
              placeholder="000000" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={handleVerifyOtp}
              disabled={isLoading || (otpTarget === 'phone' ? phoneOtp : emailOtp).length !== 6}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-amber-500 to-orange-500 disabled:opacity-40">
              {isLoading
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>인증 중...</span>
                : '인증 확인'}
            </button>
          </div>
        )}

        {/* ══ 복구 중 ══ */}
        {step === 'recovering' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 size={36} className="animate-spin text-amber-400" />
            <p className="text-sm font-black text-white">복구 중...</p>
            <p className="text-xs text-slate-500">Share 결합 → Seed 복원 → 주소 검증</p>
          </div>
        )}

        {/* ══ 완료 ══ */}
        {step === 'done' && (
          <div className="space-y-4 py-4 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
                <Check size={28} className="text-emerald-400" />
              </div>
              <p className="text-lg font-black text-white">복구 완료!</p>
              <p className="text-xs text-slate-400">
                {selectedWallet?.evm_address?.slice(0,10)}...{selectedWallet?.evm_address?.slice(-8)}
              </p>
            </div>
            <button onClick={() => { onSuccess(); onClose(); }}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500">
              완료
            </button>
          </div>
        )}

        {/* ══ 에러 ══ */}
        {step === 'error' && (
          <div className="space-y-4 py-4 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <p className="text-sm font-black text-white">복구 실패</p>
              <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">{error}</p>
            </div>
            <button onClick={() => { setStep('select_path'); setError(''); setPhoneOtp(''); setEmailOtp(''); setPassword(''); }}
              className="w-full py-3 rounded-2xl font-bold text-sm text-white bg-slate-800 border border-slate-700">
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}