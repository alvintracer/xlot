// ============================================================
// SSSSigningModal.tsx — XLOT_SSS 서명 인증 모달
//
// 복구 경로:
//   A+B: 비밀번호 + 휴대폰 OTP  (기본)
//   A+C: 비밀번호 + 이메일 OTP
//   B+C: 휴대폰 OTP + 이메일 OTP (비밀번호 분실 시)
// ============================================================

import { useState, useEffect } from 'react';
import { X, Lock, Loader2, Eye, EyeOff, Phone, Mail, AlertCircle, ChevronRight } from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { ethers } from 'ethers';
import { supabase } from '../lib/supabase';

import { combineShares, uint8ToString } from '../services/sssService';
import {
  decryptShareA, decryptShareB, decryptShareC,
  loadVaultFromSupabase,
  deriveShareKeyFromPhone, deriveShareKeyFromEmail,
} from '../services/shareVaultService';

export interface SSSSigningResult {
  wallet:   ethers.Wallet;
  mnemonic: string;  // SOL/TRX/BTC 키 파생용
  cleanup:  () => void;
}

interface Props {
  walletAddress: string;
  /** 익스텐션 서명 팝업에서 useActiveAccount()가 null일 때 사용할 스마트 계정 주소 */
  smartAccountAddress?: string;
  purpose:       string;
  onSigned:      (result: SSSSigningResult) => void;
  onCancel:      () => void;
}

type SignPath = 'A+B' | 'A+C' | 'B+C';
type Step = 'select' | 'input' | 'otp' | 'unlocking' | 'error';

