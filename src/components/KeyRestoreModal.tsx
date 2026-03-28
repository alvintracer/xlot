// ============================================================
// KeyRestoreModal.tsx — Import 키 SSS 복원 (2-of-3)
//
// 복구 경로 선택:
//   A+B: PIN + 휴대폰 OTP
//   A+C: PIN + 이메일 OTP
//   B+C: 휴대폰 OTP + 이메일 OTP
//
// 복원 완료 시 onRestored(keys) 콜백으로 키맵 반환
// ============================================================

import { useState } from 'react';
import {
  X, ShieldCheck, Phone, Mail, Lock,
  Loader2, Check, AlertCircle, ChevronRight,
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '../lib/supabase';
import type { ImportedKeyMap } from '../services/shareVaultService';
import {
  restoreImportedKeysFromVaultSSS,
  deriveShareKeyFromPhone,
  deriveShareKeyFromEmail,
} from '../services/shareVaultService';
import { SecureKeypad } from './SecureKeypad';

type RecoveryPath = 'A+B' | 'A+C' | 'B+C';
type Step = 'select_path' | 'input_a' | 'input_b' | 'input_c' | 'done' | 'error';

interface Props {
  walletAddress: string;           // 복원할 지갑 주소 (row 식별자)
  onRestored:    (keys: ImportedKeyMap) => void;
  onClose:       () => void;
}

export function KeyRestoreModal({ walletAddress, onRestored, onClose }: Props) {
  const smartAccount = useActiveAccount();

  const [path, setPath]       = useState<RecoveryPath | null>(null);
  const [step, setStep]       = useState<Step>('select_path');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]     = useState('');

  // Share A (PIN)
  const [pin, setPin]             = useState('');
  const [showKeypad, setShowKeypad] = useState(false);

  // Share B (휴대폰 OTP)
  const [phoneNum, setPhoneNum]   = useState('');
  const [phoneOtp, setPhoneOtp]   = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneToken, setPhoneToken] = useState('');

  // Share C (이메일 OTP)
  const [emailAddr, setEmailAddr] = useState('');
  const [emailOtp, setEmailOtp]   = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailToken, setEmailToken] = useState('');

  const userId = smartAccount?.address || '';

  // 경로 선택 후 첫 단계 시작
  const startPath = (p: RecoveryPath) => {
    setPath(p);
    setError('');
    if (p === 'A+B' || p === 'A+C') setStep('input_a');  // PIN 먼저
    else setStep('input_b');                               // B+C: 휴대폰 먼저
  };

  // Share A 완료 → 다음 단계
  const handlePinDone = (val: string) => {
    setPin(val); setShowKeypad(false);
    setStep(path === 'A+B' ? 'input_b' : 'input_c');
  };

  // Share B: 휴대폰 OTP 전송
  const handleSendPhone = async () => {
    setIsLoading(true); setError('');
    try {
      const f = phoneNum.startsWith('+') ? phoneNum : '+82' + phoneNum.replace(/^0/, '');
      const { error } = await supabase.auth.signInWithOtp({ phone: f });
      if (error) throw error;
      setPhoneOtpSent(true);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  // Share B: 휴대폰 OTP 검증
  const handleVerifyPhone = async (code: string) => {
    setIsLoading(true); setError('');
    try {
      const f = phoneNum.startsWith('+') ? phoneNum : '+82' + phoneNum.replace(/^0/, '');
      const { data, error } = await supabase.auth.verifyOtp({ phone: f, token: code, type: 'sms' });
      if (error) throw error;
      // 전화번호에서 결정론적 키 파생
      const pKey = await deriveShareKeyFromPhone(phoneNum);
      setPhoneToken(pKey);
      if (path === 'B+C') setStep('input_c');
      else await doRestore(pin, pKey, '');
    } catch (e: any) { setError('휴대폰 OTP 실패: ' + e.message); }
    finally { setIsLoading(false); }
  };

  // Share C: 이메일 OTP 전송
  const handleSendEmail = async () => {
    setIsLoading(true); setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailAddr });
      if (error) throw error;
      setEmailOtpSent(true);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  // Share C: 이메일 OTP 검증
  const handleVerifyEmail = async (code: string) => {
    setIsLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: emailAddr, token: code, type: 'email' });
      if (error) throw error;
      // 이메일에서 결정론적 키 파생
      const eKey = await deriveShareKeyFromEmail(emailAddr);
      setEmailToken(eKey);
      if (path === 'A+C') await doRestore(pin, '', eKey);
      else await doRestore('', phoneToken, eKey);  // B+C
    } catch (e: any) { setError('이메일 OTP 실패: ' + e.message); }
    finally { setIsLoading(false); }
  };

  // 실제 SSS 복원
  const doRestore = async (p: string, pt: string, et: string) => {
    setIsLoading(true); setError('');
    try {
      const keys = await restoreImportedKeysFromVaultSSS(userId, walletAddress, {
        pin:        p  || undefined,
        phoneToken: pt || undefined,
        emailToken: et || undefined,
      });
      if (!keys) throw new Error('2개 이상의 인증 수단이 일치하지 않습니다');
      setStep('done');
      onRestored(keys);
    } catch (e: any) { setError(e.message); setStep('error'); }
    finally { setIsLoading(false); }
  };

  return (
    <>
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t md:border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 pb-10 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck size={18} className="text-emerald-400"/>
            </div>
            <div>
              <p className="text-sm font-black text-white">Import 키 복원</p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {walletAddress.slice(0,8)}...{walletAddress.slice(-6)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
            <X size={16} className="text-slate-400"/>
          </button>
        </div>

        {/* ══ 경로 선택 ══ */}
        {step === 'select_path' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              키 저장 시 설정한 인증 수단 2가지를 선택하세요 (2-of-3)
            </p>
            {([
              { id: 'A+B', icon1: Lock, icon2: Phone, label: 'PIN + 휴대폰 OTP', desc: '비밀번호와 휴대폰으로 복원' },
              { id: 'A+C', icon1: Lock, icon2: Mail,  label: 'PIN + 이메일 OTP', desc: '비밀번호와 이메일로 복원' },
              { id: 'B+C', icon1: Phone, icon2: Mail, label: '휴대폰 + 이메일 OTP', desc: 'PIN 없이 휴대폰+이메일로 복원' },
            ] as { id: RecoveryPath; icon1: any; icon2: any; label: string; desc: string }[])
              .map(({ id, icon1: I1, icon2: I2, label, desc }) => (
                <button key={id} onClick={() => startPath(id)}
                  className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left hover:border-emerald-500/30 transition-all flex items-center gap-3">
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <I1 size={14} className="text-emerald-400"/>
                    </div>
                    <span className="text-slate-600 text-xs">+</span>
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <I2 size={14} className="text-cyan-400"/>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{label}</p>
                    <p className="text-[10px] text-slate-500">{desc}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-600"/>
                </button>
              ))
            }
          </div>
        )}

        {/* ══ Share A: PIN ══ */}
        {step === 'input_a' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
              <p className="font-bold text-white mb-1 flex items-center gap-2"><Lock size={12}/> Share A — PIN</p>
              <p>Import 저장 시 설정한 PIN을 입력하세요</p>
            </div>
            <button onClick={() => setShowKeypad(true)}
              className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-emerald-500/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock size={16} className="text-slate-400"/>
                <p className="text-sm font-bold text-white">
                  {pin ? `PIN 입력됨 (${pin.length}자리)` : '보안 키패드로 PIN 입력'}
                </p>
              </div>
              {pin ? <Check size={14} className="text-emerald-400"/> : <ChevronRight size={14} className="text-slate-600"/>}
            </button>
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
          </div>
        )}

        {/* ══ Share B: 휴대폰 OTP ══ */}
        {step === 'input_b' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
              <p className="font-bold text-white mb-1 flex items-center gap-2"><Phone size={12}/> Share B — 휴대폰 OTP</p>
              <p>Import 저장 시 인증한 휴대폰 번호로 인증하세요</p>
            </div>
            <input value={phoneNum} onChange={e => setPhoneNum(e.target.value)}
              placeholder="010-1234-5678"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>
            {!phoneOtpSent ? (
              <button onClick={handleSendPhone} disabled={isLoading || !phoneNum}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl font-bold text-sm text-white disabled:opacity-40">
                {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>전송 중...</span> : 'OTP 전송'}
              </button>
            ) : phoneToken ? (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                <Check size={12}/> 휴대폰 인증 완료
              </div>
            ) : (
              <input placeholder="인증번호 6자리" maxLength={6}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white text-center font-mono outline-none focus:border-emerald-500/50"
                onChange={e => { if (e.target.value.length === 6) handleVerifyPhone(e.target.value); }}/>
            )}
            {isLoading && <div className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin text-emerald-400"/><span className="text-sm text-slate-400">복원 중...</span></div>}
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
          </div>
        )}

        {/* ══ Share C: 이메일 OTP ══ */}
        {step === 'input_c' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
              <p className="font-bold text-white mb-1 flex items-center gap-2"><Mail size={12}/> Share C — 이메일 OTP</p>
              <p>Import 저장 시 인증한 이메일로 인증하세요</p>
            </div>
            <input value={emailAddr} onChange={e => setEmailAddr(e.target.value)}
              type="email" placeholder="your@email.com"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>
            {!emailOtpSent ? (
              <button onClick={handleSendEmail} disabled={isLoading || !emailAddr}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl font-bold text-sm text-white disabled:opacity-40">
                {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>전송 중...</span> : '이메일 OTP 전송'}
              </button>
            ) : emailToken ? (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                <Check size={12}/> 이메일 인증 완료
              </div>
            ) : (
              <input placeholder="인증번호 6자리" maxLength={6}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white text-center font-mono outline-none focus:border-emerald-500/50"
                onChange={e => { if (e.target.value.length === 6) handleVerifyEmail(e.target.value); }}/>
            )}
            {isLoading && <div className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin text-emerald-400"/><span className="text-sm text-slate-400">복원 중...</span></div>}
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
          </div>
        )}

        {/* ══ 완료 ══ */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/30 flex items-center justify-center">
              <Check size={28} className="text-emerald-400"/>
            </div>
            <p className="text-base font-black text-white">키 복원 완료</p>
            <p className="text-xs text-slate-400">복원된 키가 전달되었습니다</p>
            <button onClick={onClose}
              className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500">
              닫기
            </button>
          </div>
        )}

        {/* ══ 오류 ══ */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertCircle size={32} className="text-red-400"/>
              <p className="text-sm font-bold text-red-400">복원 실패</p>
              <p className="text-xs text-slate-400">{error}</p>
            </div>
            <button onClick={() => { setStep('select_path'); setPath(null); setError(''); setPin(''); setPhoneToken(''); setEmailToken(''); setPhoneOtpSent(false); setEmailOtpSent(false); }}
              className="w-full py-3 rounded-xl font-bold text-sm text-white bg-slate-800 border border-slate-700">
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>

    {/* PIN 키패드 */}
    {showKeypad && (
      <SecureKeypad
        title="PIN 입력"
        description="Import 저장 시 설정한 PIN"
        onClose={() => setShowKeypad(false)}
        onComplete={handlePinDone}
      />
    )}
    </>
  );
}