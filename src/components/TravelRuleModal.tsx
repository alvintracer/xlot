// ============================================================
// TravelRuleModal.tsx — Travel Rule 수취인 정보 입력 모달
//
// 한국 특금법: 100만원 이상 외부 전송 시 표시
// ============================================================

import { useState, useEffect } from 'react';
import {
  X, ShieldCheck, AlertCircle, ChevronDown,
  User, Building2, FileText, Loader2, Check
} from 'lucide-react';
import type {
  TransferPurpose, TravelRulePayload,
} from '../services/travelRuleService';
import {
  PURPOSE_LABELS, validateTRPayload, generateReferenceId,
  getKnownVasps, TRAVEL_RULE_THRESHOLD_KRW,
} from '../services/travelRuleService';
import { loadKYCFromDevice, hasKYCOnDevice } from '../services/kycDeviceService';
import { SecureKeypad } from './SecureKeypad';
// TravelRuleData는 TravelRulePayload로 통합됨
type TravelRuleData = Partial<TravelRulePayload>;

interface Props {
  // 전송 정보 (미리 채워짐)
  originatorUserId:   string;
  originatorName?:    string;
  originatorAddress:  string;
  beneficiaryAddress: string;
  assetSymbol:        string;
  assetNetwork:       string;
  amountToken:        number;
  amountKrw:          number;
  amountUsd:          number;
  riskLevel?:         string;

  onConfirm: (refId: string, payload: TravelRulePayload) => void;
  onCancel:  () => void;
}

