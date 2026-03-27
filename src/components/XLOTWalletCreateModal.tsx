// ============================================================
// XLOTWalletCreateModal.tsx
// Triple-Shield SSS 비수탁 지갑 생성
//
// STEP 1: 비밀번호 설정     (Share A factor)
// STEP 2: 계정 연결         (Thirdweb — user_id 확보)
// STEP 3: 휴대폰 OTP        (Share B factor)
// STEP 4: 이메일 OTP        (Share C factor)
// STEP 5: 지갑 생성         (SSS 분할 + 3 share 암호화 + Supabase 저장)
// STEP 6: 니모닉 확인       (선택)
// ============================================================

import { useState, useEffect } from 'react';
import {
  X, ShieldCheck, Phone, Mail, Lock, Eye, EyeOff,
  Loader2, Check, AlertCircle, KeyRound, Copy, Zap
} from 'lucide-react';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { ConnectButton } from 'thirdweb/react';
import { client } from '../client';
import { inAppWallet } from 'thirdweb/wallets';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';

import { splitSecret, stringToUint8 } from '../services/sssService';
import {
  encryptShareA, encryptShareB, encryptShareC,
  saveVaultToSupabase, validatePassword,
} from '../services/shareVaultService';
import { deriveMultiChainAddresses } from '../services/multiChainDerive';
import { addSSSWallet } from '../services/walletService';

const wallets = [
  inAppWallet({
    auth: { options: ['google', 'apple', 'email'] },
    metadata: { name: 'xLOT Wallet', image: undefined },
  }),
];

type Step = 'password' | 'account' | 'phone' | 'phone_otp' | 'email' | 'email_otp' | 'creating' | 'mnemonic' | 'done';

interface Props {
  onClose:    () => void;
  onSuccess:  () => void;
  loginMode?: boolean;
}

