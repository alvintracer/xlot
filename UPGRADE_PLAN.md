# RWA Aggregator 고도화 — 에이전트 구현 프롬프트

## 프로젝트 개요

Traverse Wallet의 RWA Aggregator를 고도화한다.
핵심 목표: **같은 underlying asset(금, 은, 국채)을 여러 venue에서 비교하고 실행할 수 있는 크로스벤뉴 RWA 어그리게이터**로 업그레이드.

현재 상태: DEX Spot 자산 5개(USDY, OUSG, BENJI, PAXG, XAUt) + tracked equity/credit/real_estate scaffold.
목표 상태: DEX Spot + Onchain Perps(Hyperliquid, edgeX) + CEX Perps(OKX, Bitget) 4개 venue 카테고리를 통합 지원.

**이번 스프린트 스코프: 금, 은, 국채(Treasuries) RWA만. Equity는 기존 scaffold 유지, 확장 안 함.**

---

## 기술 스택 & 핵심 파일

- React 19 + TypeScript 5.9 + Vite + TailwindCSS
- Web3: Thirdweb SDK (smart accounts), Wagmi + Viem
- 상태관리: TanStack React Query
- 차트: Recharts, lightweight-charts

### 핵심 파일 맵

```
src/types/rwaInstrument.ts          ← RWAInstrument 타입 정의 (AssetClass, StructureType, OwnershipClaim 등)
src/constants/rwaInstruments.ts     ← 전체 instrument 카탈로그 (현재 11개)
src/constants/rwaAssets.ts          ← 레거시 자산 목록 (5개, backward compat)
src/services/rwaService.ts          ← 가격/NAV/히스토리 fetch (CoinGecko 기반)
src/services/providers/types.ts     ← ExecutionProvider, MetadataProvider, MarketDiscoveryProvider 인터페이스
src/services/providers/rwaExecutionProvider.ts ← 멀티 DEX 실행 + 스코어링
src/services/confidenceScoringService.ts      ← 데이터 신뢰도 점수
src/services/disclosureService.ts             ← 컴플라이언스 디스클로저 생성
src/pages/TradePage.tsx             ← RWA 어그리게이터 메인 페이지 (모바일/PC 레이아웃)
src/components/RWAMarketScanner.tsx ← 자산 스캐너 테이블 (필터, 정렬)
src/components/RWAYieldPanel.tsx    ← 모바일 자산 목록
src/components/RWASwapModal.tsx     ← DEX Spot 실행 모달 (KYC/FX 게이팅 포함)
src/components/RWAMarketVisual.tsx  ← 차트/게이지/도넛 시각화
src/components/RWADisclosureBadges.tsx ← 구조/권리/실행 배지
```

---

## Phase 0: VenueCategory 분류 축 추가

### 목적
기존 AssetClass(자산군) 분류에 Platform/Venue 분류 축을 정식 추가.

### 변경사항

**`src/types/rwaInstrument.ts`:**
```typescript
// 추가할 타입
export type VenueCategory =
  | 'dex_spot'        // 온체인 현물 (PAXG, USDY 등)
  | 'onchain_perps'   // 온체인 영구선물 (Hyperliquid, edgeX)
  | 'cex_perps'       // CEX 영구선물 (OKX, Bitget)
  | 'platform_access'; // 플랫폼 발행/접근 (BUIDL, Kraken xStocks)

// VenueCategory UI 메타데이터
export const VENUE_CATEGORY_META: Record<VenueCategory, {
  id: VenueCategory;
  label: string;
  labelKr: string;
  icon: string;
  color: { bg: string; border: string; text: string };
  description: string;
}>;
```

**`RWAInstrument` 인터페이스에 추가:**
```typescript
venueCategory: VenueCategory;
```

