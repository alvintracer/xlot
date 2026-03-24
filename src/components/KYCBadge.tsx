// src/components/KYCBadge.tsx
// 수정판: 단일 통합 KYC 배지

import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { getCredentials, CLAIM_CONFIG, daysUntilExpiry } from '../services/credentialService';
import type { VerifiableCredential } from '../services/credentialService';

interface BadgeProps {
  credential?: VerifiableCredential;
  compact?: boolean;
  onRequest?: () => void;
}

export function CredentialBadge({ credential, compact = false, onRequest }: BadgeProps) {
  const config = CLAIM_CONFIG.KYC_VERIFIED;
  const isActive  = credential?.status === 'ACTIVE';
  const isExpired = credential?.status === 'EXPIRED';
  const days      = credential && isActive ? daysUntilExpiry(credential) : 0;
  const expiringSoon = days > 0 && days <= 30;

  if (compact) {
    return (
      <span
        onClick={() => !isActive && onRequest?.()}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all
          ${isActive
            ? `bg-emerald-500/15 border-emerald-500/30 text-emerald-400`
            : 'bg-slate-800/80 border-slate-700 text-slate-400 cursor-pointer hover:border-slate-500 hover:text-white'}`}>
        <ShieldCheck size={12} strokeWidth={2.5} />
        {isActive ? config.label : `${config.label} 필요`}
        {isActive && expiringSoon && <Clock size={8} className="text-amber-400" />}
      </span>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 transition-all shadow-lg
      ${isActive
        ? `bg-emerald-500/10 border-emerald-500/30`
        : isExpired
        ? 'bg-slate-800/40 border-slate-700/40'
        : 'bg-slate-900 border-slate-800 border-dashed'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            ${isActive ? `bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]` : 'bg-slate-800/80'}`}>
            {isActive
              ? <ShieldCheck size={20} strokeWidth={2.5} />
              : <ShieldAlert size={20} className="text-slate-500" />}
          </div>
          <div>
            <p className={`text-sm font-bold tracking-tight ${isActive ? `text-emerald-400` : 'text-slate-300'}`}>
              {config.label}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
              {isActive
                ? expiringSoon
                  ? `${days}일 후 만료 — 갱신 권장`
                  : config.description
                : isExpired
                ? '인증이 만료되었습니다. 재인증 필요'
                : '미인증 — 모든 자산 거래가 제한됩니다'}
            </p>
          </div>
        </div>

        {isActive ? (
          <div className="shrink-0 text-right">
            <div className={`flex items-center justify-end gap-1 text-[10px] font-black text-emerald-400 uppercase tracking-widest`}>
              <span>Verified</span>
            </div>
            <p className="text-[9px] text-slate-500 mt-1 font-mono">{days}일 유효</p>
          </div>
        ) : (
          <button
            onClick={onRequest}
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
            {isExpired ? '갱신하기' : '인증하기'}
            <ChevronRight size={12} strokeWidth={3} />
          </button>
        )}
      </div>

      {isActive && credential?.txHash && (
        <div className="mt-3 pt-3 border-t border-slate-800/50 flexjustify-end">
          <a
            href={`https://amoy.polygonscan.com/tx/${credential.txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-slate-600 hover:text-emerald-400 font-mono transition-colors flex items-center gap-1 bg-slate-950/50 px-2 py-1 rounded-md w-fit">
            <span>TX:</span> {credential.txHash.slice(0, 16)}...
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Credential Panel (프로필용) ────────────────────────────────────────────

interface CredentialPanelProps {
  userId: string;
  onRequestClaim?: () => void;
}

export function CredentialPanel({ userId, onRequestClaim }: CredentialPanelProps) {
  const [credential, setCredential] = useState<VerifiableCredential | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getCredentials(userId)
      .then(creds => {
        const active = creds.find(c => c.status === 'ACTIVE');
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
    <div className="space-y-4">
      {/* 부분: 통과 여부 */}
      <CredentialBadge
        credential={credential || undefined}
        onRequest={onRequestClaim}
      />
    </div>
  );
}

// ─── Compact Row (AssetView 카드 하단 배지) ───────────────────────────────────

interface CompactBadgeRowProps {
  userId: string;
  onRequest?: () => void;
}

export function CompactBadgeRow({ userId, onRequest }: CompactBadgeRowProps) {
  const [credential, setCredential] = useState<VerifiableCredential | null>(null);

  useEffect(() => {
    if (!userId) return;
    getCredentials(userId).then(creds => {
      setCredential(creds.find(c => c.status === 'ACTIVE') || null);
    });
  }, [userId]);

  return (
    <div className="flex">
      <CredentialBadge
        credential={credential || undefined}
        compact
        onRequest={onRequest}
      />
    </div>
  );
}