// ============================================================
// WalletSyncModal.tsx — 외부 지갑 니모닉/키 SSS 백업/복원
//
// 저장소: xlot_sss_vaults (key_share_a/b/c_* 컬럼)
// 방식:   SSS 2-of-3 (PIN + 휴대폰 OTP + 이메일 OTP)
//
// EXPORT_TO_CLOUD:
//   니모닉(권장) 또는 프라이빗 키 입력
//   → 휴대폰 OTP(B) + 이메일 OTP(C) + PIN(A) 설정
//   → saveImportedKeysToVaultSSS → xlot_sss_vaults
//
// IMPORT_FROM_CLOUD:
//   KeyRestoreModal (2-of-3 선택)
//   → restoreImportedKeysFromVaultSSS → 키 표시 (10초)
// ============================================================

import { useState, useEffect } from 'react';
import {
  X, Copy, ShieldCheck, Timer, ArrowRight,
  Loader2, Key, Check, Phone, Mail, Lock, AlertCircle,
} from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { SecureKeypad } from './SecureKeypad';
import { KeyRestoreModal } from './KeyRestoreModal';
import type {
  ImportedKeyMap,
} from '../services/shareVaultService';
import {
  saveImportedKeysToVaultSSS,
  restoreImportedKeysFromVaultSSS,
  deriveShareKeyFromPhone,
  deriveShareKeyFromEmail,
} from '../services/shareVaultService';
import { supabase } from '../lib/supabase';

type Mode     = 'EXPORT_TO_CLOUD' | 'IMPORT_FROM_CLOUD';
type ExStep   = 'INPUT_KEY' | 'PHONE_OTP' | 'EMAIL_OTP' | 'PIN' | 'SAVING' | 'SHOW_KEY';

interface Props {
  mode:          Mode;
  walletLabel:   string;
  walletAddress: string;
  chain:         'EVM' | 'SOL';
  onClose:       () => void;
  onSuccess?:    () => void;
}