export function TravelRuleModal({
  originatorUserId, originatorName, originatorAddress,
  beneficiaryAddress, assetSymbol, assetNetwork,
  amountToken, amountKrw, amountUsd, riskLevel,
  onConfirm, onCancel,
}: Props) {
  const [isSelfTransfer, setIsSelfTransfer]   = useState(false);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryVasp, setBeneficiaryVasp] = useState('');
  const [isUnknownVasp, setIsUnknownVasp]     = useState(false);
  const [purpose, setPurpose]                 = useState<TransferPurpose | ''>('');
  const [purposeDetail, setPurposeDetail]     = useState('');
  const [isLoading, setIsLoading]             = useState(false);
  const [errors, setErrors]                   = useState<string[]>([]);

  // KYC 자동 입력
  const [kycPin, setKycPin]                   = useState('');
  const [kycAutoFilled, setKycAutoFilled]     = useState(false);
  const [showKycPin, setShowKycPin]           = useState(false);
  const hasKYC = hasKYCOnDevice(originatorUserId);
  const [showKycKeypad, setShowKycKeypad] = useState(false);

  const knownVasps = getKnownVasps();

  const handleConfirm = async () => {
    const data: Partial<TravelRuleData> = {
      isSelfTransfer,
      beneficiaryName: isSelfTransfer ? originatorName : beneficiaryName,
      transferPurpose: purpose as TransferPurpose,
      purposeDetail,
    };

    const { valid, errors: errs } = validateTRPayload(data);
    if (!valid) { setErrors(errs); return; }

    setIsLoading(true);
    setErrors([]);
    try {
      const refId = generateReferenceId();
      const payload: TravelRulePayload = {
        originatorUserId,
        originatorName,
        originatorAddress,
        beneficiaryAddress,
        beneficiaryName:  isSelfTransfer ? (originatorName || '본인') : beneficiaryName,
        beneficiaryVasp:  isUnknownVasp ? '알 수 없음' : (beneficiaryVasp || undefined),
        isSelfTransfer,
        assetSymbol,
        assetNetwork,
        amountToken,
        amountUsd,
        amountKrw,
        transferPurpose:  purpose as TransferPurpose,
        purposeDetail:    purpose === 'OTHER' ? purposeDetail : undefined,
        createdAt: Date.now(),
      };
      // refId와 payload를 부모로 전달 — 암호화/저장은 tx 완료 후 부모에서 처리
      onConfirm(refId, payload);
    } catch (e: any) {
      setErrors([e.message || 'Travel Rule 정보 처리 실패']);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t md:border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 pb-10 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">

        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Travel Rule 확인</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(amountKrw / 10000).toFixed(0)}만원 이상 전송 — 특금법 수취인 정보 필요
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* 전송 요약 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <p className="text-[10px] text-slate-500 font-bold">전송 정보</p>
          <div className="flex justify-between items-center">
            <span className="text-sm font-black text-white">
              {amountToken} {assetSymbol}
            </span>
            <span className="text-sm text-slate-400">
              ≈ ₩{amountKrw.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="font-mono">{beneficiaryAddress.slice(0,10)}...{beneficiaryAddress.slice(-6)}</span>
            <span>·</span>
            <span>{assetNetwork}</span>
          </div>
        </div>

        {/* 법적 안내 */}
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-cyan-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-cyan-300/80 leading-relaxed">
            한국 특금법 및 FATF Travel Rule에 따라{' '}
            <span className="font-bold">
              {(TRAVEL_RULE_THRESHOLD_KRW / 10000).toFixed(0)}만원 이상
            </span>{' '}
            가상자산 이전 시 수취인 정보 제공이 의무화됩니다.
          </p>
        </div>

        {/* 본인 지갑 여부 */}
        <div>
          <p className="text-xs text-slate-400 font-bold mb-2">수취 지갑 유형</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setIsSelfTransfer(false); }}
              className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                !isSelfTransfer
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              타인 지갑
            </button>
            <button
              onClick={() => {
                setIsSelfTransfer(true);
                setPurpose('SELF_TRANSFER');
              }}
              className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                isSelfTransfer
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              본인 지갑
            </button>
          </div>
        </div>

        {/* 수취인 이름 (타인 지갑일 때) */}
        {!isSelfTransfer && (
          <div>
            <label className="text-xs text-slate-400 font-bold mb-1 block flex items-center gap-1">
              <User size={12} /> 수취인 실명 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={beneficiaryName}
              onChange={e => setBeneficiaryName(e.target.value)}
              placeholder="홍길동"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </div>
        )}

        {/* KYC 자동 입력 (디바이스 KYC 등록된 경우) */}
        {hasKYC && !kycAutoFilled && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
            <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck size={11}/> KYC 정보 자동 입력 가능
            </p>
            <p className="text-[10px] text-slate-400">
              등록된 KYC 정보(실명)를 자동으로 입력합니다.
            </p>
            <button
                onClick={() => setShowKycKeypad(true)}
                className="w-full py-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center gap-2">
                <ShieldCheck size={12}/> 보안 키패드로 PIN 입력
              </button>
          </div>
        )}
        {kycAutoFilled && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
            <ShieldCheck size={11}/> KYC 정보 적용됨 (송신인 실명 자동 입력)
          </div>
        )}

        {/* 수취 VASP */}
        <div>
          <label className="text-xs text-slate-400 font-bold mb-1 block flex items-center gap-1">
            <Building2 size={12} /> 수취 거래소 / VASP
          </label>
          {!isUnknownVasp ? (
            <div className="space-y-2">
              <div className="relative">
                <select
                  value={beneficiaryVasp}
                  onChange={e => setBeneficiaryVasp(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 appearance-none"
                >
                  <option value="">선택 (선택사항)</option>
                  {knownVasps.map(v => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
              <button
                onClick={() => { setIsUnknownVasp(true); setBeneficiaryVasp(''); }}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                목록에 없음 / 개인 지갑
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={beneficiaryVasp}
                onChange={e => setBeneficiaryVasp(e.target.value)}
                placeholder="VASP명 입력 또는 '개인 지갑'"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50"
              />
              <button
                onClick={() => { setIsUnknownVasp(false); setBeneficiaryVasp(''); }}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                목록에서 선택
              </button>
            </div>
          )}
        </div>

        {/* 전송 목적 */}
        <div>
          <label className="text-xs text-slate-400 font-bold mb-2 block flex items-center gap-1">
            <FileText size={12} /> 전송 목적 <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(PURPOSE_LABELS) as [TransferPurpose, string][])
              .filter(([key]) => isSelfTransfer ? key === 'SELF_TRANSFER' : key !== 'SELF_TRANSFER')
              .map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPurpose(key)}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all text-left px-3 ${
                    purpose === key
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>

          {/* 기타 직접 입력 */}
          {purpose === 'OTHER' && (
            <textarea
              value={purposeDetail}
              onChange={e => setPurposeDetail(e.target.value)}
              placeholder="전송 목적을 구체적으로 입력해주세요 (5자 이상)"
              className="w-full mt-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 h-20 resize-none"
            />
          )}
        </div>

        {/* 에러 */}
        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle size={12} /> {e}
              </p>
            ))}
          </div>
        )}

        {/* 확인 버튼 */}
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="w-full py-4 rounded-2xl font-black text-base text-white bg-gradient-to-r from-cyan-500 to-blue-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
        >
          {isLoading
            ? <><Loader2 size={16} className="animate-spin" /> 저장 중...</>
            : <><Check size={16} /> 확인 및 전송 진행</>
          }
        </button>

        <p className="text-[10px] text-slate-600 text-center leading-relaxed">
          입력하신 정보는 특금법에 따라 5년간 보관되며,
          수사기관 요청 시 제공될 수 있습니다.
        </p>
      </div>
    </div>

    {showKycKeypad && (
      <SecureKeypad
        title="KYC PIN 입력"
        description="등록 시 설정한 PIN을 입력하세요"
        onClose={() => setShowKycKeypad(false)}
        onComplete={async (pin) => {
          setShowKycKeypad(false);
          try {
            const kycData = await loadKYCFromDevice(originatorUserId, pin);
            if (!kycData) { setErrors(['PIN이 올바르지 않습니다']); return; }
            setKycAutoFilled(true);
            setErrors([]);
          } catch { setErrors(['KYC 정보 복호화 실패']); }
        }}
      />
    )}
    </>
  );
}