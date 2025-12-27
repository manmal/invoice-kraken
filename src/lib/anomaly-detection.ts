/**
 * Anomaly Detection
 * 
 * Detects suspicious patterns that may indicate classification errors.
 * Flags items for manual review when anomalies are detected.
 */

import type { DeductibleCategory } from '../types.js';
import { getDb } from './db.js';

// ============================================================================
// Types
// ============================================================================

export type AnomalyType = 
  | 'high_amount_personal'
  | 'new_vendor_suspicious'
  | 'category_change'
  | 'unusual_vat'
  | 'round_amount_high_value';

export interface AnomalyFlag {
  type: AnomalyType;
  severity: 'warning' | 'review_required';
  message: string;
  context: Record<string, unknown>;
}

export interface AnomalyCheckResult {
  flags: AnomalyFlag[];
  requiresReview: boolean;
}

interface VendorHistory {
  invoiceCount: number;
  lastCategory: DeductibleCategory | null;
  totalAmountCents: number;
  avgAmountCents: number;
}

// ============================================================================
// Thresholds
// ============================================================================

const THRESHOLDS = {
  /** Personal items above this amount are suspicious */
  HIGH_AMOUNT_PERSONAL_CENTS: 200_00, // €200
  
  /** First-time vendors with high amounts are suspicious */
  FIRST_TIME_HIGH_THRESHOLD_CENTS: 500_00, // €500
  
  /** Very high amounts that warrant review */
  VERY_HIGH_AMOUNT_CENTS: 2000_00, // €2,000
  
  /** Minimum invoices before category change is suspicious */
  MIN_INVOICES_FOR_PATTERN: 2,
};

// Patterns that typically don't have VAT recovery
const NO_VAT_PATTERNS = [
  /insurance|versicherung/i,
  /bank.*fee|bankgebühr|kontoführung/i,
  /rent|miete|pacht/i,
  /medical|arzt|apotheke|kranken/i,
  /tax|steuer(?!berater)/i, // Tax but not tax advisor
  /membership.*(?:gym|fitness)|fitnessstudio/i,
];

// ============================================================================
// Vendor History
// ============================================================================

function getVendorHistory(account: string, senderDomain: string | null): VendorHistory {
  if (!senderDomain) {
    return { invoiceCount: 0, lastCategory: null, totalAmountCents: 0, avgAmountCents: 0 };
  }
  
  const db = getDb();
  const result = db.prepare(`
    SELECT 
      COUNT(*) as count,
      deductible as last_category,
      SUM(invoice_amount_cents) as total,
      AVG(invoice_amount_cents) as avg
    FROM emails
    WHERE sender_domain = @senderDomain
      AND account = @account
      AND status IN ('extracted', 'downloaded', 'reviewed', 'filed')
    GROUP BY sender_domain
    ORDER BY date DESC
    LIMIT 1
  `).get({ senderDomain, account }) as { 
    count: number; 
    last_category: string | null; 
    total: number | null;
    avg: number | null;
  } | undefined;
  
  if (!result) {
    return { invoiceCount: 0, lastCategory: null, totalAmountCents: 0, avgAmountCents: 0 };
  }
  
  return {
    invoiceCount: result.count,
    lastCategory: result.last_category as DeductibleCategory | null,
    totalAmountCents: result.total || 0,
    avgAmountCents: Math.round(result.avg || 0),
  };
}

// ============================================================================
// Anomaly Checks
// ============================================================================

/**
 * Check for suspicious patterns that may indicate classification errors.
 */
