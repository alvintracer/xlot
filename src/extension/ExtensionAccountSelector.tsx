/**
 * ExtensionAccountSelector.tsx
 * 익스텐션 팝업 상단에 표시되는 DApp 연결용 주소 선택기.
 * chrome.storage.local 의 xlot_all_accounts 에서 사용 가능한 주소 목록을 읽고,
 * 선택한 주소를 accounts[0] + xlot_active_address 로 저장한다.
 */
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Copy, ExternalLink, Shield, Zap } from 'lucide-react';

interface AccountEntry {
  address: string;
  label: string;
  type: 'XLOT_SSS' | 'THIRDWEB_AA';
}

export function ExtensionAccountSelector() {
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [activeAddress, setActiveAddress] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 클릭 바깥쪽 감지
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // chrome.storage.local 에서 주소 목록 + 활성 주소 읽기
  useEffect(() => {
    const cs = (globalThis as any).chrome?.storage?.local;
    if (!cs) return;

    const load = () => {
      cs.get(['xlot_all_accounts', 'xlot_active_address'], (result: Record<string, any>) => {
        try {
          const list: AccountEntry[] = JSON.parse(result.xlot_all_accounts || '[]');
          setAccounts(list);
        } catch { setAccounts([]); }
        setActiveAddress(result.xlot_active_address || '');
      });
    };

    load();

    // storage 변경 감지
    const onChange = (changes: Record<string, any>) => {
      if (changes.xlot_all_accounts || changes.xlot_active_address) load();
    };
    (globalThis as any).chrome.storage.onChanged.addListener(onChange);
    return () => (globalThis as any).chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const switchAccount = (addr: string) => {
    const cs = (globalThis as any).chrome?.storage?.local;
    if (!cs) return;
    cs.set({ accounts: [addr], xlot_active_address: addr });
    setActiveAddress(addr);
    setOpen(false);
    // 브로드캐스트
    (globalThis as any).chrome.runtime.sendMessage({
      type: 'XLOT_SET_ACCOUNTS',
      accounts: [addr],
    });
  };

  const copyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (accounts.length === 0 && !activeAddress) return null;

  const activeEntry = accounts.find(a => a.address === activeAddress);
  const shortAddr = activeAddress
    ? `${activeAddress.slice(0, 6)}…${activeAddress.slice(-4)}`
    : '연결 없음';

  return (
    <div ref={ref} className="relative">
      {/* 현재 주소 표시 */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/50 hover:border-cyan-500/30 transition-all text-xs"
      >
        <div className={`w-2 h-2 rounded-full ${activeEntry?.type === 'XLOT_SSS' ? 'bg-cyan-400' : 'bg-cyan-400'}`} />
        <span className="text-slate-300 font-mono">{shortAddr}</span>
        <ChevronDown size={12} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 주소 카피 */}
      {activeAddress && (
        <button
          onClick={copyAddress}
          className="ml-1 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          title="주소 복사"
        >
          {copied
            ? <Check size={12} className="text-emerald-400" />
            : <Copy size={12} className="text-slate-500" />
          }
        </button>
      )}

      {/* 드롭다운 */}
      {open && accounts.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] text-slate-500 font-bold tracking-wider">DApp 연결 주소 선택</p>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {accounts.map((acct) => {
              const isActive = acct.address === activeAddress;
              const short = `${acct.address.slice(0, 8)}…${acct.address.slice(-6)}`;
              return (
                <button
                  key={acct.address}
                  onClick={() => switchAccount(acct.address)}
                  className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-slate-800/60 transition-colors ${
                    isActive ? 'bg-slate-800/40' : ''
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    acct.type === 'XLOT_SSS'
                      ? 'bg-cyan-500/20 border border-cyan-500/30'
                      : 'bg-cyan-500/20 border border-cyan-500/30'
                  }`}>
                    {acct.type === 'XLOT_SSS'
                      ? <ShieldCheck size={13} className="text-cyan-400" />
                      : <Zap size={13} className="text-cyan-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{acct.label}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{short}</p>
                  </div>
                  {isActive && <Check size={14} className="text-cyan-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