export function SSSSigningModal({ walletAddress, smartAccountAddress, purpose, onSigned, onCancel }: Props) {
  const smartAccount = useActiveAccount();
  // 익스텐션 서명 팝업에서 AutoConnect 가 아직 완료되지 않았을 때 fallback
  const userId = smartAccount?.address ?? smartAccountAddress ?? '';

  const [step, setStep]         = useState<Step>('select');
  const [path, setPath]         = useState<SignPath>('A+B');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [phone, setPhone]       = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneToken, setPhoneToken] = useState('');
  const [email, setEmail]       = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [otpTarget, setOtpTarget] = useState<'phone'|'email'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState('');

  const pathInfo = {
    'A+B': { label: '비밀번호 + 휴대폰', icon: <Lock size={16} className="text-cyan-400"/> },
    'A+C': { label: '비밀번호 + 이메일', icon: <Mail size={16} className="text-cyan-400"/> },
    'B+C': { label: '휴대폰 + 이메일',   icon: <Phone size={16} className="text-emerald-400"/> },
  };

  const handleSendOtp = async (target: 'phone' | 'email') => {
    setIsLoading(true); setError('');
    try {
      if (target === 'phone') {
        const { error } = await supabase.auth.signInWithOtp({ phone: `+82${phone.slice(1)}` });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
      }
      setOtpTarget(target);
      setStep('otp');
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  const handleVerifyAndSign = async () => {
    const otp = otpTarget === 'phone' ? phoneOtp : emailOtp;
    if (otp.length !== 6) { setError('6자리 OTP 입력'); return; }
    if (!userId) { setError('계정 연결이 필요합니다'); return; }
    setIsLoading(true); setError('');
    setStep('unlocking');

    try {
      let latestKey = '';
      if (otpTarget === 'phone') {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: `+82${phone.slice(1)}`, token: phoneOtp, type: 'sms',
        });
        if (error || !data.session) throw new Error('휴대폰 OTP 인증 실패');
        
        const pKey = await deriveShareKeyFromPhone(phone);
        latestKey = pKey;
        setPhoneToken(pKey);

        // B+C이면 이메일도 필요 → 이메일 OTP 전송으로 이동
        if (path === 'B+C') {
          setStep('input');
          setIsLoading(false);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          email, token: emailOtp, type: 'email',
        });
        if (error || !data.session) throw new Error('이메일 OTP 인증 실패');
        
        const eKey = await deriveShareKeyFromEmail(email);
        latestKey = eKey;
      }

      await doSign(latestKey);
    } catch (e: any) {
      setError(e.message || '인증 실패');
      setStep('error');
    } finally { setIsLoading(false); }
  };

  const doSign = async (latestKey: string) => {
    if (!userId) return;
    const vault = await loadVaultFromSupabase(userId, walletAddress);
    if (!vault) throw new Error('Vault를 찾을 수 없습니다');

    let shareX: any, shareY: any;
    if (path === 'A+B') {
      shareX = await decryptShareA({ iv: vault.share_a_iv, ciphertext: vault.share_a_ciphertext, salt: vault.share_a_salt }, password);
      shareY = await decryptShareB({ iv: vault.share_b_iv, ciphertext: vault.share_b_ciphertext, salt: vault.share_b_salt }, latestKey);
    } else if (path === 'A+C') {
      shareX = await decryptShareA({ iv: vault.share_a_iv, ciphertext: vault.share_a_ciphertext, salt: vault.share_a_salt }, password);
      shareY = await decryptShareC({ iv: vault.share_c_iv, ciphertext: vault.share_c_ciphertext, salt: vault.share_c_salt }, latestKey);
    } else { // B+C
      shareX = await decryptShareB({ iv: vault.share_b_iv, ciphertext: vault.share_b_ciphertext, salt: vault.share_b_salt }, phoneToken);
      shareY = await decryptShareC({ iv: vault.share_c_iv, ciphertext: vault.share_c_ciphertext, salt: vault.share_c_salt }, latestKey);
    }

    const mnemonic = uint8ToString(combineShares([shareX, shareY]));
    const hd = ethers.Wallet.fromPhrase(mnemonic);
    const wallet = new ethers.Wallet(hd.privateKey);

    if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('인증 정보가 올바르지 않습니다');
    }

    onSigned({ wallet, mnemonic, cleanup: () => { setPassword(''); setPhoneOtp(''); setEmailOtp(''); } });
  };

  const handleInputNext = async () => {
    if (path === 'A+B') { await handleSendOtp('phone'); return; }
    if (path === 'A+C') { await handleSendOtp('email'); return; }
    if (path === 'B+C') {
      if (!phoneToken) { await handleSendOtp('phone'); return; }
      await handleSendOtp('email');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t border-slate-800 rounded-t-3xl p-6 pb-10 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Lock size={18} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">서명 인증</p>
              <p className="text-xs text-slate-500">took SAR 지갑 잠금 해제</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* 트랜잭션 요약 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <p className="text-[10px] text-slate-500 mb-1">서명할 트랜잭션</p>
          <p className="text-xs font-bold text-white">{purpose}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            {walletAddress.slice(0,10)}...{walletAddress.slice(-8)}
          </p>
        </div>

        {/* ══ 방법 선택 ══ */}
        {step === 'select' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">인증 방법 선택</p>
            {(Object.entries(pathInfo) as [SignPath, any][]).map(([key, info]) => (
              <button key={key} onClick={() => { setPath(key); setStep('input'); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left hover:border-cyan-500/40 transition-all flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  {info.icon}
                </div>
                <p className="text-sm font-bold text-white">{info.label}</p>
                <ChevronRight size={14} className="text-slate-600 ml-auto" />
              </button>
            ))}
          </div>
        )}

        {/* ══ 입력 단계 ══ */}
        {step === 'input' && (
          <div className="space-y-4">
            {(path === 'A+B' || path === 'A+C') && (
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">비밀번호</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInputNext()}
                    autoFocus
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 pr-12"
                    placeholder="비밀번호 입력" />
                  <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
            )}

            {(path === 'A+B' || path === 'B+C') && (
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">
                  휴대폰 번호 {path === 'B+C' && phoneToken && <span className="text-emerald-400 ml-1">✓ 인증됨</span>}
                </label>
                <div className="flex gap-2">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-400 shrink-0">+82</div>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))}
                    disabled={path === 'B+C' && !!phoneToken}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 disabled:opacity-50"
                    placeholder="01012345678" maxLength={11} />
                </div>
              </div>
            )}

            {(path === 'A+C' || (path === 'B+C' && phoneToken)) && (
              <div>
                <label className="text-xs text-slate-400 font-bold mb-1 block">이메일</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50"
                  placeholder="your@email.com" />
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button onClick={handleInputNext} disabled={isLoading}
              className="w-full py-3.5 rounded-2xl font-black text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40">
              {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>전송 중...</span> : 'OTP 전송'}
            </button>

            <button onClick={() => { setStep('select'); setError(''); }}
              className="w-full text-xs text-slate-500 hover:text-slate-300">다른 방법으로</button>
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
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 text-2xl font-black text-white text-center outline-none focus:border-cyan-500/50 tracking-widest"
              placeholder="000000" autoFocus />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={handleVerifyAndSign}
              disabled={isLoading || (otpTarget === 'phone' ? phoneOtp : emailOtp).length !== 6}
              className="w-full py-3.5 rounded-2xl font-black text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40">
              {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>인증 중...</span> : '잠금 해제'}
            </button>
          </div>
        )}

        {/* ══ 잠금 해제 중 ══ */}
        {step === 'unlocking' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 size={32} className="animate-spin text-cyan-400" />
            <p className="text-sm font-black text-white">잠금 해제 중...</p>
            <p className="text-xs text-slate-500">Share 복원 → 서명 준비</p>
          </div>
        )}

        {/* ══ 에러 ══ */}
        {step === 'error' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm font-black text-white">인증 실패</p>
            <p className="text-xs text-slate-400">{error}</p>
            <button onClick={() => { setStep('select'); setError(''); }}
              className="w-full py-3 rounded-2xl font-bold text-sm text-white bg-slate-800 border border-slate-700">
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}