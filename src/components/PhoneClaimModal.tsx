// src/components/PhoneClaimModal.tsx
// Phase 4: KYC Credential 발급 UI
//
// 계정 식별: Thirdweb smartAccount.address (userId)
// OTP: 전화번호 소유 증명 전용 (Supabase Auth 세션은 신원확인만 사용)

import { useState } from 'react';
import {
  X, Loader2, ShieldCheck, ChevronRight,
  Phone, User, Calendar, CheckCircle2, AlertCircle, Lock
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '../lib/supabase';
import { requestCredential, CLAIM_CONFIG } from '../services/credentialService';
import type { ClaimType } from '../services/credentialService';

type Step = 'SELECT' | 'PHONE' | 'OTP' | 'IDENTITY' | 'PROCESSING' | 'DONE' | 'ERROR';

interface Props {
  initialClaimType?: ClaimType;
  onClose:           () => void;
  onSuccess?:        (claimType: ClaimType) => void;
  commitment?:       string;
}

function normalizePhone(raw: string): string {
  const clean = raw.replace(/[^0-9+]/g, '');
  if (clean.startsWith('010')) return `+82${clean.slice(1)}`;
  if (clean.startsWith('82'))  return `+${clean}`;
  return clean;
}

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
            ${i < current  ? 'bg-cyan-500 text-white'
            : i === current ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-400'
            : 'bg-slate-800 text-slate-500'}`}>
            {i < current ? <CheckCircle2 size={12} /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-0.5 rounded ${i < current ? 'bg-cyan-500' : 'bg-slate-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function PhoneClaimModal({ initialClaimType, onClose, onSuccess }: Props) {
  const smartAccount = useActiveAccount();

  // 계정 식별자 = Thirdweb 지갑 주소
  const userId = smartAccount?.address || '';

  const [step, setStep]           = useState<Step>(initialClaimType ? 'PHONE' : 'SELECT');
  const [claimType, setClaimType] = useState<ClaimType>(initialClaimType || 'ADULT');
  const [phone, setPhone]         = useState('');
  const [otp, setOtp]             = useState('');
  const [name, setName]           = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [loading, setLoading]     = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError]         = useState('');
  const [sessionToken, setSessionToken]   = useState('');
  const [refreshToken, setRefreshToken]   = useState('');
  const [issuedType, setIssuedType]       = useState<ClaimType | null>(null);

  const stepLabels = claimType === 'NON_SANCTIONED'
    ? ['휴대폰', '발급완료']
    : ['휴대폰', '실명확인', '발급완료'];

  const currentStepIdx =
    step === 'PHONE' || step === 'OTP'            ? 0
    : step === 'IDENTITY' || step === 'PROCESSING' ? 1
    : 2;

  // ── 1. OTP 전송 ──────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!userId) return setError('지갑이 연결되지 않았습니다.');
    if (!phone.trim()) return setError('휴대폰 번호를 입력해주세요.');
    setError(''); setLoading(true);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phone) });
      if (e) throw e;
      setStep('OTP');
    } catch (e: any) {
      setError('OTP 전송 실패: ' + e.message);
    } finally { setLoading(false); }
  };

  // ── 2. OTP 검증 ──────────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (!otp.trim()) return setError('인증번호를 입력해주세요.');
    setError(''); setLoading(true);
    try {
      const { data, error: e } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phone), token: otp, type: 'sms',
      });
      if (e || !data.session) throw e || new Error('세션 생성 실패');

      // OTP 세션 저장 (신원확인 전용 — 앱 계정과 무관)
      setSessionToken(data.session.access_token);
      setRefreshToken(data.session.refresh_token);

      // NON_SANCTIONED는 실명확인 불필요
      if (claimType === 'NON_SANCTIONED') {
        await issueCredential(data.session.access_token, data.session.refresh_token);
      } else {
        setStep('IDENTITY');
      }
    } catch (e: any) {
      setError('인증번호 오류: ' + e.message);
    } finally { setLoading(false); }
  };

  // ── 3. 실명확인 + 발급 ───────────────────────────────────────────────────────
  const handleIdentityVerify = async () => {
    if (!name.trim())           return setError('이름을 입력해주세요.');
    if (birthdate.length !== 8) return setError('생년월일 8자리를 입력해주세요. (예: 19900101)');
    setError('');
    await issueCredential(sessionToken, refreshToken, name, birthdate);
  };

  // ── 공통 발급 ────────────────────────────────────────────────────────────────
  const issueCredential = async (
    token: string, refresh: string, _name?: string, _birth?: string,
  ) => {
    if (!userId) { setError('지갑 연결이 필요합니다.'); setStep('ERROR'); return; }
    setStep('PROCESSING');
    setStatusMsg('TranSight에 Credential 발급 요청 중...');

    // userId = Thirdweb smartAccount.address (계정 식별자)
    const result = await requestCredential(claimType, userId, token, refresh, _name, _birth);

    if (result.success) {
      setIssuedType(claimType);
      setStep('DONE');
      onSuccess?.(claimType);
    } else {
      setError(result.error || '발급 실패');
      setStep('ERROR');
    }
    setStatusMsg('');
  };

  const resetForType = (type: ClaimType) => {
    setClaimType(type);
    setPhone(''); setOtp(''); setName(''); setBirthdate('');
    setError(''); setStep('PHONE');
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[200] p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">KYC 인증</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Privacy-Preserving · {userId ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : '지갑 미연결'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">

          {/* ── Claim 선택 ── */}
          {step === 'SELECT' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">인증 받을 항목을 선택하세요.</p>
              {(['ADULT', 'KOREAN', 'NON_SANCTIONED'] as ClaimType[]).map(type => {
                const c = CLAIM_CONFIG[type];
                return (
                  <button key={type} onClick={() => { setClaimType(type); setStep('PHONE'); }}
                    className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-2xl transition-all text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{c.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{c.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{c.description}</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-500 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* ── 진행 단계 ── */}
          {['PHONE', 'OTP', 'IDENTITY', 'PROCESSING'].includes(step) && (
            <>
              <StepIndicator current={currentStepIdx} steps={stepLabels} />

              <div className="flex items-center gap-2 mb-5">
                <span className="text-lg">{CLAIM_CONFIG[claimType].icon}</span>
                <span className="text-sm font-bold text-white">{CLAIM_CONFIG[claimType].label}</span>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full ml-auto">
                  {claimType}
                </span>
              </div>

              {/* 전화번호 입력 */}
              {step === 'PHONE' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                      휴대폰 번호
                    </label>
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 focus-within:border-cyan-500 transition-colors">
                      <Phone size={14} className="text-slate-500 shrink-0" />
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-600"
                        onKeyDown={e => e.key === 'Enter' && handleSendOtp()} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-slate-800/40 rounded-xl p-3">
                    <Lock size={11} className="text-cyan-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      전화번호는 본인 확인 후 즉시 폐기됩니다. 인증은 지갑 주소({userId.slice(0, 6)}...)에 계정 단위로 부여됩니다.
                    </p>
                  </div>
                  {error && <p className="text-[11px] text-red-400">{error}</p>}
                  <button onClick={handleSendOtp} disabled={loading}
                    className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                    인증번호 전송
                  </button>
                </div>
              )}

              {/* OTP 입력 */}
              {step === 'OTP' && (
                <div className="space-y-4">
                  <p className="text-[11px] text-slate-400">
                    <span className="text-white font-bold">{phone}</span>으로 전송된 6자리 인증번호를 입력하세요.
                  </p>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 focus-within:border-cyan-500 transition-colors">
                    <input type="number" value={otp} onChange={e => setOtp(e.target.value)}
                      placeholder="000000" maxLength={6}
                      className="bg-transparent text-white text-2xl font-mono text-center outline-none flex-1 placeholder-slate-700 tracking-widest"
                      onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()} />
                  </div>
                  {error && <p className="text-[11px] text-red-400">{error}</p>}
                  <button onClick={handleVerifyOtp} disabled={loading || otp.length < 6}
                    className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    인증 확인
                  </button>
                  <button onClick={() => setStep('PHONE')}
                    className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                    번호 다시 입력
                  </button>
                </div>
              )}

              {/* 실명확인 */}
              {step === 'IDENTITY' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 bg-slate-800/40 rounded-xl p-3">
                    <Lock size={11} className="text-cyan-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      이름·생년월일은 행안부 실명확인 후 즉시 폐기됩니다. 서버에 저장되지 않습니다.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">이름</label>
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 focus-within:border-cyan-500 transition-colors">
                      <User size={14} className="text-slate-500 shrink-0" />
                      <input type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="홍길동"
                        className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-600" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">생년월일 (8자리)</label>
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 focus-within:border-cyan-500 transition-colors">
                      <Calendar size={14} className="text-slate-500 shrink-0" />
                      <input type="text" value={birthdate}
                        onChange={e => setBirthdate(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="19900101" maxLength={8}
                        className="bg-transparent text-white text-sm font-mono outline-none flex-1 placeholder-slate-600 tracking-widest" />
                    </div>
                  </div>
                  {error && <p className="text-[11px] text-red-400">{error}</p>}
                  <button onClick={handleIdentityVerify} disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Credential 발급
                  </button>
                </div>
              )}

              {/* 처리 중 */}
              {step === 'PROCESSING' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                      <Loader2 size={24} className="animate-spin text-cyan-400" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" />
                  </div>
                  <p className="text-sm font-bold text-white">발급 중...</p>
                  <p className="text-[11px] text-slate-500 text-center">{statusMsg}</p>
                </div>
              )}
            </>
          )}

          {/* ── 완료 ── */}
          {step === 'DONE' && issuedType && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center">
                <span className="text-4xl">{CLAIM_CONFIG[issuedType].icon}</span>
              </div>
              <div>
                <p className="text-lg font-black text-white">{CLAIM_CONFIG[issuedType].label}</p>
                <p className="text-sm text-emerald-400 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <CheckCircle2 size={14} /> 인증 완료
                </p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed px-2">
                개인정보는 저장되지 않았습니다.<br />
                Credential은 계정({userId.slice(0, 6)}...)에 1년간 유효합니다.
              </p>
              <div className="w-full space-y-2 mt-2">
                {(['ADULT', 'KOREAN', 'NON_SANCTIONED'] as ClaimType[])
                  .filter(t => t !== issuedType)
                  .map(type => (
                    <button key={type} onClick={() => resetForType(type)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{CLAIM_CONFIG[type].icon}</span>
                        <span className="text-xs font-bold text-slate-300">{CLAIM_CONFIG[type].label} 추가 인증</span>
                      </div>
                      <ChevronRight size={12} className="text-slate-500" />
                    </button>
                  ))}
              </div>
              <button onClick={onClose}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-2xl transition-all mt-1">
                닫기
              </button>
            </div>
          )}

          {/* ── 오류 ── */}
          {step === 'ERROR' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <p className="text-sm font-bold text-white">발급 실패</p>
              <p className="text-[11px] text-red-400">{error}</p>
              <button onClick={() => { setStep('PHONE'); setError(''); }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-2xl transition-all">
                다시 시도
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}