// src/components/KYTGuard.tsx
// 모든 전송 모달에서 공통으로 사용하는 KYT 리스크 UI 컴포넌트
// - 주소 입력 후 800ms debounce로 자동 스크리닝
// - MEDIUM/HIGH: 사유 입력 textarea 노출
// - CRITICAL / KYT 장애: 전송 불가 배지

import { useEffect, useRef } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldOff, Loader2 } from 'lucide-react';
import type { RiskResult, KYTStatus } from '../services/kytService';
import { RISK_CONFIG } from '../services/kytService';

interface KYTGuardProps {
  // 스크리닝 대상 주소
  address: string;
  // 네트워크 (ethereum / solana / tron 등)
  network: string;
  // USD 기준 금액 (선택)
  amountUSD?: number;
  // 현재 KYT 상태 (부모에서 관리)
  kytStatus: KYTStatus;
  // 스크리닝 결과 (부모에서 관리)
  kytResult: RiskResult | null;
  // 사유 입력값 (부모에서 관리)
  reason: string;
  // 상태 변경 콜백
  onStatusChange: (status: KYTStatus) => void;
  onResultChange: (result: RiskResult | null) => void;
  onReasonChange: (reason: string) => void;
  // KYT 스크리닝 실행 함수 (부모에서 주입 — 서비스 직접 호출)
  onScreen: (address: string, network: string, amountUSD?: number) => Promise<RiskResult>;
}

export function KYTGuard({
  address,
  network,
  amountUSD,
  kytStatus,
  kytResult,
  reason,
  onStatusChange,
  onResultChange,
  onReasonChange,
  onScreen,
}: KYTGuardProps) {

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 주소가 바뀌면 debounce 후 자동 스크리닝
  useEffect(() => {
    // 주소가 충분히 입력되지 않으면 초기화
    if (!address || address.length < 20) {
      onStatusChange('idle');
      onResultChange(null);
      onReasonChange('');
      return;
    }

    // 이전 타이머 클리어
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      onStatusChange('checking');
      onResultChange(null);
      onReasonChange('');
      try {
        const result = await onScreen(address, network, amountUSD);
        onResultChange(result);
        onStatusChange('done');
      } catch {
        onStatusChange('error');
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [address, network]);

  // ─── idle: 아무것도 표시 안 함 ──────────────────────────────────────────────
  if (kytStatus === 'idle') return null;

  // ─── checking ──────────────────────────────────────────────────────────────
  if (kytStatus === 'checking') {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 mt-2">
        <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
        <span className="text-xs text-slate-400">TranSight로 주소 위험도 분석 중...</span>
      </div>
    );
  }

  // ─── error ─────────────────────────────────────────────────────────────────
  if (kytStatus === 'error' || !kytResult) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/25 mt-2">
        <ShieldOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="text-xs text-red-400">위험도 분석 실패 — 보안 정책에 따라 전송이 차단됩니다</span>
      </div>
    );
  }

  // ─── done: 결과 표시 ────────────────────────────────────────────────────────
  const config = RISK_CONFIG[kytResult.riskLevel];

  const Icon = () => {
    if (!kytResult.kytAvailable) return <ShieldOff className={`w-4 h-4 ${config.iconColor} shrink-0`} />;
    if (kytResult.riskLevel === 'LOW') return <ShieldCheck className={`w-4 h-4 ${config.iconColor} shrink-0`} />;
    if (kytResult.riskLevel === 'CRITICAL') return <ShieldX className={`w-4 h-4 ${config.iconColor} shrink-0`} />;
    return <ShieldAlert className={`w-4 h-4 ${config.iconColor} shrink-0`} />;
  };

  return (
    <div className={`rounded-xl border mt-2 overflow-hidden ${config.bgClass} ${config.borderClass}`}>
      
      {/* 리스크 헤더 */}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Icon />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-bold ${config.colorClass}`}>
              {config.label}
            </span>
            {kytResult.kytAvailable && kytResult.riskScore >= 0 && (
              <span className="text-[10px] text-slate-500">
                위험도 {kytResult.riskScore}/100
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
            {config.sublabel}
          </p>
        </div>
      </div>

      {/* 플래그 상세 (KYT_UNAVAILABLE 제외) */}
      {kytResult.flags.length > 0 && kytResult.flags[0].category !== 'KYT_UNAVAILABLE' && (
        <div className={`px-3 pb-2.5 space-y-1 border-t ${config.borderClass}`}>
          {kytResult.flags.map((flag, i) => (
            <div key={i} className="flex items-start gap-1.5 pt-2">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.bgClass} ${config.colorClass}`}>
                {flag.category}
              </span>
              <span className="text-[10px] text-slate-400 leading-snug">{flag.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* 제재 대상 특별 경고 */}
      {kytResult.isSanctioned && (
        <div className={`px-3 pb-2.5 border-t ${config.borderClass}`}>
          <p className="text-[11px] text-red-400 font-medium pt-2">
            ⚠️ OFAC / UN 제재 대상 주소입니다. 전송이 영구 차단됩니다.
          </p>
        </div>
      )}

      {/* MEDIUM / HIGH: 사유 입력 */}
      {config.requiresReason && !kytResult.isBlocked && (
        <div className={`px-3 pb-3 border-t ${config.borderClass}`}>
          <label className={`block text-[11px] font-bold ${config.colorClass} pt-2.5 mb-1.5`}>
            전송 사유 입력 필수
          </label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="이 주소로 전송하는 사유를 입력하세요 (최소 5자)"
            rows={2}
            className={`w-full bg-slate-950/60 border rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 
              focus:outline-none focus:ring-1 resize-none
              ${config.borderClass} focus:ring-current`}
          />
          {reason.trim().length > 0 && reason.trim().length < 5 && (
            <p className="text-[10px] text-slate-500 mt-1">최소 5자 이상 입력해주세요 ({reason.trim().length}/5)</p>
          )}
        </div>
      )}
    </div>
  );
}