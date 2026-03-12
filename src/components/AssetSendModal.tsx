// src/components/AssetSendModal.tsx
// [KYT 연동] 수정 내역:
// 1. 기존 deny_list 기반 checkAddressRisk, RiskStatus 완전 제거
// 2. kytService + KYTGuard로 교체
// 3. handleSend의 RISKY confirm() 제거 → kytService.canProceed로 대체
// 4. supabase deny_list 직접 쿼리 제거 (kyt-screen Edge Function이 처리)

import { useState, useEffect, useMemo } from "react";
import {
  useSendTransaction as useWagmiSend,
  useWaitForTransactionReceipt
} from "wagmi";
import { parseEther } from "viem";
import {
  useActiveAccount,
  useSendTransaction as useThirdwebSend
} from "thirdweb/react";
import {
  prepareTransaction,
  toWei,
  getContract,
  prepareContractCall
} from "thirdweb";
import { polygonAmoy, sepolia } from "thirdweb/chains";
import { transfer } from "thirdweb/extensions/erc20";
import { client } from "../client";
import {
  X, Loader2, ChevronDown, Wallet, ArrowRightLeft, Smartphone,
  Copy, CheckCircle2
} from "lucide-react";
import { getMyWallets } from "../services/walletService";
import type { WalletSlot, WalletAsset } from "../services/walletService";
import { fetchCryptoPrices } from "../services/priceService";
import type { PriceData } from "../services/priceService";
import { supabase } from "../lib/supabase";

// ✨ [KYT 추가]
import { kytService } from "../services/kytService";
import type { RiskResult, KYTStatus } from "../services/kytService";
import { KYTGuard } from "./KYTGuard";

const ESCROW_CONTRACT_ADDRESS = "0xe114dcC6423729D1f6eE6c71E739A2630f535f64";

type InputMode = 'TOKEN' | 'KRW' | 'USD';
type SendType = 'ADDRESS' | 'PHONE';

