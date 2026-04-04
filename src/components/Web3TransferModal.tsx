// src/components/Web3TransferModal.tsx
// [KYT 연동] 수정 내역:
// 1. kytService import 추가
// 2. KYTGuard 컴포넌트 import 추가
// 3. kytStatus, kytResult, reason state 추가
// 4. handleTransfer에 KYT 차단 로직 추가 (FAIL_CLOSED 포함)
// 5. KYTGuard를 주소 입력 필드 바로 아래에 삽입
// 6. 전송 버튼 disabled 조건에 kytService.canProceed 적용

import { useState, useEffect, useMemo } from "react";
import { X, ArrowRight, ArrowRightLeft, Loader2, CheckCircle, ChevronDown } from "lucide-react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareTransaction, toWei, getContract, prepareContractCall, readContract } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { client } from "../client";
import type { WalletSlot, WalletAsset } from "../services/walletService";



// ✨ [SSS 지원]
import { ethers } from "ethers";
import { SSSSigningModal } from "./SSSSigningModal";
import { sendSOL, sendTRX, sendBTC, sendTRC20 } from "../services/multiChainSendService";
import { signPermit, relayPermitTransfer, requestTronJit, requestSolInit, checkSolAccountExists, PERMIT_SUPPORTED_TOKENS } from '../services/gaslessService';
import { isTronWallet, getTronLinkWeb } from '../utils/walletProviderUtils';

interface Props {
  sourceWallet: WalletSlot;
  targetAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CHAIN_MAP: Record<string, number> = {
  'Ethereum': 1,
  'Sepolia': 11155111,
  'Polygon': 137,
  'Amoy': 80002,
  'Base': 8453,
  'Arbitrum': 42161,
  'Optimism': 10,
  'Binance Smart Chain': 56,
};

export function Web3TransferModal({ sourceWallet, targetAddress, onClose, onSuccess }: Props) {
  const account = useActiveAccount();
  const { mutate: sendTransaction, isPending } = useSendTransaction();

  // === UI States ===
  const [step, setStep] = useState<'INPUT' | 'RESULT'>('INPUT');
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);

