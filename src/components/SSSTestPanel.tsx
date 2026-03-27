import { useState } from 'react';
import { Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { runSSSE2ETests } from '../services/sssE2ETest';

export function SSSTestPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleTest = async () => {
    setIsRunning(true);
    setResult('idle');
    setErrorMsg('');
    try {
      await runSSSE2ETests();
      setResult('success');
    } catch (e: any) {
      setResult('fail');
      setErrorMsg(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-4 z-[9999]">
      <div className="bg-slate-900 border border-slate-700/50 p-3 rounded-2xl shadow-2xl flex flex-col gap-2 items-center backdrop-blur-md w-40">
        <p className="text-[10px] font-bold text-slate-400">DEV: SSS E2E Test</p>
        <button 
          onClick={handleTest}
          disabled={isRunning}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex justify-center items-center gap-2"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {isRunning ? 'Running...' : 'Run Tests'}
        </button>

        {result === 'success' && (
          <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold w-full justify-center bg-emerald-500/10 py-1.5 rounded-lg border border-emerald-500/20">
            <CheckCircle size={12} /> Passed
          </div>
        )}

        {result === 'fail' && (
          <div className="flex flex-col items-center gap-1 w-full bg-red-500/10 p-1.5 rounded-lg border border-red-500/20 mt-1">
            <div className="flex items-center gap-1 text-red-400 text-xs font-bold">
              <XCircle size={12} /> Failed
            </div>
            <p className="text-[9px] text-red-300 text-center leading-tight break-words w-full">
              {errorMsg.slice(0, 50)}{errorMsg.length > 50 ? '...' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
