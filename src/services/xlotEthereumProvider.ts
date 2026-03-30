// ============================================================
// xlotEthereumProvider.ts — xLOT Custom EIP-1193 + EIP-6963 Provider
//
// EIP-1193: window.ethereum 주입 (isMetaMask:true → 거래소 호환)
// EIP-6963: 이벤트 기반 멀티-지갑 공존 (최신 dApp 지원)
//
// 보안 원칙:
//   - eth_sendTransaction 절대 불허
//   - 서명 요청은 반드시 onSignRequest 콜백(UI팝업) 경유
//   - 읽기 전용 RPC는 공개 엔드포인트 직접 호출
// ============================================================

// ── 타입 ─────────────────────────────────────────────────────

export interface XLOTProviderConfig {
  address:       string;   // SSS EVM 주소 (체크섬)
  chainId:       number;   // 기본 1 (Ethereum mainnet)
  walletLabel:   string;   // 표시용 이름
  onSignRequest: (request: SignRequest) => Promise<string>;
}

export interface SignRequest {
  type:    'personal_sign' | 'eth_sign' | 'eth_signTypedData_v4';
  method:  string;         // 원본 RPC 메서드명
  message: string;         // hex 또는 JSON 원본 데이터
  params:  any[];          // 원본 params (서명 로직용)
  from:    string;
  origin:  string;
}

// ── EIP-1193 Provider ────────────────────────────────────────

export class XLOTEthereumProvider {
  readonly isMetaMask = true;   // 구형 거래소(빗썸 등) 호환
  readonly isXLOT     = true;   // xLOT 식별 플래그

  private _address   = '';
  private _chainId   = 1;
  private _config: XLOTProviderConfig | null = null;
  private _listeners = new Map<string, Set<Function>>();

  // ── 읽기 속성 ──────────────────────────────────────────────
  get selectedAddress(): string  { return this._address; }
  get chainId():         string  { return `0x${this._chainId.toString(16)}`; }
  get networkVersion():  string  { return String(this._chainId); }

  // ── 활성화 / 비활성화 ─────────────────────────────────────
  activate(config: XLOTProviderConfig): void {
    this._config  = config;
    this._address = config.address;
    this._chainId = config.chainId ?? 1;
    this._emit('accountsChanged', [config.address]);
    this._emit('chainChanged', this.chainId);
    this._emit('connect', { chainId: this.chainId });
  }

  deactivate(): void {
    this._config  = null;
    this._address = '';
    this._emit('accountsChanged', []);
    this._emit('disconnect', { code: 4900, message: 'Disconnected' });
  }

  // ── EIP-1193 request ───────────────────────────────────────
  async request({ method, params = [] }: { method: string; params?: any[] }): Promise<any> {
    switch (method) {

      // ── 계정 ──────────────────────────────────────────────
      case 'eth_requestAccounts':
      case 'eth_accounts':
        if (!this._address) throw this._rpcError(4100, 'Unauthorized: xLOT 지갑이 연결되어 있지 않습니다.');
        return [this._address];

      // ── 체인 정보 ─────────────────────────────────────────
      case 'eth_chainId':
        return this.chainId;
      case 'net_version':
        return this.networkVersion;

      // ── 읽기 전용 RPC (공개 엔드포인트 프록시) ────────────
      case 'eth_blockNumber':
      case 'eth_gasPrice':
      case 'eth_getBalance':
      case 'eth_getTransactionCount':
      case 'eth_call':
      case 'eth_estimateGas':
      case 'eth_getCode':
      case 'eth_getStorageAt':
      case 'eth_getLogs':
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt':
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
        return await this._rpcCall(method, params);

      // ── 서명 (UI 팝업 경유) ───────────────────────────────
      case 'personal_sign': {
        // MetaMask spec: params = [message, address]
        // 일부 레거시 dApp은 [address, message] 순서로 보냄 → 휴리스틱 감지
        const [p0, p1] = params;
        const isP0Message =
          typeof p0 === 'string' &&
          p0.startsWith('0x') &&
          p0.length > 42;  // 주소는 정확히 42자, 메시지는 그보다 김
        const message = isP0Message ? p0 : p1;
        return this._requestSign('personal_sign', method, message, params);
      }

      case 'eth_sign': {
        // params = [address, data]
        const [, message] = params;
        return this._requestSign('eth_sign', method, message, params);
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4': {
        // params = [address, typedDataJson]
        const [, typedData] = params;
        const json = typeof typedData === 'string' ? typedData : JSON.stringify(typedData);
        return this._requestSign('eth_signTypedData_v4', method, json, params);
      }

      // ── 체인 전환 ─────────────────────────────────────────
      case 'wallet_switchEthereumChain': {
        const newId = parseInt(params[0]?.chainId ?? '0x1', 16);
        if (isNaN(newId)) throw this._rpcError(4902, 'Invalid chainId');
        this._chainId = newId;
        this._emit('chainChanged', `0x${newId.toString(16)}`);
        return null;
      }

      case 'wallet_addEthereumChain':
        // 체인 추가 요청은 무시(지원하는 체인만 사용)
        return null;

      // ── 권한 ─────────────────────────────────────────────
      case 'wallet_requestPermissions':
        return [{ parentCapability: 'eth_accounts' }];
      case 'wallet_getPermissions':
        return [{ parentCapability: 'eth_accounts' }];

      // ── 트랜잭션 전송 — 보안상 차단 ─────────────────────
      case 'eth_sendTransaction':
      case 'eth_sendRawTransaction':
        throw this._rpcError(
          4200,
          'eth_sendTransaction은 보안상 허용되지 않습니다.\n자산 전송은 xLOT 앱 내에서만 가능합니다.',
        );

      // ── 기타 RPC 프록시 ───────────────────────────────────
      default:
        try {
          return await this._rpcCall(method, params);
        } catch {
          throw this._rpcError(4200, `지원하지 않는 메서드: ${method}`);
        }
    }
  }

