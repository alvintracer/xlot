// ============================================================
// KYCBadge.tsx
//
// credentialService: NON_SANCTIONED ACTIVE → "KYC Verified" 배지
// kycDeviceService:  로컬 실명 저장 여부 (별도, 이 파일에서 다루지 않음)
//
// CompactBadgeRow: 슬롯 카드 하단용 (compact)
// CredentialPanel: WalletDetailView 내부 섹션용
// ============================================================

import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Clock, ChevronRight, Loader2 } from 'lucide-react';
import {
  getCredentials, daysUntilExpiry, KYC_DISPLAY_CLAIM, CLAIM_CONFIG,
} from '../services/credentialService';
import type { VerifiableCredential } from '../services/credentialService';

// ── 단일 배지 ─────────────────────────────────────────────────
interface BadgeProps {
  credential?: VerifiableCredential;
  compact?:    boolean;
  onRequest?:  () => void;
}

export function CredentialBadge({ credential, compact = false, onRequest }: BadgeProps) {
  const config       = CLAIM_CONFIG[KYC_DISPLAY_CLAIM]; // NON_SANCTIONED → "KYC Verified"
  const isActive     = credential?.status === 'ACTIVE';
  const isExpired    = credential?.status === 'EXPIRED';
  const days         = credential && isActive ? daysUntilExpiry(credential) : 0;
  const expiringSoon = days > 0 && days <= 30;

  // ── compact 모드 (슬롯 카드 하단) ──────────────────────────
  if (compact) {
    return (
      <span
        onClick={() => !isActive && onRequest?.()}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all
          ${isActive
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-slate-800/80 border-slate-700 text-slate-400 cursor-pointer hover:border-slate-500 hover:text-white'
          }`}
      >
        <ShieldCheck size={12} strokeWidth={2.5} />
        {isActive ? config.label : `${config.label} 필요`}
        {isActive && expiringSoon && <Clock size={8} className="text-cyan-400" />}
      </span>
    );
  }

  // ── full 모드 (WalletDetailView) ─────────────────────────
  return (
    <div className={`rounded-2xl border p-4 transition-all
      ${isActive
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : isExpired
        ? 'bg-slate-800/40 border-slate-700/40'
        : 'bg-slate-900 border-slate-800 border-dashed'}`}>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            ${isActive
              ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
              : 'bg-slate-800/80'}`}>
            {isActive
              ? <ShieldCheck size={20} strokeWidth={2.5} />
              : <ShieldAlert size={20} className="text-slate-500" />}
          </div>
          <div>
            <p className={`text-sm font-bold ${isActive ? 'text-emerald-400' : 'text-slate-300'}`}>
              {config.label}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
              {isActive
                ? expiringSoon
                  ? `${days}일 후 만료 — 갱신 권장`
                  : config.description
                : isExpired
                ? '인증이 만료되었습니다'
                : '미인증 — KYC 인증을 완료해주세요'}
            </p>
          </div>
        </div>

        {isActive ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Verified</p>
            <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{days}일 유효</p>
          </div>
        ) : (
          <button onClick={onRequest}
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
            {isExpired ? '갱신하기' : '인증하기'}
            <ChevronRight size={12} strokeWidth={3} />
          </button>
        )}
      </div>

      {isActive && credential?.txHash && (
        <div className="mt-3 pt-3 border-t border-slate-800/50">
          <a href={`https://amoy.polygonscan.com/tx/${credential.txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-slate-600 hover:text-emerald-400 font-mono transition-colors flex items-center gap-1 bg-slate-950/50 px-2 py-1 rounded-md w-fit">
            TX: {credential.txHash.slice(0,16)}...
          </a>
        </div>
      )}
    </div>
  );
}

// ── CredentialPanel (WalletDetailView 내부 섹션) ──────────────
interface PanelProps {
  userId:          string;
  onRequestClaim?: () => void;
}

export function CredentialPanel({ userId, onRequestClaim }: PanelProps) {
  const [credential, setCredential] = useState<VerifiableCredential | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getCredentials(userId)
      .then(creds => {
        // NON_SANCTIONED ACTIVE 우선, 없으면 첫 번째
        const active = creds.find(c => c.type === 'NON_SANCTIONED' && c.status === 'ACTIVE');
        setCredential(active || creds[0] || null);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={16} className="animate-spin text-slate-500" />
    </div>
  );

  return (
    <CredentialBadge
      credential={credential || undefined}
      onRequest={onRequestClaim}
    />
  );
}

// ── CompactBadgeRow (슬롯 카드 하단) ─────────────────────────
interface CompactRowProps {
  userId:     string;
  onRequest?: () => void;
}

export function CompactBadgeRow({ userId, onRequest }: CompactRowProps) {
  const [credential, setCredential] = useState<VerifiableCredential | null>(null);

  useEffect(() => {
    if (!userId) return;
    getCredentials(userId).then(creds => {
      // NON_SANCTIONED ACTIVE가 있으면 그것으로 표시
      setCredential(
        creds.find(c => c.type === 'NON_SANCTIONED' && c.status === 'ACTIVE')
        || creds.find(c => c.status === 'ACTIVE')
        || null,
      );
    });
  }, [userId]);

  return (
    <CredentialBadge
      credential={credential || undefined}
      compact
      onRequest={onRequest}
    />
  );
}