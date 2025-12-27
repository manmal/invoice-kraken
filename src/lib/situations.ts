/**
 * Situation Manager
 * 
 * Handles temporal context for tax situations and income sources.
 * Provides date-based lookups and validation.
 */

import type {
  Situation,
  IncomeSource,
  ValidationError,
} from './jurisdictions/interface.js';
import type { KraxlerConfig } from '../types.js';
import { getTaxRules } from './jurisdictions/registry.js';

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Parse a date string (YYYY-MM-DD) to a Date object.
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date falls within a range (inclusive).
 */
export function isDateInRange(
  date: Date,
  from: string,
  to: string | null
): boolean {
  const fromDate = parseDate(from);
  const toDate = to ? parseDate(to) : null;
  
  if (date < fromDate) return false;
  if (toDate && date > toDate) return false;
  
  return true;
}

/**
 * Check if a date string falls within a range.
 */
export function isDateStringInRange(
  dateStr: string,
  from: string,
  to: string | null
): boolean {
  return isDateInRange(parseDate(dateStr), from, to);
}

// ============================================================================
// Situation Lookups
// ============================================================================

/**
 * Get the situation active on a given date.
 * @returns The active situation, or null if no situation covers that date.
 */
export function getSituationForDate(
  config: KraxlerConfig,
  date: Date
): Situation | null {
  for (const situation of config.situations) {
    if (isDateInRange(date, situation.from, situation.to)) {
      return situation;
    }
  }
  return null;
}

/**
 * Get the situation active on a given date string (YYYY-MM-DD).
 */
export function getSituationForDateString(
  config: KraxlerConfig,
  dateStr: string
): Situation | null {
  return getSituationForDate(config, parseDate(dateStr));
}

/**
 * Get all income sources active on a given date.
 */
export function getActiveIncomeSources(
  config: KraxlerConfig,
  date: Date
): IncomeSource[] {
  return config.incomeSources.filter(source =>
    isDateInRange(date, source.validFrom, source.validTo)
  );
}

/**
 * Get income sources active on a given date string.
 */
export function getActiveIncomeSourcesForDateString(
  config: KraxlerConfig,
  dateStr: string
): IncomeSource[] {
  return getActiveIncomeSources(config, parseDate(dateStr));
}

/**
 * Get a specific income source by ID.
 */
export function getIncomeSourceById(
  config: KraxlerConfig,
  sourceId: string
): IncomeSource | null {
  return config.incomeSources.find(s => s.id === sourceId) || null;
}

// ============================================================================
// Validation
// ============================================================================

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Validate the entire configuration.
 */
