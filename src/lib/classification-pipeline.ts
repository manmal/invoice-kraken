/**
 * Classification Pipeline
 * 
 * Combines all validation layers:
 * 1. Legal constraint enforcement
 * 2. Cross-validation with vendor database
 * 3. Anomaly detection
 * 
 * Returns a validated classification with audit trail.
 */

import type { DeductibleCategory, Email } from '../types.js';
import type { Situation } from './jurisdictions/interface.js';
import type { EmailClassificationResult } from './ai.js';
import { 
  enforceLegalConstraints, 
  ConstraintViolation,
} from './legal-constraints.js';
import { 
  crossValidateWithVendorDb, 
  getForceOverride,
  CrossValidationResult,
} from './cross-validate.js';
import { 
  checkForAnomalies,
  AnomalyFlag,
} from './anomaly-detection.js';
import { parseAmountToCents } from './extract.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidatedClassification {
  // Final classification (after all validation layers)
  category: DeductibleCategory;
  incomeTaxPercent: number | null;
  vatRecoverable: boolean | null;
  reason: string;
  
  // Original values from LLM
  llmOriginal: {
    category?: DeductibleCategory;
    incomeTaxPercent?: number | null;
    vatRecoverable?: boolean | null;
    reason?: string;
  };
  
  // Validation results
  legalViolations: ConstraintViolation[];
  crossValidation: CrossValidationResult;
  anomalies: AnomalyFlag[];
  
  // Force override (if applied)
  forceOverride: { category: DeductibleCategory; reason: string } | null;
  
  // Review status
  needsReview: boolean;
  reviewReasons: string[];
  confidence: 'high' | 'medium' | 'low';
  
  // Was the classification modified by validation?
  wasModified: boolean;
}

export interface ValidationOptions {
  /** Apply force overrides for known personal services */
  applyForceOverrides?: boolean;
  
  /** Treat legal violations as requiring review */
  reviewOnLegalViolation?: boolean;
  
  /** Include anomaly detection */
  checkAnomalies?: boolean;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  applyForceOverrides: true,
  reviewOnLegalViolation: false, // Legal constraints auto-correct, no need for review
  checkAnomalies: true,
};

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Run the full classification validation pipeline.
 * 
 * @param email - The email being classified
 * @param llmResult - Classification result from LLM
 * @param situation - Tax situation for the invoice date
 * @param account - Account identifier for vendor history lookup
 * @param options - Validation options
 */
