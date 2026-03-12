// src/services/kytService.ts
// TranSight KYT 연동 서비스
// FAIL_CLOSED 정책: API 장애 시 전송 차단
// MEDIUM/HIGH: 사유 입력 필수 후 진행
// CRITICAL / isSanctioned: 하드 블록

import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type KYTStatus = 'idle' | 'checking' | 'done' | 'error';

export interface RiskFlag {
  category: string;     // "OFAC" | "DARKNET" | "MIXER" | "SCAM" | "RANSOMWARE" | "KYT_UNAVAILABLE"
  severity: RiskLevel;
  description: string;
}

export interface RiskResult {
  address: string;
  network: string;
  riskScore: number;    // 0~100, -1이면 KYT 장애
  riskLevel: RiskLevel;
  flags: RiskFlag[];
  isSanctioned: boolean;
  isBlocked: boolean;   // true면 전송 불가
  kytAvailable: boolean;
  screenedAt: number;
}

export interface KYTReasonLog {
  address: string;
  network: string;
  riskLevel: RiskLevel;
  riskScore: number;
  reason: string;
  userUUID: string;
  timestamp: number;
}

// ─── Risk Level 설정 ─────────────────────────────────────────────────────────

export const RISK_CONFIG: Record<RiskLevel, {
  label: string;
  sublabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  iconColor: string;
  requiresReason: boolean;
  isBlocked: boolean;
}> = {
  LOW: {
    label: '안전',
    sublabel: '위험 요소가 발견되지 않았습니다',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-400/8',
    borderClass: 'border-emerald-400/20',
    iconColor: 'text-emerald-400',
    requiresReason: false,
    isBlocked: false,
  },
  MEDIUM: {
    label: '주의',
    sublabel: '일부 위험 신호가 감지되었습니다. 전송 사유를 입력하세요',
    colorClass: 'text-yellow-400',
    bgClass: 'bg-yellow-400/8',
    borderClass: 'border-yellow-400/20',
    iconColor: 'text-yellow-400',
    requiresReason: true,
    isBlocked: false,
  },
  HIGH: {
    label: '고위험',
    sublabel: '고위험 주소입니다. 반드시 전송 사유를 입력해야 합니다',
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-400/8',
    borderClass: 'border-orange-400/20',
    iconColor: 'text-orange-400',
    requiresReason: true,
    isBlocked: false,
  },
  CRITICAL: {
    label: '차단',
    sublabel: '제재 대상 또는 최고위험 주소입니다. 전송이 불가합니다',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/8',
    borderClass: 'border-red-500/25',
    iconColor: 'text-red-500',
    requiresReason: false,
    isBlocked: true,
  },
};

// ─── FAIL_CLOSED 기본값 ───────────────────────────────────────────────────────

const makeFailClosedResult = (address: string, network: string): RiskResult => ({
  address,
  network,
  riskScore: -1,
  riskLevel: 'CRITICAL',
  flags: [{
    category: 'KYT_UNAVAILABLE',
    severity: 'HIGH',
    description: '위험도 분석 서비스에 일시적으로 접근할 수 없습니다. 보안 정책에 따라 전송이 차단됩니다.',
  }],
  isSanctioned: false,
  isBlocked: true,       // FAIL_CLOSED
  kytAvailable: false,
  screenedAt: Date.now(),
});

// ─── Service ─────────────────────────────────────────────────────────────────

export const kytService = {

  /**
   * 주소 위험도 스크리닝
   * - FAIL_CLOSED: API 장애 시 isBlocked=true 반환
   * - 결과는 컴포넌트에서 RISK_CONFIG로 UI 처리
   */
  async screenAddress(
    address: string,
    network: string,
    amountUSD?: number
  ): Promise<RiskResult> {
    try {
      const { data, error } = await supabase.functions.invoke('kyt-screen', {
        body: {
          address: address.trim(),
          network,
          direction: 'out',
          amount_usd: amountUSD ?? 0,
        },
      });

      if (error) {
        console.error('[KYT] Edge function error:', error);
        return makeFailClosedResult(address, network);
      }

      // Edge Function이 kytAvailable: false를 반환하면 FAIL_CLOSED
      if (!data?.kytAvailable) {
        return makeFailClosedResult(address, network);
      }

      return data as RiskResult;

    } catch (err) {
      console.error('[KYT] Unexpected error:', err);
      return makeFailClosedResult(address, network);
    }
  },

  /**
   * MEDIUM/HIGH 사유 로그 저장
   * - kyt_reason_logs 테이블에 기록
   * - 실패해도 전송을 막지 않음 (사유 입력은 이미 완료된 상태)
   */
  async logReason(log: KYTReasonLog): Promise<void> {
    try {
      await supabase.from('kyt_reason_logs').insert({
        address: log.address,
        network: log.network,
        risk_level: log.riskLevel,
        risk_score: log.riskScore,
        reason: log.reason,
        user_uuid: log.userUUID,
        created_at: new Date(log.timestamp).toISOString(),
      });
    } catch (err) {
      console.error('[KYT] Reason log failed (non-blocking):', err);
    }
  },

  getRiskConfig(riskLevel: RiskLevel) {
    return RISK_CONFIG[riskLevel];
  },

  shouldBlock(result: RiskResult | null): boolean {
    if (!result) return false;
    return result.isBlocked || result.isSanctioned || !result.kytAvailable;
  },

  requiresReason(result: RiskResult | null): boolean {
    if (!result) return false;
    return RISK_CONFIG[result.riskLevel].requiresReason && !result.isBlocked;
  },

  /**
   * 전송 버튼 활성화 여부 판단
   * - checking 중: 비활성
   * - blocked: 비활성
   * - requiresReason이고 reason 미입력: 비활성
   * - 나머지: 활성
   */
  canProceed(
    status: KYTStatus,
    result: RiskResult | null,
    reason: string
  ): boolean {
    if (status === 'checking') return false;
    if (!result) return true; // 스크리닝 전 (주소 미입력 등)
    if (kytService.shouldBlock(result)) return false;
    if (kytService.requiresReason(result) && reason.trim().length < 5) return false;
    return true;
  },
};