export function checkForAnomalies(
  classification: {
    category: DeductibleCategory;
    amountCents: number | null;
    vendorProduct: string | null;
    vatRecoverable: boolean | null;
  },
  account: string,
  senderDomain: string | null
): AnomalyCheckResult {
  const flags: AnomalyFlag[] = [];
  const vendorHistory = getVendorHistory(account, senderDomain);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 1: High-amount personal expense
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    classification.category === 'none' && 
    classification.amountCents && 
    classification.amountCents > THRESHOLDS.HIGH_AMOUNT_PERSONAL_CENTS
  ) {
    flags.push({
      type: 'high_amount_personal',
      severity: 'review_required',
      message: `High-value item (€${(classification.amountCents / 100).toFixed(2)}) classified as personal. Verify this is correct.`,
      context: {
        amount: classification.amountCents,
        vendor: classification.vendorProduct,
        threshold: THRESHOLDS.HIGH_AMOUNT_PERSONAL_CENTS,
      },
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 2: New vendor with "full" deductibility and high amount
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    vendorHistory.invoiceCount === 0 &&
    classification.category === 'full' &&
    classification.amountCents &&
    classification.amountCents > THRESHOLDS.FIRST_TIME_HIGH_THRESHOLD_CENTS
  ) {
    flags.push({
      type: 'new_vendor_suspicious',
      severity: 'warning',
      message: `First invoice from this vendor with high value (€${(classification.amountCents / 100).toFixed(2)}). Consider verifying business purpose.`,
      context: {
        vendor: senderDomain,
        amount: classification.amountCents,
        threshold: THRESHOLDS.FIRST_TIME_HIGH_THRESHOLD_CENTS,
      },
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 3: Category change for recurring vendor
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    vendorHistory.invoiceCount >= THRESHOLDS.MIN_INVOICES_FOR_PATTERN &&
    vendorHistory.lastCategory &&
    vendorHistory.lastCategory !== classification.category &&
    vendorHistory.lastCategory !== 'unclear' &&
    classification.category !== 'unclear'
  ) {
    flags.push({
      type: 'category_change',
      severity: 'warning',
      message: `Category changed from "${vendorHistory.lastCategory}" to "${classification.category}" for this vendor.`,
      context: {
        previousCategory: vendorHistory.lastCategory,
        newCategory: classification.category,
        invoiceCount: vendorHistory.invoiceCount,
      },
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 4: VAT recovery on typically non-VAT categories
  // ═══════════════════════════════════════════════════════════════════════════
  const vendorText = `${senderDomain || ''} ${classification.vendorProduct || ''}`;
  
  if (
    classification.vatRecoverable === true &&
    NO_VAT_PATTERNS.some(p => p.test(vendorText))
  ) {
    flags.push({
      type: 'unusual_vat',
      severity: 'review_required',
      message: `VAT recovery claimed for vendor/product that typically has no VAT (insurance, rent, medical, bank fees)`,
      context: {
        vendor: vendorText,
        matchedPattern: NO_VAT_PATTERNS.find(p => p.test(vendorText))?.source,
      },
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 5: Round numbers for very high amounts (potential fraud indicator)
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    classification.amountCents &&
    classification.amountCents > THRESHOLDS.VERY_HIGH_AMOUNT_CENTS &&
    classification.amountCents % 100_00 === 0 // Perfect hundreds
  ) {
    flags.push({
      type: 'round_amount_high_value',
      severity: 'warning',
      message: `Very high round amount (€${(classification.amountCents / 100).toFixed(0)}). Verify invoice authenticity.`,
      context: {
        amount: classification.amountCents,
      },
    });
  }
  
  return {
    flags,
    requiresReview: flags.some(f => f.severity === 'review_required'),
  };
}

/**
 * Get summary of anomaly flags for a batch of classifications.
 */
export function summarizeAnomalies(flags: AnomalyFlag[]): {
  byType: Record<AnomalyType, number>;
  totalWarnings: number;
  totalReviewRequired: number;
} {
  const byType: Record<AnomalyType, number> = {
    high_amount_personal: 0,
    new_vendor_suspicious: 0,
    category_change: 0,
    unusual_vat: 0,
    round_amount_high_value: 0,
  };
  
  let totalWarnings = 0;
  let totalReviewRequired = 0;
  
  for (const flag of flags) {
    byType[flag.type]++;
    if (flag.severity === 'warning') {
      totalWarnings++;
    } else {
      totalReviewRequired++;
    }
  }
  
  return {
    byType,
    totalWarnings,
    totalReviewRequired,
  };
}