export function XLOTWalletCreateModal({ onClose, onSuccess, loginMode = false }: Props) {
  const smartAccount = useActiveAccount();
  const activeWallet = useActiveWallet();

  const [step, setStep]                 = useState<Step>('password');
  const [password, setPassword]         = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [phone, setPhone]               = useState('');
  const [phoneOtp, setPhoneOtp]         = useState('');
  const [phoneToken, setPhoneToken]     = useState('');
  const [email, setEmail]               = useState('');
  const [emailOtp, setEmailOtp]         = useState('');
  const [emailToken, setEmailToken]     = useState('');
  const [walletLabel, setWalletLabel]   = useState('내 xLOT 지갑');
  const [mnemonic, setMnemonic]         = useState('');
  const [mnemonicRevealed, setMnemonicRevealed] = useState(false);
  const [copied, setCopied]             = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState('');

  const pwCheck = validatePassword(password);
  const pwMatch = password === passwordConfirm;
  const canNextPw = pwCheck.valid && pwMatch;

  // smartAccount 연결 시 → 이메일 자동 추출 + 다음 단계
  useEffect(() => {
    if (smartAccount && step === 'account') {
      // Thirdweb inAppWallet에서 로그인 이메일 가져오기
      // Apple Private Relay가 아닐 때만 자동 입력
      try {
        const walletAccount = activeWallet?.getAccount?.();
        // activeWallet.id로 inAppWallet 확인
        if (activeWallet?.id === 'inApp') {
          // Thirdweb은 직접 이메일 노출 안 함 → smartAccount 연결만 확인
          // 이메일은 사용자가 직접 입력 (Thirdweb 계정 이메일 != Share C 이메일일 수 있음)
        }
      } catch {}
      setStep('phone');
    }
  }, [smartAccount, step, activeWallet]);

  const strengthColors = ['bg-red-500','bg-orange-500','bg-yellow-500','bg-emerald-500','bg-emerald-500'];
  const strengthLabels = ['매우 약함','약함','보통','강함','매우 강함'];

  // ── 진행 단계 표시용 ─────────────────────────────────────
  const STEPS: Step[] = ['password','account','phone','phone_otp','email','email_otp','creating','mnemonic'];
  const stepIdx = STEPS.indexOf(step);

  // ── 휴대폰 OTP 전송 ──────────────────────────────────────
  const handleSendPhoneOtp = async () => {
    if (!phone.match(/^010\d{8}$/)) { setError('올바른 휴대폰 번호 입력 (010XXXXXXXX)'); return; }
    setIsLoading(true); setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: `+82${phone.slice(1)}` });
      if (error) throw error;
      setStep('phone_otp');
    } catch (e: any) { setError(e.message || 'OTP 전송 실패'); }
    finally { setIsLoading(false); }
  };

  // ── 휴대폰 OTP 검증 ──────────────────────────────────────
  const handleVerifyPhoneOtp = async () => {
    if (phoneOtp.length !== 6) { setError('6자리 OTP 입력'); return; }
    setIsLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: `+82${phone.slice(1)}`, token: phoneOtp, type: 'sms',
      });
      if (error || !data.session) throw new Error('OTP 인증 실패');
      setPhoneToken(data.session.access_token);
      setStep('email');
    } catch (e: any) { setError(e.message || 'OTP 인증 실패'); }
    finally { setIsLoading(false); }
  };

  // ── 이메일 OTP 전송 ──────────────────────────────────────
  const handleSendEmailOtp = async () => {
    if (!email.includes('@')) { setError('올바른 이메일 주소 입력'); return; }
    setIsLoading(true); setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setStep('email_otp');
    } catch (e: any) { setError(e.message || '이메일 OTP 전송 실패'); }
    finally { setIsLoading(false); }
  };

  // ── 이메일 OTP 검증 + 지갑 생성 ──────────────────────────
  const handleVerifyEmailAndCreate = async () => {
    if (emailOtp.length !== 6) { setError('6자리 OTP 입력'); return; }
    if (!smartAccount) { setError('계정 연결이 필요합니다'); return; }
    setIsLoading(true); setError('');
    setStep('creating');
    try {
      // 1. 이메일 OTP 검증
      const { data, error } = await supabase.auth.verifyOtp({
        email, token: emailOtp, type: 'email',
      });
      if (error || !data.session) throw new Error('이메일 OTP 인증 실패');
      const emailSessionToken = data.session.access_token;

      // 2. 니모닉 생성 + 멀티체인 주소 파생
      const tempWallet  = ethers.Wallet.createRandom();
      const mnemonicPhrase = tempWallet.mnemonic!.phrase;
      const addrs       = await deriveMultiChainAddresses(mnemonicPhrase);

      // 3. SSS 3 share 분할
      const [shareA, shareB, shareC] = splitSecret(stringToUint8(mnemonicPhrase), 3, 2);

      // 4. 각 share 암호화
      const [shareAEnc, shareBEnc, shareCEnc] = await Promise.all([
        encryptShareA(shareA, password),
        encryptShareB(shareB, phoneToken),
        encryptShareC(shareC, emailSessionToken),
      ]);

      // 5. Supabase 저장
      await saveVaultToSupabase(
        smartAccount.address,
        addrs.evm,
        shareAEnc,
        shareBEnc,
        shareCEnc,
        { evm: addrs.evm, sol: addrs.sol },
      );

      // 6. user_wallets 등록 — EVM/SOL/BTC/TRX 주소 한 번에 저장
      await addSSSWallet(smartAccount.address, addrs, walletLabel);

      setMnemonic(mnemonicPhrase);
      setStep('mnemonic');
    } catch (e: any) {
      setError(e.message || '지갑 생성 실패');
      setStep('email_otp');
    } finally { setIsLoading(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    setMnemonic(''); setPassword(''); setPasswordConfirm('');
    setPhoneToken(''); setEmailToken('');
    onSuccess(); onClose();
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t md:border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 pb-10 space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar md:max-h-[85vh]">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <ShieldCheck size={18} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">xLOT 비수탁 지갑 생성</p>
              <p className="text-xs text-slate-500">Triple-Shield · 2-of-3 복구</p>
            </div>
          </div>
          {step !== 'creating' && (
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
              <X size={16} className="text-slate-400" />
            </button>
          )}
        </div>

        {/* 진행 바 */}
        {!['done','creating'].includes(step) && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {STEPS.slice(0, -1).map((s, i) => (
                <div key={s} className={`flex-1 h-1 rounded-full transition-all ${
                  i <= stepIdx ? 'bg-cyan-400' : 'bg-slate-800'
                }`} />
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-slate-600 px-0.5">
              <span>비밀번호</span><span>계정</span><span>휴대폰</span><span>이메일</span><span>완료</span>
            </div>
          </div>
        )}

        {/* ══ STEP 1: 비밀번호 ══ */}
        {step === 'password' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-white mb-1">비밀번호 설정</p>
              <p className="text-xs text-slate-500">이 비밀번호가 Share A가 됩니다. 절대 잊지 마세요.</p>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold mb-1 block">지갑 이름</label>
              <input value={walletLabel} onChange={e => setWalletLabel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50"
                placeholder="내 xLOT 지갑" />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold mb-1 block">비밀번호</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 pr-12"
                  placeholder="8자 이상, 대소문자+숫자+특수문자" />
                <button onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full ${i < pwCheck.score ? strengthColors[pwCheck.score] : 'bg-slate-800'}`} />
                    ))}
                  </div>
                  <p className={`text-[10px] ${pwCheck.valid ? 'text-emerald-400' : 'text-orange-400'}`}>
                    {strengthLabels[pwCheck.score]} — {pwCheck.feedback}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold mb-1 block">비밀번호 확인</label>
              <input type="password" value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                className={`w-full bg-slate-900 border rounded-xl px-4 py-3 text-sm text-white outline-none ${
                  passwordConfirm && !pwMatch ? 'border-red-500/50' : 'border-slate-800 focus:border-cyan-500/50'
                }`} placeholder="비밀번호 재입력" />
              {passwordConfirm && !pwMatch && (
                <p className="text-[10px] text-red-400 mt-1">비밀번호가 일치하지 않습니다</p>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-[10px] text-amber-300 leading-relaxed">
                ⚠️ 비밀번호는 xLOT 서버에 저장되지 않습니다. 분실 시 휴대폰 + 이메일로 복구 가능합니다.
              </p>
            </div>

            <button onClick={() => setStep('account')} disabled={!canNextPw}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40 transition-all">
              다음 — 계정 연결
            </button>
          </div>
        )}

        {/* ══ STEP 2: Thirdweb 계정 연결 ══ */}
        {step === 'account' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-white mb-1">계정 연결</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                복구 데이터를 안전하게 보관하기 위한 계정이에요.<br/>
                이 계정은 자산 보관이 아닌 <span className="text-cyan-400 font-bold">신원 확인 용도</span>로만 사용됩니다.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
              <Zap size={16} className="text-cyan-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                구글, 애플, 이메일 중 편한 방법으로 연결하세요. 이 계정 정보는 암호화 키 파생에는 사용되지 않으며, 지갑 복구 시 신원 확인 수단이 됩니다.
              </p>
            </div>

            {smartAccount ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
                <Check size={16} className="text-emerald-400" />
                <div>
                  <p className="text-xs font-bold text-emerald-300">계정 연결됨</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {smartAccount.address.slice(0,10)}...{smartAccount.address.slice(-8)}
                  </p>
                </div>
              </div>
            ) : (
              <ConnectButton
                client={client}
                wallets={wallets}
                connectModal={{
                  size: 'compact',
                  title: '계정 연결',
                  showThirdwebBranding: false,
                }}
                connectButton={{
                  label: '구글 · 애플 · 이메일로 연결',
                  className: '!w-full !py-4 !rounded-2xl !text-sm !font-bold !text-white !bg-gradient-to-r !from-slate-700 !to-slate-600 !border !border-slate-600 !transition-all',
                }}
              />
            )}

            {smartAccount && (
              <button onClick={() => setStep('phone')}
                className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 transition-all">
                다음 — 휴대폰 인증
              </button>
            )}
          </div>
        )}

        {/* ══ STEP 3: 휴대폰 번호 ══ */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-white mb-1">휴대폰 인증</p>
              <p className="text-xs text-slate-500">Share B — 이 번호가 복구 수단이 됩니다.</p>
            </div>
            <div className="flex gap-2">
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-400 shrink-0">+82</div>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50"
                placeholder="01012345678" maxLength={11} />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={handleSendPhoneOtp} disabled={isLoading || phone.length < 10}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40 transition-all">
              {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>전송 중...</span> : 'OTP 전송'}
            </button>
          </div>
        )}

        {/* ══ STEP 3-OTP: 휴대폰 OTP 입력 ══ */}
        {step === 'phone_otp' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-white mb-1">휴대폰 인증번호</p>
              <p className="text-xs text-slate-500">{phone}으로 발송된 6자리</p>
            </div>
            <input type="number" value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.slice(0,6))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 text-2xl font-black text-white text-center outline-none focus:border-cyan-500/50 tracking-widest"
              placeholder="000000" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={handleVerifyPhoneOtp} disabled={isLoading || phoneOtp.length !== 6}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40">
              {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>인증 중...</span> : '인증 확인'}
            </button>
            <button onClick={() => { setStep('phone'); setPhoneOtp(''); setError(''); }}
              className="w-full text-xs text-slate-500 hover:text-slate-300">번호 다시 입력</button>
          </div>
        )}

        {/* ══ STEP 4: 이메일 ══ */}
        {step === 'email' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-white mb-1">이메일 인증</p>
              <p className="text-xs text-slate-500">Share C — 두 번째 복구 수단이 됩니다.</p>
            </div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50"
              placeholder="your@email.com" autoFocus />
            <p className="text-[10px] text-slate-500">
              💡 구글로 로그인하셨다면 구글 이메일을 그대로 입력하셔도 됩니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-start gap-2">
              <Mail size={13} className="text-cyan-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-slate-400">
                복구 시 이 이메일로 OTP가 발송됩니다. 계정 연결 이메일과 달라도 됩니다.
              </p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-300/80 leading-relaxed">
                Apple Private Relay 주소(@privaterelay.appleid.com)는 OTP 수신이 안 될 수 있어요.
                실제 이메일 주소를 입력해 주세요.
              </p>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={handleSendEmailOtp} disabled={isLoading || !email.includes('@')}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40 transition-all">
              {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>전송 중...</span> : '이메일 OTP 전송'}
            </button>
          </div>
        )}

        {/* ══ STEP 4-OTP: 이메일 OTP 입력 ══ */}
        {step === 'email_otp' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-white mb-1">이메일 인증번호</p>
              <p className="text-xs text-slate-500">{email}으로 발송된 6자리</p>
            </div>
            <input type="number" value={emailOtp} onChange={e => setEmailOtp(e.target.value.slice(0,6))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 text-2xl font-black text-white text-center outline-none focus:border-cyan-500/50 tracking-widest"
              placeholder="000000" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={handleVerifyEmailAndCreate} disabled={isLoading || emailOtp.length !== 6}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40">
              {isLoading
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>인증 중...</span>
                : '인증 및 지갑 생성'}
            </button>
            <button onClick={() => { setStep('email'); setEmailOtp(''); setError(''); }}
              className="w-full text-xs text-slate-500 hover:text-slate-300">이메일 다시 입력</button>
          </div>
        )}

        {/* ══ 생성 중 ══ */}
        {step === 'creating' && (
          <div className="flex flex-col items-center gap-5 py-10">
            <Loader2 size={36} className="animate-spin text-cyan-400" />
            <div className="text-center space-y-1">
              <p className="text-sm font-black text-white">지갑 생성 중...</p>
              <p className="text-xs text-slate-500">니모닉 생성 → SSS 3분할 → 암호화 → 저장</p>
            </div>
            <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 text-[10px] text-slate-500">
              <p>✓ Share A — 비밀번호로 암호화</p>
              <p>✓ Share B — 휴대폰 OTP로 암호화</p>
              <p>✓ Share C — 이메일 OTP로 암호화</p>
            </div>
          </div>
        )}

        {/* ══ STEP 6: 니모닉 확인 ══ */}
        {step === 'mnemonic' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-black text-amber-300">복구 니모닉 (선택 백업)</p>
                <p className="text-[10px] text-amber-200/70 mt-0.5">
                  비밀번호+휴대폰+이메일 중 2개로 복구 가능하지만, 추가 백업이 필요하다면 지금 안전한 곳에 기록하세요.
                </p>
              </div>
            </div>

            {!mnemonicRevealed ? (
              <button onClick={() => setMnemonicRevealed(true)}
                className="w-full py-4 rounded-2xl border border-slate-700 bg-slate-900 text-sm font-bold text-slate-300 flex items-center justify-center gap-2 hover:border-slate-600">
                <KeyRound size={16} /> 니모닉 보기 (선택사항)
              </button>
            ) : (
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {mnemonic.split(' ').map((word, i) => (
                    <div key={i} className="bg-slate-800 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-500 w-4 shrink-0">{i+1}.</span>
                      <span className="text-xs font-bold text-white">{word}</span>
                    </div>
                  ))}
                </div>
                <button onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white py-2 border border-slate-700 rounded-xl transition-colors">
                  {copied ? <><Check size={12} className="text-emerald-400"/>복사됨</> : <><Copy size={12}/>클립보드 복사</>}
                </button>
              </div>
            )}

            <button onClick={handleDone}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500 transition-all">
              완료 — 지갑 사용 시작
            </button>
          </div>
        )}
      </div>
    </div>
  );
}