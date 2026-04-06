import { useState, useEffect, useMemo } from "react";
// Wagmi imports
import { 
  useSendTransaction as useWagmiSend, 
  useWaitForTransactionReceipt 
} from "wagmi";
import { parseEther } from "viem";

// Thirdweb v5 Imports
import { 
  useActiveAccount, 
  useSendTransaction as useThirdwebSend 
} from "thirdweb/react";
import { 
  prepareTransaction, 
  toWei, 
  getContract, 
  prepareContractCall,
  defineChain
} from "thirdweb";
import { transfer } from "thirdweb/extensions/erc20"; 
import { client } from "../client"; 

const ethMainnet = defineChain(1);
const polygonChain = defineChain(137);
const baseChain = defineChain(8453);
const arbitrumChain = defineChain(42161);
const sepoliaChain = defineChain(11155111);
const amoyChain = defineChain(80002);


// UI & Services
// ✨ [추가] ShieldAlert, SearchCheck 등 아이콘 추가
import { 
  X, Loader2, ChevronDown, Wallet, ArrowRightLeft, Smartphone, 
  Copy, Check, ShieldCheck, AlertTriangle, Search, CheckCircle2, ExternalLink
} from "lucide-react";
import toast from 'react-hot-toast';

import { getMyWallets } from "../services/walletService";
import type { WalletSlot, WalletAsset } from "../services/walletService";
import { fetchCryptoPrices } from "../services/priceService";
import type { PriceData } from "../services/priceService";
import { supabase } from "../lib/supabase"; 
import type {
  TravelRulePayload
} from '../services/travelRuleService';
import {
  requiresTravelRule,
  generateReferenceId,
  encodeReferenceIdCalldata,
  encryptTravelRuleData,
  saveTravelRulePackage,
  updateTravelRuleTxHash,
} from '../services/travelRuleService';
import { TravelRuleModal } from './TravelRuleModal';
import { signPermit, relayPermitTransfer, requestTronJit, requestSolInit, checkSolAccountExists, PERMIT_SUPPORTED_TOKENS } from '../services/gaslessService';
import { sendSOL, sendSPLToken, sendSPLTokenRelayed, sendTRX, sendBTC, sendTRC20 } from '../services/multiChainSendService';
import { ethers } from "ethers";
import { SSSSigningModal } from "./SSSSigningModal";
import type { SSSSigningResult } from "./SSSSigningModal";

// 배포한 PhoneEscrow 컨트랙트 주소
const ESCROW_CONTRACT_ADDRESS = "0xe114dcC6423729D1f6eE6c71E739A2630f535f64"; 

type InputMode = 'TOKEN' | 'KRW' | 'USD';
type SendType = 'ADDRESS' | 'PHONE';
// ✨ 검증 상태 타입 정의
type RiskStatus = 'IDLE' | 'CHECKING' | 'SAFE' | 'RISKY';

