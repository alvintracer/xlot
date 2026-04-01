/**
 * ExtensionRequestPage.tsx
 * chrome.windows.create 로 열리는 서명/연결 승인 팝업 UI
 * URL: index.html?mode=extension-request&requestId=...
 */
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveAccount } from 'thirdweb/react';
import { SSSSigningModal } from '../components/SSSSigningModal';

// ── chrome 타입 선언 (전역 사용) ──────────────────────────────────
declare const chrome: typeof globalThis extends { chrome: infer C } ? C : never;

interface PendingRequest {
  id: string;
  method: string;
  params: unknown[];
  origin: string;
  timestamp: number;
}

// ── personal_sign 파라미터에서 메시지를 추출 (MetaMask 호환) ──────
// EIP spec: personal_sign(data, address) → [data, address]
// 하지만 많은 DApp이 [address, data] 순서로 보내기도 함
function isEthAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

function extractPersonalSignMessage(params: unknown[]): string {
  // 업비트 등 일부 거래소는 params가 undefined/null/string일 수 있음
  if (!params || !Array.isArray(params) || params.length === 0) return '';
  const p0 = String(params[0] ?? '');
  const p1 = String(params[1] ?? '');

  // 표준: [data, address]
  if (isEthAddress(p1) && !isEthAddress(p0)) return p0;
  // 비표준: [address, data]
  if (isEthAddress(p0) && !isEthAddress(p1)) return p1;
  // 둘 다 주소거나 둘 다 아닌 경우 → p0 을 메시지로 (spec 기본)
  if (isEthAddress(p0) && isEthAddress(p1)) return p1; // 첫 번째가 주소면 두 번째가 메시지
  return p0;
}

// 메서드별 한국어 제목/설명
const METHOD_INFO: Record<string, { title: string; description: string; danger?: boolean }> = {
  eth_requestAccounts: {
    title: '지갑 연결',
    description: '이 사이트가 귀하의 지갑 주소에 접근하려 합니다.',
  },
  wallet_requestPermissions: {
    title: '권한 요청',
    description: '이 사이트가 지갑 접근 권한을 요청합니다.',
  },
  personal_sign: {
    title: '메시지 서명',
    description: '이 사이트가 메시지 서명을 요청합니다. 내용을 확인하세요.',
    danger: true,
  },
  eth_sign: {
    title: '메시지 서명',
    description: '이 사이트가 데이터 서명을 요청합니다.',
    danger: true,
  },
  eth_signTypedData_v4: {
    title: '구조화 데이터 서명',
    description: '이 사이트가 구조화된 데이터 서명을 요청합니다.',
    danger: true,
  },
  eth_sendTransaction: {
    title: '트랜잭션 전송',
    description: '이 사이트가 트랜잭션 전송을 요청합니다.',
    danger: true,
  },
  wallet_addEthereumChain: {
    title: '네트워크 추가',
    description: '새 이더리움 네트워크를 지갑에 추가하려 합니다.',
  },
  wallet_switchEthereumChain: {
    title: '네트워크 전환',
    description: '연결된 네트워크를 전환하려 합니다.',
  },
};

