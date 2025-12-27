/**
 * Allocation Engine
 * 
 * Core logic for routing expenses to income sources.
 * Implements the priority hierarchy:
 *   1. Manual Override (user already assigned this invoice)
 *   2. Allocation Rule (user-defined rule matches)
 *   3. AI Suggestion (from classification)
 *   4. Category Default (config-based fallback)
 *   5. Heuristics (single source, vendor history)
 */

import type {
  Situation,
  IncomeSource,
  AllocationRule,
  Allocation,
  AllocationResult,
  AllocationSource,
  ValidationError,
} from './jurisdictions/interface.js';
import type { 
  KraxlerConfig, 
  DeductibleCategory,
  Email,
} from '../types.js';
import { getTaxRules } from './jurisdictions/registry.js';
// getIncomeSourceById imported from situations.ts for validation
import { getIncomeSourceById as _getIncomeSourceById } from './situations.js';

// ============================================================================
// Rule Matching
// ============================================================================

interface RuleMatchContext {
  vendorDomain: string | null;
  deductibleCategory: DeductibleCategory | null;
  amountCents: number | null;
  subject: string | null;
  sender: string | null;
}

/**
 * Check if a rule matches the given context.
 */
function ruleMatches(rule: AllocationRule, context: RuleMatchContext): boolean {
  let hasMatchCriteria = false;
  
  // Check vendor domain
  if (rule.vendorDomain) {
    hasMatchCriteria = true;
    if (!context.vendorDomain) return false;
    if (!context.vendorDomain.toLowerCase().includes(rule.vendorDomain.toLowerCase())) {
      return false;
    }
  }
  
  // Check vendor pattern (regex)
  if (rule.vendorPattern) {
    hasMatchCriteria = true;
    const pattern = new RegExp(rule.vendorPattern, 'i');
    const textToMatch = [
      context.vendorDomain,
      context.subject,
      context.sender,
    ].filter(Boolean).join(' ');
    
    if (!pattern.test(textToMatch)) {
      return false;
    }
  }
  
  // Check deductible category
  if (rule.deductibleCategory) {
    hasMatchCriteria = true;
    if (context.deductibleCategory !== rule.deductibleCategory) {
      return false;
    }
  }
  
  // Check minimum amount
  if (rule.minAmountCents !== undefined) {
    hasMatchCriteria = true;
    if (!context.amountCents || context.amountCents < rule.minAmountCents) {
      return false;
    }
  }
  
  // Must have at least one matching criterion
  return hasMatchCriteria;
}

/**
 * Find the first matching allocation rule.
 */
export function findMatchingRule(
  rules: AllocationRule[],
  context: RuleMatchContext
): AllocationRule | null {
  for (const rule of rules) {
    if (ruleMatches(rule, context)) {
      return rule;
    }
  }
  return null;
}

// ============================================================================
// Allocation Engine
// ============================================================================

export interface AllocationInput {
  /** The email/invoice being allocated */
  email: Email;
  
  /** Active situation for the invoice date */
  situation: Situation;
  
  /** Active income sources for the invoice date */
  activeSources: IncomeSource[];
  
  /** AI's suggested source ID (if any) */
  aiSuggestedSourceId?: string | null;
  
  /** AI flagged as split candidate */
  aiIsSplitCandidate?: boolean;
  
  /** Already has a manual override? */
  hasManualOverride?: boolean;
  
  /** Existing assignment status */
  existingAssignmentStatus?: string | null;
}

/**
 * Allocate an expense to income source(s).
 * Returns the allocation result with audit trail.
 */