**`src/constants/rwaInstruments.ts`:**
- 기존 Treasury/Commodity 자산: `venueCategory: 'dex_spot'`
- 기존 Equity (Injective): `venueCategory: 'onchain_perps'`
- 기존 Equity (Robinhood): `venueCategory: 'platform_access'`
- Credit (Maple): `venueCategory: 'platform_access'`
- Real Estate (RealT): `venueCategory: 'platform_access'`

**`src/components/RWAMarketScanner.tsx`:**
- AssetClass 탭 상단에 VenueCategory 필터 탭 추가
- 필터 로직: venue 선택 → 해당 venue의 instrument만 표시 → 그 안에서 AssetClass 세부 필터

**`src/components/RWAYieldPanel.tsx`:**
- 동일하게 venue 필터 추가 (모바일)

---

## Phase 1-A: Hyperliquid 연동

### 개요
Hyperliquid는 fully onchain perpetual DEX. Arbitrum 기반이며 자체 L2 운영.
RWA 관련 perp: Gold(XAU), Silver(XAG) 마켓이 있을 수 있음. API로 마켓 리스트 확인 필요.

### API 정보
- **Info API (읽기):** `POST https://api.hyperliquid.xyz/info`
  - `{"type": "meta"}` → 전체 마켓 메타데이터 (심볼, 최소 주문, 마진 등)
  - `{"type": "allMids"}` → 전체 마켓 mid 가격
  - `{"type": "metaAndAssetCtxs"}` → 메타 + OI, 펀딩레이트, 24h 볼륨 등
  - `{"type": "l2Book", "coin": "XAU"}` → 호가창
  - `{"type": "candleSnapshot", "coin": "XAU", "interval": "1h", "startTime": ..., "endTime": ...}` → 캔들 데이터
- **Exchange API (쓰기):** `POST https://api.hyperliquid.xyz/exchange`
  - EIP-712 서명 필요 (우리 smart account로 서명)
  - 주문: `{"type": "order", "orders": [...], "grouping": "na"}`
  - 취소: `{"type": "cancel", "cancels": [...]}`

### 구현 파일

**`src/services/providers/hyperliquidProvider.ts` (신규):**
```typescript
// MarketDiscoveryProvider + MetadataProvider 구현
// 1. discoverMarkets(): meta API 호출 → RWA 관련 마켓 필터 (XAU, XAG, 국채 관련)
// 2. fetchMetadata(instrument): allMids + metaAndAssetCtxs → 가격, 펀딩레이트, OI, 볼륨
// 3. fetchCandles(coin, interval, range): 캔들 데이터 → 히스토리컬 차트용
// 캐시: 30초 TTL
```

**`src/services/providers/hyperliquidExecutionProvider.ts` (신규):**
```typescript
// ExecutionProvider 구현
// 1. getQuote(): l2Book으로 슬리피지 추정
// 2. placeOrder(): EIP-712 서명 → exchange API
// 3. cancelOrder(): 취소
// 지갑 플로우:
//   - 유저의 EVM wallet 주소 그대로 Hyperliquid에서 사용 가능
//   - USDC를 Arbitrum에서 Hyperliquid L2로 deposit 필요
//   - deposit은 Hyperliquid bridge contract에 approve + deposit tx
```

**`src/constants/rwaInstruments.ts`에 추가:**
```typescript
// Hyperliquid Gold Perp 예시
{
  id: 'hl-xau-perp',
  canonicalId: 'hl-xau',
  displayName: 'Gold Perpetual (Hyperliquid)',
  symbol: 'XAU-PERP',
  issuer: 'Hyperliquid',
  assetClass: 'commodity',
  subCategory: 'gold',
  underlyingReference: 'Gold (XAU/USD)',
  structureType: 'synthetic',
  ownershipClaim: 'economic_exposure_only',
  settlementModel: 'perpetual',
  permissionModel: 'public',
  executionAvailability: 'swappable_now',  // 지갑 연결로 직접 주문 가능
  venueCategory: 'onchain_perps',
  navSupport: 'none',
  referenceValueType: 'oracle_reference',
  tradabilityScope: 'venue_only',
  // ... chains, venues, routers 설정
}
// Silver도 동일 패턴으로 추가 (있을 경우)
```

