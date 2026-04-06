/**
 * background.ts  –  Service Worker (Extension World)
 *
 * 역할:
 *  1. content.ts 에서 오는 XLOT_REQUEST 를 받아 처리
 *  2. 즉시 응답 가능한 요청(eth_chainId 등)은 바로 반환
 *  3. 사용자 승인이 필요한 요청(sign, sendTx 등)은 팝업을 열고 결과 대기
 *  4. 팝업에서 XLOT_APPROVE / XLOT_REJECT 가 오면 원래 콘텐츠에 응답
 *  5. 기타 RPC 요청(eth_call, eth_getBalance 등)은 원격 노드로 프록시
 */

export {};

// ── 타입 ─────────────────────────────────────────────────────────
interface PendingRequest {
  id: string;
  method: string;
  params: unknown[];
  origin: string;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
}

// ── 대기 중 요청 저장소 ────────────────────────────────────────────
const pendingRequests = new Map<string, PendingRequest>();

// ── 사용자 승인이 필요한 메서드 목록 ──────────────────────────────
const INTERACTIVE_METHODS = new Set([
  'eth_requestAccounts',
  'wallet_requestPermissions',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_addEthereumChain',
  'wallet_switchEthereumChain',
]);

// ── 체인별 RPC 엔드포인트 (프록시용) ─────────────────────────────
const CHAIN_RPC: Record<string, string> = {
  '0x1':    'https://rpc.ankr.com/eth',            // Ethereum Mainnet
  '0x89':   'https://rpc.ankr.com/polygon',         // Polygon
  '0xaa36a7': 'https://rpc.ankr.com/eth_sepolia',   // Sepolia
  '0x13882': 'https://rpc.ankr.com/polygon_amoy',   // Polygon Amoy
  '0x2105': 'https://rpc.ankr.com/base',            // Base
};