export function SendModal({ onClose }: { onClose: () => void }) {
  const [wallets, setWallets] = useState<WalletSlot[]>([]);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedWallet, setSelectedWallet] = useState<WalletSlot | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [sendType, setSendType] = useState<SendType>('ADDRESS');

  const [toAddress, setToAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>('TOKEN');

  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>("");

  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);

  // ✨ [KYT 추가] — 기존 riskStatus/riskDetail 완전 대체
  const [kytStatus, setKytStatus] = useState<KYTStatus>('idle');
  const [kytResult, setKytResult] = useState<RiskResult | null>(null);
  const [reason, setReason] = useState('');

  const smartAccount = useActiveAccount();

  const { sendTransaction: sendWagmi, data: wagmiHash, isPending: isWagmiPending } = useWagmiSend();
  const { isLoading: isWagmiConfirming } = useWaitForTransactionReceipt({ hash: wagmiHash });
  const { mutateAsync: sendThirdwebTx, isPending: isThirdwebPending } = useThirdwebSend();

  const escrowContract = getContract({
    client,
    chain: polygonAmoy,
    address: ESCROW_CONTRACT_ADDRESS,
  });

  useEffect(() => {
    const init = async () => {
      if (!smartAccount) return;
      try {
        const [walletList, priceData] = await Promise.all([
          getMyWallets(smartAccount.address),
          fetchCryptoPrices()
        ]);
        const validWallets = walletList.filter(w => w.wallet_type !== 'UPBIT');
        setWallets(validWallets);
        setPrices(priceData);
        const defaultWallet = validWallets.find(w => w.wallet_type === 'XLOT') || validWallets[0];
        setSelectedWallet(defaultWallet);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    init();
  }, [smartAccount]);

  const availableAssets = useMemo(() => {
    if (!selectedWallet) return [];
    if (!selectedWallet.assets || selectedWallet.assets.length === 0) {
      if (selectedWallet.addresses.evm) {
        return [{
          symbol: 'ETH', name: 'Ethereum', balance: selectedWallet.balances.evm || 0,
          price: prices?.tokens.eth.usd || 0, value: 0, change: 0, network: 'Sepolia', isNative: true
        } as WalletAsset];
      }
      return [];
    }
    return selectedWallet.assets;
  }, [selectedWallet, prices]);

  useEffect(() => {
    if (availableAssets.length > 0) setSelectedAsset(availableAssets[0]);
  }, [selectedWallet]);

  // ✨ [KYT 추가] 주소 바뀌면 KYT 상태 초기화
  useEffect(() => {
    setKytStatus('idle');
    setKytResult(null);
    setReason('');
  }, [toAddress]);

  const finalTokenAmount = useMemo(() => {
    if (!amountInput || !selectedAsset) return "0";
    const val = parseFloat(amountInput);
    if (isNaN(val)) return "0";
    const priceUsd = selectedAsset.price || 0;
    const exchangeRate = prices?.exchangeRate || 1450;
    const priceKrw = priceUsd * exchangeRate;
    if (inputMode === 'TOKEN') return amountInput;
    if (inputMode === 'KRW') return priceKrw > 0 ? (val / priceKrw).toFixed(6) : "0";
    if (inputMode === 'USD') return priceUsd > 0 ? (val / priceUsd).toFixed(6) : "0";
    return "0";
  }, [amountInput, inputMode, selectedAsset, prices]);

  const convertedValue = useMemo(() => {
    if (!finalTokenAmount || !selectedAsset) return "";
    const amount = parseFloat(finalTokenAmount);
    const priceUsd = selectedAsset.price || 0;
    const exchangeRate = prices?.exchangeRate || 1450;
    if (inputMode === 'TOKEN') return `≈ ₩ ${(amount * priceUsd * exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    else return `≈ ${finalTokenAmount} ${selectedAsset.symbol}`;
  }, [finalTokenAmount, inputMode, selectedAsset, prices]);

  // ✨ [KYT 추가] USD 환산
  const amountUSD = useMemo(() => {
    if (!finalTokenAmount || !selectedAsset) return 0;
    return parseFloat(finalTokenAmount) * (selectedAsset.price || 0);
  }, [finalTokenAmount, selectedAsset]);

  const networkForKYT = selectedAsset?.network?.toLowerCase() ?? 'ethereum';

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalTokenAmount || !selectedWallet || !selectedAsset) return;

    // ✨ [KYT 추가] 전송 전 최종 KYT 차단 체크
    if (sendType === 'ADDRESS') {
      if (!kytService.canProceed(kytStatus, kytResult, reason)) {
        if (kytService.shouldBlock(kytResult)) return; // 버튼이 이미 비활성이지만 이중 방어
        return;
      }
      // MEDIUM/HIGH 사유 로그 (논블로킹)
      if (kytResult && kytService.requiresReason(kytResult) && reason.trim()) {
        kytService.logReason({
          address: toAddress,
          network: networkForKYT,
          riskLevel: kytResult.riskLevel,
          riskScore: kytResult.riskScore,
          reason: reason.trim(),
          userUUID: smartAccount?.address ?? 'unknown',
          timestamp: Date.now(),
        });
      }
    }

    // A. 휴대폰 번호 송금
    if (sendType === 'PHONE') {
      if (!phoneNumber) return alert("휴대폰 번호를 입력해주세요.");
      if (selectedAsset.network !== 'Amoy') return alert("휴대폰 송금은 'Polygon Amoy'만 지원합니다.");

      try {
        setIsLoading(true);
        const { data, error } = await supabase.functions.invoke('create-escrow', {
          body: {
            phone: phoneNumber,
            sender: smartAccount?.address,
            token: selectedAsset.isNative ? "0x0000000000000000000000000000000000000000" : selectedAsset.tokenAddress,
            amount: toWei(finalTokenAmount).toString()
          }
        });

        if (error || !data.commitment) throw new Error("서버 에러: 송금 정보를 생성하지 못했습니다.");

        const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
        const amountWei = toWei(finalTokenAmount);
        const valueToSend = selectedAsset.isNative ? amountWei : 0n;
        const tokenAddrArg = selectedAsset.isNative ? "0x0000000000000000000000000000000000000000" : (selectedAsset.tokenAddress || "0x00");

        const depositTx = prepareContractCall({
          contract: escrowContract,
          method: "function deposit(bytes32 commitment, address token, uint256 amount, uint64 expiry)",
          params: [data.commitment as `0x${string}`, tokenAddrArg as `0x${string}`, amountWei, expiry],
          value: valueToSend
        });

        await sendThirdwebTx(depositTx);

        const origin = window.location.origin;
        const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        setExpiryDate(date.toLocaleString());
        setClaimLink(`${origin}?claim=${data.commitment}`);

      } catch (err: any) {
        console.error(err);
        alert("송금 실패: " + (err.message || err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // B. 지갑 주소 송금
    if (sendType === 'ADDRESS') {
      if (!toAddress) return alert("받는 주소를 입력해주세요.");
      try {
        if (selectedWallet.wallet_type === 'XLOT') {
          const targetChain = selectedAsset.network === 'Amoy' ? polygonAmoy : sepolia;
          if (selectedAsset.isNative) {
            const transaction = prepareTransaction({ to: toAddress, chain: targetChain, client, value: toWei(finalTokenAmount) });
            await sendThirdwebTx(transaction);
          } else if (selectedAsset.tokenAddress) {
            alert("ERC20 전송 기능은 준비중입니다. (Native만 가능)");
            return;
          }
          alert("전송 완료!");
          onClose();
        } else if (selectedWallet.wallet_type === 'METAMASK') {
          if (!selectedAsset.isNative) return alert("현재 메타마스크는 Native 토큰 전송만 지원합니다.");
          sendWagmi({ to: toAddress as `0x${string}`, value: parseEther(finalTokenAmount) });
        }
      } catch (err: any) {
        alert("전송 실패: " + err.message);
      }
    }
  };

  const isProcessing = isWagmiPending || isWagmiConfirming || isThirdwebPending || isLoading;

  // ✨ [KYT 추가] 전송 버튼 비활성 조건
  const isSendDisabled =
    isProcessing ||
    (sendType === 'ADDRESS' && !kytService.canProceed(kytStatus, kytResult, reason));

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
      <div className="bg-slate-900 w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-800 animate-fade-in-up relative overflow-hidden h-[90vh] sm:h-auto flex flex-col">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 className="text-xl font-bold text-white">보내기</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* 결과 화면 */}
        {claimLink ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <div className="w-16 h-16 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center mb-4 text-3xl border border-cyan-500/30">🎁</div>
            <h3 className="text-xl font-bold text-white mb-2">송금 링크 생성 완료!</h3>
            <p className="text-slate-400 text-sm mb-6">아래 링크를 복사해서 전달하세요.</p>
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full mb-4">
              유효기간: {expiryDate} 까지
            </div>
            <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 break-all text-xs text-slate-300 font-mono">{claimLink}</div>
            <button onClick={() => { navigator.clipboard.writeText(claimLink); alert("복사됨!"); }} className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-500 flex items-center justify-center gap-2 mb-2"><Copy size={16} /> 링크 복사</button>
            <button onClick={onClose} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700">닫기</button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">

            {/* 전송 타입 탭 */}
            <div className="flex bg-slate-800 p-1 rounded-xl mb-2 shrink-0">
              <button type="button" onClick={() => setSendType('ADDRESS')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${sendType === 'ADDRESS' ? 'bg-slate-700 text-white shadow' : 'text-slate-500'}`}><Wallet size={14} /> 지갑 주소</button>
              <button type="button" onClick={() => setSendType('PHONE')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${sendType === 'PHONE' ? 'bg-cyan-600/20 text-cyan-400 shadow' : 'text-slate-500'}`}><Smartphone size={14} /> 휴대폰 번호</button>
            </div>

            {/* 지갑 선택 */}
            <div className="shrink-0">
              <label className="text-xs font-bold text-slate-400 mb-2 block ml-1">보내는 지갑</label>
              <button type="button" onClick={() => setIsWalletSelectorOpen(true)} className="w-full p-4 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-between hover:border-cyan-500/50 transition-all">
                <span className="text-white font-bold text-sm">{selectedWallet?.label || "선택"}</span>
                <ChevronDown size={16} className="text-slate-500" />
              </button>
            </div>

            {/* 자산 선택 */}
            <div className="shrink-0">
              <label className="text-xs font-bold text-slate-400 mb-2 block ml-1">보낼 자산</label>
              <button type="button" onClick={() => setIsAssetSelectorOpen(true)} className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-cyan-500/50 transition-all">
                {selectedAsset ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white">
                      {selectedAsset.symbol[0]}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">{selectedAsset.symbol}</p>
                      <p className="text-[10px] text-slate-500">{selectedAsset.network} · 잔액: {selectedAsset.balance.toFixed(4)}</p>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-500 text-sm">자산 선택</span>
                )}
                <ChevronDown size={16} className="text-slate-500" />
              </button>
            </div>

            {/* 금액 입력 */}
            <div className="shrink-0">
              <div className="flex justify-between items-end mb-2 px-1">
                <label className="text-xs font-bold text-slate-400">보낼 금액</label>
                <button type="button" onClick={() => setInputMode(prev => prev === 'TOKEN' ? 'KRW' : 'TOKEN')} className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 text-cyan-400 px-2 py-1 rounded-lg">
                  <ArrowRightLeft size={10} /> {inputMode === 'TOKEN' ? selectedAsset?.symbol : 'KRW'} 기준
                </button>
              </div>
              <input type="number" placeholder="0.00" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-800 text-lg font-bold" />
              <p className="text-right text-xs text-slate-500 mt-2 font-mono h-4">{convertedValue}</p>
            </div>

            {/* 받는 주소 / 전화번호 */}
            <div className="shrink-0">
              <label className="block text-xs font-bold text-slate-400 mb-2 ml-1">
                {sendType === 'ADDRESS' ? "받는 주소" : "받는 사람 전화번호"}
              </label>

              {sendType === 'ADDRESS' ? (
                <div>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                    className={`w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border transition-all font-mono text-sm
                      ${kytResult?.riskLevel === 'CRITICAL' ? 'border-red-500/50' :
                        kytResult?.riskLevel === 'HIGH' ? 'border-orange-400/50' :
                        kytResult?.riskLevel === 'MEDIUM' ? 'border-yellow-400/50' :
                        kytResult?.riskLevel === 'LOW' ? 'border-emerald-400/50' :
                        'border-slate-800 focus:ring-2 focus:ring-cyan-500'}`}
                  />
                  {/* ✨ [KYT 추가] KYTGuard — 주소 입력창 바로 아래 */}
                  <KYTGuard
                    address={toAddress}
                    network={networkForKYT}
                    amountUSD={amountUSD}
                    kytStatus={kytStatus}
                    kytResult={kytResult}
                    reason={reason}
                    onStatusChange={setKytStatus}
                    onResultChange={setKytResult}
                    onReasonChange={setReason}
                    onScreen={kytService.screenAddress.bind(kytService)}
                  />
                </div>
              ) : (
                <input type="tel" placeholder="+821012345678" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-800 font-mono text-sm" />
              )}
            </div>

            {/* 전송 버튼 */}
            <div className="mt-auto pt-2 shrink-0">
              <button
                type="submit"
                disabled={isSendDisabled}
                className={`w-full py-4 rounded-2xl font-bold disabled:opacity-50 transition-all text-lg flex justify-center items-center gap-2
                  ${kytService.shouldBlock(kytResult)
                    ? 'bg-slate-800 cursor-not-allowed text-slate-500'
                    : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 text-white'}`}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> :
                  kytService.shouldBlock(kytResult) ? '전송 차단됨' :
                  kytStatus === 'checking' ? '위험도 분석 중...' :
                  sendType === 'PHONE' ? "링크 생성 및 송금" : "전송하기"}
              </button>
            </div>
          </form>
        )}

        {/* 지갑 선택 오버레이 */}
        {isWalletSelectorOpen && (
          <div className="absolute inset-0 bg-slate-900 z-50 animate-fade-in-up flex flex-col p-6 rounded-t-3xl sm:rounded-3xl">
            <button onClick={() => setIsWalletSelectorOpen(false)} className="self-end mb-4"><X size={20} className="text-slate-400" /></button>
            <h3 className="text-white font-bold mb-4">지갑 선택</h3>
            <div className="overflow-y-auto flex-1">
              {wallets.map(w => (
                <button key={w.id} onClick={() => { setSelectedWallet(w); setIsWalletSelectorOpen(false); }} className="w-full p-4 rounded-2xl border text-left bg-slate-800 border-slate-700 mb-2 text-white font-bold hover:border-cyan-500">{w.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* 자산 선택 오버레이 */}
        {isAssetSelectorOpen && (
          <div className="absolute inset-0 bg-slate-900 z-50 animate-fade-in-up flex flex-col p-6 rounded-t-3xl sm:rounded-3xl">
            <button onClick={() => setIsAssetSelectorOpen(false)} className="self-end mb-4"><X size={20} className="text-slate-400" /></button>
            <h3 className="text-white font-bold mb-4">자산 선택</h3>
            <div className="overflow-y-auto flex-1 space-y-2">
              {availableAssets.length === 0 ? (
                <p className="text-slate-500 text-center py-4">보유한 자산이 없습니다.</p>
              ) : (
                availableAssets.map((asset, idx) => (
                  <button key={idx} onClick={() => { setSelectedAsset(asset); setIsAssetSelectorOpen(false); }}
                    className={`w-full p-3 rounded-xl border text-left flex justify-between items-center
                      ${selectedAsset?.symbol === asset.symbol ? 'bg-cyan-500/10 border-cyan-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold text-white">
                        {asset.symbol[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{asset.symbol}</p>
                        <p className="text-[10px] text-slate-400">{asset.network}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{asset.balance.toFixed(4)}</p>
                      <p className="text-[10px] text-slate-500">
                        ≈ ₩ {Math.floor(asset.value * (prices?.exchangeRate || 1450)).toLocaleString()}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}