export function validateConfig(config: KraxlerConfig): ConfigValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  
  // Get jurisdiction rules
  let taxRules;
  try {
    taxRules = getTaxRules(config.jurisdiction);
  } catch (e) {
    errors.push({
      field: 'jurisdiction',
      message: (e as Error).message,
      code: 'INVALID_JURISDICTION',
    });
    return { valid: false, errors, warnings };
  }
  
  // Validate situations
  for (let i = 0; i < config.situations.length; i++) {
    const situation = config.situations[i];
    const situationErrors = taxRules.validateSituation(situation);
    for (const err of situationErrors) {
      errors.push({
        ...err,
        field: `situations[${i}].${err.field}`,
      });
    }
  }
  
  // Validate income sources
  for (let i = 0; i < config.incomeSources.length; i++) {
    const source = config.incomeSources[i];
    const sourceErrors = taxRules.validateIncomeSource(source);
    for (const err of sourceErrors) {
      errors.push({
        ...err,
        field: `incomeSources[${i}].${err.field}`,
      });
    }
  }
  
  // Validate allocation rules
  for (let i = 0; i < config.allocationRules.length; i++) {
    const rule = config.allocationRules[i];
    const allocErrors = taxRules.validateAllocations(rule.allocations);
    for (const err of allocErrors) {
      errors.push({
        ...err,
        field: `allocationRules[${i}].${err.field}`,
      });
    }
    
    // Validate source IDs exist
    for (const alloc of rule.allocations) {
      const source = getIncomeSourceById(config, alloc.sourceId);
      if (!source) {
        errors.push({
          field: `allocationRules[${i}].allocations`,
          message: `Income source '${alloc.sourceId}' not found`,
          code: 'INVALID_SOURCE_ID',
        });
      }
    }
  }
  
  // Check for situation overlaps
  const overlapErrors = checkSituationOverlaps(config.situations);
  errors.push(...overlapErrors);
  
  // Check for gaps (warning, not error)
  const gaps = findSituationGaps(config.situations);
  for (const gap of gaps) {
    warnings.push(
      `⚠️  Gap in situations: ${gap.from} to ${gap.to}. ` +
      `Consider adding a 'no business activity' situation.`
    );
  }
  
  // Check category defaults reference valid sources
  for (const [category, sourceId] of Object.entries(config.categoryDefaults)) {
    if (sourceId && !getIncomeSourceById(config, sourceId)) {
      errors.push({
        field: `categoryDefaults.${category}`,
        message: `Income source '${sourceId}' not found`,
        code: 'INVALID_SOURCE_ID',
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for overlapping situations.
 */
function checkSituationOverlaps(situations: Situation[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Sort by start date
  const sorted = [...situations].sort((a, b) => a.from.localeCompare(b.from));
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    // If current has no end date, it overlaps with next
    if (!current.to) {
      errors.push({
        field: `situations[${i}]`,
        message: `Situation ${current.id} (from ${current.from}) has no end date but overlaps with situation ${next.id} (from ${next.from})`,
        code: 'SITUATION_OVERLAP',
      });
      continue;
    }
    
    // Check if current end is after next start
    if (current.to >= next.from) {
      errors.push({
        field: `situations[${i}]`,
        message: `Situation ${current.id} (ends ${current.to}) overlaps with situation ${next.id} (starts ${next.from})`,
        code: 'SITUATION_OVERLAP',
      });
    }
  }
  
  return errors;
}

/**
 * Find gaps between situations.
 */
export interface DateGap {
  from: string;
  to: string;
}

export function findSituationGaps(situations: Situation[]): DateGap[] {
  if (situations.length === 0) return [];
  
  const gaps: DateGap[] = [];
  
  // Sort by start date
  const sorted = [...situations].sort((a, b) => a.from.localeCompare(b.from));
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    if (!current.to) continue; // No gap if current has no end
    
    // Calculate day after current ends
    const currentEndDate = parseDate(current.to);
    const nextDay = new Date(currentEndDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = formatDate(nextDay);
    
    // Check if there's a gap
    if (nextDayStr < next.from) {
      gaps.push({
        from: nextDayStr,
        to: formatDateBefore(next.from),
      });
    }
  }
  
  return gaps;
}

/**
 * Get the date before a given date string.
 */
function formatDateBefore(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Context for a specific invoice date.
 * Used to pass to AI and allocation engine.
 */
export interface InvoiceContext {
  invoiceDate: string;
  situation: Situation | null;
  activeSources: IncomeSource[];
  jurisdiction: string;
  hasGap: boolean;
}

/**
 * Build the context for a specific invoice date.
 */
export function buildInvoiceContext(
  config: KraxlerConfig,
  invoiceDate: string
): InvoiceContext {
  const date = parseDate(invoiceDate);
  const situation = getSituationForDate(config, date);
  const activeSources = getActiveIncomeSources(config, date);
  
  return {
    invoiceDate,
    situation,
    activeSources,
    jurisdiction: config.jurisdiction,
    hasGap: situation === null,
  };
}

// ============================================================================
// Effective Percentages
// ============================================================================

/**
 * Get the effective telecom business percentage for a source on a date.
 * Uses source override if present, otherwise falls back to situation default.
 */
export function getEffectiveTelecomPercent(
  situation: Situation,
  source: IncomeSource
): number {
  if (source.telecomPercentOverride !== undefined) {
    return source.telecomPercentOverride;
  }
  return situation.telecomBusinessPercent;
}

/**
 * Get the effective internet business percentage for a source on a date.
 */
export function getEffectiveInternetPercent(
  situation: Situation,
  source: IncomeSource
): number {
  if (source.internetPercentOverride !== undefined) {
    return source.internetPercentOverride;
  }
  return situation.internetBusinessPercent;
}

/**
 * Get the effective vehicle business percentage for a source on a date.
 */
export function getEffectiveVehiclePercent(
  situation: Situation,
  source: IncomeSource
): number {
  if (source.vehiclePercentOverride !== undefined) {
    return source.vehiclePercentOverride;
  }
  return situation.carBusinessPercent;
}