**PROVIDER_REGISTRY에 추가 (`src/services/providers/types.ts`):**
```typescript
{ name: 'Hyperliquid', type: 'execution', status: 'live', description: 'Onchain perp DEX (Arbitrum L2)', requiredEnvVars: [] },
{ name: 'Hyperliquid', type: 'market', status: 'live', description: 'Perp market discovery', requiredEnvVars: [] },
```

---

## Phase 1-B: edgeX 연동

### 개요
edgeX는 self-custody perpetual DEX. CLOB 기반.
**확인된 RWA 마켓: Copper, Coal, Silver, XAUt** (금 관련)

### API 정보
- edgeX의 공개 API 문서를 기반으로 구현 (REST + WebSocket)
- 마켓 목록, 가격, 펀딩레이트, 호가창
- 주문: 서명 기반 self-custody 실행

### 구현 파일

**`src/services/providers/edgexProvider.ts` (신규):**
```typescript
// MarketDiscoveryProvider + MetadataProvider 구현
// discoverMarkets(): Copper, Coal, Silver, XAUt 등 commodity perp 마켓 fetch
// fetchMetadata(): 가격, 펀딩레이트, OI, 볼륨
```

**`src/services/providers/edgexExecutionProvider.ts` (신규):**
```typescript
// ExecutionProvider 구현
// self-custody이므로 지갑 서명으로 직접 주문
```

**`src/constants/rwaInstruments.ts`에 추가:**
- edgeX XAUt perp (gold)
- edgeX Silver perp
- edgeX Copper perp (commodity 확장)
- edgeX Coal perp (commodity 확장)
- 모두 `venueCategory: 'onchain_perps'`

---

## Phase 2-A/B: Traverse Proxy DEX (CEX Omnibus Broker 모델)

### 개요
CEX (OKX, Bitget 등)의 영구선물(Perp) 마켓을 연동하되, 유저에게 외부 CEX 가입이나 API 키 입력을 절대 요구하지 않습니다. 
대신 Traverse 프론트엔드가 자체 **Broker Vault(스마트 컨트랙트)**로 유저 자산을 예치받고, 중앙화된 백엔드가 CEX의 **Broker API(Master Account)**를 통해 유저 지갑별 전용 **Sub-account**를 자동 생성하여 마진 풀을 완전 격리(Isolated Margin)시킨 후 대리 주문(Proxy Order)을 수행하는 궁극의 '1-Click Proxy DEX' 환경을 구축합니다.

### OKX / Bitget Public API (읽기 전용 가격 데이터)
- **Public (인증 불필요):**
  - 마켓 리스트, 실시간 Ticker 가격, 호가창(L2 Book), 펀딩레이트, 캔들 데이터.
  - RWA 관련 필터: `XAU-USDT-SWAP` (Gold), `XAG-USDT-SWAP` (Silver) 등.
- 기존처럼 `okxProvider.ts`, `bitgetProvider.ts`를 구현해 Public API로 가격/메타데이터를 가져옵니다.

### 프라임 브로커리지 아키텍처 (실행 전용)
1. **Proxy Vault Contract (L1/L2):** 유저가 `USDC`를 예치/출금할 수 있는 Traverse 고유의 스마트 컨트랙트.
2. **Broker Sub-account Service (Backend):**
   - 유저가 Vault에 입금 시, 백엔드에서 OKX Broker API를 호출해 해당 유저 지갑 주소 1:1 전담 Sub-account를 즉시 생성.
   - 마스터 계정에서 Sub-account로 해당 금액만큼 즉시 내부 이체(Transfer).