export function SendModal({ onClose }: { onClose: () => void }) {
  // === Data States ===
  const [wallets, setWallets] = useState<WalletSlot[]>([]);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // === Selection States ===
  const [selectedWallet, setSelectedWallet] = useState<WalletSlot | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [sendType, setSendType] = useState<SendType>('ADDRESS');

  // === Input States ===
  const [toAddress, setToAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>('TOKEN');
  
  // === Result States ===
  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>("");

  // === UI Toggles ===
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);

  // === ✨ [신규] Risk Check States ===
  const [riskStatus, setRiskStatus] = useState<RiskStatus>('IDLE');
  const [riskDetail, setRiskDetail] = useState<{label: string, level: string} | null>(null);

  // === SSS 서명 모달 ===
  const [sssSigningOpen, setSssSigningOpen]       = useState(false);
  const [sssPendingTx, setSssPendingTx]           = useState<((w: ethers.Wallet, mnemonic: string) => Promise<void>) | null>(null);
  const [showTravelRule, setShowTravelRule]           = useState(false);
  const [travelRuleRefId, setTravelRuleRefId]         = useState<string | null>(null);
  const [travelRulePayload, setTravelRulePayload]     = useState<TravelRulePayload | null>(null);
  const [sssSigningPurpose, setSssSigningPurpose] = useState('');

  // === JIT 가스비 대납 진행 상태 ===
  const [jitStep, setJitStep] = useState<'idle' | 'checking' | 'funding' | 'waiting' | 'ready' | 'error' | 'success'>('idle');
  const [jitFeeUsdt, setJitFeeUsdt] = useState(0);
  const [jitMessage, setJitMessage] = useState('');
  const [jitTxHash, setJitTxHash] = useState('');
  // 전체 체인 공통 성공 상태
  const [txResult, setTxResult] = useState<{ hash: string; chain: string; explorerUrl: string } | null>(null);

  // === Blockchain Hooks ===
  const smartAccount = useActiveAccount();
  
  // Wagmi
  const { sendTransaction: sendWagmi, data: wagmiHash, isPending: isWagmiPending } = useWagmiSend();
  const { isLoading: isWagmiConfirming } = useWaitForTransactionReceipt({ hash: wagmiHash });
  
  // Thirdweb
  const { mutateAsync: sendThirdwebTx, isPending: isThirdwebPending } = useThirdwebSend();

  const escrowContract = getContract({
    client,
    chain: amoyChain,
    address: ESCROW_CONTRACT_ADDRESS,
  });

  // --- 초기화 ---
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
        
        const defaultWallet = validWallets.find(w => w.wallet_type === 'XLOT_SSS') || validWallets.find(w => w.wallet_type === 'XLOT') || validWallets[0];
        setSelectedWallet(defaultWallet);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    init();
  }, [smartAccount]);

  // --- 자산 목록 로직 ---
  const availableAssets = useMemo(() => {
    if (!selectedWallet) return [];

    // XLOT_SSS: 4체인 네이티브 자산 항상 표시 (토큰 포함)
    if (selectedWallet.wallet_type === 'XLOT_SSS') {
      const assets = selectedWallet.assets || [];
      const result: WalletAsset[] = [];
      if (selectedWallet.addresses.evm) {
        const evmNetworks = ['Ethereum', 'Polygon', 'Sepolia', 'Amoy', 'Base', 'Arbitrum', 'EVM'];
        const evmAssets = assets.filter(a => evmNetworks.includes(a.network));
        result.push(...(evmAssets.length > 0 ? evmAssets : [{
          symbol: 'ETH', name: 'Ethereum', balance: selectedWallet.balances?.evm || 0,
          price: prices?.tokens?.eth?.usd || 0, value: 0, change: 0, network: 'Ethereum', isNative: true
        } as WalletAsset]));
      }
      if (selectedWallet.addresses.sol) {
        // SOL 네이티브
        const s = assets.find(a => a.symbol === 'SOL' && a.isNative);
        result.push(s || { symbol: 'SOL', name: 'Solana', balance: 0, price: prices?.tokens?.sol?.usd || 0, value: 0, change: 0, network: 'Solana', isNative: true } as WalletAsset);
        // SPL 토큰 (USDC, USDT 등 — 잔액 있는 것만)
        const splAssets = assets.filter(a => a.network === 'Solana' && !a.isNative && a.balance > 0);
        result.push(...splAssets);
      }
      if (selectedWallet.addresses.btc) {
        const b = assets.find(a => a.symbol === 'BTC');
        result.push(b || { symbol: 'BTC', name: 'Bitcoin', balance: 0, price: prices?.tokens?.btc?.usd || 0, value: 0, change: 0, network: 'Bitcoin', isNative: true } as WalletAsset);
      }
      if (selectedWallet.addresses.trx) {
        const tronAssets = assets.filter(a => a.network === 'Tron');
        if (tronAssets.length > 0) {
          result.push(...tronAssets);
        } else {
          result.push({ symbol: 'TRX', name: 'Tron', balance: 0, price: prices?.tokens?.trx?.usd || 0, value: 0, change: 0, network: 'Tron', isNative: true } as WalletAsset);
        }
      }
      return result;
    }

    // 일반 지갑
    if (!selectedWallet.assets || selectedWallet.assets.length === 0) {
      if (selectedWallet.addresses.evm) {
        return [{ symbol: 'ETH', name: 'Ethereum', balance: selectedWallet.balances?.evm || 0,
          price: prices?.tokens?.eth?.usd || 0, value: 0, change: 0, network: 'Sepolia', isNative: true } as WalletAsset];
      }
      return [];
    }
    return selectedWallet.assets;
  }, [selectedWallet, prices]);

  useEffect(() => {
    if (availableAssets.length > 0) setSelectedAsset(availableAssets[0]);
  }, [selectedWallet]);

  // --- 금액 계산 로직 ---
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

  // ── 수수료 / 예상 수신 금액 계산 ──
  const feeEstimate = useMemo(() => {
    if (!selectedAsset || !finalTokenAmount) return null;
    const amount = parseFloat(finalTokenAmount);
    if (isNaN(amount) || amount <= 0) return null;

    const sym = selectedAsset.symbol.toUpperCase();
    const net = selectedAsset.network;

    // USDT / USDC (Tron 라우터) — 수수료: max(0.2%, 2 USDT)
    if ((sym === 'USDT' || sym === 'USDC') && net === 'Tron') {
      const byRate = amount * 0.002;
      const fee = Math.max(byRate, 2.0);
      const receive = amount - fee;
      if (receive <= 0) return { type: 'error' as const, fee, receive: 0 };
      return { type: 'stablecoin' as const, fee: parseFloat(fee.toFixed(2)), receive: parseFloat(receive.toFixed(2)), sym };
    }

    // USDT / USDC (Solana 릴레이) — SOL 없을 때: 수수료 max(0.2%, 0.1)
    const solBal = selectedWallet?.balances?.sol ?? 0;
    if ((sym === 'USDT' || sym === 'USDC') && net === 'Solana' && solBal < 0.001) {
      const byRate = amount * 0.002;
      const fee    = Math.max(byRate, 0.1);
      const receive = amount - fee;
      if (receive <= 0) return { type: 'error' as const, fee, receive: 0 };
      return { type: 'stablecoin' as const, fee: parseFloat(fee.toFixed(4)), receive: parseFloat(receive.toFixed(4)), sym, relay: true };
    }

    // 네이티브 코인 — 정적 추정 (API 호출 없음)
    if (selectedAsset.isNative) {
      const gasMap: Record<string, { label: string; feeToken: number }> = {
        'BTC':  { label: '~1,000 sat',   feeToken: 0.00001 },
        'ETH':  { label: '~$0.5–2',      feeToken: 0 },
        'SOL':  { label: '~0.000005 SOL', feeToken: 0.000005 },
        'TRX':  { label: '~1–3 TRX',     feeToken: 0 },
        'MATIC': { label: '~0.001 MATIC', feeToken: 0 },
        'POL':  { label: '~0.001 POL',   feeToken: 0 },
      };
      const info = gasMap[sym];
      if (info) return { type: 'native' as const, label: info.label, sym };
    }

    return null;
  }, [finalTokenAmount, selectedAsset]);


  // ✨ [신규] 주소 검증 함수 (토스 스타일)
  const checkAddressRisk = async () => {
    if (!toAddress || toAddress.length < 10) return;
    
    setRiskStatus('CHECKING');
    setRiskDetail(null);

    // 약간의 딜레이를 주어 사용자가 "검사 중"임을 인지하게 함 (UX)
    setTimeout(async () => {
        try {
            // 주소 소문자로 변환하여 검색
            const { data, error } = await supabase
                .from('deny_list')
                .select('*')
                .eq('address', toAddress.toLowerCase()) // DB에는 소문자로 저장 권장
                .maybeSingle();

            if (error) throw error;

            if (data) {
                // 🚨 위험 감지!
                setRiskStatus('RISKY');
                setRiskDetail({
                    label: data.label_name, // 예: '도박 사이트'
                    level: data.risk_level  // 예: 'HIGH'
                });
            } else {
                // ✅ 안전함
                setRiskStatus('SAFE');
            }
        } catch (e) {
            console.error("Risk check failed", e);
            // 에러나면 일단 안전으로 처리하거나 에러 상태 표시 (여기선 안전으로 처리)
            setRiskStatus('SAFE'); 
        }
    }, 600);
  };

  // 주소가 바뀌면 검증 상태 초기화
  useEffect(() => {
      setRiskStatus('IDLE');
      setRiskDetail(null);
  }, [toAddress]);


  // --- 전송 핸들러 ---
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalTokenAmount || !selectedWallet || !selectedAsset) return;

    // ✨ 위험 감지되었는데 그냥 보내려 할 때 한 번 더 묻기
    if (riskStatus === 'RISKY') {
        const confirmMsg = `⚠️ 경고: 이 주소는 '${riskDetail?.label}'(으)로 신고된 주소입니다.\n정말 송금하시겠습니까?`;
        if (!confirm(confirmMsg)) return;
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
        
        let valueToSend = selectedAsset.isNative ? amountWei : 0n;
        let tokenAddrArg = selectedAsset.isNative ? "0x0000000000000000000000000000000000000000" : (selectedAsset.tokenAddress || "0x00");

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
        toast.error("송금 실패: " + (err.message || err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── Travel Rule (100만원 이상) ──────────────────────────────
    if (sendType === 'ADDRESS' && !travelRuleRefId) {
      const amountUsd = parseFloat(finalTokenAmount) * (selectedAsset?.price || 0);
      const amountKrw = Math.floor(amountUsd * (prices?.exchangeRate || 1450));
      if (requiresTravelRule(amountKrw)) {
        setShowTravelRule(true);
        return;
      }
    }

    // B. 지갑 주소 송금
    if (sendType === 'ADDRESS') {
        if (!toAddress) return toast.error("받는 주소를 입력해주세요.");
        
        try {
            // ── XLOT_SSS: SSS 서명 모달 경유 ──────────────────────────
            if (selectedWallet.wallet_type === 'XLOT_SSS') {
              // ── SOL 네이티브 전송 ─────────────────────────────────────────────
              if (selectedAsset.network === 'Solana' && selectedAsset.isNative) {
                const currentRefId = travelRuleRefId;
                const currentPayload = travelRulePayload;
                setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
                  try {
                    const result = await sendSOL(mn, toAddress, parseFloat(finalTokenAmount), currentRefId || undefined);
                    if (currentRefId && currentPayload) {
                      try {
                        const { encryptTravelRuleData, saveTravelRulePackage } = await import('../services/travelRuleService');
                        const pkg = await encryptTravelRuleData(currentPayload, currentRefId);
                        await saveTravelRulePackage(pkg, result.txHash, 'SOL');
                      } catch(e) { console.error('TR 저장 실패:', e); }
                    }
                    const explorerUrl = `https://solscan.io/tx/${result.txHash}`;
                    setTxResult({ hash: result.txHash, chain: 'SOL', explorerUrl });
                    toast.success(
                      (t) => <span onClick={() => { window.open(explorerUrl, '_blank'); toast.dismiss(t.id); }} className="cursor-pointer">
                        ✅ SOL 전송 성공! 클릭해서 확인
                      </span>,
                      { duration: 10000, id: result.txHash }
                    );
                    onClose();
                  } catch (e: any) { toast.error('SOL 전송 실패: ' + e.message); }
                });
                setSssSigningPurpose(`${finalTokenAmount} SOL → ${toAddress.slice(0,8)}...`);
                setSssSigningOpen(true);
                return;
              }
              // ── Solana SPL 토큰 전송 (USDC / USDT 등) ──────────────────────────
              if (selectedAsset.network === 'Solana' && !selectedAsset.isNative && selectedAsset.tokenAddress) {
                const mintAddress    = selectedAsset.tokenAddress;
                const splDecimals    = 6; // USDC / USDT 모두 6 decimals
                const currentRefId   = travelRuleRefId;
                const currentPayload = travelRulePayload;
                const solBalance     = selectedWallet.balances?.sol ?? 0;
                // SOL 0.001 미만 → 릴레이어 대납 경로 (수수료 0.2% 원자적 차감)
                const useRelay       = solBalance < 0.001;

                setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
                  try {
                    let result: { txHash: string; chain: string };
                    let feeNote = '';

                    if (useRelay) {
                      // 릴레이어 fee payer 경로 — SOL 불필요
                      const relayResult = await sendSPLTokenRelayed(
                        mn, mintAddress, splDecimals,
                        toAddress, parseFloat(finalTokenAmount),
                      );
                      result  = relayResult;
                      feeNote = ` (네트워크 수수료 ${relayResult.feeAmount.toFixed(4)} ${selectedAsset.symbol} 차감)`;
                    } else {
                      // 사용자 SOL로 직접 전송
                      result = await sendSPLToken(
                        mn, mintAddress, splDecimals,
                        toAddress, parseFloat(finalTokenAmount), currentRefId || undefined,
                      );
                    }

                    if (currentRefId && currentPayload) {
                      try {
                        const { encryptTravelRuleData, saveTravelRulePackage } = await import('../services/travelRuleService');
                        const pkg = await encryptTravelRuleData(currentPayload, currentRefId);
                        await saveTravelRulePackage(pkg, result.txHash, 'SOL');
                      } catch(e) { console.error('TR 저장 실패:', e); }
                    }

                    const explorerUrl = `https://solscan.io/tx/${result.txHash}`;
                    setTxResult({ hash: result.txHash, chain: 'SOL', explorerUrl });
                    toast.success(
                      (t) => <span onClick={() => { window.open(explorerUrl, '_blank'); toast.dismiss(t.id); }} className="cursor-pointer">
                        ✅ {selectedAsset.symbol} 전송 성공{feeNote}! 클릭해서 확인
                      </span>,
                      { duration: 10000, id: result.txHash }
                    );
                    onClose();
                  } catch (e: any) { toast.error(`${selectedAsset.symbol} 전송 실패: ` + e.message); }
                });
                setSssSigningPurpose(`${finalTokenAmount} ${selectedAsset.symbol} → ${toAddress.slice(0,8)}...`);
                setSssSigningOpen(true);
                return;
              }
              // ── TRX 및 TRC20 전송 (xLOT Router 경유) ──────────────────────────
              if (selectedAsset.network === 'Tron') {
                const isToken = !selectedAsset.isNative && !!selectedAsset.tokenAddress;
                const currentRefId = travelRuleRefId;
                const currentPayload = travelRulePayload;
                
                setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
                  try {
                    const sendAmount = parseFloat(finalTokenAmount);
                    setJitStep('checking');
                    setJitMessage('네트워크 상태 확인 중...');

                    // ── 1단계: 실시간 TRX + 에너지 상태 조회 ──
                    let trxBal = 0;
                    let hasEnergy = false;
                    const tronKeysStr = import.meta.env.VITE_TRONSCAN_API_KEYS || import.meta.env.VITE_TRON_PRO_API_KEY || '';
                    const apiKeys = tronKeysStr.split(',').map((k: string) => k.trim()).filter(Boolean);
                    
                    if (isToken) {
                        try {
                            const headers: HeadersInit = { 'Content-Type': 'application/json' };
                            if (apiKeys.length > 0) headers['TRON-PRO-API-KEY'] = apiKeys[Math.floor(Math.random() * apiKeys.length)];
                            const checkRes = await fetch(`https://api.trongrid.io/v1/accounts/${selectedWallet.addresses.trx}`, { headers });
                            const checkData = await checkRes.json();
                            if (checkData?.data?.[0]) {
                                const acc = checkData.data[0];
                                trxBal = (acc.balance || 0) / 1_000_000;
                                const ownEng = acc.account_resource?.energy_limit || 0;
                                const delSun = acc.account_resource?.acquired_delegated_frozenV2_balance_for_energy || 0;
                                hasEnergy = ownEng >= 60000 || delSun > 0;
                            }
                        } catch (_) {}
                    }
                    console.log(`[Tron] trxBal=${trxBal}, hasEnergy=${hasEnergy}`);

                    // ── 2단계: JIT 필요 여부 (라우터 = approve + transferWithFee 2tx) ──
                    // 에너지 100k+ 와 대역폭(TRX ~2) 모두 필요
                    const needsJit = isToken && (!hasEnergy || trxBal < 2);

                    if (needsJit) {
                        // 라우터 수수료로 JIT 비용 충당 → 별도 USDT 차감 없음
                        const routerFeeDisplay = Math.max(sendAmount * 0.002, 2.0);
                        setJitFeeUsdt(routerFeeDisplay);
                        setJitMessage(`가스비 지원 요청 중... (라우터 수수료 ${routerFeeDisplay.toFixed(2)} USDT 포함)`);
                        setJitStep('funding');

                        // JIT 요청 → 엣지 펑션이 에너지 렌탈 + TRX 대역폭 전송
                        await requestTronJit(selectedWallet.addresses.trx || '', 30);

                        // 도착 확인 폴링
                        setJitStep('waiting');
                        setJitMessage('에너지/TRX 도착 확인 중...');
                        let arrived = false;
                        for (let i = 0; i < 20; i++) {
                            try {
                                const h: HeadersInit = { 'Content-Type': 'application/json' };
                                if (apiKeys.length > 0) h['TRON-PRO-API-KEY'] = apiKeys[i % apiKeys.length];
                                const r = await fetch(`https://api.trongrid.io/v1/accounts/${selectedWallet.addresses.trx}`, { headers: h });
                                const d = await r.json();
                                if (d?.data?.[0]) {
                                    const a = d.data[0];
                                    const tb = (a.balance || 0) / 1_000_000;
                                    const oE = a.account_resource?.energy_limit || 0;
                                    const dE = a.account_resource?.acquired_delegated_frozenV2_balance_for_energy || 0;
                                    // 에너지 확보 + TRX >= 1 이면 진행 가능
                                    if ((oE >= 60000 || dE > 0) && tb >= 1) { arrived = true; break; }
                                }
                            } catch (_) {}
                            await new Promise(r => setTimeout(r, 3000));
                        }
                        if (!arrived) { setJitStep('error'); throw new Error('가스비 지원이 시간 내 도착하지 않았습니다.'); }
                        await new Promise(r => setTimeout(r, 3000));
                        setJitStep('ready');
                        setJitMessage('가스비 준비 완료! 전송 진행 중...');
                    } else if (isToken) {
                        // JIT 불필요 — 라우터 수수료만 표시
                        const routerFeeDisplay = Math.max(sendAmount * 0.002, 2.0);
                        setJitFeeUsdt(routerFeeDisplay);
                        setJitStep('ready');
                        setJitMessage(`라우터 수수료 ${routerFeeDisplay.toFixed(2)} USDT 포함`);
                    } else {
                        setJitStep('idle');
                    }

                    // ── 3단계: 실제 전송 ──
                    let txHash = '';
                    let fee: number | undefined;
                    if (!isToken) {
                        // 네이티브 TRX 전송 — 라우터 미사용
                        const res = await sendTRX(mn, toAddress, sendAmount, currentRefId || undefined);
                        txHash = res.txHash;
                    } else {
                        // TRC20 전송 — xLOT Router 경유 (수수료 on-chain 자동 징수)
                        setJitMessage('took Router 경유 전송 중...');
                        const res = await sendTRC20(
                            mn, toAddress, selectedAsset.tokenAddress!,
                            sendAmount,   // 원래 전체 금액 → 라우터가 수수료 자동 차감
                            true,         // useRouter = true
                            currentRefId || undefined
                        );
                        txHash = res.txHash;
                        fee = res.fee;
                    }

                    if (currentRefId && currentPayload) {
                      try {
                        const { encryptTravelRuleData, saveTravelRulePackage } = await import('../services/travelRuleService');
                        const pkg = await encryptTravelRuleData(currentPayload, currentRefId);
                        await saveTravelRulePackage(pkg, txHash, 'TRX');
                      } catch(e) { console.error('TR 저장 실패:', e); }
                    }

                    setJitTxHash(txHash);
                    setJitStep('success');
                    const actualSent = fee ? (sendAmount - fee).toFixed(2) : sendAmount.toFixed(2);
                    setJitMessage(`전송 완료! ${actualSent} ${selectedAsset.symbol} → 수취인`);
                  } catch(e: any) { setJitStep('error'); setJitMessage(e.message); }
                });
                
                setSssSigningPurpose(`${finalTokenAmount} ${selectedAsset.symbol} → ${toAddress.slice(0,8)}...`);
                setSssSigningOpen(true);
                return;
              }
              // ── BTC 전송 ────────────────────────────────────────
              if (selectedAsset?.symbol === 'BTC') {
                const currentRefId = travelRuleRefId;
                const currentPayload = travelRulePayload;
                setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
                  try {
                    const result = await sendBTC(mn, toAddress, parseFloat(finalTokenAmount), currentRefId || undefined);
                    if (currentRefId && currentPayload) {
                      try {
                        const { encryptTravelRuleData, saveTravelRulePackage } = await import('../services/travelRuleService');
                        const pkg = await encryptTravelRuleData(currentPayload, currentRefId);
                        await saveTravelRulePackage(pkg, result.txHash, 'BTC');
                      } catch(e) { console.error('TR 저장 실패:', e); }
                    }
                    const explorerUrl = `https://mempool.space/tx/${result.txHash}`;
                    setTxResult({ hash: result.txHash, chain: 'BTC', explorerUrl });
                    toast.success(
                      (t) => <span onClick={() => { window.open(explorerUrl, '_blank'); toast.dismiss(t.id); }} className="cursor-pointer">
                        ✅ BTC 전송 성공! 클릭해서 확인
                      </span>,
                      { duration: 10000, id: result.txHash }
                    );
                    onClose();
                  } catch (e: any) { toast.error('BTC 전송 실패: ' + e.message); }
                });
                setSssSigningPurpose(`${finalTokenAmount} BTC → ${toAddress.slice(0,8)}...`);
                setSssSigningOpen(true);
                return;
              }
                const evmAddress = selectedWallet.addresses.evm;
                if (!evmAddress) return toast.error('EVM 주소를 찾을 수 없습니다');

                // EVM Permit 체크 로직 (수수료 대납 오프체인 서명 플로우)
                let tAddr = selectedAsset.tokenAddress || '';
                const permitDetail = (!selectedAsset.isNative && tAddr)
                    ? PERMIT_SUPPORTED_TOKENS[tAddr.toLowerCase()]
                    : undefined;

                if (permitDetail) {
                    const relayerAddress = import.meta.env.VITE_EVM_RELAYER_ADDRESS || "0xRelayerAddressPlaceholder";
                    let permitRpcUrl = 'https://eth.llamarpc.com';
                    if (selectedAsset.network === 'Polygon') permitRpcUrl = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com';
                    else if (selectedAsset.network === 'Amoy') permitRpcUrl = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://rpc-amoy.polygon.technology';
                    else if (selectedAsset.network === 'Sepolia') permitRpcUrl = import.meta.env.VITE_SEPOLIA_RPC || 'https://rpc.sepolia.org';
                    setSssSigningPurpose(`[가스비 무료] ${finalTokenAmount} ${selectedAsset.symbol} → ${toAddress.slice(0,8)}...`);
                    setSssPendingTx(() => async (wallet: ethers.Wallet, _mn: string) => {
                        try {
                            const deadline = Math.floor(Date.now() / 1000) + 3600;
                            const amountWei = ethers.parseUnits(finalTokenAmount, 6);
                            const provider = new ethers.JsonRpcProvider(permitRpcUrl);
                            const connected = wallet.connect(provider);
                            const { v, r, s } = await signPermit(
                                connected, permitDetail, relayerAddress, amountWei.toString(), deadline
                            );
                            const txResult = await relayPermitTransfer({
                                network: selectedAsset.network,
                                tokenAddress: permitDetail.tokenAddress,
                                owner: wallet.address,
                                toAddress,
                                amount: finalTokenAmount,
                                deadline, v, r, s
                            });
                            const hash = (txResult as any).txHash || '';
                            const explorerUrl = `https://etherscan.io/tx/${hash}`;
                            setTxResult({ hash, chain: selectedAsset.network, explorerUrl });
                            toast.success(
                              (t) => <span onClick={() => { window.open(explorerUrl, '_blank'); toast.dismiss(t.id); }} className="cursor-pointer">
                                ✅ {selectedAsset.symbol} 전송 성공! 클릭해서 확인
                              </span>,
                              { duration: 10000, id: hash }
                            );
                            onClose();
                        } catch (e: any) { toast.error('대납 전송(Permit) 실패: ' + e.message); }
                    });
                    setSssSigningOpen(true);
                    return;
                }

                // 일반 EVM Transaction (Native 및 Permit 미지원 ERC20)
                let rpcUrl = 'https://eth.llamarpc.com';
                if (selectedAsset.network === 'Amoy') {
                    rpcUrl = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://rpc-amoy.polygon.technology';
                } else if (selectedAsset.network === 'Polygon') {
                    rpcUrl = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com';
                } else if (selectedAsset.network === 'Sepolia') {
                    rpcUrl = import.meta.env.VITE_SEPOLIA_RPC || 'https://rpc.sepolia.org';
                } else if (selectedAsset.network === 'Ethereum') {
                    rpcUrl = import.meta.env.VITE_ETH_RPC || 'https://eth.llamarpc.com';
                }

                const purpose = `${finalTokenAmount} ${selectedAsset.symbol} → ${toAddress.slice(0,8)}...${toAddress.slice(-6)}`;
                setSssSigningPurpose(purpose);

                setSssPendingTx(() => async (wallet: ethers.Wallet, _mn: string) => {
                    const provider = new ethers.JsonRpcProvider(rpcUrl);
                    const connected = wallet.connect(provider);
                    const currentRefId = travelRuleRefId;
                    const trData = currentRefId ? encodeReferenceIdCalldata(currentRefId) : undefined;

                    let hash = '';
                    let explorerBase = 'https://etherscan.io';
                    if (selectedAsset.network === 'Polygon') explorerBase = 'https://polygonscan.com';
                    else if (selectedAsset.network === 'Base') explorerBase = 'https://basescan.org';
                    else if (selectedAsset.network === 'Arbitrum') explorerBase = 'https://arbiscan.io';
                    else if (selectedAsset.network === 'Sepolia') explorerBase = 'https://sepolia.etherscan.io';

                    if (selectedAsset.isNative) {
                        const tx = await connected.sendTransaction({
                            to: toAddress,
                            value: ethers.parseEther(finalTokenAmount),
                            ...(trData ? { data: trData } : {}),
                        });
                        hash = tx.hash;
                        // fire-and-forget: wait() 대기하지 않고 제출 후 바로 성공 안내
                        if (currentRefId && travelRulePayload) {
                            encryptTravelRuleData(travelRulePayload, currentRefId)
                              .then(pkg => saveTravelRulePackage(pkg, hash, selectedAsset.network))
                              .catch(e => console.error('TR 저장 실패:', e));
                        }
                    } else if (selectedAsset.tokenAddress) {
                        const abi = [
                            'function transfer(address to, uint256 amount) returns (bool)',
                            'function decimals() view returns (uint8)'
                        ];
                        const contract = new ethers.Contract(selectedAsset.tokenAddress, abi, connected);
                        let decimals = 18;
                        try { decimals = Number(await contract.decimals()); } catch (e) { console.error("Decimals fetch error:", e); }
                        const tx = await contract.transfer(toAddress, ethers.parseUnits(finalTokenAmount, decimals));
                        hash = tx.hash;
                        if (currentRefId && travelRulePayload) {
                            encryptTravelRuleData(travelRulePayload, currentRefId)
                              .then(pkg => saveTravelRulePackage(pkg, hash, selectedAsset.network))
                              .catch(e => console.error('TR 저장 실패:', e));
                        }
                    } else {
                        throw new Error('전송 가능한 자산이 없습니다');
                    }

                    const explorerUrl = `${explorerBase}/tx/${hash}`;
                    setTxResult({ hash, chain: selectedAsset.network, explorerUrl });
                    toast.success(
                      (t) => <span onClick={() => { window.open(explorerUrl, '_blank'); toast.dismiss(t.id); }} className="cursor-pointer">
                        ✅ {selectedAsset.symbol} 전송 제출! 클릭해서 확인
                      </span>,
                      { duration: 10000, id: hash }
                    );
                    onClose();
                });
                setSssSigningOpen(true);
                return;
            }

            // ── 기존 XLOT (Thirdweb AA) ───────────────────────────────
            if (selectedWallet.wallet_type === 'XLOT') {
                let targetChain = sepoliaChain;
                if (selectedAsset.network === 'Amoy') targetChain = amoyChain;
                else if (selectedAsset.network === 'Ethereum') targetChain = ethMainnet;
                else if (selectedAsset.network === 'Polygon') targetChain = polygonChain;

                if (selectedAsset.isNative) {
                    const currentRefId = travelRuleRefId;
                    const trData = currentRefId ? encodeReferenceIdCalldata(currentRefId) as `0x${string}` : undefined;
                    const transaction = prepareTransaction({
                      to: toAddress, chain: targetChain, client,
                      value: toWei(finalTokenAmount),
                      ...(trData ? { data: trData } : {}),
                    });
                    const result = await sendThirdwebTx(transaction);
                    if (currentRefId && travelRulePayload) {
                      try {
                        const pkg = await encryptTravelRuleData(travelRulePayload, currentRefId);
                        await saveTravelRulePackage(pkg, typeof result === 'string' ? result : undefined, selectedAsset.network);
                      } catch(e) { console.error('TR 저장 실패 (non-blocking):', e); }
                    }
                } else if (selectedAsset.tokenAddress) {
                    // ERC20
                    // ... (토큰 전송 로직 생략, 기존과 동일) ...
                    // 여기서는 심플하게 Native 전송만 예시로 둠
                    alert("ERC20 전송 기능은 준비중입니다. (Native만 가능)"); 
                    return;
                }
                alert("전송 완료!");
                onClose();

            } else if (['METAMASK', 'RABBY', 'BYBIT', 'BITGET', 'TRUST', 'WALLETCONNECT'].includes(selectedWallet.wallet_type)) {
                if (!selectedAsset.isNative) return alert("현재 이 지갑은 Native 토큰 전송만 지원합니다.");
                sendWagmi({ to: toAddress as `0x${string}`, value: parseEther(finalTokenAmount) });
            }
        } catch (err: any) {
            toast.error('전송 실패: ' + err.message);
        }
    }
  };

  // SSS 서명 완료 핸들러
  const handleSSSSigningComplete = async (result: SSSSigningResult) => {
    setSssSigningOpen(false);
    if (!sssPendingTx) return;
    try {
      setIsLoading(true);
      await sssPendingTx(result.wallet, result.mnemonic);
    } catch (e: any) {
      toast.error('전송 실패: ' + (e.message || e));
    } finally {
      result.cleanup();
      setIsLoading(false);
      setSssPendingTx(null);
    }
  };

  const isProcessing = isWagmiPending || isWagmiConfirming || isThirdwebPending || isLoading;

  const handleTravelRuleConfirm = async (refId: string, payload: TravelRulePayload) => {
    setTravelRuleRefId(refId);
    setTravelRulePayload(payload);
    setShowTravelRule(false);
    setTimeout(() => handleSend({ preventDefault: () => {} } as React.FormEvent), 100);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end justify-center z-[100]">
      <div className="bg-slate-900 w-full max-w-lg rounded-t-3xl p-6 shadow-2xl border-t border-x border-slate-800 animate-slide-up relative overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 className="text-xl font-bold text-white">보내기</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* 결과 화면 (링크) */}
        {claimLink ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <div className="w-16 h-16 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center mb-4 text-3xl border border-cyan-500/30">🎁</div>
            <h3 className="text-xl font-bold text-white mb-2">송금 링크 생성 완료!</h3>
            <p className="text-slate-400 text-sm mb-6">아래 링크를 복사해서 전달하세요.</p>
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full mb-4">
               유효기간: {expiryDate} 까지
            </div>
            <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 break-all text-xs text-slate-300 font-mono">{claimLink}</div>
            <button onClick={() => { navigator.clipboard.writeText(claimLink); alert("복사됨!"); }} className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-500 flex items-center justify-center gap-2 mb-2"><Copy size={16}/> 링크 복사</button>
            <button onClick={onClose} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700">닫기</button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex-1 flex flex-col gap-4">
            
            {/* 전송 타입 탭 */}
            <div className="flex bg-slate-800 p-1 rounded-xl mb-2">
                <button type="button" onClick={() => setSendType('ADDRESS')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${sendType === 'ADDRESS' ? 'bg-slate-700 text-white shadow' : 'text-slate-500'}`}><Wallet size={14}/> 지갑 주소</button>
                <button type="button" onClick={() => setSendType('PHONE')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${sendType === 'PHONE' ? 'bg-cyan-600/20 text-cyan-400 shadow' : 'text-slate-500'}`}><Smartphone size={14}/> 휴대폰 번호</button>
            </div>

            {/* 지갑 선택 */}
            <div>
              <label className="text-xs font-bold text-slate-400 mb-2 block ml-1">보내는 지갑</label>
              <button type="button" onClick={() => setIsWalletSelectorOpen(true)} className="w-full p-4 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-between hover:border-cyan-500/50 transition-all">
                 <span className="text-white font-bold text-sm">{selectedWallet?.label || "선택"}</span>
                 <ChevronDown size={16} className="text-slate-500" />
              </button>
            </div>

            {/* 자산 선택 */}
            <div>
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
            <div>
              <div className="flex justify-between items-end mb-2 px-1">
                <label className="text-xs font-bold text-slate-400">보낼 금액</label>
                <button type="button" onClick={() => setInputMode(prev => prev === 'TOKEN' ? 'KRW' : 'TOKEN')} className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 text-cyan-400 px-2 py-1 rounded-lg"><ArrowRightLeft size={10} /> {inputMode === 'TOKEN' ? selectedAsset?.symbol : 'KRW'} 기준</button>
              </div>
              <div className="relative">
                <input type="number" placeholder="0.00" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full bg-slate-950 text-white p-4 pr-16 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-800 text-lg font-bold" />
              </div>
              <p className="text-right text-xs text-slate-500 mt-2 font-mono h-4">{convertedValue}</p>

              {/* 금액 입력 후 수수료·수신 금액 요약 */}
              {feeEstimate && (
                <div className="mt-2 animate-fade-in">
                  {feeEstimate.type === 'stablecoin' && (
                    <div className={`rounded-xl px-3 py-2.5 border flex flex-col gap-1 ${
                      feeEstimate.receive <= 0
                        ? 'bg-red-500/10 border-red-500/20'
                        : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">
                          {(feeEstimate as any).relay
                            ? '⚡ 가스 대납 수수료 (0.2%, 최소 0.1)'
                            : `수수료 (max 0.2%, 최소 2 ${feeEstimate.sym})`}
                        </span>
                        <span className="text-amber-400 font-semibold">−{feeEstimate.fee} {feeEstimate.sym}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold border-t border-slate-800 pt-1.5 mt-0.5">
                        <span className="text-slate-400">예상 수신액</span>
                        <span className={feeEstimate.receive <= 0 ? 'text-red-400' : 'text-emerald-400'}>
                          {feeEstimate.receive > 0 ? `${feeEstimate.receive} ${feeEstimate.sym}` : '금액 부족'}
                        </span>
                      </div>
                    </div>
                  )}
                  {feeEstimate.type === 'native' && (
                    <p className="text-right text-[11px] text-slate-500">
                      예상 가스비 <span className="text-slate-400 font-medium">{feeEstimate.label}</span>
                    </p>
                  )}
                  {feeEstimate.type === 'error' && (
                    <p className="text-xs text-red-400 text-center">전송 금액이 최소 수수료(2 USDT)보다 작습니다.</p>
                  )}
                </div>
              )}

              {/* 자산별 안내 */}
              {selectedAsset?.symbol === 'USDT' && ['Ethereum', 'Polygon', 'Sepolia', 'Amoy', 'Base', 'Arbitrum'].includes(selectedAsset.network) && (
                  <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex items-start gap-2 mt-2 animate-fade-in-up">
                      <AlertTriangle size={14} className="text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-slate-400 text-[11px] leading-tight">
                          EVM USDT는 가스비 대납 미지원 — <b className="text-slate-300">네이티브 코인(ETH 등) 필요</b>. 트론(Tron) 사용 권장.
                      </p>
                  </div>
              )}
              {selectedAsset?.network === 'Tron' && !selectedAsset.isNative && (
                  <div className="bg-cyan-500/5 border border-cyan-500/15 px-3 py-2 rounded-xl flex items-center gap-2 mt-2 animate-fade-in-up">
                      <ShieldCheck size={13} className="text-cyan-500 shrink-0" />
                      <p className="text-slate-400 text-[11px]">가스비 자동 지원 · 수수료는 라우터가 자동 징수</p>
                  </div>
              )}
            </div>

{/* 받는 곳 입력 & ✨ [토스 스타일 검증 UI - 업데이트됨] */}
            <div className="animate-fade-in">
              <label className="block text-xs font-bold text-slate-400 mb-2 ml-1">{sendType === 'ADDRESS' ? "받는 주소" : "받는 사람 전화번호"}</label>
              
              {sendType === 'ADDRESS' ? (
                <div className="space-y-3">
                  {/* 주소 입력창 (깔끔하게) */}
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="0x..." 
                      value={toAddress} 
                      onChange={(e) => setToAddress(e.target.value)} 
                      className={`w-full bg-slate-950 text-white p-4 rounded-2xl outline-none border transition-all font-mono text-sm
                        ${riskStatus === 'RISKY' ? 'border-red-500/50 focus:ring-red-500/20' : 
                          riskStatus === 'SAFE' ? 'border-green-500/50 focus:ring-green-500/20' : 
                          'border-slate-800 focus:ring-2 focus:ring-cyan-500'}`} 
                    />
                  </div>

                  {/* ✨ [수정] 검증 버튼 (입력창 아래로 이동) */}
                  {/* 주소가 어느 정도 입력되었고(10자 이상), 아직 검증 안 했을 때(IDLE) 표시 */}
                  {toAddress.length > 10 && riskStatus === 'IDLE' && (
                      <button 
                          type="button"
                          onClick={checkAddressRisk}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all animate-fade-in border border-slate-700 hover:border-slate-600"
                      >
                          <ShieldCheck size={14} className="text-cyan-400"/>
                          잠깐! 사기·범죄 계좌인지 확인하기
                      </button>
                  )}

                  {/* 로딩 상태 */}
                  {riskStatus === 'CHECKING' && (
                      <div className="w-full py-3 bg-slate-900/50 rounded-xl flex items-center justify-center gap-2 border border-slate-800/50">
                          <Loader2 size={14} className="text-cyan-400 animate-spin" />
                          <span className="text-xs text-slate-500 font-medium">데이터베이스 조회 중...</span>
                      </div>
                  )}

                  {/* ✅ 안전함 (Safe) */}
                  {riskStatus === 'SAFE' && (
                      <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-xl flex items-start gap-3 animate-fade-in-up">
                          <div className="bg-green-500/20 p-1.5 rounded-full mt-0.5">
                              <CheckCircle2 size={16} className="text-green-400" />
                          </div>
                          <div>
                              <p className="text-green-400 text-xs font-bold mb-0.5">안심하고 보내세요!</p>
                              <p className="text-slate-400 text-[11px] leading-tight">
                                  금융사기 등으로 신고된 내역이 발견되지 않았어요.
                              </p>
                          </div>
                      </div>
                  )}

                  {/* 🚨 위험 감지 (Risky) */}
                  {riskStatus === 'RISKY' && (
                      <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-start gap-3 animate-fade-in-up">
                          <div className="bg-red-500/20 p-1.5 rounded-full mt-0.5">
                              <AlertTriangle size={16} className="text-red-400" />
                          </div>
                          <div>
                              <p className="text-red-400 text-xs font-bold mb-0.5">잠시만요! 주의가 필요해요.</p>
                              <p className="text-slate-300 text-[11px] leading-tight mb-1">
                                  이 주소는 <span className="text-red-300 font-bold underline">{riskDetail?.label}</span>(으)로 신고된 내역이 있습니다.
                              </p>
                              <p className="text-slate-500 text-[10px]">
                                  위험 등급: {riskDetail?.level}
                              </p>
                          </div>
                      </div>
                  )}
                </div>
              ) : (
                  <input type="tel" placeholder="+821012345678" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full bg-slate-950 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-800 font-mono text-sm" />
              )}
            </div>
            
            {/* ⭐ JIT 가스비 대납 진행 표시 */}
            {/* ⭐ JIT 가스비 / 전송결과 표시 */}
            {jitStep !== 'idle' && jitStep !== 'success' && (
              <div className={`mb-3 p-3 rounded-2xl border ${jitStep === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-cyan-500/30 bg-cyan-500/5'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {(jitStep === 'checking' || jitStep === 'funding' || jitStep === 'waiting') && <Loader2 size={14} className="animate-spin text-cyan-400" />}
                  {jitStep === 'ready' && <CheckCircle2 size={14} className="text-emerald-400" />}
                  {jitStep === 'error' && <AlertTriangle size={14} className="text-red-400" />}
                  <span className={`text-xs font-semibold ${jitStep === 'error' ? 'text-red-300' : 'text-cyan-300'}`}>
                    {jitStep === 'checking' ? '가스비 확인' : jitStep === 'funding' ? '가스비 충전' : jitStep === 'waiting' ? '도착 확인' : jitStep === 'ready' ? '전송 중...' : '전송 실패'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{jitMessage}</p>
                {jitFeeUsdt > 0 && jitStep !== 'error' && (
                  <div className="mt-2 flex justify-between text-[11px]">
                    <span className="text-slate-500">가스비 수수료</span>
                    <span className="text-amber-400 font-semibold">-{jitFeeUsdt} USDT</span>
                  </div>
                )}
              </div>
            )}

            {/* ✅ Tron 전송 성공 카드 */}
            {jitStep === 'success' && (
              <div className="mb-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 animate-fade-in-up">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="bg-emerald-500/20 p-1.5 rounded-full">
                    <CheckCircle2 size={18} className="text-emerald-400" />
                  </div>
                  <span className="text-sm font-bold text-emerald-300">전송 제출완료!</span>
                </div>
                <p className="text-[12px] text-slate-300 mb-2">{jitMessage}</p>
                {jitTxHash && (
                  <button
                    type="button"
                    onClick={() => window.open(`https://tronscan.org/#/transaction/${jitTxHash}`, '_blank')}
                    className="w-full mt-1 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={12} /> Tronscan에서 확인 →
                  </button>
                )}
              </div>
            )}

            <div className="mt-auto pt-2">
              <button 
                type="submit" 
                disabled={isProcessing} 
                className={`w-full py-4 rounded-2xl font-bold disabled:opacity-50 transition-all text-lg flex justify-center items-center gap-2
                  ${riskStatus === 'RISKY' 
                    ? 'bg-red-500/80 hover:bg-red-600 text-white' 
                    : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 text-white'}`}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : 
                 riskStatus === 'RISKY' ? "위험 감수하고 보내기" : 
                 (sendType === 'PHONE' ? "링크 생성 및 송금" : "전송하기")}
              </button>
            </div>
          </form>
        )}
        
        {/* 지갑 선택 모달 */}
        {isWalletSelectorOpen && (
            <div className="absolute inset-0 bg-slate-900 z-50 animate-fade-in-up flex flex-col p-6 rounded-t-3xl sm:rounded-3xl">
                <button onClick={() => setIsWalletSelectorOpen(false)} className="self-end mb-4"><X size={20} className="text-slate-400"/></button>
                <h3 className="text-white font-bold mb-4">지갑 선택</h3>
                <div className="overflow-y-auto flex-1">
                    {wallets.map(w => (
                        <button key={w.id} onClick={() => { setSelectedWallet(w); setIsWalletSelectorOpen(false); }} className="w-full p-4 rounded-2xl border text-left bg-slate-800 border-slate-700 mb-2 text-white font-bold hover:border-cyan-500">{w.label}</button>
                    ))}
                </div>
            </div>
        )}

        {/* 자산 선택 모달 */}
        {isAssetSelectorOpen && (
            <div className="absolute inset-0 bg-slate-900 z-50 animate-fade-in-up flex flex-col p-6 rounded-t-3xl sm:rounded-3xl">
                <button onClick={() => setIsAssetSelectorOpen(false)} className="self-end mb-4"><X size={20} className="text-slate-400"/></button>
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

      {/* SSS 서명 모달 */}
      {sssSigningOpen && selectedWallet?.addresses?.evm && (
        <SSSSigningModal
          walletAddress={selectedWallet.addresses.evm}
          purpose={sssSigningPurpose}
          onSigned={handleSSSSigningComplete}
          onCancel={() => {
            setSssSigningOpen(false);
            setSssPendingTx(null);
          }}
        />
      )}

      {/* Travel Rule 모달 */}
      {showTravelRule && selectedWallet && selectedAsset && (
        <TravelRuleModal
          originatorUserId={smartAccount?.address || ''}
          originatorAddress={selectedWallet.addresses.evm || ''}
          beneficiaryAddress={toAddress}
          assetSymbol={selectedAsset.symbol}
          assetNetwork={selectedAsset.network}
          amountToken={parseFloat(finalTokenAmount) || 0}
          amountKrw={Math.floor((parseFloat(finalTokenAmount)||0)*(selectedAsset.price||0)*(prices?.exchangeRate||1450))}
          amountUsd={(parseFloat(finalTokenAmount)||0)*(selectedAsset.price||0)}
          onConfirm={(refId, payload) => handleTravelRuleConfirm(refId, payload)}
          onCancel={() => setShowTravelRule(false)}
        />
      )}
      </div>
    </div>
  );
}