export function allocateExpense(
  config: KraxlerConfig,
  input: AllocationInput
): AllocationResult {
  const { email, activeSources, aiSuggestedSourceId, hasManualOverride } = input;
  // situation is available in input but not directly used in current logic
  
  // Priority 1: Manual Override
  if (hasManualOverride && input.existingAssignmentStatus === 'confirmed') {
    // Parse existing allocation
    const existingAllocation = email.allocation_json 
      ? JSON.parse(email.allocation_json) as Allocation[]
      : email.income_source_id 
        ? [{ sourceId: email.income_source_id, percent: 100 }]
        : [];
    
    return {
      allocations: existingAllocation,
      source: 'manual_override',
      confidence: 1.0,
      reason: 'User confirmed allocation',
    };
  }
  
  // Build match context
  const matchContext: RuleMatchContext = {
    vendorDomain: email.sender_domain,
    deductibleCategory: email.deductible,
    amountCents: email.invoice_amount_cents,
    subject: email.subject,
    sender: email.sender,
  };
  
  // Priority 2: Allocation Rule
  const matchingRule = findMatchingRule(config.allocationRules, matchContext);
  if (matchingRule) {
    // Validate allocations target active sources
    const validAllocations = matchingRule.allocations.filter(alloc =>
      activeSources.some(s => s.id === alloc.sourceId)
    );
    
    if (validAllocations.length > 0) {
      return {
        allocations: validAllocations,
        source: 'allocation_rule',
        ruleId: matchingRule.id,
        confidence: 1.0,
        reason: `Matched rule: ${matchingRule.id}`,
      };
    }
  }
  
  // Priority 3: AI Suggestion
  if (aiSuggestedSourceId) {
    const suggestedSource = activeSources.find(s => s.id === aiSuggestedSourceId);
    if (suggestedSource) {
      return {
        allocations: [{ sourceId: aiSuggestedSourceId, percent: 100 }],
        source: 'ai_suggestion',
        confidence: 0.8,
        reason: `AI suggested: ${suggestedSource.name}`,
        alternativesConsidered: activeSources
          .filter(s => s.id !== aiSuggestedSourceId)
          .map(s => s.id),
      };
    }
  }
  
  // Priority 4: Category Default
  if (email.deductible && config.categoryDefaults[email.deductible]) {
    const defaultSourceId = config.categoryDefaults[email.deductible]!;
    const defaultSource = activeSources.find(s => s.id === defaultSourceId);
    if (defaultSource) {
      return {
        allocations: [{ sourceId: defaultSourceId, percent: 100 }],
        source: 'category_default',
        confidence: 0.7,
        reason: `Category default: ${email.deductible} → ${defaultSource.name}`,
        alternativesConsidered: activeSources
          .filter(s => s.id !== defaultSourceId)
          .map(s => s.id),
      };
    }
  }
  
  // Priority 5: Heuristics
  
  // 5a: Single source fallback
  if (activeSources.length === 1) {
    const onlySource = activeSources[0];
    return {
      allocations: [{ sourceId: onlySource.id, percent: 100 }],
      source: 'heuristic_single_source',
      confidence: 0.9,
      reason: `Only one active source: ${onlySource.name}`,
    };
  }
  
  // 5b: Vendor history (would need DB query - simplified here)
  // TODO: Implement vendor history lookup
  
  // No match - needs review
  return {
    allocations: [],
    source: 'review_needed',
    confidence: 0,
    reason: activeSources.length === 0
      ? 'No active income sources for this date'
      : `Multiple sources active, manual review needed: ${activeSources.map(s => s.name).join(', ')}`,
    alternativesConsidered: activeSources.map(s => s.id),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an allocation against jurisdiction rules.
 */
export function validateAllocation(
  jurisdiction: string,
  allocations: Allocation[]
): ValidationError[] {
  const taxRules = getTaxRules(jurisdiction);
  return taxRules.validateAllocations(allocations);
}

/**
 * Normalize allocations (ensure they sum to ≤100, remove zeros).
 */
export function normalizeAllocations(allocations: Allocation[]): Allocation[] {
  // Remove zero allocations
  const nonZero = allocations.filter(a => a.percent > 0);
  
  // Sort by percent descending
  nonZero.sort((a, b) => b.percent - a.percent);
  
  return nonZero;
}

// ============================================================================
// Assignment Metadata
// ============================================================================

export interface AssignmentMetadata {
  source: AllocationSource;
  ruleId?: string;
  confidence: number;
  timestamp: string;
  alternativesConsidered?: string[];
  logicVersion: string;
}

const LOGIC_VERSION = '2.0.0';

/**
 * Build assignment metadata for audit trail.
 */
export function buildAssignmentMetadata(result: AllocationResult): AssignmentMetadata {
  return {
    source: result.source,
    ruleId: result.ruleId,
    confidence: result.confidence,
    timestamp: new Date().toISOString(),
    alternativesConsidered: result.alternativesConsidered,
    logicVersion: LOGIC_VERSION,
  };
}

/**
 * Serialize allocations to JSON string.
 */
export function serializeAllocations(allocations: Allocation[]): string {
  return JSON.stringify(allocations);
}

/**
 * Parse allocations from JSON string.
 */
export function parseAllocations(json: string | null): Allocation[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Allocation[];
  } catch {
    return [];
  }
}

// ============================================================================
// Source Selection Helpers
// ============================================================================

/**
 * Get the primary source ID from allocations.
 * Returns the source with highest percentage.
 */
export function getPrimarySourceId(allocations: Allocation[]): string | null {
  if (allocations.length === 0) return null;
  
  const sorted = [...allocations].sort((a, b) => b.percent - a.percent);
  return sorted[0].sourceId;
}

/**
 * Check if allocation is a split (multiple sources).
 */
export function isSplitAllocation(allocations: Allocation[]): boolean {
  const nonZero = allocations.filter(a => a.percent > 0);
  return nonZero.length > 1;
}

/**
 * Format allocations for display.
 */
export function formatAllocations(
  allocations: Allocation[],
  sources: IncomeSource[]
): string {
  if (allocations.length === 0) return 'Unassigned';
  
  return allocations
    .filter(a => a.percent > 0)
    .map(a => {
      const source = sources.find(s => s.id === a.sourceId);
      const name = source?.name || a.sourceId;
      return a.percent === 100 ? name : `${name} (${a.percent}%)`;
    })
    .join(' / ');
}