export function validateClassification(
  email: Email,
  llmResult: EmailClassificationResult,
  situation: Situation,
  account: string,
  options: ValidationOptions = {}
): ValidatedClassification {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Parse amount
  const amountCents = llmResult.amount ? parseAmountToCents(llmResult.amount) : null;
  
  // Track modifications
  let wasModified = false;
  const reviewReasons: string[] = [];
  
  // Start with LLM values
  let category: DeductibleCategory = llmResult.deductible || 'unclear';
  let incomeTaxPercent = llmResult.income_tax_percent ?? null;
  let vatRecoverable = llmResult.vat_recoverable ?? null;
  let reason = llmResult.deductible_reason || '';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 0: Force Overrides (known personal services)
  // ═══════════════════════════════════════════════════════════════════════════
  let forceOverride: { category: DeductibleCategory; reason: string } | null = null;
  
  if (opts.applyForceOverrides) {
    forceOverride = getForceOverride(
      email.sender_domain,
      email.subject || '',
      email.snippet || ''
    );
    
    if (forceOverride && forceOverride.category !== category) {
      category = forceOverride.category;
      reason = forceOverride.reason;
      wasModified = true;
      
      // Adjust tax values for force override
      if (category === 'none') {
        incomeTaxPercent = 0;
        vatRecoverable = false;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: Legal Constraint Enforcement
  // ═══════════════════════════════════════════════════════════════════════════
  const legalResult = enforceLegalConstraints(
    {
      category,
      incomeTaxPercent,
      vatRecoverable,
      amountCents: amountCents ?? undefined,
      vendorName: llmResult.vendor_product ?? undefined,
    },
    situation,
    situation.jurisdiction
  );
  
  if (legalResult.wasModified) {
    category = legalResult.classification.category;
    incomeTaxPercent = legalResult.classification.incomeTaxPercent;
    vatRecoverable = legalResult.classification.vatRecoverable;
    wasModified = true;
    
    // Append legal correction reasons
    for (const violation of legalResult.violations) {
      if (violation.severity === 'error') {
        reason += ` [Corrected: ${violation.rule}]`;
      }
    }
    
    if (opts.reviewOnLegalViolation) {
      for (const v of legalResult.violations.filter(v => v.severity === 'error')) {
        reviewReasons.push(`Legal: ${v.rule}`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: Cross-Validation with Vendor Database
  // ═══════════════════════════════════════════════════════════════════════════
  const crossValidation = crossValidateWithVendorDb(
    category,
    email.sender_domain,
    email.subject || '',
    email.snippet || ''
  );
  
  if (crossValidation.match === 'disagree' && crossValidation.confidence === 'low') {
    if (crossValidation.suggestedAction) {
      reviewReasons.push(crossValidation.suggestedAction);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: Anomaly Detection
  // ═══════════════════════════════════════════════════════════════════════════
  let anomalies: AnomalyFlag[] = [];
  
  if (opts.checkAnomalies) {
    const anomalyCheck = checkForAnomalies(
      {
        category,
        amountCents,
        vendorProduct: llmResult.vendor_product || null,
        vatRecoverable,
      },
      account,
      email.sender_domain
    );
    
    anomalies = anomalyCheck.flags;
    
    for (const flag of anomalyCheck.flags.filter(f => f.severity === 'review_required')) {
      reviewReasons.push(flag.message);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Determine Final Status
  // ═══════════════════════════════════════════════════════════════════════════
  const needsReview = reviewReasons.length > 0 || category === 'unclear';
  
  // Calculate confidence
  let confidence: 'high' | 'medium' | 'low' = 'high';
  
  if (crossValidation.match === 'unknown_vendor') {
    confidence = 'medium';
  }
  if (crossValidation.match === 'disagree') {
    confidence = crossValidation.confidence;
  }
  if (anomalies.length > 0) {
    confidence = anomalies.some(a => a.severity === 'review_required') ? 'low' : 'medium';
  }
  if (legalResult.violations.some(v => v.severity === 'error')) {
    // Legal corrections actually increase confidence since we enforced the law
    confidence = confidence === 'low' ? 'medium' : confidence;
  }
  
  return {
    category,
    incomeTaxPercent,
    vatRecoverable,
    reason,
    
    llmOriginal: {
      category: llmResult.deductible,
      incomeTaxPercent: llmResult.income_tax_percent,
      vatRecoverable: llmResult.vat_recoverable,
      reason: llmResult.deductible_reason || undefined,
    },
    
    legalViolations: legalResult.violations,
    crossValidation,
    anomalies,
    forceOverride,
    
    needsReview,
    reviewReasons,
    confidence,
    wasModified,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface BatchValidationSummary {
  total: number;
  modified: number;
  needsReview: number;
  byConfidence: Record<'high' | 'medium' | 'low', number>;
  legalViolations: number;
  anomalies: number;
  forceOverrides: number;
}

/**
 * Summarize validation results for a batch of classifications.
 */
export function summarizeValidation(
  results: ValidatedClassification[]
): BatchValidationSummary {
  const summary: BatchValidationSummary = {
    total: results.length,
    modified: 0,
    needsReview: 0,
    byConfidence: { high: 0, medium: 0, low: 0 },
    legalViolations: 0,
    anomalies: 0,
    forceOverrides: 0,
  };
  
  for (const result of results) {
    if (result.wasModified) summary.modified++;
    if (result.needsReview) summary.needsReview++;
    summary.byConfidence[result.confidence]++;
    summary.legalViolations += result.legalViolations.length;
    summary.anomalies += result.anomalies.length;
    if (result.forceOverride) summary.forceOverrides++;
  }
  
  return summary;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format validation result for CLI output.
 */
export function formatValidationResult(result: ValidatedClassification): string {
  const lines: string[] = [];
  
  if (result.wasModified) {
    lines.push(`  ⚠️  Classification modified by validation`);
    
    if (result.forceOverride) {
      lines.push(`    └─ Force: ${result.forceOverride.reason}`);
    }
    
    for (const v of result.legalViolations.filter(v => v.severity === 'error')) {
      lines.push(`    └─ Legal: ${v.rule}`);
      if (v.legalReference) {
        lines.push(`       (${v.legalReference})`);
      }
    }
  }
  
  if (result.crossValidation.match === 'disagree') {
    lines.push(`    └─ Vendor DB: ${result.crossValidation.suggestedAction}`);
  }
  
  for (const anomaly of result.anomalies) {
    const icon = anomaly.severity === 'review_required' ? '🔍' : '⚠️';
    lines.push(`    └─ ${icon} ${anomaly.message}`);
  }
  
  return lines.join('\n');
}
