// ============================================================
// RWADisclosureBadges.tsx
// Renders structure, execution, ownership badges for instruments
// ============================================================

import type { RWAInstrument } from '../types/rwaInstrument';
import { STRUCTURE_LABELS, EXECUTION_LABELS } from '../types/rwaInstrument';
import type { ConfidenceReport } from '../services/confidenceScoringService';
import { generateDisclosure } from '../services/disclosureService';
import type { DisclosureBadge } from '../services/disclosureService';
import { useState } from 'react';
import { Info, ChevronDown, AlertTriangle } from 'lucide-react';

// ── Single Badge ──
function Badge({ badge }: { badge: DisclosureBadge }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border border-transparent ${badge.color}`}
      title={badge.tooltip}
    >
      {badge.label}
    </span>
  );
}

// ── Badge Strip (horizontal row of badges) ──
export function BadgeStrip({ instrument }: { instrument: RWAInstrument }) {
  const disclosure = generateDisclosure(instrument);
  return (
    <div className="flex flex-wrap gap-1.5">
      {disclosure.badges.map((b, i) => (
        <Badge key={i} badge={b} />
      ))}
    </div>
  );
}

// ── Confidence Meter ──
export function ConfidenceMeter({ report }: { report: ConfidenceReport }) {
  const [expanded, setExpanded] = useState(false);
  const barColor =
    report.level === 'high' ? 'bg-emerald-500' :
    report.level === 'medium' ? 'bg-amber-500' :
    report.level === 'low' ? 'bg-red-500' : 'bg-slate-600';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 font-bold">Confidence</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
        >
          {report.score}/100
          <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${report.score}%` }}
        />
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 bg-slate-900 rounded-lg p-2 border border-slate-800">
          {report.factors.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">{f.label}</span>
              <span className={f.impact > 0 ? 'text-emerald-400' : f.impact < 0 ? 'text-red-400' : 'text-slate-500'}>
                {f.impact > 0 ? '+' : ''}{f.impact}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Full Disclosure Panel ──
export function DisclosurePanel({ instrument }: { instrument: RWAInstrument }) {
  const disclosure = generateDisclosure(instrument);
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="space-y-3">
      {/* Badges */}
      <BadgeStrip instrument={instrument} />

      {/* Summary */}
      {disclosure.summary && (
        <p className="text-[11px] text-slate-400 leading-relaxed">{disclosure.summary}</p>
      )}

      {/* Warnings */}
      {disclosure.warnings.length > 0 && (
        <div className="space-y-1.5">
          {disclosure.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
              <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-300/90">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Expandable legal */}
      <button
        onClick={() => setShowFull(!showFull)}
        className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-1"
      >
        <Info size={10} />
        {showFull ? 'Hide' : 'Show'} legal classification note
      </button>
      {showFull && (
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-800">
          <p className="text-[10px] text-slate-500 leading-relaxed">{disclosure.legalNote}</p>
          <p className="text-[10px] text-slate-600 mt-2 italic">{instrument.disclaimerLong}</p>
        </div>
      )}
    </div>
  );
}
