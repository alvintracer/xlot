// ============================================================
// Disclosure Service
// Generates human-readable disclosure text and badge sets
// for any RWAInstrument based on its structure metadata.
// ============================================================

import type { RWAInstrument, StructureType, ExecutionAvailability, OwnershipClaim } from '../types/rwaInstrument';
import { STRUCTURE_LABELS, EXECUTION_LABELS } from '../types/rwaInstrument';

export interface DisclosureBadge {
  label: string;
  color: string;       // tailwind class string
  tooltip: string;
}

export interface InstrumentDisclosure {
  badges: DisclosureBadge[];
  summary: string;
  warnings: string[];
  legalNote: string;
}

export function generateDisclosure(instrument: RWAInstrument): InstrumentDisclosure {
  const badges: DisclosureBadge[] = [];
  const warnings: string[] = [];

  // Structure badge
  const structLabel = STRUCTURE_LABELS[instrument.structureType];
  badges.push({
    label: structLabel.label,
    color: structLabel.color,
    tooltip: getStructureTooltip(instrument.structureType),
  });

  // Execution badge
  const execLabel = EXECUTION_LABELS[instrument.executionAvailability];
  badges.push({
    label: `${execLabel.icon} ${execLabel.label}`,
    color: execLabel.color,
    tooltip: getExecutionTooltip(instrument.executionAvailability),
  });

  // Ownership claim badge
  if (instrument.ownershipClaim === 'economic_exposure_only') {
    badges.push({
      label: 'Economic Exposure Only',
      color: 'text-fuchsia-400 bg-fuchsia-500/10',
      tooltip: 'This product does not grant any ownership rights in the underlying asset.',
    });
  } else if (instrument.ownershipClaim === 'indirect_claim') {
    badges.push({
      label: 'Indirect Claim',
      color: 'text-amber-400 bg-amber-500/10',
      tooltip: 'Ownership via intermediary. Rights depend on provider terms.',
    });
  }

  // NAV badge
  if (instrument.navSupport === 'official') {
    badges.push({
      label: 'Official NAV',
      color: 'text-emerald-400 bg-emerald-500/10',
      tooltip: `NAV published by ${instrument.sourceAttribution.sourceName}`,
    });
  } else if (instrument.navSupport === 'estimated') {
    badges.push({
      label: 'Estimated NAV',
      color: 'text-amber-400 bg-amber-500/10',
      tooltip: 'NAV is estimated, not officially published.',
    });
  }

  // KYC badge
  if (instrument.requiresKyc) {
    badges.push({
      label: 'KYC Required',
      color: 'text-cyan-400 bg-cyan-500/10',
      tooltip: 'Identity verification required before execution.',
    });
  }

  // Permission badges
  if (instrument.permissionModel === 'platform_only') {
    badges.push({
      label: 'Platform Only',
      color: 'text-slate-400 bg-slate-500/10',
      tooltip: 'Only accessible via the issuer/platform interface.',
    });
  }

  // Warnings
  if (instrument.structureType === 'synthetic') {
    warnings.push('This is a synthetic market. It does not represent ownership of the underlying asset.');
  }
  if (instrument.executionAvailability === 'tracked_only') {
    warnings.push('Execution is not currently integrated. Displayed prices are for informational purposes only.');
  }
  if (instrument.executionAvailability === 'platform_only') {
    warnings.push('This product is only executable on the provider platform. It cannot be bought via DEX routes.');
  }
  if (instrument.ownershipClaim === 'economic_exposure_only') {
    warnings.push('This product provides economic exposure only. No shareholder or ownership rights apply.');
  }

  // Summary
  const summary = generateSummary(instrument);

  // Legal note
  const legalNote = `Asset class (${instrument.assetClass}) describes the exposure type. Structure (${instrument.structureType}) describes the claim type. These are not interchangeable.`;

  return { badges, summary, warnings, legalNote };
}

function generateSummary(inst: RWAInstrument): string {
  const parts: string[] = [];

  if (inst.executionAvailability === 'swappable_now' && inst.chains.length > 0) {
    const chainNames = inst.chains.map(c => c.chainName).join(', ');
    const routerNames = inst.routers.filter(r => r.isLive).map(r => r.name).join(', ');
    parts.push(`Executable on ${chainNames} via ${routerNames || 'connected routers'}.`);
  } else if (inst.executionAvailability === 'tracked_only') {
    parts.push('Market data tracked. Execution not currently integrated.');
  } else if (inst.executionAvailability === 'platform_only') {
    parts.push(`Access via ${inst.issuer} platform only.`);
  }

  if (inst.navSupport === 'official' && inst.marketData?.spreadPct != null) {
    const spread = inst.marketData.spreadPct;
    const dir = spread < 0 ? 'below' : 'above';
    parts.push(`Current price is ${Math.abs(spread).toFixed(2)}% ${dir} official NAV.`);
  }

  if (inst.structureType === 'synthetic') {
    parts.push('This market is synthetic and provides economic exposure only.');
  }

  if (inst.structureType === 'platform_issued') {
    parts.push(`This product is issued by ${inst.issuer} and is not redeemable for the underlying.`);
  }

  return parts.join(' ');
}

function getStructureTooltip(st: StructureType): string {
  switch (st) {
    case 'asset_backed': return 'Directly backed by the underlying asset. May be redeemable.';
    case 'regulated_tokenized': return 'Issued under regulatory framework (SEC, MAS, etc).';
    case 'platform_issued': return 'Issued by a platform as a representation. Check provider terms.';
    case 'synthetic': return 'No physical backing. Price tracked via oracle. Economic exposure only.';
  }
}

function getExecutionTooltip(ea: ExecutionAvailability): string {
  switch (ea) {
    case 'swappable_now': return 'Can be bought/sold via integrated DEX routes right now.';
    case 'quote_only': return 'A quote can be obtained but execution path is not yet integrated.';
    case 'tracked_only': return 'Market data is tracked but the asset cannot be traded here.';
    case 'platform_only': return 'Only tradable on the issuer/provider platform.';
  }
}