3. **Execution Provider (`okxBrokerExecutionProvider.ts` 신규):**
   - 프론트엔드에서 주문(Order) 실행 시, 지갑 서명만으로 백엔드에 주문을 검증해 넘김.
   - 백엔드는 해당 서명을 검증한 후, Sub-account의 API Key를 이용해 OKX로 CEX 주문 삽입.
   - 이를 통해 **유저간 완벽한 자본 격리(Margin Isolation)** 보장 및 CEX 유동성을 DEX처럼 쓸 수 있는 경험 제공.

**PROVIDER_REGISTRY에 추가:**
```typescript
{ name: 'OKX Omni', type: 'execution', status: 'scaffold', description: 'Institutional Proxy DEX execution via OKX Broker Sub-accounts', requiredEnvVars: [] },
```

---

## Phase 2-C: Proxy DEX Deposit & Trade UI (대리 주문 실행 UI)

### 개요
CEX instrument 클릭 시 단순히 거래소를 외부로 안내하거나 API 입력을 요구하는 대신, 고유의 Proxy DEX 예치금(Vault) 모달과 대리 주문(Proxy Trade) 탭을 뷰에 노출.

**`src/components/ProxyBrokerModal.tsx` (신규):**
```
┌────────────────────────────────────────┐
│  XAU-USDT-SWAP (Traverse Proxy DEX)    │
│  Venue: OKX Liquidity Pool             │
│                                        │
│  💰 Traverse Proxy Vault 잔고: 0 USDC  │
│  [📥 Vault에 USDC 예치하기 (지갑 서명)]│
│                                        │
│  [Long 🟢]  [Short 🔴]                 │
│  주문 수량: [________] USD              │
│                                        │
│  [주문 실행 (1-Click Wallet Sign)]      │
│                                        │
│  ⚠️ Traverse Proxy 계정을 통해 대리     │
│  실행되며, 유저 간 마진은 격리됩니다.      │
└────────────────────────────────────────┘
```

- TradePage에서 instrument의 `venueCategory`가 `cex_perps`이면 CEX로 내치지 않고, 자체 ProxyBroker UI를 노출하여 이탈을 방지.
- 예치가 필요할 경우 Web3 트랜잭션을 트리거하여 Vault로 송금.

---

## Phase 2-D: 크로스벤뉴 가격 비교 UI

### 개요
같은 underlying(예: Gold)에 대해 모든 venue의 가격을 나란히 비교.

**`src/components/CrossVenuePriceTable.tsx` (신규):**
```
Gold (XAU/USD) — 크로스벤뉴 비교
┌──────────────┬──────────┬──────────┬──────────┬──────────┐
│ Venue        │ 가격     │ 스프레드 │ 펀딩/APY │ 실행     │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ 🟢 PAXG     │ $3,118   │ -0.12%   │ —        │ ⚡ Swap  │
│   DEX Spot   │          │ vs NAV   │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ 🟢 XAUt     │ $3,115   │ -0.22%   │ —        │ ⚡ Swap  │
│   DEX Spot   │          │ vs NAV   │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ 🔵 HL Gold  │ $3,120   │ +0.05%   │ 0.01%/8h │ ⚡ Perp  │
│   Onchain    │          │ vs index │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ 🔵 edgeX    │ $3,119   │ +0.02%   │ 0.008%   │ ⚡ Perp  │
│   XAUt      │          │ vs index │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ 🟡 OKX      │ $3,121   │ +0.08%   │ 0.012%   │ 🔗 CEX  │
│   CEX Perp  │          │ vs index │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ 🟡 Bitget   │ $3,120   │ +0.05%   │ 0.01%    │ 🔗 CEX  │
│   CEX Perp  │          │ vs index │          │          │
└──────────────┴──────────┴──────────┴──────────┴──────────┘
```

- underlying으로 instrument를 그룹핑: `underlyingReference`가 "Gold" 포함 → 같은 그룹
- TradePage PC 레이아웃의 Layer 2+3 영역에 배치 (instrument 선택 시)
- 실행 버튼: venueCategory에 따라 RWASwapModal / PerpOrderPanel / CEXConnectModal 분기

