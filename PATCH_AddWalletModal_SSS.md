# AddWalletModal.tsx — SSS 지갑 진입점 추가 패치

## 1. import 추가 (파일 상단)

```tsx
import { XLOTWalletCreateModal } from './XLOTWalletCreateModal';
import { XLOTWalletRecoverModal } from './XLOTWalletRecoverModal';
```

## 2. state 추가 (AddWalletModal 함수 내부)

```tsx
const [showSSSCreate, setShowSSSCreate]   = useState(false);
const [showSSSRecover, setShowSSSRecover] = useState(false);
```

## 3. WEB3 탭 상단에 SSS 지갑 카드 추가

기존 WEB3_WALLETS.map() 위에 삽입:

```tsx
{/* ── xLOT 비수탁 지갑 (SSS) ── */}
<div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-4 space-y-3 mb-4">
  <div className="flex items-center gap-2">
    <ShieldCheck size={16} className="text-cyan-400" />
    <p className="text-sm font-black text-white">xLOT 비수탁 지갑</p>
    <span className="text-[9px] bg-cyan-500 text-white px-1.5 py-0.5 rounded font-bold">NEW</span>
  </div>
  <p className="text-[10px] text-slate-400 leading-relaxed">
    Triple-Shield 2-of-3 복구 · 비밀번호 + 휴대폰으로 언제든 복구
    · BIP-39 표준 · 완전 비수탁
  </p>
  <div className="flex gap-2">
    <button
      onClick={() => setShowSSSCreate(true)}
      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all"
    >
      새 지갑 만들기
    </button>
    <button
      onClick={() => setShowSSSRecover(true)}
      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all"
    >
      기존 지갑 복구
    </button>
  </div>
</div>
```

## 4. 모달 렌더링 추가 (return 내부 최하단)

```tsx
{showSSSCreate && (
  <XLOTWalletCreateModal
    onClose={() => setShowSSSCreate(false)}
    onSuccess={async () => { await onSuccess(); onClose(); }}
  />
)}

{showSSSRecover && (
  <XLOTWalletRecoverModal
    onClose={() => setShowSSSRecover(false)}
    onSuccess={async () => { await onSuccess(); onClose(); }}
  />
)}
```

## 5. wallet_type 'XLOT_SSS' 처리 추가

### AssetView.tsx — 아이콘 매핑 (case 'XLOT' 옆에 추가)
```tsx
case 'XLOT_SSS':
  return {
    bg: 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20',
    text: 'text-cyan-400',
    icon: <ShieldCheck size={20} className="text-cyan-400" />
  };
```

### SwapPage.tsx — canSwap 조건 (기존 EVM_WALLET_TYPES 배열에 추가)
```tsx
const EVM_WALLET_TYPES = ['XLOT', 'XLOT_SSS', 'METAMASK', 'RABBY', 'WALLETCONNECT', 'BYBIT', 'BITGET', 'TRUST'];
```

### walletService.ts — getProvider 분기 (기존 XLOT 처리 위에 추가)
```tsx
if (wallet.wallet_type === 'XLOT_SSS') {
  // SSS 지갑은 localWalletManager 경유 서명
  // privateKey는 SSS 복원 후 제공 (AssetSendModal에서 처리)
  return getSpecificProvider('METAMASK'); // fallback
}
```
