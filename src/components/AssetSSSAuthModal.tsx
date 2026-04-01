import { useState } from 'react';
import { X, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';

import { combineShares, uint8ToString } from '../services/sssService';
import {
  decryptShareA, decryptShareB,
  loadVaultFromSupabase, deriveShareKeyFromPhone,
} from '../services/shareVaultService';

interface Props {
  walletAddress: string;
  onClose: () => void;
  onSuccess: (privateKey: string) => void;
}

export function AssetSSSAuthModal({ walletAddress, onClose, onSuccess }: Props) {
  const smartAccount = useActiveAccount();
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'password' | 'phone' | 'otp'>('password');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePasswordSubmit = async () => {
    if (!smartAccount) return;
    setIsLoading(true);
    setError('');

    try {
      const vault = await loadVaultFromSupabase(smartAccount.address, walletAddress);
      if (!vault) throw new Error('Vault 기록을 찾을 수 없습니다.');

      // Share A 복호화 검증 (비밀번호 확인용)
      try {
        await decryptShareA(
          { iv: vault.share_a_iv, ciphertext: vault.share_a_ciphertext, salt: vault.share_a_salt },
          password
        );
      } catch {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }

      // Share B 복원을 위해 휴대폰 OTP 인증 단계로 진행
      setStep('phone');

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone.match(/^010\d{8}$/)) { setError('올바른 번호 입력'); return; }
    setIsLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: `+82${phone.slice(1)}` });
      if (error) throw error;
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!smartAccount) return;
    setIsLoading(true);
    setError('');
    try {
      const vault = await loadVaultFromSupabase(smartAccount.address, walletAddress);
      if (!vault) throw new Error('Vault 기록을 찾을 수 없습니다.');

      // OTP 검증 (본인 확인용만, 세션 토큰은 사용 안 함)
      const { error: authErr } = await supabase.auth.verifyOtp({
        phone: `+82${phone.slice(1)}`, token: otp, type: 'sms',
      });
      if (authErr) throw new Error('OTP 인증 실패');

      // Share A: 비밀번호로 복호화
      const shareA = await decryptShareA(
        { iv: vault.share_a_iv, ciphertext: vault.share_a_ciphertext, salt: vault.share_a_salt },
        password
      );

      // Share B: 전화번호에서 결정론적 키 파생 (세션과 무관하게 항상 동일)
      const phoneKey = await deriveShareKeyFromPhone(phone);
      const shareB = await decryptShareB(
        { iv: vault.share_b_iv, ciphertext: vault.share_b_ciphertext, salt: vault.share_b_salt },
        phoneKey
      );

      const secretBytes = combineShares([shareA, shareB]);
      const mnemonic = uint8ToString(secretBytes);
      const recovered = ethers.Wallet.fromPhrase(mnemonic);

      if (recovered.address.toLowerCase() !== vault.evm_address.toLowerCase()) {
        throw new Error('복원된 키 검증 실패.');
      }

      onSuccess(recovered.privateKey);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">
          <X size={18} />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 border-2 border-cyan-500/40 flex items-center justify-center mb-3">
            <ShieldCheck size={24} className="text-cyan-400" />
          </div>
          <h2 className="text-lg font-black text-white">서명 승인</h2>
          <p className="text-xs text-slate-400 text-center mt-1">
            SSS 지갑 트랜잭션 서명을 위해<br/>비밀번호를 입력하세요.
          </p>
        </div>

        {step === 'password' && (
          <div className="space-y-4">
            <input type="password" placeholder="지갑 비밀번호" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-500" />
            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
            <button onClick={handlePasswordSubmit} disabled={isLoading || !password}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-50 flex justify-center items-center">
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : '다음'}
            </button>
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-4">
            <div className="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/20 mb-2">
              <AlertCircle size={14} className="text-cyan-400 mb-1" />
              <p className="text-[10px] text-cyan-300">
                휴대폰 OTP 인증이 필요합니다 (Share B).<br/>
                저장 시 사용한 번호를 입력하세요.
              </p>
            </div>
            <input type="tel" placeholder="01012345678" value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} maxLength={11}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-500" />
            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
            <button onClick={handleSendOtp} disabled={isLoading || phone.length < 10}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-50 flex justify-center items-center">
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'OTP 발송'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 text-center">{phone} 발송됨</p>
            <input type="number" placeholder="000000" value={otp}
              onChange={e => setOtp(e.target.value.slice(0, 6))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 text-center tracking-widest text-2xl font-bold text-white focus:border-cyan-500" />
            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
            <button onClick={handleOtpVerify} disabled={isLoading || otp.length !== 6}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-50 flex justify-center items-center">
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : '인증 및 서명'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
