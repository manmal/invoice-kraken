/**
 * Situation Hash
 * 
 * Computes a hash of the situation + income sources context for an invoice.
 * Used to detect when invoices need reclassification due to config changes.
 */

import { createHash } from 'crypto';
import type { Situation, IncomeSource } from './jurisdictions/interface.js';
import type { KraxlerConfig } from '../types.js';
import { getSituationForDate, getActiveIncomeSources, parseDate } from './situations.js';

// ============================================================================
// Context Types
// ============================================================================

export interface SituationContext {
  situation: Situation;
  activeIncomeSources: IncomeSource[];
}

// ============================================================================
// Hash Computation
// ============================================================================

/**
 * Compute a hash of the situation context.
 * This hash changes when any classification-relevant field changes.
 */
export function computeSituationHash(context: SituationContext): string {
  const data = {
    // Situation fields that affect classification
    situationId: context.situation.id,
    vatStatus: context.situation.vatStatus,
    hasCompanyCar: context.situation.hasCompanyCar,
    companyCarType: context.situation.companyCarType,
    carBusinessPercent: context.situation.carBusinessPercent,
    telecomBusinessPercent: context.situation.telecomBusinessPercent,
    internetBusinessPercent: context.situation.internetBusinessPercent,
    homeOffice: context.situation.homeOffice,
    jurisdiction: context.situation.jurisdiction,
    
    // Income sources affect allocation
    incomeSourceIds: context.activeIncomeSources
      .map(s => s.id)
      .sort(),
  };
  
  return createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16); // 16 hex chars = 64 bits, enough for collision avoidance
}

/**
 * Get the situation context for a specific date.
 * Returns null if no situation covers the date.
 */
export function getContextForDate(
  config: KraxlerConfig,
  date: Date
): SituationContext | null {
  const situation = getSituationForDate(config, date);
  if (!situation) return null;
  
  const activeIncomeSources = getActiveIncomeSources(config, date);
  return { situation, activeIncomeSources };
}

/**
 * Get the situation context for a date string (YYYY-MM-DD).
 */
export function getContextForDateString(
  config: KraxlerConfig,
  dateStr: string
): SituationContext | null {
  return getContextForDate(config, parseDate(dateStr));
}

/**
 * Compute hash for a specific date.
 * Returns null if no situation covers the date.
 */
export function computeHashForDate(
  config: KraxlerConfig,
  date: Date
): string | null {
  const context = getContextForDate(config, date);
  if (!context) return null;
  return computeSituationHash(context);
}

/**
 * Compute hash for a date string (YYYY-MM-DD).
 */
export function computeHashForDateString(
  config: KraxlerConfig,
  dateStr: string
): string | null {
  return computeHashForDate(config, parseDate(dateStr));
}
