// src/components/PhoneClaimModal.tsx
// 수정판: 통합 KYC 인증 폼 (이름(국/영), 생점, 국적, 폰번호) 및 제재 대상 스캐닝

import { useState } from 'react';
import {
  X, Loader2, ShieldCheck,
  Phone, User, Calendar, CheckCircle2, AlertCircle, Lock, Globe, SearchCode
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '../lib/supabase';
import { requestCredential, CLAIM_CONFIG, checkSanctionTarget } from '../services/credentialService';

type Step = 'IDENTITY' | 'OTP' | 'PROCESSING' | 'DONE' | 'ERROR';

interface Props {
  initialClaimType?: string; // 사용안함 (항상 통합 KYC)
  onClose: () => void;
  onSuccess?: () => void;
  commitment?: string;
}

function normalizePhone(raw: string): string {
  const clean = raw.replace(/[^0-9+]/g, '');
  if (clean.startsWith('010')) return `+82${clean.slice(1)}`;
  if (clean.startsWith('82'))  return `+${clean}`;
  return clean;
}

export function PhoneClaimModal({ onClose, onSuccess }: Props) {
  const smartAccount = useActiveAccount();
  const userId = smartAccount?.address || '';

  const [step, setStep] = useState<Step>('IDENTITY');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 폼 필드
  const [nameKr, setNameKr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [dob, setDob] = useState('');
  const [nationality, setNationality] = useState('KOREA');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // 1. 신원 정보 해시 & 제재 심사 후 OTP 발송
  const handleVerifyIdentityAndSendOtp = async () => {
    if (!userId) return setError('지갑이 연결되지 않았습니다.');
    if (!nameKr.trim()) return setError('국문 이름을 입력해주세요.');
    if (!nameEn.trim()) return setError('영문 이름을 입력해주세요.');
    if (dob.length !== 8) return setError('생년월일 8자리를 입력해주세요. (예: 19900101)');
    if (!nationality.trim()) return setError('국적을 입력해주세요.');
    if (!phone.trim()) return setError('휴대폰 번호를 입력해주세요.');

    setError(''); setLoading(true);
    
    try {
      // 1. 제재 명단 확인 (비제재 대상 인증 로직)
      const isSanctioned = await checkSanctionTarget(nameEn, dob, nationality);
      if (isSanctioned) {
        // 제재 대상인 경우 차단
        setError('OFAC 및 제재 명단에 포함되어 있어 서비스 이용이 불가능합니다.');
        setStep('ERROR');
        return;
      }

      // 2. 문제 없으면 OTP 발송
      const { error: e } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phone) });
      if (e) throw e;
      
      setStep('OTP');
    } catch (e: unknown) {
      setError('오류 발생: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  // 2. OTP 검증 후 Credential 발급
  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length < 6) return setError('인증번호 6자리를 입력해주세요.');
    setError(''); setLoading(true);

    let sessionToken = '';
    let refreshToken = '';

    try {
      const { data, error: e } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phone), token: otp, type: 'sms',
      });
      if (e || !data.session) throw e || new Error('세션 생성 실패 (인증번호가 잘못되었습니다)');
      sessionToken = data.session.access_token;
      refreshToken = data.session.refresh_token;
    } catch (e: unknown) {
      setError('인증 실패: ' + (e instanceof Error ? e.message : String(e)));
      setLoading(false);
      return;
    }

    setStep('PROCESSING');
    
    try {
      // Credential 저장 (우리 서버에는 PII 정보 저장 금지 지침에 따라 발급 완료 상태만 서버에 남김)
      const result = await requestCredential(
        'NON_SANCTIONED',
        userId, 
        sessionToken, 
        refreshToken
      );

      if (result.success) {
        setStep('DONE');
        onSuccess?.();
      } else {
        throw new Error(result.error || 'Credential 저장 실패 (DB 저장 규칙 오류 등)');
      }

    } catch (e: unknown) {
      setError('발급 실패: ' + (e instanceof Error ? e.message : String(e)));
      setStep('ERROR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[200] p-4">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-400" /> 통합 KYC 인증
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Privacy-Preserving · 개인정보는 검증 용도로만 1회성 사용되며 저장되지 않습니다.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto custom-scrollbar">

          {/* 1. 기본 정보 및 제재 조회 */}
          {step === 'IDENTITY' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-slate-800/40 border border-slate-800 rounded-xl p-3 mb-2">
                <Lock size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  OFAC 및 국제 제재 명단(Sanction List) 조회를 위해 영문이름과 생년월일, 국적이 필요합니다. 해당 정보는 본인 확인 후 즉시 폐기됩니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 국문 이름 */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">이름 (국문)</label>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                    <User size={14} className="text-slate-500 shrink-0" />
                    <input type="text" value={nameKr} onChange={e => setNameKr(e.target.value)}
                      placeholder="홍길동" className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-600 min-w-0" />
                  </div>
                </div>
                {/* 영문 이름 */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">이름 (영문)</label>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                    <User size={14} className="text-slate-500 shrink-0" />
                    <input type="text" value={nameEn} onChange={e => setNameEn(e.target.value.toUpperCase())}
                      placeholder="HONG GILDONG" className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-600 min-w-0" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 생년월일 */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">생년월일 (8자리)</label>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                    <Calendar size={14} className="text-slate-500 shrink-0" />
                    <input type="text" value={dob} onChange={e => setDob(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="19900101" maxLength={8} className="bg-transparent text-white text-sm font-mono outline-none flex-1 placeholder-slate-600 min-w-0" />
                  </div>
                </div>
                {/* 국적 */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">국적</label>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                    <Globe size={14} className="text-slate-500 shrink-0" />
                    <input type="text" value={nationality} onChange={e => setNationality(e.target.value.toUpperCase())}
                      placeholder="KOREA" className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-600 min-w-0" />
                  </div>
                </div>
              </div>

              {/* 휴대폰 번호 */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">휴대폰 번호</label>
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                  <Phone size={14} className="text-slate-500 shrink-0" />
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="010-0000-0000" onKeyDown={e => e.key === 'Enter' && handleVerifyIdentityAndSendOtp()}
                    className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-600 min-w-0" />
                </div>
              </div>

              {error && <p className="text-[11px] text-red-400 pt-1">{error}</p>}

              <button onClick={handleVerifyIdentityAndSendOtp} disabled={loading}
                className="w-full mt-2 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 text-sm font-black rounded-2xl transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <SearchCode size={16} />}
                제재 리스트 심사 & OTP 전송
              </button>
            </div>
          )}

          {/* 2. OTP 입력 */}
          {step === 'OTP' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <span className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full mb-3">
                  <Phone size={24} />
                </span>
                <p className="text-[11px] text-slate-400">
                  <span className="text-white font-bold">{phone}</span>으로 전송된 6자리 인증번호를 입력하세요.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 focus-within:border-emerald-500 transition-colors">
                <input type="number" value={otp} onChange={e => setOtp(e.target.value)}
                  placeholder="000000" maxLength={6}
                  className="bg-transparent text-white text-2xl font-mono text-center outline-none flex-1 placeholder-slate-700 tracking-widest"
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()} />
              </div>

              {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

              <button onClick={handleVerifyOtp} disabled={loading || otp.length < 6}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 text-sm font-black rounded-2xl transition-all flex items-center justify-center gap-2 mt-4">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                인증 확인 및 완료
              </button>
              
              <button onClick={() => setStep('IDENTITY')} disabled={loading}
                className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors text-center mt-2 p-2">
                정보 다시 입력하기
              </button>
            </div>
          )}

          {/* 3. 처리 중 */}
          {step === 'PROCESSING' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-emerald-400" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" />
              </div>
              <p className="text-sm font-bold text-white">블록체인 증명 발급 중...</p>
              <p className="text-[11px] text-slate-500 text-center">자격을 블록체인 상에 등록하고 있습니다.</p>
            </div>
          )}

          {/* 4. 완료 */}
          {step === 'DONE' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={36} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-lg font-black text-white">{CLAIM_CONFIG.NON_SANCTIONED.label}</p>
                <p className="text-sm text-emerald-400 font-bold mt-1 flex items-center justify-center gap-1">
                  <CheckCircle2 size={14} /> 자격 인증을 통과하였습니다
                </p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed px-2 my-2 border border-slate-800 bg-slate-800/50 rounded-xl p-3">
                모든 개인정보는 철저히 파기되었으며, 귀하의 지갑 주소({userId.slice(0, 6)}...)에는 검증 완료 상태 권한만 암호화되어 부여되었습니다.
              </p>
              <button onClick={onClose}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-2xl transition-all mt-3">
                닫기
              </button>
            </div>
          )}

          {/* 5. 에러 */}
          {step === 'ERROR' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <p className="text-sm font-bold text-white">인증 실패</p>
              <p className="text-[11px] text-red-400 px-4">{error}</p>
              <button onClick={() => { setStep('IDENTITY'); setError(''); }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-2xl transition-all mt-4">
                다시 시도
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}