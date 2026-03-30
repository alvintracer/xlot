// ============================================================
// SignRequestPopup.tsx — 서명 요청 확인 팝업
//
// 거래소가 personal_sign / eth_signTypedData_v4 를 요청하면
// 이 팝업이 표시되고, 사용자가 내용 확인 후 승인/거부한다.
// ============================================================

import { useState, useMemo } from 'react';
import { X, ShieldAlert, Globe, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { ethers } from 'ethers';
import type { SignRequest } from '../services/xlotEthereumProvider';

interface Props {
  request: SignRequest;
  wallet:  ethers.Wallet;
  onSign:  (signature: string) => void;
  onReject: () => void;
}

// ── 유틸 ─────────────────────────────────────────────────────

/** hex 문자열을 UTF-8 텍스트로 변환 (불가능하면 null) */
function hexToReadable(hex: string): string | null {
  try {
    if (!hex.startsWith('0x')) return null;
    const bytes = ethers.getBytes(hex);
    const text  = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // 제어문자(개행/탭 제외)가 포함되면 바이너리로 판단
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

/** JSON 문자열을 보기 좋게 포맷 (실패 시 원본 반환) */
function prettyJson(str: string): string {
  try { return JSON.stringify(JSON.parse(str), null, 2); }
  catch { return str; }
}

/** 출처 URL에서 호스트명만 추출 */
function extractHost(origin: string): string {
  try { return new URL(origin).hostname; }
  catch { return origin; }
}

/** 서명 타입 레이블 */
const TYPE_LABEL: Record<SignRequest['type'], { label: string; desc: string; color: string }> = {
  personal_sign:       { label: '메시지 서명',              desc: '일반 텍스트 서명 (로그인 등)',    color: 'text-blue-400'  },
  eth_sign:            { label: '메시지 서명 (Legacy)',      desc: '레거시 방식 서명',                 color: 'text-amber-400' },
  eth_signTypedData_v4:{ label: '구조화 데이터 서명 (EIP-712)', desc: '구조화된 데이터에 대한 서명',  color: 'text-purple-400'},
};

// ── 컴포넌트 ─────────────────────────────────────────────────

export function SignRequestPopup({ request, wallet, onSign, onReject }: Props) {
  const [signing, setSigning]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const typeInfo = TYPE_LABEL[request.type];
  const host     = extractHost(request.origin);

  /** 표시용 메시지 변환 */
  const displayMessage = useMemo(() => {
    const { type, message } = request;
    if (type === 'eth_signTypedData_v4') {
      return prettyJson(message);
    }
    // personal_sign / eth_sign: hex → UTF-8 시도
    const readable = hexToReadable(message);
    return readable ?? message;
  }, [request]);

  const isJson = request.type === 'eth_signTypedData_v4';

  // ── 서명 실행 ────────────────────────────────────────────
  const handleSign = async () => {
    setSigning(true); setError(null);
    try {
      let signature: string;

      if (request.type === 'personal_sign' || request.type === 'eth_sign') {
        // hex 메시지 → Uint8Array로 변환 후 signMessage
        // ethers.signMessage는 자동으로 "\x19Ethereum Signed Message:\n" prefix를 붙임
        const msgBytes = (() => {
          try {
            // 0x-prefixed hex → bytes
            if (request.message.startsWith('0x')) return ethers.getBytes(request.message);
          } catch {}
          // plain string 그대로
          return request.message;
        })();
        signature = await wallet.signMessage(msgBytes);
      } else {
        // eth_signTypedData_v4
        const { domain, types, message: value, primaryType } =
          JSON.parse(request.message) as {
            domain: ethers.TypedDataDomain;
            types:  Record<string, ethers.TypedDataField[]>;
            message: Record<string, any>;
            primaryType: string;
          };

        // ethers v6 signTypedData는 EIP712Domain을 types에서 제거해야 함
        const filteredTypes = { ...types };
        delete filteredTypes['EIP712Domain'];

        void primaryType; // ethers가 자동 결정
        signature = await wallet.signTypedData(domain, filteredTypes, value);
      }

      onSign(signature);
    } catch (e: any) {
      setError(e.message ?? '서명 실패');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/90 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-950 border-t border-slate-800 rounded-t-3xl shadow-2xl animate-slide-up">

        {/* ── 헤더 ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ShieldAlert size={18} className="text-amber-400" />
            </div>
            <div>
              <p className={`text-sm font-black ${typeInfo.color}`}>{typeInfo.label}</p>
              <p className="text-[10px] text-slate-500">{typeInfo.desc}</p>
            </div>
          </div>
          <button
            onClick={onReject}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">

          {/* ── 요청 출처 ──────────────────────────────────── */}
          <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800">
            <Globe size={14} className="text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-500 mb-0.5">요청 출처</p>
              <p className="text-sm font-bold text-white truncate">{host || '알 수 없음'}</p>
            </div>
          </div>

          {/* ── 서명 지갑 주소 ─────────────────────────────── */}
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 mb-1">서명 지갑</p>
            <p className="text-xs font-mono text-cyan-400 break-all">{wallet.address}</p>
          </div>

          {/* ── 메시지 내용 ────────────────────────────────── */}
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 mb-2">메시지 내용</p>
            <pre
              className={`text-xs break-all whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto
                ${isJson ? 'text-slate-300 font-mono' : 'text-white'}`}
            >
              {displayMessage}
            </pre>
          </div>

          {/* ── 경고 ───────────────────────────────────────── */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-300/80 leading-relaxed">
              서명은 자산 이동을 유발하지 않습니다. 주로 거래소 본인 확인(로그인·지갑 등록)에 사용됩니다.
              출처가 신뢰할 수 있는 거래소인지 꼭 확인하세요.
            </p>
          </div>

          {/* ── 에러 ───────────────────────────────────────── */}
          {error && (
            <p className="text-xs text-red-400 text-center p-3 bg-red-500/10 rounded-xl border border-red-500/20">
              {error}
            </p>
          )}
        </div>

        {/* ── 버튼 ───────────────────────────────────────────── */}
        <div className="flex gap-3 p-5 pt-3 border-t border-slate-800">
          <button
            onClick={onReject}
            disabled={signing}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-slate-300
              bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all disabled:opacity-40"
          >
            거부
          </button>
          <button
            onClick={handleSign}
            disabled={signing}
            className="flex-1 py-3.5 rounded-2xl font-black text-sm text-white
              bg-gradient-to-r from-amber-500 to-orange-500
              hover:shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all
              disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {signing ? (
              <><Loader2 size={15} className="animate-spin" /> 서명 중...</>
            ) : (
              <><CheckCircle2 size={15} /> 서명 승인</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