---

## Phase 3: rwaService 멀티소스 리팩터

### 개요
`src/services/rwaService.ts`를 venue별 provider 분기 구조로 확장.

### 변경사항

**`fetchRWAPrices()` 확장:**
```typescript
// 기존: CoinGecko만 호출
// 변경: instrument.venueCategory에 따라 분기
async function fetchRWAPrices(): Promise<RWAPriceMap> {
  const dexSpotInstruments = ALL_INSTRUMENTS.filter(i => i.venueCategory === 'dex_spot');
  const onchainPerpInstruments = ALL_INSTRUMENTS.filter(i => i.venueCategory === 'onchain_perps');
  const cexPerpInstruments = ALL_INSTRUMENTS.filter(i => i.venueCategory === 'cex_perps');

  const [dexPrices, perpPrices, cexPrices] = await Promise.allSettled([
    fetchDexSpotPrices(dexSpotInstruments),       // 기존 CoinGecko 로직
    fetchOnchainPerpPrices(onchainPerpInstruments), // Hyperliquid + edgeX provider
    fetchCexPerpPrices(cexPerpInstruments),         // OKX + Bitget provider
  ]);

  return mergePriceMaps(dexPrices, perpPrices, cexPrices);
}
```

**캐시 TTL venue별 분리:**
- DEX Spot: 2분 (기존 유지)
- Onchain Perps: 30초
- CEX Perps: 1분

**`fetchNAVData()` 확장:**
- Perp instrument는 NAV 대신 **mark price vs index price** 스프레드 계산
- 펀딩레이트를 `apyPct` 필드에 매핑 (annualized funding rate)

---

## Phase 1-C: Perp 전용 UI

### 개요
Perp 주문은 spot swap과 구조가 다르므로 별도 패널 필요.

**`src/components/PerpOrderPanel.tsx` (신규):**
```
┌─────────────────────────────────┐
│  XAU-PERP on Hyperliquid        │
│  Mark: $3,120.50  Index: $3,119 │
│  펀딩: 0.01% (8시간 후)         │
│                                 │
│  [Long 🟢]  [Short 🔴]         │
│                                 │
│  주문 유형: [Limit ▾]          │
│  가격: [________]               │
│  수량: [________] USD           │
│  레버리지: [1x] [5x] [10x]     │
│                                 │
│  예상 청산가: $2,810            │
│  예상 수수료: $0.62             │
│                                 │
│  [주문 실행]                    │
│                                 │
│  ⚠️ 합성 상품입니다.            │
│  실제 자산 소유권이 없습니다.    │
└─────────────────────────────────┘
```

- Hyperliquid: EIP-712 서명으로 주문 (smart account에서 직접)
- edgeX: 자체 서명 스킴 (provider에서 추상화)
- 포지션 관리는 별도 `PositionPanel.tsx`로 분리 (오픈 포지션, PnL, 청산가 표시)

**TradePage 분기 로직:**
```typescript
// instrument 선택 시
if (instrument.venueCategory === 'dex_spot') → RWASwapModal
if (instrument.venueCategory === 'onchain_perps') → PerpOrderPanel
if (instrument.venueCategory === 'cex_perps') → CEXConnectModal
if (instrument.venueCategory === 'platform_access') → 기존 tracked_only 안내
```

---

## 최종 Instrument 카탈로그 (이번 스프린트 완료 후)

