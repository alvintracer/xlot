// ============================================================
// KYCRegistrationModal.tsx — 통합 KYC 등록/복원
//
// 모드:
//   'register' — 신규 등록 (이름+생년월일+휴대폰OTP+PIN)
//   'restore'  — 다른 기기에서 vault로 복원 (vault비밀번호+로컬PIN)
//
// 완료 시:
//   1. 로컬 localStorage에 AES-256(PIN) 저장
//   2. vaultService에 동기화 (기기간 공유)
//   3. user_credentials에 NON_SANCTIONED ACTIVE 기록 (배지용)
// ============================================================

import { useState } from 'react';
import {
  X, User, Globe, Calendar, Phone, Lock,
  ShieldCheck, Loader2, Check, AlertCircle,
  CloudDownload, UserCheck,
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '../lib/supabase';
import type { KYCDeviceData } from '../services/kycDeviceService';
import {
  saveKYCToDevice, syncKYCToVault, restoreKYCFromVault,
  recordKYCCompletion,
} from '../services/kycDeviceService';
import { SecureKeypad } from './SecureKeypad';

interface Props {
  onClose:   () => void;
  onSuccess: (data: KYCDeviceData) => void;
  defaultMode?: 'register' | 'restore';
}

type Mode = 'select' | 'register' | 'restore';
type RegStep = 'info' | 'phone' | 'pin' | 'vault_pin' | 'done';

export function KYCRegistrationModal({ onClose, onSuccess, defaultMode }: Props) {
  const smartAccount = useActiveAccount();

  const [mode, setMode]           = useState<Mode>(defaultMode || 'select');
  const [regStep, setRegStep]     = useState<RegStep>('info');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');

  // 정보 입력
  const [nameKo, setNameKo] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [dob, setDob]       = useState('');
  const [phone, setPhone]   = useState('');

  // OTP
  const [otp, setOtp]           = useState('');
  const [otpSent, setOtpSent]   = useState(false);

  // PIN (SecureKeypad)
  const [pin, setPin]             = useState('');
  const [vaultPin, setVaultPin]   = useState('');
  const [showKeypad, setShowKeypad] = useState<
    'pin' | 'vault_pin' | 'restore_vault' | 'restore_local' | null
  >(null);

  // 복원 모드
  const [restoreVaultPass, setRestoreVaultPass] = useState('');
  const [restoreLocalPin,  setRestoreLocalPin]  = useState('');
  const [restoredData,     setRestoredData]     = useState<KYCDeviceData | null>(null);

  const userId = smartAccount?.address || '';

  // ── 정보 입력 검증 ────────────────────────────────────────
  const handleInfoNext = () => {
    setError('');
    if (!nameKo.trim())                        { setError('한국 실명을 입력해주세요'); return; }
    if (!nameEn.trim())                        { setError('영문명을 입력해주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob))    { setError('생년월일 형식: YYYY-MM-DD'); return; }
    if (!phone.trim())                         { setError('휴대폰 번호를 입력해주세요'); return; }
    setRegStep('phone');
  };

  // ── OTP 전송 ──────────────────────────────────────────────
  const handleSendOtp = async () => {
    setIsLoading(true); setError('');
    try {
      const formatted = phone.startsWith('+') ? phone : '+82' + phone.replace(/^0/,'');
      const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
      if (error) throw error;
      setOtpSent(true);
    } catch (e: any) { setError(e.message || 'OTP 전송 실패'); }
    finally { setIsLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('6자리 OTP를 입력해주세요'); return; }
    setIsLoading(true); setError('');
    try {
      const formatted = phone.startsWith('+') ? phone : '+82' + phone.replace(/^0/,'');
      const { error } = await supabase.auth.verifyOtp({ phone: formatted, token: otp, type: 'sms' });
      if (error) throw error;
      setRegStep('pin');
    } catch (e: any) { setError(e.message || 'OTP 인증 실패'); }
    finally { setIsLoading(false); }
  };

  // ── PIN + Vault 비밀번호 → 저장 ──────────────────────────
  const handlePinComplete = (val: string) => {
    setPin(val);
    setShowKeypad(null);
    // pin이 채워졌으면 vault_pin으로 넘어감
    setRegStep('vault_pin');
  };

  const handleVaultPinComplete = async (val: string) => {
    setVaultPin(val);
    setShowKeypad(null);
    await handleSave(pin, val);
  };

  const handleSave = async (localPin: string, vaultPass: string) => {
    if (!userId) { setError('지갑 연결이 필요합니다'); return; }
    setIsLoading(true); setError('');
    try {
      const data: KYCDeviceData = {
        nameKo: nameKo.trim(),
        nameEn: nameEn.trim(),
        dob,
        phone,
        verified: true,
        savedAt:  Date.now(),
      };
      // 1. 로컬 저장
      await saveKYCToDevice(userId, data, localPin);
      // 2. Vault 동기화 (non-blocking)
      syncKYCToVault(userId, data, vaultPass).catch(console.error);
      // 3. DB 배지 기록 (non-blocking)
      recordKYCCompletion(userId).catch(console.error);
      setRegStep('done');
      onSuccess(data);
    } catch (e: any) { setError(e.message || '저장 실패'); }
    finally { setIsLoading(false); }
  };

  // ── 복원 모드 ─────────────────────────────────────────────
  const handleRestoreComplete = async (vaultPass: string, localPin: string) => {
    if (!userId) return;
    setIsLoading(true); setError('');
    try {
      const data = await restoreKYCFromVault(userId, vaultPass, localPin);
      if (!data) { setError('Vault에서 KYC 데이터를 찾을 수 없습니다'); return; }
      setRestoredData(data);
      recordKYCCompletion(userId).catch(console.error);
      setRegStep('done');
      onSuccess(data);
    } catch (e: any) { setError(e.message || '복원 실패'); }
    finally { setIsLoading(false); }
  };

  const stepNum = { info:1, phone:2, pin:3, vault_pin:3, done:4 }[regStep] || 1;

  return (
    <>
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t md:border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 pb-10 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">

        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">KYC 정보 등록</p>
              <p className="text-xs text-slate-500 mt-0.5">디바이스에만 저장 · 서버에 실명 없음</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* ══ 모드 선택 ══ */}
        {mode === 'select' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">처음 등록하시나요, 아니면 다른 기기에서 이미 등록하셨나요?</p>
            <button onClick={() => setMode('register')}
              className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left hover:border-emerald-500/40 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <UserCheck size={18} className="text-emerald-400"/>
              </div>
              <div>
                <p className="text-sm font-bold text-white">처음 등록</p>
                <p className="text-[11px] text-slate-500">이름·생년월일·휴대폰 인증</p>
              </div>
            </button>
            <button onClick={() => setMode('restore')}
              className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left hover:border-cyan-500/40 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
                <CloudDownload size={18} className="text-cyan-400"/>
              </div>
              <div>
                <p className="text-sm font-bold text-white">다른 기기에서 복원</p>
                <p className="text-[11px] text-slate-500">Vault 비밀번호로 가져오기</p>
              </div>
            </button>
          </div>
        )}

        {/* ══ 등록 모드 ══ */}
        {mode === 'register' && (
          <>
            {/* 스텝 인디케이터 */}
            <div className="flex items-center gap-1">
              {[1,2,3].map(n => (
                <div key={n} className="flex items-center gap-1 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                    stepNum > n ? 'bg-emerald-500 text-white'
                    : stepNum === n ? 'bg-cyan-500 text-white'
                    : 'bg-slate-800 text-slate-500'}`}>
                    {stepNum > n ? <Check size={10}/> : n}
                  </div>
                  {n < 3 && <div className={`flex-1 h-px ${stepNum > n ? 'bg-emerald-500':'bg-slate-800'}`}/>}
                </div>
              ))}
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2">
              <ShieldCheck size={12} className="text-emerald-400 mt-0.5 shrink-0"/>
              <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                실명/생년월일은 <span className="font-bold">이 기기에만</span> 암호화 저장됩니다.
                서버에는 인증 완료 여부만 기록됩니다.
              </p>
            </div>

            {/* STEP 1: 정보 입력 */}
            {regStep === 'info' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-bold mb-1 block flex items-center gap-1">
                    <User size={11}/> 한국 실명 <span className="text-red-400">*</span>
                  </label>
                  <input value={nameKo} onChange={e => setNameKo(e.target.value)}
                    placeholder="홍길동"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold mb-1 block flex items-center gap-1">
                    <Globe size={11}/> 영문명 (여권 기준) <span className="text-red-400">*</span>
                  </label>
                  <input value={nameEn} onChange={e => setNameEn(e.target.value.toUpperCase())}
                    placeholder="HONG GILDONG"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50 font-mono tracking-wide"/>
                  <p className="text-[10px] text-slate-500 mt-1">여권 영문명 기준 · 대문자 (HONG GILDONG)</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold mb-1 block flex items-center gap-1">
                    <Calendar size={11}/> 생년월일 <span className="text-red-400">*</span>
                  </label>
                  <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold mb-1 block flex items-center gap-1">
                    <Phone size={11}/> 휴대폰 번호 <span className="text-red-400">*</span>
                  </label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>
                </div>
                {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
                <button onClick={handleInfoNext}
                  className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500">
                  다음 → 휴대폰 인증
                </button>
              </div>
            )}

            {/* STEP 2: 휴대폰 OTP */}
            {regStep === 'phone' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">인증할 번호</p>
                  <p className="text-sm font-bold text-white">{phone}</p>
                </div>
                {!otpSent ? (
                  <button onClick={handleSendOtp} disabled={isLoading}
                    className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-40">
                    {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>전송 중...</span> : 'OTP 전송'}
                  </button>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-slate-400 font-bold mb-1 block">인증번호 6자리</label>
                      <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                        placeholder="000000" maxLength={6}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-lg text-white outline-none focus:border-emerald-500/50 text-center font-mono tracking-widest"/>
                    </div>
                    <button onClick={handleVerifyOtp} disabled={isLoading || otp.length !== 6}
                      className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-40">
                      {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/>확인 중...</span> : '인증 확인'}
                    </button>
                    <button onClick={handleSendOtp} className="w-full text-xs text-slate-500 hover:text-slate-300">재전송</button>
                  </>
                )}
                {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
              </div>
            )}

            {/* STEP 3: PIN 설정 */}
            {regStep === 'pin' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1 text-[10px] text-slate-500">
                  <p className="font-bold text-slate-400">2가지 비밀번호 설정</p>
                  <p>① <span className="text-white">로컬 PIN</span> — 이 기기에서 KYC 정보 잠금 해제용</p>
                  <p>② <span className="text-white">Vault 비밀번호</span> — 다른 기기로 복원할 때 사용 (기기 동기화 Vault와 동일)</p>
                  <p className="text-cyan-400 mt-1">⚠️ 두 비밀번호를 잊으면 KYC 정보를 복구할 수 없습니다.</p>
                </div>
                <button onClick={() => setShowKeypad('pin')}
                  className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 transition-all flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Lock size={16} className="text-slate-400"/>
                    <div>
                      <p className="text-sm font-bold text-white">① 로컬 PIN 설정</p>
                      <p className="text-[10px] text-slate-500">이 기기 전용 잠금 해제 번호</p>
                    </div>
                  </div>
                  {pin ? <Check size={16} className="text-emerald-400"/> : <span className="text-[10px] text-slate-500">미설정</span>}
                </button>
                {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
              </div>
            )}

            {/* STEP 3b: Vault 비밀번호 설정 */}
            {regStep === 'vault_pin' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1 text-[10px] text-slate-500">
                  <p className="font-bold text-slate-400">Vault 비밀번호</p>
                  <p>기기 동기화(Cloud Export/Import)와 동일한 비밀번호를 사용하면<br/>KYC 정보도 자동으로 같이 동기화됩니다.</p>
                </div>
                <button onClick={() => setShowKeypad('vault_pin')}
                  className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-cyan-500/40 transition-all flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={16} className="text-slate-400"/>
                    <div>
                      <p className="text-sm font-bold text-white">② Vault 비밀번호 설정</p>
                      <p className="text-[10px] text-slate-500">기기간 동기화용 Cloud Vault 비밀번호</p>
                    </div>
                  </div>
                  {vaultPin ? <Check size={16} className="text-cyan-400"/> : <span className="text-[10px] text-slate-500">미설정</span>}
                </button>
                {isLoading && (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 size={16} className="animate-spin text-emerald-400"/>
                    <span className="text-sm text-slate-400">저장 중...</span>
                  </div>
                )}
                {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
              </div>
            )}

            {/* DONE */}
            {regStep === 'done' && (
              <div className="flex flex-col items-center gap-5 py-4 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/30 flex items-center justify-center">
                  <Check size={28} className="text-emerald-400"/>
                </div>
                <div>
                  <p className="text-base font-black text-white">KYC 등록 완료</p>
                  <p className="text-xs text-slate-400 mt-1">
                    이 기기에 암호화 저장 + Vault 동기화 완료<br/>
                    100만원 이상 전송 시 실명이 자동 입력됩니다.
                  </p>
                </div>
                <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left space-y-2">
                  {[['실명', nameKo], ['영문명', nameEn], ['생년월일', dob]].map(([k,v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-xs text-slate-500">{k}</span>
                      <span className="text-xs font-bold text-white">{v}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onClose}
                  className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-emerald-500 to-teal-500">
                  완료
                </button>
              </div>
            )}
          </>
        )}

        {/* ══ 복원 모드 ══ */}
        {mode === 'restore' && (
          <div className="space-y-4">
            {!restoredData ? (
              <>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-500 space-y-1">
                  <p className="font-bold text-slate-400">다른 기기에서 복원</p>
                  <p>이전에 KYC 등록 시 설정한 Vault 비밀번호와,<br/>이 기기에서 사용할 새 로컬 PIN을 입력해주세요.</p>
                </div>
                <button onClick={() => setShowKeypad('restore_vault')}
                  className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-cyan-500/40 transition-all flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">① Vault 비밀번호</p>
                    <p className="text-[10px] text-slate-500">기존 기기에서 설정한 비밀번호</p>
                  </div>
                  {restoreVaultPass ? <Check size={16} className="text-cyan-400"/> : <span className="text-[10px] text-slate-500">미입력</span>}
                </button>
                <button onClick={() => setShowKeypad('restore_local')}
                  className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 transition-all flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">② 이 기기 로컬 PIN</p>
                    <p className="text-[10px] text-slate-500">이 기기에서 사용할 새 PIN</p>
                  </div>
                  {restoreLocalPin ? <Check size={16} className="text-emerald-400"/> : <span className="text-[10px] text-slate-500">미설정</span>}
                </button>
                {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
                <button
                  onClick={() => handleRestoreComplete(restoreVaultPass, restoreLocalPin)}
                  disabled={!restoreVaultPass || !restoreLocalPin || isLoading}
                  className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40 flex items-center justify-center gap-2">
                  {isLoading ? <><Loader2 size={16} className="animate-spin"/>복원 중...</> : <><CloudDownload size={16}/>Vault에서 복원</>}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-5 py-4 text-center">
                <div className="w-16 h-16 rounded-full bg-cyan-500/20 border-2 border-cyan-500/30 flex items-center justify-center">
                  <Check size={28} className="text-cyan-400"/>
                </div>
                <p className="text-base font-black text-white">복원 완료</p>
                <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left space-y-2">
                  {[['실명', restoredData.nameKo], ['영문명', restoredData.nameEn], ['생년월일', restoredData.dob]].map(([k,v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-xs text-slate-500">{k}</span>
                      <span className="text-xs font-bold text-white">{v}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onClose}
                  className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500">
                  완료
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* SecureKeypad 오버레이 */}
    {showKeypad === 'pin' && (
      <SecureKeypad
        title="로컬 PIN 설정"
        description="이 기기 전용 잠금 해제 번호 (6자리 이상)"
        onClose={() => setShowKeypad(null)}
        onComplete={handlePinComplete}
      />
    )}
    {showKeypad === 'vault_pin' && (
      <SecureKeypad
        title="Vault 비밀번호 설정"
        description="기기간 동기화 Cloud Vault 비밀번호"
        onClose={() => setShowKeypad(null)}
        onComplete={handleVaultPinComplete}
      />
    )}
    {showKeypad === 'restore_vault' && (
      <SecureKeypad
        title="Vault 비밀번호 입력"
        description="기존 기기에서 설정한 Vault 비밀번호"
        onClose={() => setShowKeypad(null)}
        onComplete={(val) => { setRestoreVaultPass(val); setShowKeypad(null); }}
      />
    )}
    {showKeypad === 'restore_local' && (
      <SecureKeypad
        title="새 로컬 PIN 설정"
        description="이 기기에서 사용할 PIN"
        onClose={() => setShowKeypad(null)}
        onComplete={(val) => { setRestoreLocalPin(val); setShowKeypad(null); }}
      />
    )}
    </>
  );
}