  // === Data States ===
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);



  // ✨ [SSS 추가] SSS 지갑 내부 이체 처리용
  const [sssSigningOpen, setSssSigningOpen] = useState(false);
  const [sssPendingTx, setSssPendingTx] = useState<((w: ethers.Wallet, mn: string) => Promise<void>) | null>(null);
  const [sssSigningPurpose, setSssSigningPurpose] = useState('');

  // ✨ [TronLink] 연결된 TronLink 주소 추적
  const [tronLinkAddress, setTronLinkAddress] = useState<string | null>(null);

  useEffect(() => {
    if (sourceWallet.assets && sourceWallet.assets.length > 0) {
      const firstWithBalance = sourceWallet.assets.find(a => a.balance > 0) || sourceWallet.assets[0];
      setSelectedAsset(firstWithBalance);
    }
  }, [sourceWallet]);

  // TronLink 주소 감지 (해당 wallet_type일 때만)
  useEffect(() => {
    if (!isTronWallet(sourceWallet.wallet_type)) return;
    const win = window as any;

    const sync = () => {
      const addr = getTronLinkWeb()?.defaultAddress?.base58 || null;
      setTronLinkAddress(addr);
    };

    // TronLink는 비동기 주입 → 최대 3초 폴링 후 감지
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (win.tronLink || win.tronWeb) {
        clearInterval(poll);
        sync();
        win.tronLink?.on?.('accountsChanged', sync);
      } else if (attempts >= 30) {
        clearInterval(poll);
      }
    }, 100);

    return () => {
      clearInterval(poll);
      win.tronLink?.removeListener?.('accountsChanged', sync);
    };
  }, [sourceWallet.wallet_type]);

  const isCorrectWallet = useMemo(() => {
    // SSS 계정은 내부 서명앱을 쓰므로 Active 연결 여부와 무관하게 허용
    if (sourceWallet.wallet_type === 'XLOT_SSS' || sourceWallet.wallet_type === 'XLOT') return true;
    // TronLink: window.tronWeb 연결 주소 vs 저장된 TRX 주소 비교
    if (isTronWallet(sourceWallet.wallet_type)) {
      if (!tronLinkAddress || !sourceWallet.addresses.trx) return false;
      return tronLinkAddress === sourceWallet.addresses.trx;
    }
    if (!account?.address || !sourceWallet.addresses.evm) return false;
    return account.address.toLowerCase() === sourceWallet.addresses.evm.toLowerCase();
  }, [account, sourceWallet, tronLinkAddress]);



  const handleTransfer = async () => {
    if (!amount || !selectedAsset) return;
    setError(null);

    if (!isCorrectWallet) {
      setError(`지갑이 다릅니다. '${sourceWallet.label}' 지갑으로 연결해주세요.`);
      return;
    }



    // ✨ XLOT_SSS일 경우 SSS 서명 프로세스 바로 진행 (매끄러운 이체)
    if (sourceWallet.wallet_type === 'XLOT_SSS' || sourceWallet.wallet_type === 'XLOT') {
       if (selectedAsset.network === 'Solana') {
          // SPL 토큰 지원 시 hasSol 분기 필요하나, 지금은 Native(SOL) 전송
          setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
             await sendSOL(mn, targetAddress, parseFloat(amount));
             setStep('RESULT');
          });
       } else if (selectedAsset.network === 'Tron') {
          const isToken = !selectedAsset.isNative && !!selectedAsset.tokenAddress;
          setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
             const sendAmount = parseFloat(amount);
             if (isToken) {
                 // JIT 가스비 확인 — 에너지/TRX 부족 시 JIT 요청
                 const trxBalance = sourceWallet.balances?.trx || 0;
                 if (trxBalance < 2) {
                     await requestTronJit(sourceWallet.addresses.trx || '');
                     await new Promise(r => setTimeout(r, 5000));
                 }
                 // xLOT Router 경유 전송 (수수료 on-chain 자동 징수)
                 await sendTRC20(mn, targetAddress, selectedAsset.tokenAddress!, sendAmount, true);
             } else {
                 await sendTRX(mn, targetAddress, sendAmount);
             }
             setStep('RESULT');
          });
       } else if (selectedAsset.network === 'Bitcoin') {
          setSssPendingTx(() => async (_w: ethers.Wallet, mn: string) => {
             await sendBTC(mn, targetAddress, parseFloat(amount));
             setStep('RESULT');
          });
       } else {
         // EVM
         // Permit 체크 
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
             setSssPendingTx(() => async (wallet: ethers.Wallet, _mn: string) => {
                 const deadline = Math.floor(Date.now() / 1000) + 3600;
                 const amountWei = ethers.parseUnits(amount, 6);
                 // nonce 조회를 위해 provider 연결 필요
                 const provider = new ethers.JsonRpcProvider(permitRpcUrl);
                 const connected = wallet.connect(provider);
                 const { v, r, s } = await signPermit(
                     connected, permitDetail, relayerAddress, amountWei.toString(), deadline
                 );
                 await relayPermitTransfer({
                     network: selectedAsset.network,
                     tokenAddress: permitDetail.tokenAddress,
                     owner: wallet.address,
                     toAddress: targetAddress,
                     amount: amount, 
                     deadline, v, r, s
                 });
                 setStep('RESULT');
             });
         } else {
             // 일반 EVM
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
                 
             setSssPendingTx(() => async (wallet: ethers.Wallet, _mn: string) => {
                 const provider = new ethers.JsonRpcProvider(rpcUrl);
                 const connected = wallet.connect(provider);

                 if (selectedAsset.isNative) {
                     const tx = await connected.sendTransaction({
                         to: targetAddress,
                         value: ethers.parseEther(amount)
                     });
                     await tx.wait();
                 } else if (selectedAsset.tokenAddress) {
                     const abi = [
                        'function transfer(address to, uint256 amount) returns (bool)',
                        'function decimals() view returns (uint8)'
                     ];
                     const contract = new ethers.Contract(selectedAsset.tokenAddress, abi, connected);
                     let decimals = 18;
                     try { decimals = Number(await contract.decimals()); } catch (e) { /* default to 18 */ }
                     const tx = await contract.transfer(targetAddress, ethers.parseUnits(amount, decimals));
                     await tx.wait();
                 } else {
                     throw new Error('전송 가능한 자산이 없습니다');
                 }
                 setStep('RESULT');
             });
         }
       }
       setSssSigningPurpose(`${amount} ${selectedAsset.symbol} 채우기`);
       setSssSigningOpen(true);
       return;
    }

    // ── TronLink 전송 경로 ────────────────────────────────────
    if (isTronWallet(sourceWallet.wallet_type)) {
      try {
        const tronWeb = getTronLinkWeb();
        if (!tronWeb?.defaultAddress?.base58) {
          setError("TronLink가 연결되어 있지 않습니다. 지갑 잠금을 해제하고 다시 시도해주세요.");
          return;
        }
        if (selectedAsset.isNative) {
          // TRX 전송 (1 TRX = 1,000,000 SUN)
          const sunAmount = Math.floor(parseFloat(amount) * 1_000_000);
          const tx = await tronWeb.trx.sendTransaction(targetAddress, sunAmount);
          if (!tx.result) throw new Error("TRX 전송 실패: " + (tx.message || '트랜잭션 거절'));
        } else if (selectedAsset.tokenAddress) {
          // TRC20 전송
          const contract = await tronWeb.contract().at(selectedAsset.tokenAddress);
          let decimals = 6;
          try { decimals = Number(await contract.decimals().call()); } catch (_) { /* 기본 6 유지 */ }
          const rawAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
          await contract.transfer(targetAddress, rawAmount).send({ feeLimit: 100_000_000 });
        } else {
          throw new Error("전송 가능한 자산이 없습니다.");
        }
        setStep('RESULT');
      } catch (e: any) {
        setError(e.message);
      }
      return;
    }

    // 일반 Web3 계정
    try {
      const chainId = CHAIN_MAP[selectedAsset.network];
      if (!chainId) throw new Error(`지원하지 않는 네트워크입니다: ${selectedAsset.network}`);

      const chain = defineChain(chainId);

      // ── Permit(EIP-2612) 가스리스 경로 ──────────────────────
      const tAddr = selectedAsset.tokenAddress || '';
      const permitDetail = (!selectedAsset.isNative && tAddr)
        ? PERMIT_SUPPORTED_TOKENS[tAddr.toLowerCase()]
        : undefined;

      if (permitDetail && account) {
        const relayerAddress = import.meta.env.VITE_EVM_RELAYER_ADDRESS || '';
        if (!relayerAddress) throw new Error('Relayer 주소가 설정되지 않았습니다.');

        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const amountWei = ethers.parseUnits(amount, 6);

        // nonce 읽기 (read-only provider)
        const rpcUrl = chainId === 1
          ? (import.meta.env.VITE_ETH_RPC || 'https://eth.llamarpc.com')
          : (import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com');
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const tokenContract = new ethers.Contract(
          permitDetail.tokenAddress,
          ['function nonces(address owner) view returns (uint256)'],
          provider,
        );
        const nonce = await tokenContract.nonces(account.address);

        // EIP-712 permit 서명 (thirdweb account — 가스 불필요)
        const signature = await account.signTypedData({
          domain: {
            name: permitDetail.name,
            version: permitDetail.version,
            chainId: BigInt(permitDetail.chainId),
            verifyingContract: permitDetail.tokenAddress as `0x${string}`,
          },
          types: {
            Permit: [
              { name: 'owner',    type: 'address' },
              { name: 'spender',  type: 'address' },
              { name: 'value',    type: 'uint256' },
              { name: 'nonce',    type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          message: {
            owner:    account.address as `0x${string}`,
            spender:  relayerAddress  as `0x${string}`,
            value:    amountWei,
            nonce:    BigInt(nonce.toString()),
            deadline: BigInt(deadline),
          },
        });

        const { v, r, s } = ethers.Signature.from(signature);
        await relayPermitTransfer({
          network: selectedAsset.network,
          tokenAddress: permitDetail.tokenAddress,
          owner: account.address,
          toAddress: targetAddress,
          amount,
          deadline, v, r, s,
        });
        setStep('RESULT');
        return;
      }

      // ── 일반 transfer (가스 필요) ────────────────────────────
      let transaction;
      if (selectedAsset.isNative) {
        transaction = prepareTransaction({
          to: targetAddress,
          chain: chain,
          client: client,
          value: toWei(amount),
        });
      } else if (selectedAsset.tokenAddress) {
        const contract = getContract({ client, chain, address: selectedAsset.tokenAddress });
        const decimals = await readContract({ contract, method: 'function decimals() view returns (uint8)' });
        const rawAmount = ethers.parseUnits(amount, Number(decimals));
        transaction = prepareContractCall({
          contract,
          method: 'function transfer(address to, uint256 amount) returns (bool)',
          params: [targetAddress as `0x${string}`, rawAmount],
        });
      } else {
        throw new Error('올바르지 않은 자산 정보입니다.');
      }

      sendTransaction(transaction, {
        onSuccess: () => { setStep('RESULT'); },
        onError: (err) => {
          if (err.message.includes('rejected')) {
            setError('사용자가 서명을 거부했습니다.');
          } else {
            setError('전송 실패: ' + err.message);
          }
        },
      });

    } catch (e: any) {
      setError(e.message);
    }
  };

  const availableAssets = sourceWallet.assets || [];

  const isTransferDisabled =
    isPending ||
    !amount ||
    parseFloat(amount) <= 0 ||
    !isCorrectWallet;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-x border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800 shrink-0">
          <h3 className="font-bold text-white flex items-center gap-2">
            <span className="text-cyan-400">Web3</span> 이체
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">채우기 모드</span>
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-500 hover:text-white" /></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar relative">
          {step === 'INPUT' && (
            <div className="space-y-6">
              {/* 1. From -> To Info */}
              <div className="flex items-center justify-between gap-2 p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-center w-5/12 overflow-hidden">
                  <p className="text-xs text-slate-500 mb-1">보내는 곳</p>
                  <p className="text-sm font-bold text-white truncate">{sourceWallet.label}</p>
                </div>
                <ArrowRight className="text-slate-600 shrink-0" />
                <div className="text-center w-5/12 overflow-hidden">
                  <p className="text-xs text-slate-500 mb-1">받는 곳 (나)</p>
                  <p className="text-sm font-bold text-cyan-400 truncate">내 지갑</p>
                  <p className="text-[9px] text-slate-600 truncate">
                    {targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}
                  </p>
                </div>
              </div>



              {/* 2. 자산 선택 */}
              <div>
                <label className="text-xs font-bold text-slate-400 mb-2 block ml-1">보낼 자산</label>
                <button
                  type="button"
                  onClick={() => setIsAssetSelectorOpen(true)}
                  className="w-full p-4 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-between hover:border-cyan-500/50 transition-all"
                >
                  {selectedAsset ? (
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white
                        ${selectedAsset.isNative ? 'bg-slate-700' : 'bg-slate-900 border border-slate-700'}`}>
                        {selectedAsset.symbol[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">{selectedAsset.symbol}</p>
                        <p className="text-[10px] text-slate-500">{selectedAsset.network} · 잔액: {selectedAsset.balance.toFixed(4)}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500 text-sm">자산을 선택하세요</span>
                  )}
                  <ChevronDown size={16} className="text-slate-500" />
                </button>
              </div>

              {/* 3. 금액 입력 */}
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">전송할 수량</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pr-16 text-lg font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="absolute right-2 top-2 bottom-2 flex items-center">
                    <button
                      onClick={() => selectedAsset && setAmount(selectedAsset.balance.toString())}
                      className="px-2 py-1 bg-slate-800 text-xs text-cyan-400 font-bold rounded-lg hover:bg-slate-700"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                {selectedAsset && (
                  <p className="text-right text-xs text-slate-500 mt-1">
                    사용 가능: {selectedAsset.balance.toFixed(6)} {selectedAsset.symbol}
                  </p>
                )}
              </div>

              {/* 4. Action Button */}
              <button
                onClick={handleTransfer}
                disabled={isTransferDisabled}
                className={`w-full py-4 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2
                  ${isCorrectWallet && !isTransferDisabled
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-900/20'
                    : 'bg-slate-800 cursor-not-allowed text-slate-500'}`}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
                {!isCorrectWallet
                  ? isTronWallet(sourceWallet.wallet_type)
                    ? 'TronLink 연결 필요'
                    : '지갑 연결 필요'
                  : '채우기'}
              </button>
            </div>
          )}

          {/* 결과 화면 */}
          {step === 'RESULT' && (
            <div className="text-center py-10 animate-fade-in px-6">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                 <span className="text-4xl">🥳</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">채우기가 완료되었습니다!</h3>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                나의 다른 지갑에서 성공적으로<br/>
                자산을 가져왔습니다.
              </p>
              <button onClick={onSuccess} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl font-bold transition-colors">
                확인
              </button>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 text-center">
              {error}
            </div>
          )}

          {/* Asset Selector Overlay */}
          {isAssetSelectorOpen && (
            <div className="absolute inset-0 bg-slate-900 z-50 flex flex-col p-6 animate-fade-in-up">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-white font-bold">자산 선택</h3>
                <button onClick={() => setIsAssetSelectorOpen(false)}><X size={20} className="text-slate-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                {availableAssets.length === 0 ? (
                  <p className="text-slate-500 text-center py-10">보유 자산이 없습니다.</p>
                ) : (
                  availableAssets.map((asset, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setSelectedAsset(asset); setIsAssetSelectorOpen(false); }}
                      className={`w-full p-3 rounded-xl border text-left flex justify-between items-center transition-all
                        ${selectedAsset?.symbol === asset.symbol && selectedAsset?.network === asset.network
                          ? 'bg-cyan-500/10 border-cyan-500'
                          : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white
                          ${asset.isNative ? 'bg-slate-600' : 'bg-slate-900'}`}>
                          {asset.symbol[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{asset.symbol}</p>
                          <p className="text-[10px] text-slate-400">{asset.network}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{asset.balance.toFixed(4)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {sssSigningOpen && sssPendingTx && (
        <SSSSigningModal
          walletAddress={sourceWallet.addresses.evm!}
          purpose={sssSigningPurpose}
          onSigned={async (result) => {
            try {
               await sssPendingTx(result.wallet, result.mnemonic);
               setSssSigningOpen(false);
               result.cleanup();
            } catch(e: any) {
               setError(e.message);
               setSssSigningOpen(false);
               result.cleanup();
            }
          }}
          onCancel={() => setSssSigningOpen(false)}
        />
      )}
    </div>
  );
}