// JSON-RPC 프록시: 로컬에서 처리 불가능한 요청을 원격 RPC 노드로 전달
async function proxyToRpc(method: string, params: unknown[]): Promise<unknown> {
  const stored = await chrome.storage.local.get('chainId');
  const chainId = (stored['chainId'] as string | undefined) ?? '0x1';
  const rpcUrl = CHAIN_RPC[chainId] ?? CHAIN_RPC['0x1'];

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  });

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const json = await resp.json();
  if (json.error) {
    throw new Error(json.error.message ?? `RPC error: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

// ── 메시지 리스너 ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (
    message: {
      type: string;
      id?: string;
      method?: string;
      params?: unknown[];
      origin?: string;
      result?: unknown;
      error?: unknown;
    },
    _sender,
    sendResponse,
  ) => {
    if (message.type === 'XLOT_REQUEST') {
      handleProviderRequest(message as Required<Pick<typeof message, 'id' | 'method' | 'params' | 'origin'>> & typeof message, sendResponse);
      return true; // 비동기 응답 유지
    }

    if (message.type === 'XLOT_APPROVE') {
      const pending = pendingRequests.get(message.id!);
      if (pending) {
        pendingRequests.delete(message.id!);
        pending.resolve(message.result);
        // 연결 승인 시 accountsChanged 이벤트 브로드캐스트 (async IIFE)
        if (
          pending.method === 'eth_requestAccounts' ||
          pending.method === 'wallet_requestPermissions'
        ) {
          (async () => {
            const accounts = Array.isArray(message.result)
              ? message.result as string[]
              : ((await chrome.storage.local.get('accounts'))['accounts'] as string[] | undefined) ?? [];
            if (accounts.length > 0) broadcastAccountsChanged(accounts);
          })();
        }
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'XLOT_REJECT') {
      const pending = pendingRequests.get(message.id!);
      if (pending) {
        pendingRequests.delete(message.id!);
        pending.reject({ code: 4001, message: 'User rejected the request.' });
      }
      sendResponse({ ok: true });
      return false;
    }

    return false;
  },
);

// ── 요청 처리 핵심 로직 ────────────────────────────────────────────
async function handleProviderRequest(
  message: { id: string; method: string; params: unknown[]; origin: string },
  sendResponse: (response: { result?: unknown; error?: { code: number; message: string } }) => void,
) {
  const { id, method, params, origin } = message;

  try {
    // ── 즉시 응답 가능한 읽기 전용 요청 ─────────────────────────
    switch (method) {
      case 'eth_chainId': {
        const stored = await chrome.storage.local.get('chainId');
        const chainId = (stored['chainId'] as string | undefined) ?? '0x1';
        sendResponse({ result: chainId });
        return;
      }
      case 'net_version': {
        const stored = await chrome.storage.local.get('chainId');
        const chainId = (stored['chainId'] as string | undefined) ?? '0x1';
        sendResponse({ result: String(parseInt(chainId, 16)) });
        return;
      }
      case 'eth_accounts': {
        const stored = await chrome.storage.local.get(['accounts', 'xlot_active_wallet']);
        let accounts = (stored['accounts'] as string[] | undefined) ?? [];
        // accounts가 비어있으면 active wallet에서 폴백
        const activeWalletAny = stored['xlot_active_wallet'] as any;
        if (accounts.length === 0 && activeWalletAny?.addresses?.evm) {
          const fallback = (activeWalletAny.addresses.evm as string).toLowerCase();
          accounts = [fallback];
        }
        sendResponse({ result: accounts });
        return;
      }
      case 'wallet_getPermissions': {
        const stored = await chrome.storage.local.get('accounts');
        const accounts = (stored['accounts'] as string[] | undefined) ?? [];
        if (accounts.length > 0) {
          sendResponse({ result: [{ parentCapability: 'eth_accounts' }] });
        } else {
          sendResponse({ result: [] });
        }
        return;
      }
      // eth_requestAccounts: 항상 팝업을 열어 사용자가 연결을 명시적으로 승인하게 함
      // (MetaMask와 동일: 첫 연결 시 사용자 확인 필요)
      case 'eth_requestAccounts':
      case 'wallet_requestPermissions': {
        // xlot_active_wallet에서 accounts 자동 저장 (아직 없는 경우)
        const stored = await chrome.storage.local.get(['accounts', 'xlot_active_wallet']);
        const existingAccounts = (stored['accounts'] as string[] | undefined) ?? [];
        const activeWalletData = stored['xlot_active_wallet'] as any;
        if (existingAccounts.length === 0 && activeWalletData?.addresses?.evm) {
          const fallbackAddr = (activeWalletData.addresses.evm as string).toLowerCase();
          await chrome.storage.local.set({ accounts: [fallbackAddr] });
        }
        break; // 팝업으로 진행
      }
    }

    // ── 사용자 승인 필요 → 팝업 열기 ─────────────────────────────
    if (INTERACTIVE_METHODS.has(method)) {
      // 서명 요청의 경우에도 accounts 없으면 자동 저장 (업비트: 연결 없이 바로 서명)
      const preStored = await chrome.storage.local.get(['accounts', 'xlot_active_wallet']);
      const preAccounts = (preStored['accounts'] as string[] | undefined) ?? [];
      const preActiveWallet = preStored['xlot_active_wallet'] as any;
      if (preAccounts.length === 0 && preActiveWallet?.addresses?.evm) {
        const fallbackAddr = (preActiveWallet.addresses.evm as string).toLowerCase();
        await chrome.storage.local.set({ accounts: [fallbackAddr] });
      }

      pendingRequests.set(id, {
        id,
        method,
        params,
        origin,
        resolve: (result) => sendResponse({ result }),
        reject: (error) => sendResponse({ error: error as { code: number; message: string } }),
      });

      await openRequestPopup(id, method, params, origin);
      return;
    }

    // ── 기타 RPC 요청 → 원격 노드로 프록시 ──────────────────────
    // eth_call, eth_getBalance, eth_blockNumber, eth_getBlockByNumber,
    // eth_getTransactionReceipt, eth_estimateGas, eth_gasPrice, etc.
    try {
      const result = await proxyToRpc(method, params);
      sendResponse({ result });
    } catch (e: unknown) {
      const err = e as Error;
      sendResponse({ error: { code: -32603, message: err.message ?? 'RPC proxy error' } });
    }
  } catch (e: unknown) {
    const err = e as Error;
    sendResponse({ error: { code: -32603, message: err.message ?? 'Internal error' } });
  }
}

// ── 팝업 창 열기 ──────────────────────────────────────────────────
async function openRequestPopup(
  requestId: string,
  method: string,
  params: unknown[],
  origin: string = 'Unknown',
) {
  try {
    // 로컬 스토리지에 요청 정보 저장 (팝업에서 읽음, session보다 호환성 뛰어남)
    await chrome.storage.local.set({
      [`xlot_req_${requestId}`]: { id: requestId, method, params, origin, timestamp: Date.now() },
    });

    const screenWidth = 1920; // 기본값
    const left = Math.max(0, screenWidth - 560);

    await chrome.windows.create({
      url: `index.html?mode=extension-request&requestId=${requestId}`,
      type: 'popup',
      width: 375,
      height: 620,
      left,
      top: 60,
      focused: true,
    });
  } catch (err) {
    console.error('[xLOT] Failed to open request popup:', err);
  }
}

// ── 익스텐션 설치/업데이트 시 초기화 ────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[xLOT] Extension installed/updated');
  chrome.storage.local.get(['chainId'], (result) => {
    if (!result.chainId) {
      chrome.storage.local.set({ chainId: '0x1', accounts: [] });
    }
  });
});

// ── 계정 변경 브로드캐스트 (앱에서 호출용) ──────────────────────
async function broadcastAccountsChanged(accounts: string[]) {
  await chrome.storage.local.set({ accounts });
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'XLOT_ACCOUNTS_CHANGED', accounts }).catch(() => {});
    }
  }
}

// 체인 변경 브로드캐스트
async function broadcastChainChanged(chainId: string) {
  await chrome.storage.local.set({ chainId });
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'XLOT_CHAIN_CHANGED', chainId }).catch(() => {});
    }
  }
}

// 앱 내부에서 계정/체인 업데이트 수신 (ExtensionRequestPage 에서 로그인 완료 후 호출)
chrome.runtime.onMessage.addListener((message: { type: string; accounts?: string[]; chainId?: string }) => {
  if (message.type === 'XLOT_SET_ACCOUNTS' && message.accounts) {
    broadcastAccountsChanged(message.accounts);
  }
  if (message.type === 'XLOT_SET_CHAIN' && message.chainId) {
    broadcastChainChanged(message.chainId);
  }
});
