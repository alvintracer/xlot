// src/components/CexWithdrawModal.tsx
// [KYT 연동] 수정 내역:
// 1. kytService + KYTGuard import 추가
// 2. INPUT_AMOUNT 단계에서 selectedTarget.withdraw_address에 KYTGuard 삽입
// 3. handleWithdraw에 KYT 차단 로직 추가
// 4. 출금 버튼 disabled 조건에 kytService.canProceed 적용
// 기존 화이트리스트 주소록 로직은 100% 유지

import { useState, useEffect } from "react";
import { X, ArrowRight, Loader2, CheckCircle, AlertTriangle, Book, ExternalLink } from "lucide-react";
import type { WalletSlot } from "../services/walletService";
import { getUpbitChance, withdrawUpbitCoin, fetchUpbitWithdrawAddresses } from "../services/upbitService";

// ✨ [KYT 추가]
import { kytService } from "../services/kytService";
import type { RiskResult, KYTStatus } from "../services/kytService";
import { KYTGuard } from "./KYTGuard";

interface Props {
  sourceWallet: WalletSlot;
  targetAddress?: string;
  targetNetwork?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CexWithdrawModal({ sourceWallet, targetAddress, targetNetwork, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'SELECT_ASSET' | 'SELECT_ADDRESS' | 'INPUT_AMOUNT' | 'RESULT'>('SELECT_ASSET');
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [allowList, setAllowList] = useState<any[]>([]);
  const [filteredAddresses, setFilteredAddresses] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chanceInfo, setChanceInfo] = useState<any>(null);
  const [showRegisterGuide, setShowRegisterGuide] = useState(false);

  // ✨ [KYT 추가] INPUT_AMOUNT 단계에서 withdraw_address 스크리닝
  const [kytStatus, setKytStatus] = useState<KYTStatus>('idle');
  const [kytResult, setKytResult] = useState<RiskResult | null>(null);
  const [reason, setReason] = useState('');

  // 단계 변경 시 KYT 상태 초기화
  useEffect(() => {
    setKytStatus('idle');
    setKytResult(null);
    setReason('');
  }, [step, selectedTarget]);

  useEffect(() => {
    async function loadAddresses() {
      if (!sourceWallet.api_access_key) return;
      try {
        const list = await fetchUpbitWithdrawAddresses(sourceWallet.api_access_key!, sourceWallet.api_secret_key!);
        if (Array.isArray(list)) setAllowList(list);
      } catch (e) {
        console.error(e);
        setError("출금 주소록을 불러오지 못했습니다.");
      }
    }
    loadAddresses();
  }, [sourceWallet]);

  const handleSelectAsset = (asset: any) => {
    setSelectedAsset(asset);
    let validAddrs = allowList.filter(item => item.currency === asset.symbol);
    if (targetAddress) {
      const targetLower = targetAddress.toLowerCase();
      const matched = validAddrs.filter(item => item.withdraw_address.toLowerCase() === targetLower);
      if (matched.length > 0) validAddrs = matched;
    }
    setFilteredAddresses(validAddrs);
    setStep('SELECT_ADDRESS');
    setShowRegisterGuide(false);
  };

  const handleSelectAddress = async (target: any) => {
    setSelectedTarget(target);
    setLoading(true);
    setError(null);
    try {
      const info = await getUpbitChance(sourceWallet.api_access_key!, sourceWallet.api_secret_key!, target.currency, target.net_type);
      if (info.error) throw new Error(info.error.message);
      setChanceInfo(info);
      setStep('INPUT_AMOUNT');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!amount || !selectedTarget) return;

    // ✨ [KYT 추가] 출금 전 최종 KYT 차단 체크
    if (!kytService.canProceed(kytStatus, kytResult, reason)) {
      if (kytService.shouldBlock(kytResult)) {
        setError('보안 정책에 따라 이 주소로의 출금이 차단되었습니다.');
      } else if (kytService.requiresReason(kytResult) && reason.trim().length < 5) {
        setError('출금 사유를 입력해주세요 (최소 5자).');
      }
      return;
    }

    // ✨ [KYT 추가] MEDIUM/HIGH 사유 로그 (논블로킹)
    if (kytResult && kytService.requiresReason(kytResult) && reason.trim()) {
      kytService.logReason({
        address: selectedTarget.withdraw_address,
        network: selectedTarget.net_type?.toLowerCase() ?? 'unknown',
        riskLevel: kytResult.riskLevel,
        riskScore: kytResult.riskScore,
        reason: reason.trim(),
        userUUID: sourceWallet.id,
        timestamp: Date.now(),
      });
    }

    setLoading(true);
    setError(null);
    try {
      await withdrawUpbitCoin(
        sourceWallet.api_access_key!, sourceWallet.api_secret_key!, selectedAsset.symbol, amount,
        selectedTarget.net_type, selectedTarget.withdraw_address, selectedTarget.secondary_address
      );
      setStep('RESULT');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const coinAssets = sourceWallet.assets.filter(a => a.symbol !== 'KRW' && a.balance > 0);
  const openUpbitLink = (url: string) => window.open(url, '_blank');

  // ✨ [KYT 추가] 출금 버튼 비활성 조건
  const isWithdrawDisabled =
    loading ||
    !amount ||
    !kytService.canProceed(kytStatus, kytResult, reason);

  // ✨ [KYT 추가] 출금 주소의 네트워크 → TranSight 코드
  const networkForKYT = selectedTarget?.net_type?.toLowerCase() ?? 'ethereum';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-900 shrink-0">
          <h3 className="font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400">Upbit</span> 출금
            {targetAddress && <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">채우기 모드</span>}
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-500 hover:text-white" /></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">

          {/* Step 1: 코인 선택 */}
          {step === 'SELECT_ASSET' && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400 mb-4">출금할 코인을 선택하세요.</p>
              {coinAssets.map(asset => (
                <button key={asset.symbol} onClick={() => handleSelectAsset(asset)} className="w-full flex justify-between items-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 hover:border-indigo-500/50 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="font-bold text-white">{asset.symbol}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">{asset.balance}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: 주소 선택 */}
          {step === 'SELECT_ADDRESS' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep('SELECT_ASSET')} className="text-xs text-slate-500 hover:text-white">← 뒤로</button>
                <span className="text-sm font-bold text-white">{selectedAsset.symbol} 출금 주소 선택</span>
              </div>

              {filteredAddresses.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                  {!showRegisterGuide ? (
                    <>
                      <Book className="mx-auto text-slate-600 mb-3" size={32} />
                      <p className="text-sm text-slate-400 mb-4">등록된 출금 주소가 없습니다.</p>
                      <button
                        onClick={() => setShowRegisterGuide(true)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20"
                      >
                        한번 연결하고 언제든 편하게 보내기! 🚀
                      </button>
                    </>
                  ) : (
                    <div className="px-4 animate-fade-in-up">
                      <h4 className="text-white font-bold mb-4">업비트에 개인지갑이 등록되어 있나요?</h4>
                      <div className="space-y-3">
                        <button onClick={() => openUpbitLink('https://upbit.com/mypage/open_api_management?tab=fund_source')} className="w-full p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-all">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-green-400">네, 있습니다</span>
                            <ExternalLink size={12} className="text-slate-500" />
                          </div>
                          <p className="text-[10px] text-slate-400">오픈API 출금 허용 주소로 등록하러 가기</p>
                        </button>
                        <button onClick={() => openUpbitLink('https://upbit.com/mypage/customer_info/personal_wallet/select-network')} className="w-full p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-all">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-slate-300">아니오 (지갑 등록부터)</span>
                            <ExternalLink size={12} className="text-slate-500" />
                          </div>
                          <p className="text-[10px] text-slate-400">개인지갑 주소 관리 페이지로 이동</p>
                        </button>
                      </div>
                      <button onClick={() => setShowRegisterGuide(false)} className="mt-4 text-xs text-slate-500 underline">처음으로</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAddresses.map((addr, idx) => (
                    <button key={idx} onClick={() => handleSelectAddress(addr)} className="w-full text-left p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded uppercase">
                          {addr.network_name || addr.net_type}
                        </span>
                        {addr.wallet_type && <span className="text-[10px] text-slate-500">{addr.wallet_type}</span>}
                      </div>
                      <div className="text-sm text-white font-mono break-all mb-1">{addr.withdraw_address}</div>
                      {addr.secondary_address && <div className="text-[10px] text-amber-500">Tag: {addr.secondary_address}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: 금액 입력 + KYT */}
          {step === 'INPUT_AMOUNT' && chanceInfo && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep('SELECT_ADDRESS')} className="text-xs text-slate-500 hover:text-white">← 주소 재선택</button>
              </div>

              {/* 출금 주소 표시 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-500 mb-1">받는 주소 ({selectedTarget.network_name})</p>
                <p className="text-xs text-white font-mono break-all">{selectedTarget.withdraw_address}</p>
              </div>

              {/* ✨ [KYT 추가] 출금 주소 KYTGuard */}
              <KYTGuard
                address={selectedTarget.withdraw_address}
                network={networkForKYT}
                amountUSD={undefined}
                kytStatus={kytStatus}
                kytResult={kytResult}
                reason={reason}
                onStatusChange={setKytStatus}
                onResultChange={setKytResult}
                onReasonChange={setReason}
                onScreen={kytService.screenAddress.bind(kytService)}
              />

              {/* 잔액 / 수수료 */}
              <div className="flex items-center justify-between bg-indigo-500/10 p-4 rounded-xl border border-indigo-500/20">
                <div>
                  <p className="text-xs text-indigo-300 font-bold mb-1">출금 가능</p>
                  <p className="text-lg font-bold text-white">{selectedAsset.balance} <span className="text-sm">{selectedAsset.symbol}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">수수료</p>
                  <p className="text-sm text-slate-400">{chanceInfo.currency.withdraw_fee} {selectedAsset.symbol}</p>
                </div>
              </div>

              {/* 수량 입력 */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">출금 수량</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-lg font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button onClick={() => setAmount(selectedAsset.balance.toString())} className="px-3 rounded-xl bg-slate-800 text-xs font-bold text-indigo-400 hover:bg-slate-700">최대</button>
                </div>
              </div>

              {/* 출금 버튼 */}
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawDisabled}
                className={`w-full py-4 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2
                  ${kytService.shouldBlock(kytResult)
                    ? 'bg-slate-800 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                {kytService.shouldBlock(kytResult) ? '출금 차단됨' :
                  kytStatus === 'checking' ? '위험도 분석 중...' :
                  '출금 요청하기'}
              </button>
            </div>
          )}

          {/* Step 4: 결과 */}
          {step === 'RESULT' && (
            <div className="text-center py-10">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">출금 요청 완료</h3>
              <p className="text-slate-400 text-sm mb-6">
                업비트 앱에서 카카오페이/네이버 인증을<br />완료해야 출금이 진행됩니다.
              </p>
              <button onClick={onSuccess} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold">확인</button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}