// src/components/KYCBadge.tsx
// 지갑 카드 / 프로필에 붙는 KYC Credential 배지
// - ACTIVE: 색상 배지
// - EXPIRED: 회색 + 재인증 유도
// - 없음: 인증하기 버튼

import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { getCredentials, CLAIM_CONFIG, daysUntilExpiry } from '../services/credentialService';
import type { VerifiableCredential, ClaimType } from '../services/credentialService';

// ─── Single Badge ────────────────────────────────────────────────────────────

interface BadgeProps {
  claimType: ClaimType;
  credential?: VerifiableCredential;
  compact?: boolean;
  onRequest?: (type: ClaimType) => void;
}

export function CredentialBadge({ claimType, credential, compact = false, onRequest }: BadgeProps) {
  const config = CLAIM_CONFIG[claimType];
  const isActive  = credential?.status === 'ACTIVE';
  const isExpired = credential?.status === 'EXPIRED';
  const days      = credential && isActive ? daysUntilExpiry(credential) : 0;
  const expiringSoon = days > 0 && days <= 30;

  // compact 모드: 아이콘 + 텍스트만
  if (compact) {
    return (
      <span
        onClick={() => !isActive && onRequest?.(claimType)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all
          ${isActive
            ? `bg-${config.color}-500/15 border-${config.color}-500/30 text-${config.color}-400`
            : 'bg-slate-800 border-slate-700 text-slate-500 cursor-pointer hover:border-slate-500'}`}>
        <span>{config.icon}</span>
        {isActive ? config.label : `${config.label} 미인증`}
        {isActive && expiringSoon && <Clock size={8} className="text-amber-400" />}
      </span>
    );
  }

  // full 모드: 카드 형태
  return (
    <div className={`rounded-2xl border p-3.5 transition-all
      ${isActive
        ? `bg-${config.color}-500/8 border-${config.color}-500/25`
        : isExpired
        ? 'bg-slate-800/40 border-slate-700/40'
        : 'bg-slate-900 border-slate-800 border-dashed'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* 아이콘 */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0
            ${isActive ? `bg-${config.color}-500/15` : 'bg-slate-800'}`}>
            {isActive
              ? <span>{config.icon}</span>
              : isExpired
              ? <ShieldX size={16} className="text-slate-500" />
              : <ShieldAlert size={16} className="text-slate-600" />}
          </div>
          <div>
            <p className={`text-xs font-bold ${isActive ? `text-${config.color}-300` : 'text-slate-400'}`}>
              {config.label}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
              {isActive
                ? expiringSoon
                  ? `${days}일 후 만료 — 갱신 권장`
                  : config.description
                : isExpired
                ? '인증이 만료되었습니다. 재인증 필요'
                : '미인증 — 일부 기능이 제한됩니다'}
            </p>
          </div>
        </div>

        {/* 우측 상태 */}
        {isActive ? (
          <div className="shrink-0 text-right">
            <div className={`flex items-center gap-1 text-[10px] font-bold text-${config.color}-400`}>
              <ShieldCheck size={11} />
              <span>인증됨</span>
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">{days}일 남음</p>
          </div>
        ) : (
          <button
            onClick={() => onRequest?.(claimType)}
            className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-500/10 px-2.5 py-1.5 rounded-xl border border-cyan-500/20">
            {isExpired ? '갱신' : '인증'}
            <ChevronRight size={11} />
          </button>
        )}
      </div>

      {/* 온체인 증명 링크 */}
      {isActive && credential?.txHash && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800">
          <a
            href={`https://amoy.polygonscan.com/tx/${credential.txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[9px] text-slate-600 hover:text-slate-400 font-mono transition-colors">
            on-chain proof: {credential.txHash.slice(0, 12)}...
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Credential Panel (전체 목록) ────────────────────────────────────────────

interface CredentialPanelProps {
  userId: string;
  onRequestClaim?: (type: ClaimType) => void;
}

export function CredentialPanel({ userId, onRequestClaim }: CredentialPanelProps) {
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getCredentials(userId)
      .then(setCredentials)
      .finally(() => setLoading(false));
  }, [userId]);

  const findCred = (type: ClaimType) => credentials.find(c => c.type === type);
  const activeCount = credentials.filter(c => c.status === 'ACTIVE').length;

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={16} className="animate-spin text-slate-500" />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* 헤더 요약 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">KYC Credentials</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Privacy-Preserving · Powered by TranSight
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border
          ${activeCount === 3
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : activeCount > 0
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
          <ShieldCheck size={11} />
          {activeCount}/3 인증
        </div>
      </div>

      {/* 배지 목록 */}
      {(['ADULT', 'KOREAN', 'NON_SANCTIONED'] as ClaimType[]).map(type => (
        <CredentialBadge
          key={type}
          claimType={type}
          credential={findCred(type)}
          onRequest={onRequestClaim}
        />
      ))}

      {/* ZK 업그레이드 예고 배너 */}
      <div className="flex items-center gap-2.5 bg-slate-800/40 border border-slate-700/40 rounded-2xl px-3.5 py-3">
        <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
          <span className="text-sm">⚡</span>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400">Polygon ID 업그레이드 예정</p>
          <p className="text-[10px] text-slate-600 leading-snug">
            zk-SNARK 기반 완전 영지식 증명으로 전환 시 서버 신뢰도 제거
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Compact Row (지갑 카드 하단 배지 줄) ───────────────────────────────────

interface CompactBadgeRowProps {
  userId: string;
  onRequest?: (type: ClaimType) => void;
}

export function CompactBadgeRow({ userId, onRequest }: CompactBadgeRowProps) {
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);

  useEffect(() => {
    if (!userId) return;
    getCredentials(userId).then(setCredentials);
  }, [userId]);

  const findCred = (type: ClaimType) => credentials.find(c => c.type === type && c.status === 'ACTIVE');

  return (
    <div className="flex flex-wrap gap-1.5">
      {(['ADULT', 'KOREAN', 'NON_SANCTIONED'] as ClaimType[]).map(type => (
        <CredentialBadge
          key={type}
          claimType={type}
          credential={findCred(type)}
          compact
          onRequest={onRequest}
        />
      ))}
    </div>
  );
}