export function ExtensionRequestPage() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSssModal, setShowSssModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [smartAddress, setSmartAddress] = useState<string>('');
  const [activeWalletType, setActiveWalletType] = useState<string>('XLOT_SSS');

  const smartAccount = useActiveAccount();

  const requestId = new URLSearchParams(window.location.search).get('requestId');

  useEffect(() => {
    if (!requestId) {
      setError('요청 ID가 없습니다.');
      setLoading(false);
      return;
    }

    // chrome.storage.local 에서 요청 정보 읽기
    const chromeAny = (globalThis as any).chrome;
    if (!chromeAny?.storage?.local) {
      setError('익스텐션 환경이 아닙니다.');
      setLoading(false);
      return;
    }

    chromeAny.storage.local.get(
      [`xlot_req_${requestId}`, 'accounts', 'xlot_smart_address', 'xlot_active_wallet', 'xlot_active_address', 'xlot_all_accounts'],
      (result: Record<string, any>) => {
        const req = result[`xlot_req_${requestId}`];
        if (!req) {
          setError('요청을 찾을 수 없습니다. 이미 처리되었거나 만료되었습니다.');
          setLoading(false);
          return;
        }

        // accounts가 없으면 (업비트처럼 바로 서명 요청) xlot_active_wallet에서 EVM 주소 사용
        const activeEvmAddr = result.xlot_active_wallet?.addresses?.evm;
        if (result.accounts && result.accounts.length > 0) {
          setWalletAddress(result.accounts[0]);
        } else if (activeEvmAddr) {
          // 업비트 케이스: storage에도 저장해서 background가 알 수 있게 함
          setWalletAddress(activeEvmAddr.toLowerCase());
          chromeAny.storage.local.set({ accounts: [activeEvmAddr.toLowerCase()] });
        }
        // SSS Vault 조회에 필요한 스마트 계정 주소
        if (result.xlot_smart_address) {
          setSmartAddress(result.xlot_smart_address);
        }

        // 활성 지갑 타입 결정:
        // xlot_all_accounts + xlot_active_address를 우선 사용 (ExtensionAccountSelector로 전환 시 최신값 반영)
        // xlot_active_wallet.wallet_type은 메인 앱에서만 업데이트되어 stale할 수 있음
        const activeAddr = result.xlot_active_address || result.accounts?.[0] || '';
        let allAccountsList: Array<{address: string; type: string}> = [];
        try { allAccountsList = JSON.parse(result.xlot_all_accounts || '[]'); } catch {}
        const activeAccountEntry = allAccountsList.find((a: any) => a.address === activeAddr);
        const walletType = activeAccountEntry?.type === 'THIRDWEB_AA' ? 'XLOT'
          : activeAccountEntry?.type === 'XLOT_SSS' ? 'XLOT_SSS'
          : result.xlot_active_wallet?.wallet_type || 'XLOT_SSS';
        setActiveWalletType(walletType);

        setRequest(req);
        setLoading(false);

        // 서명 및 트랜잭션 요청이면 불필요한 "승인/거절" 단계를 건너뛰고 곧바로 SSS 인증 모달 표시
        if (
          req.method === 'personal_sign' ||
          req.method === 'eth_sign' ||
          req.method.startsWith('eth_signTypedData') ||
          req.method === 'eth_sendTransaction'
        ) {
          // MPC(Thirdweb XLOT) 지갑인 경우 SSS 인증이 없으므로 승인/거절 UI를 그대로 보여줌
          // 로컬 변수(walletType)을 직접 사용해야 state 비동기 문제를 피할 수 있음
          if (walletType !== 'XLOT') {
            setShowSssModal(true);
          }
        }
      },
    );
  }, [requestId]);

  const handleApprove = async () => {
    if (!request) return;
    setProcessing(true);

    const chromeAny = (globalThis as any).chrome;

    try {
      // ── 실제 서명/응답 처리 ────────────────────────────────────
      let result: unknown;

      if (request.method === 'eth_requestAccounts' || request.method === 'wallet_requestPermissions') {
        // 저장된 계정 반환
        const stored = await new Promise<{ accounts?: string[] }>((resolve) =>
          chromeAny.storage.local.get(['accounts'], resolve),
        );
        result = stored.accounts ?? [];

        if (request.method === 'wallet_requestPermissions') {
          result = [{ parentCapability: 'eth_accounts' }];
        }
        
        // background 에 승인 결과 전달
        await new Promise<void>((resolve) =>
          chromeAny.runtime.sendMessage({ type: 'XLOT_APPROVE', id: request.id, result }, () => resolve()),
        );
        await new Promise<void>((resolve) =>
          chromeAny.storage.local.remove([`xlot_req_${request.id}`], () => resolve()),
        );
        window.close();
      } else if (
        request.method === 'personal_sign' ||
        request.method === 'eth_sign' ||
        request.method.startsWith('eth_signTypedData') ||
        request.method === 'eth_sendTransaction'
      ) {
        // state가 비동기라 storage에서 직접 최신값 읽기
        // xlot_all_accounts + xlot_active_address를 우선 사용 (ExtensionAccountSelector로 전환 시 최신값 반영)
        const freshStored = await new Promise<Record<string, any>>((resolve) =>
          chromeAny.storage.local.get(['xlot_active_wallet', 'xlot_active_address', 'xlot_all_accounts', 'accounts'], resolve),
        );
        const freshActiveAddr = freshStored.xlot_active_address || freshStored.accounts?.[0] || '';
        let freshAllAccounts: Array<{address: string; type: string}> = [];
        try { freshAllAccounts = JSON.parse(freshStored.xlot_all_accounts || '[]'); } catch {}
        const freshEntry = freshAllAccounts.find((a: any) => a.address === freshActiveAddr);
        const freshWalletType = freshEntry?.type === 'THIRDWEB_AA' ? 'XLOT'
          : freshEntry?.type === 'XLOT_SSS' ? 'XLOT_SSS'
          : freshStored.xlot_active_wallet?.wallet_type || activeWalletType;

        if (freshWalletType === 'XLOT') {
          if (!smartAccount) throw new Error("계정이 연결되지 않았습니다. (Thirdweb Smart Account)");
          
          if (request.method === 'personal_sign' || request.method === 'eth_sign') {
            const msg = extractPersonalSignMessage(request.params as string[]);
            let payloadToSign: string | Uint8Array = msg;
            if (msg.startsWith('0x')) {
              try { payloadToSign = ethers.getBytes(msg); } catch {}
            }
            if (payloadToSign instanceof Uint8Array) {
              result = await smartAccount.signMessage({ message: { raw: payloadToSign } });
            } else {
              result = await smartAccount.signMessage({ message: payloadToSign });
            }
          } else if (request.method.startsWith('eth_signTypedData')) {
            const dataStr = (request.params as any[])[1];
            const dataObj = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
            const types = { ...dataObj.types };
            delete types['EIP712Domain'];
            if (smartAccount.signTypedData) {
               result = await smartAccount.signTypedData({
                 domain: dataObj.domain,
                 types,
                 message: dataObj.message
               } as any);
            }
          } else if (request.method === 'eth_sendTransaction') {
            const txObj = (request.params as any[])[0];
            if (smartAccount.sendTransaction) result = await smartAccount.sendTransaction(txObj);
          }

          await new Promise<void>((resolve) =>
            chromeAny.runtime.sendMessage({ type: 'XLOT_APPROVE', id: request.id, result }, () => resolve()),
          );
          await new Promise<void>((resolve) =>
            chromeAny.storage.local.remove([`xlot_req_${request.id}`], () => resolve()),
          );
          window.close();
        } else {
          // SSS 지갑: 모달을 띄워 사용자 인증(OTP 등)을 받음
          setShowSssModal(true);
          setProcessing(false);
          return;
        }
      } else if (request.method === 'wallet_addEthereumChain' || request.method === 'wallet_switchEthereumChain') {
        result = null; // 성공 응답
        // background 에 승인 결과 전달
        await new Promise<void>((resolve) =>
          chromeAny.runtime.sendMessage({ type: 'XLOT_APPROVE', id: request.id, result }, () => resolve()),
        );
        await new Promise<void>((resolve) =>
          chromeAny.storage.local.remove([`xlot_req_${request.id}`], () => resolve()),
        );
        window.close();
      }
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message);
      setProcessing(false);
    }
  };

  // ── SSS 모달에서 개인키가 복원되었을 때 실제 서명 수행 ────────────────────────
  const performSigning = async (wallet: any, cleanup: () => void) => {
    if (!request) return;
    setProcessing(true);
    setShowSssModal(false);

    const chromeAny = (globalThis as any).chrome;
    let result: unknown;

    try {
      if (request.method === 'personal_sign' || request.method === 'eth_sign') {
        // MetaMask 호환: 파라미터 순서 자동 감지
        const msg = extractPersonalSignMessage(request.params as string[]);

        // 메시지가 hex 인 경우 바이트 배열로 변환 (거래소 challenge 서명 핵심)
        // MetaMask와 동일하게 hex → Uint8Array → signMessage(bytes)
        let payloadToSign: string | Uint8Array = msg;
        if (msg.startsWith('0x')) {
          try {
            payloadToSign = ethers.getBytes(msg);
          } catch {
            // 유효하지 않은 hex 면 그냥 문자열로 서명
            payloadToSign = msg;
          }
        }

        result = await wallet.signMessage(payloadToSign);
      } else if (request.method.startsWith('eth_signTypedData')) {
        // eth_signTypedData_v4: params = [address, typedDataJSON]
        const dataStr = (request.params as any[])[1];
        const dataObj = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;

        // EIP-712 types 에서 EIP712Domain 제거 (ethers.js 가 자동 추가)
        const types = { ...dataObj.types };
        delete types['EIP712Domain'];

        if (wallet.signTypedData) {
          result = await wallet.signTypedData(dataObj.domain, types, dataObj.message);
        } else {
          // ethers v5 호환
          result = await wallet._signTypedData(dataObj.domain, types, dataObj.message);
        }
      } else if (request.method === 'eth_sendTransaction') {
        const txObj = (request.params as any[])[0];

        // Provider 연결: RPC 노드를 통해 트랜잭션 전송
        const stored = await new Promise<Record<string, any>>((resolve) =>
          chromeAny.storage.local.get(['chainId'], resolve),
        );
        const chainId = (stored.chainId as string) ?? '0x1';
        const rpcMap: Record<string, string> = {
          '0x1':      'https://rpc.ankr.com/eth',
          '0x89':     'https://rpc.ankr.com/polygon',
          '0xaa36a7': 'https://rpc.ankr.com/eth_sepolia',
          '0x13882':  'https://rpc.ankr.com/polygon_amoy',
        };
        const rpcUrl = rpcMap[chainId] ?? rpcMap['0x1'];
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const connectedWallet = wallet.connect(provider);

        const txResponse = await connectedWallet.sendTransaction(txObj);
        result = txResponse.hash;
      }

      // background 로 승인 결과(서명) 반환
      await new Promise<void>((resolve) =>
        chromeAny.runtime.sendMessage({ type: 'XLOT_APPROVE', id: request.id, result }, () => resolve()),
      );

      await new Promise<void>((resolve) =>
        chromeAny.storage.local.remove([`xlot_req_${request.id}`], () => resolve()),
      );

      cleanup();
      window.close();
    } catch (e: unknown) {
      const err = e as Error;
      setError('서명 중 오류 발생: ' + err.message);
      cleanup();
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setProcessing(true);

    const chromeAny = (globalThis as any).chrome;

    await new Promise<void>((resolve) =>
      chromeAny.runtime.sendMessage({ type: 'XLOT_REJECT', id: request.id }, () => resolve()),
    );

    await new Promise<void>((resolve) =>
      chromeAny.storage.local.remove([`xlot_req_${request.id}`], () => resolve()),
    );

    window.close();
  };

  // ── UI 렌더링 ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-red-400 text-4xl">⚠️</div>
        <p className="text-white font-semibold">{error}</p>
        <button
          onClick={() => window.close()}
          className="mt-2 px-6 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-600"
        >
          닫기
        </button>
      </div>
    );
  }

  if (!request) return null;

  const info = METHOD_INFO[request.method] ?? {
    title: request.method,
    description: '이 작업을 승인하시겠습니까?',
    danger: false,
  };

  const originHost = (() => {
    try { return new URL(request.origin).hostname; } catch { return request.origin; }
  })();

  const renderParams = () => {
    if (request.method === 'personal_sign' || request.method === 'eth_sign') {
      const raw = extractPersonalSignMessage(request.params as string[]);
      // hex → utf8 시도
      let decoded = raw;
      if (raw.startsWith('0x')) {
        try {
          decoded = decodeURIComponent(
            raw.slice(2).replace(/../g, '%$&'),
          );
        } catch {
          decoded = raw;
        }
      }
      return (
        <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300 break-all max-h-40 overflow-y-auto">
          {decoded}
        </div>
      );
    }

    if (request.method === 'eth_signTypedData_v4') {
      const data = (request.params as unknown[])[1];
      let parsed: unknown = data;
      if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch {}
      }
      return (
        <pre className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    }

    if (request.method === 'eth_sendTransaction') {
      const tx = (request.params as Record<string, string>[])[0] ?? {};
      return (
        <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300 space-y-1">
          {tx.to && <div><span className="text-slate-500">To: </span><span className="break-all">{tx.to}</span></div>}
          {tx.value && <div><span className="text-slate-500">Value: </span>{parseInt(tx.value, 16) / 1e18} ETH</div>}
          {tx.data && tx.data !== '0x' && <div><span className="text-slate-500">Data: </span><span className="text-xs break-all">{tx.data.slice(0, 66)}…</span></div>}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-[375px] max-w-[100vw] min-h-screen bg-slate-950 flex flex-col mx-auto overflow-hidden shadow-2xl relative">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
          X
        </div>
        <span className="text-white font-semibold text-sm">xLOT Wallet</span>
      </div>

      {/* 출처 사이트 표시 */}
      <div className="mx-5 mt-4 px-4 py-2 bg-slate-800/60 rounded-lg flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-slate-400 text-xs">{originHost}</span>
      </div>

      {/* 요청 내용 */}
      <div className="flex-1 px-5 py-4 space-y-4">
        <div>
          <h1 className="text-white text-xl font-bold">{info.title}</h1>
          <p className="text-slate-400 text-sm mt-1">{info.description}</p>
        </div>

        {info.danger && (
          <div className="flex items-start gap-2 px-3 py-2 bg-cyan-900/30 border border-cyan-700/50 rounded-lg">
            <span className="text-cyan-400 mt-0.5">⚠</span>
            <p className="text-cyan-300 text-xs">
              서명 데이터를 신중히 확인하세요. 잘못된 서명은 자산 손실로 이어질 수 있습니다.
            </p>
          </div>
        )}

        {renderParams()}

        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div className="px-5 pb-6 flex gap-3">
        <button
          onClick={handleReject}
          disabled={processing}
          className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          거절
        </button>
        <button
          onClick={handleApprove}
          disabled={processing}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors ${
            info.danger
              ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
              : 'bg-cyan-500 hover:bg-cyan-400 text-black'
          }`}
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
               <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
              처리 중...
            </span>
          ) : (
            '승인'
          )}
        </button>
      </div>

      {showSssModal && (
        <SSSSigningModal
          walletAddress={walletAddress}
          smartAccountAddress={smartAddress}
          purpose={`${info.title} (${originHost})`}
          onSigned={({ wallet, cleanup }) => performSigning(wallet, cleanup)}
          onCancel={handleReject}
        />
      )}
    </div>
  );
}
