/**
 * inpage.ts
 * world: "MAIN" 으로 실행 → window 접근 가능, chrome.* API 없음
 * 모든 웹사이트에 window.ethereum (EIP-1193 provider) 을 주입한다.
 * 실제 요청은 postMessage → content.ts → background.ts 로 전달된다.
 */
(function () {
  // 중복 주입 방지
  if ((window as any).__xlotInjected) return;
  (window as any).__xlotInjected = true;

  // 요청 ID별 pending Promise 저장소
  const pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  // 이벤트 리스너 저장소
  const eventListeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  // background 에서 push된 응답/이벤트 수신
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as
      | { target: string; type: string; id?: string; result?: unknown; error?: { message: string; code?: number }; accounts?: string[]; chainId?: string }
      | undefined;
    if (!data || data.target !== 'xlot-inpage') return;

    switch (data.type) {
      case 'XLOT_RESPONSE': {
        if (!data.id) break;
        const pending = pendingRequests.get(data.id);
        if (!pending) break;
        pendingRequests.delete(data.id);
        if (data.error) {
          const err = new Error(data.error.message ?? 'Request rejected');
          (err as any).code = data.error.code ?? 4001;
          pending.reject(err);
        } else {
          pending.resolve(data.result);
        }
        break;
      }
      case 'XLOT_ACCOUNTS_CHANGED': {
        const accts = data.accounts ?? [];
        provider.selectedAddress = accts[0] ?? null;
        (window as any).__xlotSelectedAddress = accts[0] ?? null;
        _emit('accountsChanged', accts);
        break;
      }
      case 'XLOT_CHAIN_CHANGED': {
        const cid = data.chainId ?? '0x1';
        provider.chainId = cid;
        provider.networkVersion = String(parseInt(cid, 16));
        _emit('chainChanged', cid);
        _emit('networkChanged', provider.networkVersion);
        break;
      }
      case 'XLOT_CONNECT':
        _emit('connect', { chainId: data.chainId ?? '0x1' });
        break;
      case 'XLOT_DISCONNECT':
        _emit('disconnect', data.error ?? { code: 4900, message: 'Disconnected' });
        break;
    }
  });

  function _emit(event: string, ...args: unknown[]) {
    (eventListeners[event] ?? []).forEach((h) => {
      try { h(...args); } catch {}
    });
  }

  // content.ts 로 요청 전달
  function sendRequest(method: string, params: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `xlot_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingRequests.set(id, { resolve, reject });

      window.postMessage(
        { target: 'xlot-content', type: 'XLOT_REQUEST', id, method, params },
        '*',
      );

      // 5분 타임아웃
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('xLOT: Request timed out'));
        }
      }, 5 * 60 * 1000);
    });
  }

  // ── EIP-1193 Provider ─────────────────────────────────────────────
  const provider = {
    isMetaMask: true, // 대부분의 거래소가 이 플래그를 확인함
    _metamask: {
      isUnlocked: () => Promise.resolve(true), // MetaMask 호환: 잠금 해제 상태
    },
    isCoinbaseWallet: false, // 코인베이스 등으로 오인 방지
    isXLOT: true,
    isConnected: () => true,

    // MetaMask 호환 내부 상태
    chainId: '0x1',
    networkVersion: '1',

    request({ method, params = [] }: { method: string; params?: unknown[] }) {
      return sendRequest(method, params).then((result) => {
        // eth_requestAccounts 성공 시 selectedAddress 캐시
        if (method === 'eth_requestAccounts' && Array.isArray(result) && result.length > 0) {
          (window as any).__xlotSelectedAddress = result[0];
          provider.selectedAddress = result[0];
        }
        // eth_chainId 응답으로 chainId 동기화
        if (method === 'eth_chainId' && typeof result === 'string') {
          provider.chainId = result;
          provider.networkVersion = String(parseInt(result, 16));
        }
        return result;
      });
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(handler);
      return this;
    },

    removeListener(event: string, handler: (...args: unknown[]) => void) {
      if (eventListeners[event]) {
        eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
      }
      return this;
    },

    removeAllListeners(event?: string) {
      if (event) {
        delete eventListeners[event];
      } else {
        Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
      }
      return this;
    },

    // Legacy: eth_accounts 캐시 (일부 dApp이 직접 접근)
    selectedAddress: (window as any).__xlotSelectedAddress ?? null,

    // Legacy methods
    enable() {
      return this.request({ method: 'eth_requestAccounts' });
    },
    sendAsync(payload: { method: string; params?: unknown[]; id?: number }, callback: (err: Error | null, res: unknown) => void) {
      this.request({ method: payload.method, params: payload.params ?? [] })
        .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch((err: Error) => callback(err, null));
    },
    send(
      methodOrPayload: string | { method: string; params?: unknown[] },
      paramsOrCallback?: unknown[] | ((err: Error | null, res: unknown) => void),
    ) {
      if (typeof methodOrPayload === 'string' && !paramsOrCallback) {
        return this.request({ method: methodOrPayload });
      }
      if (typeof methodOrPayload === 'string' && Array.isArray(paramsOrCallback)) {
        return this.request({ method: methodOrPayload, params: paramsOrCallback });
      }
      if (typeof paramsOrCallback === 'function') {
        this.sendAsync(methodOrPayload as any, paramsOrCallback);
        return;
      }
      return this.request(methodOrPayload as any);
    },
  };

  // ── window.ethereum 덮어쓰기 (Aggressive Hijack) ───────────
  // Coinbase, MetaMask 등 다른 지갑 확장이 나중에 로드되더라도 덮어쓰지 못하도록 get/set 트랩 설정
  try {
    Object.defineProperty(window, 'ethereum', {
      get: () => provider,
      set: () => {
        console.warn('[xLOT] Intercepted attempt to overwrite window.ethereum by another wallet');
      },
      configurable: false, // 다른 확장이 재정의하지 못하게 막음
      enumerable: true,
    });
  } catch (e) {
    // 누군가 이미 configurable: false 로 선점했다면 객체 직접 할당 시도
    try {
      (window as any).ethereum = provider;
    } catch {}
    
    // 객체 할당마저 실패했다면 내부 메서드를 강제로 덮어씌워서 하이재킹 (Ultimate Intercept)
    try {
      const eth = (window as any).ethereum;
      if (eth && eth !== provider) {
        eth.request = provider.request;
        eth.send = provider.send;
        eth.sendAsync = provider.sendAsync;
        eth.on = provider.on;
        eth.removeListener = provider.removeListener;
        eth.isXLOT = true;
        eth.isMetaMask = true;
        console.warn('[xLOT] Mutated existing window.ethereum to force interception');
      }
    } catch {}
  }

  // 구형 web3.js 를 사용하는 dApp을 위한 호환성 (선택적)
  try {
    Object.defineProperty(window, 'web3', {
      get: () => ({ currentProvider: provider }),
      set: () => {},
      configurable: false,
      enumerable: true
    });
  } catch {
    try { (window as any).web3 = { currentProvider: provider }; } catch {}
  }
  
  // 이미 providers 배열이 있다면 (다른 지갑이 먼저 로드된 경우), 우리를 최우선 순위로 삽입
  if ((window as any).ethereum && Array.isArray((window as any).ethereum.providers)) {
    try {
      (window as any).ethereum.providers.unshift(provider);
    } catch {}
  }

  // ── EIP-6963: Wallet Selector 지원 ───────────────────────────────
  const eip6963Info = {
    uuid: 'xlot-wallet-extension-v1',
    name: 'took Wallet',
    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    rdns: 'com.xlot.wallet',
  };

  function announceProvider() {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({ info: eip6963Info, provider }),
      }),
    );
  }

  window.addEventListener('eip6963:requestProvider', announceProvider);
  announceProvider();

  // ── 늦게 로드되는 다른 지갑을 이기기 위한 DOM 기반 재주입 ──
  window.addEventListener('load', () => {
    if ((window as any).ethereum !== provider) {
      console.warn('[xLOT] Another wallet hijacked window.ethereum. Re-injecting...');
      try {
        Object.defineProperty(window, 'ethereum', {
          get: () => provider,
          set: () => {},
          configurable: false,
          enumerable: true,
        });
      } catch {
        try {
          (window as any).ethereum = provider;
        } catch {}
        
        try {
          const eth = (window as any).ethereum;
          if (eth && eth !== provider) {
            eth.request = provider.request;
            eth.send = provider.send;
            eth.sendAsync = provider.sendAsync;
            eth.on = provider.on;
            eth.removeListener = provider.removeListener;
            eth.isXLOT = true;
            eth.isMetaMask = true;
            console.warn('[xLOT] Mutated existing window.ethereum on load');
          }
        } catch {}
      }
    }
  });

  console.log('[xLOT] Wallet provider injected (Aggressive mode) ✓');
})();
