/**
 * ExtensionInlineLogin.tsx
 *
 * 익스텐션 팝업 안에서 직접 이메일 OTP 로그인을 처리한다.
 * Google OAuth 는 COOP 정책으로 익스텐션에서 불가능하므로
 * 팝업 없이 동작하는 이메일 OTP 방식만 사용한다.
 *
 * Thirdweb v5 API:
 *   preAuthenticate({ client, strategy: "email", email })  → OTP 발송
 *   inAppWallet().connect({ client, strategy:"email", email, verificationCode }) → 연결
 */
import { useState } from "react";
import { useConnect } from "thirdweb/react";
import { inAppWallet } from "thirdweb/wallets";
import { preAuthenticate } from "thirdweb/wallets/in-app";
import { client } from "../client";
import { Mail, ArrowRight, KeyRound, RefreshCw } from "lucide-react";

type Step = "email" | "otp" | "connecting";

interface Props {
  /** SSS 복구 선택 시 콜백 */
  onSeedPhrase: () => void;
}

export function ExtensionInlineLogin({ onSeedPhrase }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { connect } = useConnect();

  // ── Step 1: 이메일 입력 후 OTP 발송 ─────────────────────────
  const handleSendOtp = async () => {
    if (!email.trim()) { setError("이메일을 입력해 주세요."); return; }
    setError("");
    setLoading(true);
    try {
      await preAuthenticate({ client, strategy: "email", email: email.trim() });
      setStep("otp");
    } catch (e: unknown) {
      setError((e as Error).message ?? "OTP 발송에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: OTP 입력 후 지갑 연결 ───────────────────────────
  const handleVerifyOtp = async () => {
    if (!otp.trim()) { setError("인증 코드를 입력해 주세요."); return; }
    setError("");
    setLoading(true);
    setStep("connecting");
    try {
      await connect(async () => {
        const wallet = inAppWallet();
        await wallet.connect({
          client,
          strategy: "email",
          email: email.trim(),
          verificationCode: otp.trim(),
        });
        return wallet;
      });
      // 연결 성공 → App.tsx의 useActiveAccount()가 자동으로 감지
    } catch (e: unknown) {
      setError((e as Error).message ?? "인증에 실패했습니다. 코드를 확인해 주세요.");
      setStep("otp");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-6">
      {/* 헤더 */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center overflow-hidden">
          <img src="/icon-192.png" alt="xLOT" className="w-full h-full object-contain rounded-xl" />
        </div>
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
          xLOT Wallet
        </h1>
      </div>

      <div className="w-full max-w-sm space-y-4">

        {/* ── 이메일 입력 ── */}
        {step === "email" && (
          <>
            <div className="space-y-2">
              <label className="text-slate-400 text-xs font-semibold tracking-wide">이메일</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                  placeholder="your@email.com"
                  className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span className="animate-spin h-4 w-4 border-2 border-black/30 border-t-black rounded-full" />
              ) : (
                <>인증 코드 보내기 <ArrowRight size={15} /></>
              )}
            </button>
          </>
        )}

        {/* ── OTP 입력 ── */}
        {step === "otp" && (
          <>
            <div className="text-center space-y-1">
              <p className="text-white text-sm font-semibold">인증 코드를 입력하세요</p>
              <p className="text-slate-500 text-xs">{email} 로 발송됐습니다</p>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
                placeholder="6자리 코드"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm text-center tracking-[0.4em] placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                autoFocus
              />
            </div>

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span className="animate-spin h-4 w-4 border-2 border-black/30 border-t-black rounded-full" />
              ) : (
                "로그인"
              )}
            </button>

            <button
              onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              className="w-full text-slate-600 text-xs hover:text-slate-400 transition-colors flex items-center justify-center gap-1"
            >
              <RefreshCw size={11} /> 다시 보내기
            </button>
          </>
        )}

        {/* ── 연결 중 ── */}
        {step === "connecting" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="animate-spin h-8 w-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full" />
            <p className="text-slate-400 text-sm">지갑 연결 중...</p>
          </div>
        )}

        {/* ── SSS 지갑 복구 옵션 ── */}
        {step !== "connecting" && (
          <div className="relative flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-slate-600 text-[11px]">또는</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>
        )}

        {step !== "connecting" && (
          <button
            onClick={onSeedPhrase}
            className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-400 text-xs font-semibold flex items-center justify-center gap-2 hover:border-slate-500 hover:text-slate-300 transition-all"
          >
            <KeyRound size={13} />
            SSS 비수탁 지갑으로 복구
          </button>
        )}
      </div>
    </div>
  );
}