| ID | Symbol | Asset Class | Venue Category | 출처 | 실행 |
|----|--------|------------|----------------|------|------|
| usdy | USDY | treasury | dex_spot | CoinGecko | ⚡ Swap |
| ousg | OUSG | treasury | dex_spot | CoinGecko | ⚡ Swap |
| benji-usd | BENJI | treasury | dex_spot | CoinGecko | ⚡ Swap |
| paxg | PAXG | commodity | dex_spot | CoinGecko | ⚡ Swap |
| xaut | XAUt | commodity | dex_spot | CoinGecko | ⚡ Swap |
| hl-xau-perp | XAU-PERP | commodity | onchain_perps | Hyperliquid API | ⚡ Perp Order |
| hl-xag-perp | XAG-PERP | commodity | onchain_perps | Hyperliquid API | ⚡ Perp Order |
| edgex-xaut | XAUt-PERP | commodity | onchain_perps | edgeX API | ⚡ Perp Order |
| edgex-silver | SILVER-PERP | commodity | onchain_perps | edgeX API | ⚡ Perp Order |
| edgex-copper | COPPER-PERP | commodity | onchain_perps | edgeX API | ⚡ Perp Order |
| edgex-coal | COAL-PERP | commodity | onchain_perps | edgeX API | ⚡ Perp Order |
| okx-xau-perp | XAU-USDT-SWAP | commodity | cex_perps | OKX Public API | 🔗 CEX |
| okx-xag-perp | XAG-USDT-SWAP | commodity | cex_perps | OKX Public API | 🔗 CEX |
| bitget-xau-perp | XAUUSDT | commodity | cex_perps | Bitget Public API | 🔗 CEX |
| bitget-xag-perp | XAGUSDT | commodity | cex_perps | Bitget Public API | 🔗 CEX |
| inj-aapl | iAAPL | equity | onchain_perps | Injective | ⚡ (기존) |
| inj-goog | iGOOG | equity | onchain_perps | Injective | ⚡ (기존) |
| rh-tsla-tracked | TSLA | equity | platform_access | — | 📊 Tracked |
| maple-lending | MPL-LEND | credit | platform_access | — | 📊 Tracked |
| realt-tracked | REALT | real_estate | platform_access | — | 📊 Tracked |

---

## 구현 순서

```
Phase 0: VenueCategory 타입 + 기존 instrument 태깅 + 필터 UI
  ↓
Phase 3: rwaService 멀티소스 분기 구조 리팩터 (실제 provider 없이 구조만)
  ↓
Phase 1-A: Hyperliquid provider (market discovery + metadata + execution)
  ↓
Phase 1-B: edgeX provider (market discovery + metadata + execution)
  ↓
Phase 2-A: OKX/Bitget Provider (Metadata Only, Public API)
  ↓
Phase 1-C: PerpOrderPanel + PositionPanel UI
  ↓
Phase 2-C: Broker Vault Smart Contract & ProxyBroker UI 설계
  ↓
Phase 2-D: CrossVenuePriceTable (크로스벤뉴 비교)
```

---

## 주의사항

1. **기존 DEX Spot 플로우를 절대 깨지 마라.** USDY/OUSG/BENJI/PAXG/XAUt의 기존 swap 실행 경로는 그대로 유지.
2. **레거시 호환.** `instrumentToLegacyAsset()`은 유지. 기존 `RWAAsset` 타입을 사용하는 컴포넌트가 있다.
3. **API key 없이 동작하는 것 우선.** Hyperliquid, edgeX, OKX, Bitget 모두 public API 먼저. 인증 필요한 실행은 지갑 서명 기반.
4. **에러 시 graceful fallback.** 특정 venue API 실패 시 해당 venue instrument만 `marketData: null`로 두고 나머지는 정상 표시.
5. **한국어 UI.** 기존 패턴 따라 description은 한국어, 기술 필드는 영어.
6. **환율.** priceKrw 계산은 기존 rwaService의 환율 로직 재사용 (CoinGecko KRW 또는 fallback 1450).
7. **Perp instrument에서 NAV 개념이 다름.** spot은 NAV vs DEX price spread. perp은 mark price vs index price spread + 펀딩레이트. 이 차이를 UI에서 명확히 구분.
8. **Disclosure.** 모든 synthetic/perp instrument에 `"합성 상품입니다. 실제 자산 소유권이 없습니다."` 디스클로저 필수.