export function WalletSyncModal({
  mode, walletLabel, walletAddress, chain, onClose, onSuccess,
}: Props) {
  const smartAccount = useActiveAccount();

  // Export 단계
  const [exStep, setExStep]       = useState<ExStep>('INPUT_KEY');
  const [inputType, setInputType] = useState<'mnemonic' | 'privkey'>('mnemonic');
  const [keyInput, setKeyInput]   = useState('');

  // OTP 상태
  const [phoneNum, setPhoneNum]         = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneToken, setPhoneToken]     = useState('');
  const [emailAddr, setEmailAddr]       = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailToken, setEmailToken]     = useState('');
  const [pin, setPin]                   = useState('');
  const [showKeypad, setShowKeypad]     = useState(false);

  // Import 상태
  const [showRestore, setShowRestore] = useState(mode === 'IMPORT_FROM_CLOUD');

  // 공통
  const [revealedKey, setRevealedKey] = useState('');
  const [countdown, setCountdown]     = useState(0);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');

  const userId = smartAccount?.address || '';

  // 카운트다운
  useEffect(() => {
    if (countdown <= 0) {
      if (revealedKey) {
        setRevealedKey('');
        alert('보안을 위해 키 표시가 종료되었습니다.');
        onClose();
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, revealedKey, onClose]);

  // ── Export 핸들러들 ──────────────────────────────────────

  const handleKeyNext = () => {
    const val = keyInput.trim();
    if (!val) { setError('입력값이 없습니다'); return; }
    if (inputType === 'mnemonic') {
      const wc = val.split(/\s+/).length;
      if (wc !== 12 && wc !== 24) { setError('니모닉은 12 또는 24 단어여야 합니다'); return; }
    }
    setError(''); setExStep('PHONE_OTP');
  };

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

  const handleVerifyPhone = async (code: string) => {
    setIsLoading(true); setError('');
    try {
      const f = phoneNum.startsWith('+') ? phoneNum : '+82' + phoneNum.replace(/^0/, '');
      const { data, error } = await supabase.auth.verifyOtp({ phone: f, token: code, type: 'sms' });
      if (error) throw error;
      // 전화번호에서 결정론적 키 파생 — 같은 번호면 언제나 동일
      const pKey = await deriveShareKeyFromPhone(phoneNum);
      setPhoneToken(pKey);
      setExStep('EMAIL_OTP');
    } catch (e: any) { setError('OTP 인증 실패: ' + e.message); }
    finally { setIsLoading(false); }
  };

  const handleSendEmail = async () => {
    setIsLoading(true); setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailAddr });
      if (error) throw error;
      setEmailOtpSent(true);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  const handleVerifyEmail = async (code: string) => {
    setIsLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: emailAddr, token: code, type: 'email' });
      if (error) throw error;
      // 이메일에서 결정론적 키 파생 — 같은 이메일이면 언제나 동일
      const eKey = await deriveShareKeyFromEmail(emailAddr);
      setEmailToken(eKey);
      setExStep('PIN');
    } catch (e: any) { setError('이메일 OTP 실패: ' + e.message); }
    finally { setIsLoading(false); }
  };

  const handlePinDone = async (p: string) => {
    setPin(p); setShowKeypad(false); setExStep('SAVING');
    setIsLoading(true); setError('');
    try {
      const val  = keyInput.trim();
      const keys: ImportedKeyMap = inputType === 'mnemonic'
        ? { mnemonic: val }
        : { [chain]: val } as ImportedKeyMap;

      await saveImportedKeysToVaultSSS(
        userId, walletAddress, keys, p, phoneToken, emailToken,
      );
      onSuccess?.();
      alert('✅ SAR Triple-Shield로 분산 저장 완료!\n(비밀번호 + 휴대폰 + 이메일 3조각)');
      onClose();
    } catch (e: any) {
      setError(e.message || '저장 실패');
      setExStep('PIN');
    } finally { setIsLoading(false); }
  };

  // ── Import 완료 콜백 ─────────────────────────────────────
  const handleRestored = (keys: ImportedKeyMap) => {
    const key = keys.mnemonic || keys[chain as keyof ImportedKeyMap] || Object.values(keys)[0];
    if (!key) { alert('해당 체인의 키를 찾을 수 없습니다'); onClose(); return; }
    setRevealedKey(key);
    setShowRestore(false);
    setCountdown(15);
  };

  // ── Import 모달 ─────────────────────────────────────────
  if (showRestore) {
    return (
      <KeyRestoreModal
        walletAddress={walletAddress}
        onRestored={handleRestored}
        onClose={onClose}
      />
    );
  }

  // ── 공통 래퍼 ────────────────────────────────────────────
  return (
    <>
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end justify-center z-[100]">
      <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-x border-slate-800 shadow-2xl animate-slide-up">

        {/* 드래그 핸들 */}
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3"/>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className={mode === 'EXPORT_TO_CLOUD' ? 'text-cyan-400' : 'text-emerald-400'}/>
            <h2 className="text-sm font-bold text-white">
              {mode === 'EXPORT_TO_CLOUD' ? 'SSS 백업' : 'SSS 복원'}
            </h2>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-bold">
              Triple-Shield
            </span>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-500 hover:text-white"/></button>
        </div>

        {/* 지갑 정보 */}
        <div className="px-6 py-3 border-b border-slate-800/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
            <Key size={14} className="text-slate-400"/>
          </div>
          <div>
            <p className="text-xs font-bold text-white">{walletLabel}</p>
            <p className="text-[10px] text-slate-500 font-mono">
              {walletAddress.slice(0,8)}...{walletAddress.slice(-6)} · {chain}
            </p>
          </div>
        </div>

        {/* 컨텐츠 */}
        <div className="px-6 py-5 pb-10 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">

          {/* ── STEP 1: 키 입력 ── */}
          {exStep === 'INPUT_KEY' && (
            <div className="space-y-4">
              {/* 스텝 표시 */}
              <div className="flex items-center gap-1 mb-2">
                {['키 입력','휴대폰','이메일','PIN'].map((s, i) => (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i===0?'bg-cyan-500 text-white':'bg-slate-800 text-slate-500'}`}>
                      {i+1}
                    </div>
                    {i<3 && <div className="flex-1 h-px bg-slate-800"/>}
                  </div>
                ))}
              </div>

              {/* 타입 선택 */}
              <div className="flex gap-1 bg-slate-950 p-1 rounded-xl">
                {([
                  { id: 'mnemonic', label: '니모닉 (권장)' },
                  { id: 'privkey',  label: '프라이빗 키' },
                ] as { id: 'mnemonic'|'privkey'; label: string }[]).map(({ id, label }) => (
                  <button key={id} onClick={() => { setInputType(id); setKeyInput(''); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      inputType === id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <textarea
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={inputType === 'mnemonic'
                  ? 'word1 word2 word3 ... word12\n(12 또는 24 단어)'
                  : '0x... 또는 Base58 키'}
                rows={inputType === 'mnemonic' ? 3 : 2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:border-cyan-500/50 outline-none font-mono resize-none"/>

              {inputType === 'mnemonic' && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-[11px] text-emerald-300/80">
                   니모닉은 모든 체인(EVM·SOL·BTC·TRX) 키를 한번에 백업해요
                </div>
              )}

              {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}

              <button onClick={handleKeyNext}
                className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                다음 — 휴대폰 인증 <ArrowRight size={16}/>
              </button>
            </div>
          )}

          {/* ── STEP 2: 휴대폰 OTP ── */}
          {exStep === 'PHONE_OTP' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 mb-2">
                {['키 입력','휴대폰','이메일','PIN'].map((s, i) => (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i<1?'bg-emerald-500 text-white':i===1?'bg-cyan-500 text-white':'bg-slate-800 text-slate-500'}`}>
                      {i<1?<Check size={8}/>:i+1}
                    </div>
                    {i<3 && <div className={`flex-1 h-px ${i<1?'bg-emerald-500':'bg-slate-800'}`}/>}
                  </div>
                ))}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
                <p className="font-bold text-white flex items-center gap-2 mb-1"><Phone size={12}/> Share B — 휴대폰 인증</p>
                <p>복구 수단 1로 사용됩니다</p>
              </div>

              <input value={phoneNum} onChange={e => setPhoneNum(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>

              {!phoneOtpSent ? (
                <button onClick={handleSendPhone} disabled={isLoading || !phoneNum}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl font-bold text-sm text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {isLoading ? <><Loader2 size={14} className="animate-spin"/>전송 중...</> : 'OTP 전송'}
                </button>
              ) : phoneToken ? (
                <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <Check size={12}/> 휴대폰 인증 완료 → 이메일 인증으로
                </div>
              ) : (
                <>
                  <input placeholder="인증번호 6자리" maxLength={6}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xl text-white text-center font-mono outline-none focus:border-emerald-500/50"
                    onChange={e => { if (e.target.value.length === 6) handleVerifyPhone(e.target.value); }}/>
                  {isLoading && <div className="flex justify-center"><Loader2 size={16} className="animate-spin text-emerald-400"/></div>}
                </>
              )}
              {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
            </div>
          )}

          {/* ── STEP 3: 이메일 OTP ── */}
          {exStep === 'EMAIL_OTP' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 mb-2">
                {['키 입력','휴대폰','이메일','PIN'].map((s, i) => (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i<2?'bg-emerald-500 text-white':i===2?'bg-cyan-500 text-white':'bg-slate-800 text-slate-500'}`}>
                      {i<2?<Check size={8}/>:i+1}
                    </div>
                    {i<3 && <div className={`flex-1 h-px ${i<2?'bg-emerald-500':'bg-slate-800'}`}/>}
                  </div>
                ))}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
                <p className="font-bold text-white flex items-center gap-2 mb-1"><Mail size={12}/> Share C — 이메일 인증</p>
                <p>복구 수단 2로 사용됩니다</p>
              </div>

              <input value={emailAddr} onChange={e => setEmailAddr(e.target.value)}
                type="email" placeholder="your@email.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"/>

              {!emailOtpSent ? (
                <button onClick={handleSendEmail} disabled={isLoading || !emailAddr}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl font-bold text-sm text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {isLoading ? <><Loader2 size={14} className="animate-spin"/>전송 중...</> : '이메일 OTP 전송'}
                </button>
              ) : emailToken ? (
                <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <Check size={12}/> 이메일 인증 완료 → PIN 설정으로
                </div>
              ) : (
                <>
                  <input placeholder="인증번호 6자리" maxLength={6}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xl text-white text-center font-mono outline-none focus:border-emerald-500/50"
                    onChange={e => { if (e.target.value.length === 6) handleVerifyEmail(e.target.value); }}/>
                  {isLoading && <div className="flex justify-center"><Loader2 size={16} className="animate-spin text-emerald-400"/></div>}
                </>
              )}
              {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
            </div>
          )}

          {/* ── STEP 4: PIN ── */}
          {exStep === 'PIN' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 mb-2">
                {['키 입력','휴대폰','이메일','PIN'].map((s, i) => (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i<3?'bg-emerald-500 text-white':'bg-cyan-500 text-white'}`}>
                      {i<3?<Check size={8}/>:4}
                    </div>
                    {i<3 && <div className="flex-1 h-px bg-emerald-500"/>}
                  </div>
                ))}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
                <p className="font-bold text-white flex items-center gap-2 mb-1"><Lock size={12}/> Share A — PIN 설정</p>
                <p>복구 시 첫 번째 수단. 잊어버리면 휴대폰+이메일로 복구 가능</p>
              </div>

              {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}

              <button onClick={() => setShowKeypad(true)}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                <Lock size={16}/> 보안 키패드로 PIN 설정 후 저장
              </button>
            </div>
          )}

          {/* ── STEP 5: 저장 중 ── */}
          {exStep === 'SAVING' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 size={32} className="animate-spin text-emerald-400"/>
              <p className="text-sm font-bold text-white">SSS 분산 저장 중...</p>
              <p className="text-[11px] text-slate-500">3조각으로 나누어 Vault에 저장합니다</p>
            </div>
          )}

          {/* ── 키 표시 (Import 복원 완료) ── */}
          {revealedKey && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <Key size={12} className="text-emerald-400"/>
                <p className="text-[11px] text-emerald-400 font-bold">SSS 복원 완료</p>
              </div>

              <div className="bg-slate-950 border border-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-bold mb-2">
                  {revealedKey.split(' ').length >= 12 ? '니모닉' : `Private Key (${chain})`}
                </p>
                <p className="font-mono text-sm text-white break-all blur-sm hover:blur-none transition-all cursor-pointer select-all"
                  title="마우스를 올리면 보입니다">
                  {revealedKey}
                </p>
              </div>

              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">
                <span className="text-xs text-red-400 flex items-center gap-2">
                  <Timer size={13} className="animate-pulse"/> {countdown}초 후 자동 삭제
                </span>
                <button onClick={() => { navigator.clipboard.writeText(revealedKey); alert('복사됨'); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
                  <Copy size={13}/> 복사
                </button>
              </div>

              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full transition-all duration-1000"
                  style={{ width: `${(countdown / 15) * 100}%` }}/>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {showKeypad && (
      <SecureKeypad
        title="PIN 설정"
        description="복구 수단 A — 6자리 이상"
        onClose={() => setShowKeypad(false)}
        onComplete={handlePinDone}
      />
    )}
    </>
  );
}