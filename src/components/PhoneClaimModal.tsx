import { useState } from "react";
// ✨ Thirdweb v5 Imports
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall } from "thirdweb";
import { polygonAmoy } from "thirdweb/chains";
import { supabase } from "../lib/supabase";
import { Loader2, X, Gift } from "lucide-react";
import { ConnectButton } from "thirdweb/react";
import { client, smartWalletConfig } from "../client"; // 위에서 만든 설정 임포트

// ⚠️ 배포한 PhoneEscrow 컨트랙트 주소
const ESCROW_CONTRACT_ADDRESS = "0xe114dcC6423729D1f6eE6c71E739A2630f535f64"; 

const escrowContract = getContract({
  client,
  chain: polygonAmoy,
  address: ESCROW_CONTRACT_ADDRESS,
});

export function PhoneClaimModal({ commitment, onClose }: { commitment: string, onClose: () => void }) {
  const smartAccount = useActiveAccount();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<'PHONE' | 'OTP' | 'CLAIM'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const { mutate: sendTransaction, isPending: isClaiming } = useSendTransaction();

  // ✨ [핵심] 전화번호 강제 통일 함수 (E.164 포맷)
  // 010-1234-5678 -> +821012345678
  const normalizePhone = (raw: string) => {
    let clean = raw.replace(/[^0-9+]/g, ''); // 숫자, + 빼고 다 제거
    if (clean.startsWith('010')) {
      return `+82${clean.slice(1)}`;
    }
    return clean;
  };

  // 1. OTP 전송
  const handleSendOtp = async () => {
    if (!phone) return alert("전화번호를 입력해주세요.");
    setLoading(true);
    try {
      // ✨ 여기서 변환!
      const finalPhone = normalizePhone(phone);
      console.log("OTP 전송 번호:", finalPhone);

      const { error } = await supabase.auth.signInWithOtp({ phone: finalPhone });
      if (error) throw error;
      setStep('OTP');
    } catch (e: any) {
      alert("OTP 전송 실패: " + e.message);
    } finally {
      setLoading(false);
    }
  };

// 2. OTP 검증 & 서명 & 수령
  const handleVerifyAndClaim = async () => {
    if (!smartAccount) return alert("지갑을 먼저 연결해주세요!");
    setLoading(true);
    setStatusMsg("휴대폰 인증 확인 중...");

    try {
      // ✨ 1. 검증할 때도 번호 포맷 통일! (+82...)
      // (normalizePhone 함수가 이 함수 위에 정의되어 있어야 합니다)
      const finalPhone = normalizePhone(phone);
      
      // ✨ 2. Supabase Auth 검증
      const { data: authData, error } = await supabase.auth.verifyOtp({ 
        phone: finalPhone, 
        token: otp, 
        type: 'sms' 
      });

      if (error) {
        console.error("OTP Error:", error);
        throw new Error("인증번호가 틀렸거나 만료되었습니다.");
      }
      
      if (!authData.session) throw new Error("세션 생성 실패 (로그인 처리 안됨)");

      setStatusMsg("서버 서명 요청 중...");
      
      // ✨ 3. 방금 받은 따끈한 토큰 추출
const accessToken = authData.session.access_token;
const refreshToken = authData.session.refresh_token; // ✨ [추가] 리프레시 토큰 추출

      // ✨ [수정] access_token과 refresh_token을 모두 보냅니다.
      const { data, error: fnError } = await supabase.functions.invoke('sign-claim', {
        body: { 
            commitment, 
            recipientAddress: smartAccount.address,
            token: accessToken,
            refreshToken: refreshToken // 🔥 여기 추가!
        }
      });

      if (fnError) throw new Error("함수 에러: " + fnError.message);
      if (data?.error) throw new Error(data.error);

      if (!data.signature) throw new Error("서명 데이터 없음");
      setStatusMsg("블록체인 수령 처리 중...");

      // ✨ 5. 컨트랙트 호출
      const transaction = prepareContractCall({
        contract: escrowContract,
        method: "function claim(bytes32 commitment, bytes signature)",
        params: [
            commitment as `0x${string}`, 
            data.signature as `0x${string}`
        ], 
      });

      // 전송 (await를 붙여서 완료될 때까지 기다리는 게 좋습니다)
      sendTransaction(transaction);
      
      setStep('CLAIM');

    } catch (e: any) {
      console.error(e);
      // 🔥 여기서 이제 "상세에러(Auth): ..." 같은 메시지가 뜰 겁니다.
      alert("진행 실패: " + e.message); 
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  // ... (UI 부분은 기존과 동일)
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[200] p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 border border-slate-700 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
        
        {step === 'CLAIM' ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">수령 완료!</h2>
            <p className="text-slate-400 mb-6">잠시 후 지갑에 토큰이 입금됩니다.</p>
            <button onClick={onClose} className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold">닫기</button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                <Gift size={32} className="text-white"/>
              </div>
              <h2 className="text-xl font-bold text-white">송금이 도착했습니다!</h2>
              <p className="text-sm text-slate-400">본인 인증 후 수령하세요.</p>
            </div>
            {!smartAccount ? (
            <div className="bg-slate-800/50 p-6 rounded-xl text-center space-y-4">
                <p className="text-slate-300 mb-2">수령하려면 지갑을 연결하세요.<br/>(구글 로그인 등 지원)</p>
                
                {/* ✨ [핵심] accountAbstraction 옵션 추가 */}
                <ConnectButton 
                client={client}
                accountAbstraction={smartWalletConfig} // 🔥 이걸 넣어야 가스비 무료!
                connectButton={{ label: "지갑 생성/연결하고 받기" }}
                connectModal={{
                    size: "compact",
                    title: "xLOT 수령하기",
                    showThirdwebBranding: false,
                }}
                />
            </div>
            ) : (
              <div className="space-y-4">
                {step === 'PHONE' ? (
                  <>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">휴대폰 번호</label>
                      <input 
                        type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-cyan-500"
                      />
                    </div>
                    <button onClick={handleSendOtp} disabled={loading} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 flex justify-center">
                      {loading ? <Loader2 className="animate-spin"/> : "인증번호 받기"}
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">인증번호 6자리</label>
                      <input 
                        type="text" value={otp} onChange={e => setOtp(e.target.value)}
                        placeholder="123456"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-cyan-500 text-center tracking-widest text-lg"
                      />
                    </div>
                    {statusMsg && <p className="text-xs text-cyan-400 text-center animate-pulse">{statusMsg}</p>}
                    <button onClick={handleVerifyAndClaim} disabled={loading || isClaiming} className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-500 flex justify-center">
                      {(loading || isClaiming) ? <Loader2 className="animate-spin"/> : "인증하고 받기"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}