  // ── 레거시 web3.js 호환 메서드 ────────────────────────────
  send(method: string, params?: any[]): Promise<any> {
    return this.request({ method, params: params ?? [] });
  }

  sendAsync(
    payload: { id?: number; method: string; params?: any[] },
    callback: (err: Error | null, res: any) => void,
  ): void {
    this.request(payload)
      .then(result =>
        callback(null, { id: payload.id, jsonrpc: '2.0', result }),
      )
      .catch(err => callback(err, null));
  }

  // ── 이벤트 emitter ────────────────────────────────────────
  on(event: string, handler: Function): this {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(handler);
    return this;
  }

  removeListener(event: string, handler: Function): this {
    this._listeners.get(event)?.delete(handler);
    return this;
  }

  off = this.removeListener.bind(this);

  once(event: string, handler: Function): this {
    const wrapper = (...args: any[]) => {
      handler(...args);
      this.removeListener(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  private _emit(event: string, ...args: any[]): void {
    this._listeners.get(event)?.forEach(h => {
      try { h(...args); } catch {}
    });
  }

  // ── 서명 → UI 콜백 ────────────────────────────────────────
  private async _requestSign(
    type: SignRequest['type'],
    method: string,
    message: string,
    params: any[],
  ): Promise<string> {
    if (!this._config) throw this._rpcError(4100, 'Unauthorized');
    return this._config.onSignRequest({
      type,
      method,
      message,
      params,
      from:   this._address,
      origin: document.referrer || window.location.origin,
    });
  }

  // ── 공개 RPC (읽기 전용) ──────────────────────────────────
  private readonly _RPC_URLS: Record<number, string> = {
    1:     'https://eth.llamarpc.com',
    137:   'https://polygon.llamarpc.com',
    8453:  'https://base.llamarpc.com',
    42161: 'https://arbitrum.llamarpc.com',
    10:    'https://mainnet.optimism.io',
    56:    'https://bsc-dataseed.binance.org',
  };

  private async _rpcCall(method: string, params: any[]): Promise<any> {
    const url = this._RPC_URLS[this._chainId] ?? this._RPC_URLS[1];
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    const data = await res.json();
    if (data.error) {
      const e: any = new Error(data.error.message ?? 'RPC Error');
      e.code = data.error.code;
      throw e;
    }
    return data.result;
  }

  private _rpcError(code: number, message: string): Error {
    const e: any = new Error(message);
    e.code = code;
    return e;
  }
}

// ── EIP-6963 ─────────────────────────────────────────────────

const XLOT_SVG_ICON = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="36" fill="#0f172a"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <text x="96" y="138" text-anchor="middle"
    font-family="system-ui,sans-serif" font-weight="900"
    font-size="108" fill="url(#g)">x</text>
</svg>
`)}`;

export const XLOT_PROVIDER_INFO = {
  uuid: crypto.randomUUID(),
  name: 'xLOT Wallet',
  icon: XLOT_SVG_ICON,
  rdns: 'app.xlot.wallet',
} as const;

// ── 전역 싱글톤 ───────────────────────────────────────────────
export const xlotProvider = new XLOTEthereumProvider();

// ── window.ethereum 주입 / 해제 ───────────────────────────────

let _savedEthereum: unknown  = undefined;
let _eip6963Handler: ((e: Event) => void) | null = null;
let _isInjected = false;

/**
 * xLOT 프로바이더를 window.ethereum 에 주입하고 EIP-6963을 announce 한다.
 * 반환값: cleanup 함수 (비활성화 시 호출)
 */
export function injectXLOTProvider(config: XLOTProviderConfig): () => void {
  if (_isInjected) {
    // 이미 주입된 경우 config만 업데이트
    xlotProvider.activate(config);
    return createCleanup();
  }

  // 1. 기존 window.ethereum 백업
  _savedEthereum = (window as any).ethereum;

  // 2. 프로바이더 활성화
  xlotProvider.activate(config);

  // 3. window.ethereum 주입 (EIP-1193)
  try {
    Object.defineProperty(window, 'ethereum', {
      value:        xlotProvider,
      writable:     true,
      configurable: true,
    });
  } catch {
    // defineProperty 실패 시(일부 환경) 직접 할당 시도
    (window as any).ethereum = xlotProvider;
  }

  // 4. MetaMask 감지 트리거 이벤트
  window.dispatchEvent(new Event('ethereum#initialized'));

  // 5. EIP-6963 announce
  const announce = () => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info:     XLOT_PROVIDER_INFO,
          provider: xlotProvider,
        }),
      }),
    );
  };
  announce();

  // dApp이 나중에 requestProvider를 보낼 때도 응답
  _eip6963Handler = () => announce();
  window.addEventListener('eip6963:requestProvider', _eip6963Handler);

  _isInjected = true;
  return createCleanup();
}

function createCleanup(): () => void {
  return () => {
    if (!_isInjected) return;

    xlotProvider.deactivate();

    // window.ethereum 원상 복원
    try {
      Object.defineProperty(window, 'ethereum', {
        value:        _savedEthereum,
        writable:     true,
        configurable: true,
      });
    } catch {
      (window as any).ethereum = _savedEthereum;
    }

    // EIP-6963 리스너 제거
    if (_eip6963Handler) {
      window.removeEventListener('eip6963:requestProvider', _eip6963Handler);
      _eip6963Handler = null;
    }

    _savedEthereum = undefined;
    _isInjected    = false;
  };
}
