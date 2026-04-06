// ============================================================
// Confidence Scoring Service
// Computes a 0–100 confidence score for each instrument's data.
// ============================================================

import type { RWAInstrument, ConfidenceLevel } from '../types/rwaInstrument';

export interface ConfidenceReport {
  score: number;          // 0–100
  level: ConfidenceLevel;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  label: string;
  impact: number;         // positive = boost, negative = penalize
  reason: string;
}

export function computeConfidence(instrument: RWAInstrument): ConfidenceReport {
  const factors: ConfidenceFactor[] = [];
  let score = 50; // baseline

  // 1. Source quality
  const src = instrument.sourceAttribution;
  if (src.sourceType === 'official_issuer' || src.sourceType === 'official_venue_api') {
    factors.push({ label: 'Official Source', impact: 20, reason: `Data from ${src.sourceName}` });
    score += 20;
  } else if (src.sourceType === 'onchain_executable') {
    factors.push({ label: 'Onchain Data', impact: 15, reason: 'Executable onchain quote available' });
    score += 15;
  } else if (src.sourceType === 'oracle_feed') {
    factors.push({ label: 'Oracle Feed', impact: 10, reason: 'Price from oracle reference' });
    score += 10;
  } else if (src.sourceType === 'estimated') {
    factors.push({ label: 'Estimated Data', impact: -10, reason: 'No official source, using estimates' });
    score -= 10;
  } else if (src.sourceType === 'tracked_only') {
    factors.push({ label: 'Tracked Only', impact: -20, reason: 'Market data is tracked, not executable' });
    score -= 20;
  }

  // 2. Execution availability
  if (instrument.executionAvailability === 'swappable_now') {
    factors.push({ label: 'Executable', impact: 15, reason: 'Can be bought via integrated DEX routes' });
    score += 15;
  } else if (instrument.executionAvailability === 'quote_only') {
    factors.push({ label: 'Quote Only', impact: -5, reason: 'Quote available but execution not integrated' });
    score -= 5;
  } else {
    factors.push({ label: 'No Execution', impact: -15, reason: 'Not executable through this platform' });
    score -= 15;
  }

  // 3. NAV support
  if (instrument.navSupport === 'official') {
    factors.push({ label: 'Official NAV', impact: 10, reason: 'Official issuer NAV data available' });
    score += 10;
  } else if (instrument.navSupport === 'estimated') {
    factors.push({ label: 'Estimated NAV', impact: -5, reason: 'NAV is estimated, not officially published' });
    score -= 5;
  } else {
    factors.push({ label: 'No NAV', impact: -10, reason: 'No NAV or reference value available' });
    score -= 10;
  }

  // 4. Structure clarity
  if (instrument.ownershipClaim === 'direct_claim') {
    factors.push({ label: 'Direct Ownership', impact: 5, reason: 'Holder has direct claim on underlying' });
    score += 5;
  } else if (instrument.ownershipClaim === 'economic_exposure_only') {
    factors.push({ label: 'Exposure Only', impact: -5, reason: 'No ownership rights, price exposure only' });
    score -= 5;
  }

  // 5. Data freshness
  if (instrument.marketData?.source?.lastUpdated) {
    const ageMs = Date.now() - instrument.marketData.source.lastUpdated;
    const ageMin = ageMs / 60000;
    if (ageMin < 5) {
      factors.push({ label: 'Fresh Data', impact: 5, reason: 'Data updated within 5 minutes' });
      score += 5;
    } else if (ageMin > 60) {
      factors.push({ label: 'Stale Data', impact: -10, reason: 'Data older than 1 hour' });
      score -= 10;
    }
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const level: ConfidenceLevel =
    score >= 75 ? 'high' :
    score >= 45 ? 'medium' :
    score >= 20 ? 'low' : 'unknown';

  return { score, level, factors };
}
