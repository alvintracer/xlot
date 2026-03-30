// ============================================================
// walletProviderUtils.ts — EIP-6963 기반 지갑 Provider 탐색
//
// 우선순위:
//   1순위: EIP-6963 RDNS 표준 (가장 정확)
//   2순위: 전용 window 객체 (Legacy)
//   3순위: window.ethereum 뒤지기 (최후 수단)
// ============================================================

// ── EIP-6963 인터페이스 정의 ─────────────────────────────────
interface EIP6963ProviderInfo {
  rdns:  string;
  uuid:  string;
  name:  string;
  icon:  string;
}

interface EIP6963ProviderDetail {
  info:     EIP6963ProviderInfo;
  provider: any;
}

// 발견된 지갑 저장소 (Key: RDNS, Value: Provider)
const discoveredProviders = new Map<string, any>();

// EIP-6963 이벤트 리스닝 시작
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    const detail = event.detail as EIP6963ProviderDetail;
    discoveredProviders.set(detail.info.rdns, detail.provider);
  });
  // 기존에 등록된 지갑들에게 재공지 요청
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

// RDNS로 EIP-6963 provider 가져오기
const getEIP6963Provider = (rdns: string): any | null => {
  return discoveredProviders.get(rdns) || null;
};

// 발견된 모든 EIP-6963 지갑 목록 (디버깅용)
export const getDiscoveredWallets = (): { rdns: string; provider: any }[] => {
  return Array.from(discoveredProviders.entries()).map(([rdns, provider]) => ({ rdns, provider }));
};

// ── RDNS 레지스트리 ──────────────────────────────────────────
const RDNS: Record<string, string> = {
  METAMASK:   'io.metamask',
  RABBY:      'io.rabby',
  OKX:        'com.okex.wallet',
  PHANTOM:    'app.phantom',
  BYBIT:      'com.bybit',           // Phase 6-B
  BITGET:     'com.bitget.web3',     // Phase 6-B
  TRUST:      'com.trustwallet.app', // Phase 6-B
  // TronLink은 EIP-6963 미지원 → legacy window.tronLink 전용
};

// ── 메인 함수 ────────────────────────────────────────────────
export const getSpecificProvider = (walletType: string): any | null => {
  const win = window as any;

  // ═══════════════════════════════════════════════════════════
  // 1순위: EIP-6963 RDNS 표준
  // ═══════════════════════════════════════════════════════════
  const rdns = RDNS[walletType];
  if (rdns) {
    const eip = getEIP6963Provider(rdns);
    if (eip) return eip;
  }

  // ═══════════════════════════════════════════════════════════
  // 2순위: 전용 window 객체 (Legacy fallback)
  // ═══════════════════════════════════════════════════════════
  switch (walletType) {
    case 'OKX':
      if (win.okxwallet) return win.okxwallet;
      break;
    case 'RABBY':
      if (win.rabby) return win.rabby;
      break;
    case 'PHANTOM':
      if (win.solana?.isPhantom) return win.solana;
      break;
    case 'SOLFLARE':
      if (win.solflare) return win.solflare;
      break;
    case 'BYBIT':
      // Bybit Web3 익스텐션은 window.bybitWallet을 노출하기도 함
      if (win.bybitWallet) return win.bybitWallet;
      break;
    case 'BITGET':
      // Bitget은 window.bitkeep.ethereum 패턴
      if (win.bitkeep?.ethereum) return win.bitkeep.ethereum;
      break;
    case 'TRUST':
      // Trust Wallet은 window.trustWallet 또는 window.ethereum.isTrust
      if (win.trustWallet) return win.trustWallet;
      break;
    case 'TRONLINK':
      // TronLink는 window.tronLink (EIP-6963 미지원)
      if (win.tronLink) return win.tronLink;
      break;
  }

  // ═══════════════════════════════════════════════════════════
  // 3순위: window.ethereum 뒤지기 (MetaMask 전용)
  // ═══════════════════════════════════════════════════════════
  if (walletType === 'METAMASK') {
    // 여러 지갑이 공존할 때 providers 배열에서 MetaMask 찾기
    if (win.ethereum?.providers) {
      const mm = win.ethereum.providers.find(
        (p: any) => p.isMetaMask && !p.isOkxWallet && !p.isRabby
      );
      if (mm) return mm;
    }
    // 단독 설치된 MetaMask
    if (win.ethereum?.isMetaMask && !win.ethereum?.isOkxWallet && !win.ethereum?.isRabby) {
      return win.ethereum;
    }
  }

  // OKX 마지막 fallback
  if (walletType === 'OKX' && win.ethereum?.isOkxWallet) {
    return win.ethereum;
  }

  return null;
};

// ── EVM 지갑 타입 목록 (중앙 관리) ───────────────────────────
// canSwap, canSend 등 EVM 가능 여부 체크 시 사용
export const EVM_WALLET_TYPES = [
  'XLOT',
  'XLOT_SSS',
  'METAMASK',
  'RABBY',
  'WALLETCONNECT',
  'BYBIT',
  'BITGET',
  'TRUST',
  'OKX',
] as const;

export type EVMWalletType = typeof EVM_WALLET_TYPES[number];

export const isEVMWallet = (walletType: string): boolean =>
  EVM_WALLET_TYPES.includes(walletType as EVMWalletType);

// ── Tron 지갑 타입 목록 ───────────────────────────────────────
export const TRON_WALLET_TYPES = ['TRON', 'TRONLINK'] as const;
export type TronWalletType = typeof TRON_WALLET_TYPES[number];
export const isTronWallet = (walletType: string): boolean =>
  TRON_WALLET_TYPES.includes(walletType as TronWalletType);

/**
 * window.tronWeb 반환 (TronLink 브라우저 확장 주입 객체)
 * TronLink가 잠금 해제 + 연결된 상태여야 defaultAddress.base58 이 유효함.
 */
export const getTronLinkWeb = (): any | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).tronWeb || null;
};