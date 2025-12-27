# Plan: Classification Guardrails & Error Prevention

## Problem Statement

LLMs can make classification errors that violate Austrian tax law:
- Claiming VAT recovery on vehicle expenses (illegal for PKW)
- Missing the 50% rule for meals
- Allowing VAT recovery for Kleinunternehmer
- Misclassifying personal items as business expenses

## Solution: Multi-Layer Validation System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LLM Classification                                 │
│                                ↓                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Layer 1: Schema Validation                                              ││
│  │  • Valid JSON structure                                                  ││
│  │  • Required fields present                                               ││
│  │  • Enum values valid                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                ↓                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Layer 2: Legal Constraint Enforcement                                   ││
│  │  • Kleinunternehmer → VAT = false (override LLM)                        ││
│  │  • Vehicle expenses → VAT per car type (override LLM)                   ││
│  │  • Meals → 50% income tax, 100% VAT (enforce)                           ││
│  │  • Gifts → €40 limit for VAT recovery                                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                ↓                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Layer 3: Cross-Validation                                               ││
│  │  • Category vs income_tax_percent consistency                           ││
│  │  • Category vs vat_recoverable consistency                              ││
│  │  • Vendor pattern matching (2nd opinion)                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                ↓                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Layer 4: Anomaly Detection                                              ││
│  │  • High-amount personal items flagged                                    ││
│  │  • New vendors with suspicious categorization                            ││
│  │  • Sudden category changes for recurring vendors                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                ↓                                             │
│                       Validated Classification                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Schema Validation (Existing)

Already implemented in `src/lib/ai.ts`. Validates JSON structure.

---

## Layer 2: Legal Constraint Enforcement

### Implementation: `src/lib/legal-constraints.ts`

```typescript
import type { DeductibleCategory } from '../types.js';
import type { Situation } from './jurisdictions/interface.js';

export interface ClassificationInput {
  category: DeductibleCategory;
  incomeTaxPercent: number | null;
  vatRecoverable: boolean | null;
  amountCents?: number;
  vendorName?: string;
}

export interface ConstraintViolation {
  field: string;
  llmValue: unknown;
  correctedValue: unknown;
  rule: string;
  severity: 'error' | 'warning';
  legalReference?: string;
}

export interface ConstraintResult {
  classification: ClassificationInput;
  violations: ConstraintViolation[];
  wasModified: boolean;
}

/**
 * Austrian legal constraints that MUST be enforced regardless of LLM output.
 */
export function enforceAustrianLegalConstraints(
  input: ClassificationInput,
  situation: Situation
): ConstraintResult {
  const violations: ConstraintViolation[] = [];
  const result = { ...input };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 1: Kleinunternehmer → NO VAT recovery (§6 Abs 1 Z 27 UStG)
  // ═══════════════════════════════════════════════════════════════════════════
  if (situation.vatStatus === 'kleinunternehmer' && input.vatRecoverable === true) {
    violations.push({
      field: 'vatRecoverable',
      llmValue: true,
      correctedValue: false,
      rule: 'Kleinunternehmer cannot recover VAT',
      severity: 'error',
      legalReference: '§6 Abs 1 Z 27 UStG',
    });
    result.vatRecoverable = false;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 2: Vehicle (PKW) expenses → NO VAT recovery (§12 Abs 2 Z 2 UStG)
  // Exception: Electric vehicles (sachliche Rechtfertigung für Elektro-PKW)
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.category === 'vehicle') {
    const allowVatRecovery = 
      situation.hasCompanyCar && 
      situation.companyCarType === 'electric' &&
      situation.vatStatus !== 'kleinunternehmer';
    
    if (input.vatRecoverable === true && !allowVatRecovery) {
      violations.push({
        field: 'vatRecoverable',
        llmValue: true,
        correctedValue: false,
        rule: 'Vehicle (PKW) expenses: no VAT recovery unless electric',
        severity: 'error',
        legalReference: '§12 Abs 2 Z 2 UStG',
      });
      result.vatRecoverable = false;
    }
    
    // Income tax is business portion (always 100% of business use)
    if (input.incomeTaxPercent !== 100 && input.incomeTaxPercent !== null) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: 100,
        rule: 'Vehicle expenses: 100% of business portion deductible',
        severity: 'warning',
      });
      result.incomeTaxPercent = 100;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 3: Business meals → 50% income tax, 100% VAT
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.category === 'meals') {
    if (input.incomeTaxPercent !== 50) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: 50,
        rule: 'Business meals: 50% income tax deductibility',
        severity: 'error',
        legalReference: '§20 EStG (Repräsentationsaufwendungen)',
      });
      result.incomeTaxPercent = 50;
    }
    
    // VAT is 100% recoverable for meals (unless Kleinunternehmer)
    if (situation.vatStatus !== 'kleinunternehmer' && input.vatRecoverable !== true) {
      violations.push({
        field: 'vatRecoverable',
        llmValue: input.vatRecoverable,
        correctedValue: true,
        rule: 'Business meals: 100% VAT recovery (despite 50% EST)',
        severity: 'warning',
      });
      result.vatRecoverable = true;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 4: Business gifts → €40 limit for VAT recovery (2025)
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.category === 'gifts') {
    const GIFT_VAT_LIMIT_CENTS = 40_00; // €40
    
    if (input.amountCents && input.amountCents > GIFT_VAT_LIMIT_CENTS) {
      if (input.vatRecoverable === true) {
        violations.push({
          field: 'vatRecoverable',
          llmValue: true,
          correctedValue: false,
          rule: `Business gifts over €40: no VAT recovery`,
          severity: 'error',
          legalReference: '§12 Abs 2 Z 2 lit a UStG',
        });
        result.vatRecoverable = false;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 5: 'none' category → 0% deductibility
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.category === 'none') {
    if (input.incomeTaxPercent !== 0) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: 0,
        rule: 'Non-deductible category: 0% income tax',
        severity: 'error',
      });
      result.incomeTaxPercent = 0;
    }
    if (input.vatRecoverable !== false) {
      violations.push({
        field: 'vatRecoverable',
        llmValue: input.vatRecoverable,
        correctedValue: false,
        rule: 'Non-deductible category: no VAT recovery',
        severity: 'error',
      });
      result.vatRecoverable = false;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 6: 'full' category → 100% deductibility
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.category === 'full') {
    if (input.incomeTaxPercent !== 100) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: 100,
        rule: 'Full category: 100% income tax deductible',
        severity: 'warning',
      });
      result.incomeTaxPercent = 100;
    }
    // VAT depends on Kleinunternehmer status (already handled in Rule 1)
    if (situation.vatStatus !== 'kleinunternehmer' && input.vatRecoverable !== true) {
      violations.push({
        field: 'vatRecoverable',
        llmValue: input.vatRecoverable,
        correctedValue: true,
        rule: 'Full category: VAT recoverable',
        severity: 'warning',
      });
      result.vatRecoverable = true;
    }
  }
  
  return {
    classification: result,
    violations,
    wasModified: violations.length > 0,
  };
}
```

---

## Layer 3: Cross-Validation with Vendor Database

### Implementation: `src/lib/cross-validate.ts`

```typescript
import { findVendor, KNOWN_VENDORS } from './vendors.js';

export interface CrossValidationResult {
  match: 'agree' | 'disagree' | 'unknown_vendor';
  llmCategory: DeductibleCategory;
  vendorDbCategory: DeductibleCategory | null;
  vendorName: string | null;
  confidence: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}

/**
 * Compare LLM classification against vendor database.
 * Flag disagreements for review.
 */
export function crossValidateWithVendorDb(
  llmCategory: DeductibleCategory,
  senderDomain: string | null,
  subject: string,
  body: string
): CrossValidationResult {
  const vendorMatch = findVendor(senderDomain, subject, body);
  
  if (!vendorMatch) {
    return {
      match: 'unknown_vendor',
      llmCategory,
      vendorDbCategory: null,
      vendorName: null,
      confidence: 'low',
    };
  }
  
  const vendorCategory = vendorMatch.deductibleCategory;
  
  if (llmCategory === vendorCategory) {
    return {
      match: 'agree',
      llmCategory,
      vendorDbCategory: vendorCategory,
      vendorName: vendorMatch.name,
      confidence: 'high',
    };
  }
  
  // Disagreement - analyze severity
  const isMinorDisagreement = 
    (llmCategory === 'full' && vendorCategory === 'partial') ||
    (llmCategory === 'partial' && vendorCategory === 'full');
  
  const isPersonalVsBusinessConflict =
    (llmCategory === 'none' && vendorCategory !== 'none' && vendorCategory !== 'unclear') ||
    (vendorCategory === 'none' && llmCategory !== 'none' && llmCategory !== 'unclear');
  
  return {
    match: 'disagree',
    llmCategory,
    vendorDbCategory: vendorCategory,
    vendorName: vendorMatch.name,
    confidence: isPersonalVsBusinessConflict ? 'low' : 'medium',
    suggestedAction: isPersonalVsBusinessConflict
      ? `⚠️ Personal/business conflict: LLM says "${llmCategory}", vendor DB says "${vendorCategory}"`
      : `Minor disagreement: LLM says "${llmCategory}", vendor DB says "${vendorCategory}"`,
  };
}
```

---

## Layer 4: Anomaly Detection

### Implementation: `src/lib/anomaly-detection.ts`

```typescript
export interface AnomalyFlag {
  type: 'high_amount_personal' | 'new_vendor_suspicious' | 'category_change' | 'unusual_vat';
  severity: 'warning' | 'review_required';
  message: string;
  context: Record<string, unknown>;
}

export interface AnomalyCheckResult {
  flags: AnomalyFlag[];
  requiresReview: boolean;
}

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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 1: High-amount personal expense
  // ═══════════════════════════════════════════════════════════════════════════
  const HIGH_AMOUNT_THRESHOLD = 200_00; // €200
  
  if (
    classification.category === 'none' && 
    classification.amountCents && 
    classification.amountCents > HIGH_AMOUNT_THRESHOLD
  ) {
    flags.push({
      type: 'high_amount_personal',
      severity: 'review_required',
      message: `High-value item (€${(classification.amountCents / 100).toFixed(2)}) classified as personal. Verify this is correct.`,
      context: {
        amount: classification.amountCents,
        vendor: classification.vendorProduct,
      },
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 2: New vendor with "full" deductibility and high amount
  // ═══════════════════════════════════════════════════════════════════════════
  const vendorHistory = getVendorHistory(account, senderDomain);
  const FIRST_TIME_HIGH_THRESHOLD = 500_00; // €500
  
  if (
    vendorHistory.invoiceCount === 0 &&
    classification.category === 'full' &&
    classification.amountCents &&
    classification.amountCents > FIRST_TIME_HIGH_THRESHOLD
  ) {
    flags.push({
      type: 'new_vendor_suspicious',
      severity: 'warning',
      message: `First invoice from this vendor with high value (€${(classification.amountCents / 100).toFixed(2)}). Consider verifying business purpose.`,
      context: {
        vendor: senderDomain,
        amount: classification.amountCents,
      },
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY 3: Category change for recurring vendor
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    vendorHistory.invoiceCount > 0 &&
    vendorHistory.lastCategory &&
    vendorHistory.lastCategory !== classification.category &&
    vendorHistory.lastCategory !== 'unclear'
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
  const NO_VAT_PATTERNS = [
    /insurance|versicherung/i,
    /bank.*fee|bankgebühr/i,
    /rent|miete/i,
    /medical|arzt|apotheke/i,
  ];
  
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
      },
    });
  }
  
  return {
    flags,
    requiresReview: flags.some(f => f.severity === 'review_required'),
  };
}

interface VendorHistory {
  invoiceCount: number;
  lastCategory: DeductibleCategory | null;
  totalAmountCents: number;
}

function getVendorHistory(account: string, senderDomain: string | null): VendorHistory {
  if (!senderDomain) {
    return { invoiceCount: 0, lastCategory: null, totalAmountCents: 0 };
  }
  
  const db = getDatabase(account);
  const result = db.prepare(`
    SELECT 
      COUNT(*) as count,
      MAX(deductible) as last_category,
      SUM(amount_cents) as total
    FROM emails
    WHERE sender_domain = ?
      AND status IN ('extracted', 'reviewed', 'filed')
  `).get(senderDomain) as { count: number; last_category: string | null; total: number | null };
  
  return {
    invoiceCount: result.count,
    lastCategory: result.last_category as DeductibleCategory | null,
    totalAmountCents: result.total || 0,
  };
}
```

---

## Derived Rules from Austrian Tax Law

### Hardcoded Legal Rules (Cannot Be Overridden)

| Rule | Source | Implementation |
|------|--------|----------------|
| Kleinunternehmer = no VAT recovery | §6 Abs 1 Z 27 UStG | `situation.vatStatus === 'kleinunternehmer' → vatRecoverable = false` |
| PKW expenses = no VAT recovery | §12 Abs 2 Z 2 UStG | `category === 'vehicle' && carType !== 'electric' → vatRecoverable = false` |
| Meals = 50% EST, 100% VAT | §20 EStG | `category === 'meals' → incomeTaxPercent = 50, vatRecoverable = true` |
| Gifts > €40 = no VAT recovery | §12 Abs 2 Z 2 lit a UStG | `category === 'gifts' && amount > 4000 → vatRecoverable = false` |
| 10% allocation minimum | Austrian tax law | If allocating <10% to a source, must be 0% |

### Vendor Pattern Rules (Second Opinion)

| Pattern | Expected Category | Override LLM? |
|---------|-------------------|---------------|
| Netflix, Spotify, Disney+ | `none` | Yes, if LLM says otherwise |
| Fuel stations (OMV, Shell, BP) | `vehicle` | Yes |
| GitHub, AWS, JetBrains | `full` | Warning only |
| A1, Magenta, Drei | `telecom` | Warning only |
| Restaurant, Gasthaus | `meals` | Warning only |
| Supermarket (Billa, Spar, Hofer) | `none` | Yes |

---

## Integration: Classification Pipeline

```typescript
// src/lib/classify.ts

import { enforceAustrianLegalConstraints } from './legal-constraints.js';
import { crossValidateWithVendorDb } from './cross-validate.js';
import { checkForAnomalies } from './anomaly-detection.js';

export async function classifyAndValidate(
  email: Email,
  llmResult: EmailClassificationResult,
  situation: Situation,
  account: string
): Promise<ValidatedClassification> {
  // Layer 1: Schema validation (already done by AI module)
  
  // Layer 2: Legal constraint enforcement
  const legalResult = enforceAustrianLegalConstraints({
    category: llmResult.deductible || 'unclear',
    incomeTaxPercent: llmResult.income_tax_percent ?? null,
    vatRecoverable: llmResult.vat_recoverable ?? null,
    amountCents: parseAmount(llmResult.amount),
  }, situation);
  
  // Layer 3: Cross-validation with vendor DB
  const crossValidation = crossValidateWithVendorDb(
    legalResult.classification.category,
    email.sender_domain,
    email.subject || '',
    email.snippet || ''
  );
  
  // Layer 4: Anomaly detection
  const anomalyCheck = checkForAnomalies({
    category: legalResult.classification.category,
    amountCents: parseAmount(llmResult.amount),
    vendorProduct: llmResult.vendor_product || null,
    vatRecoverable: legalResult.classification.vatRecoverable,
  }, account, email.sender_domain);
  
  // Determine final status
  const needsReview = 
    legalResult.violations.some(v => v.severity === 'error') ||
    crossValidation.match === 'disagree' && crossValidation.confidence === 'low' ||
    anomalyCheck.requiresReview;
  
  return {
    // Final classification (after legal enforcement)
    category: legalResult.classification.category,
    incomeTaxPercent: legalResult.classification.incomeTaxPercent,
    vatRecoverable: legalResult.classification.vatRecoverable,
    
    // Metadata
    llmOriginal: {
      category: llmResult.deductible,
      incomeTaxPercent: llmResult.income_tax_percent,
      vatRecoverable: llmResult.vat_recoverable,
    },
    legalViolations: legalResult.violations,
    crossValidation,
    anomalies: anomalyCheck.flags,
    
    // Status
    needsReview,
    reviewReasons: [
      ...legalResult.violations.filter(v => v.severity === 'error').map(v => v.rule),
      ...(crossValidation.suggestedAction ? [crossValidation.suggestedAction] : []),
      ...anomalyCheck.flags.filter(f => f.severity === 'review_required').map(f => f.message),
    ],
  };
}
```

---

## CLI Output: Showing Violations

```
$ kraxler run

Classifying 47 invoices...

✓ JetBrains - IntelliJ IDEA (€149.00)
  Category: full (100% EST, VAT recoverable)

⚠️ OMV Tankstelle (€65.00)
  Category: vehicle (100% EST, NO VAT recovery)
  └─ Legal: Vehicle (PKW) expenses: no VAT recovery unless electric
     (LLM claimed VAT recoverable - corrected)

⚠️ Netflix (€15.99)
  Category: none (0% EST, no VAT)
  └─ Vendor DB disagrees: LLM said "full", vendor DB says "none"
     Forced to "none" (known personal service)

🔍 MediaMarkt (€899.00)
  Category: unclear - NEEDS REVIEW
  └─ High-value item from mixed-use vendor
  └─ First invoice from this sender

Summary:
  ✓ 42 invoices classified
  ⚠️ 3 invoices corrected (legal enforcement)
  🔍 2 invoices need review
```

---

## Implementation Order

1. **Create `src/lib/legal-constraints.ts`** - Hardcoded Austrian rules
2. **Create `src/lib/cross-validate.ts`** - Vendor DB comparison
3. **Create `src/lib/anomaly-detection.ts`** - Pattern detection
4. **Update `src/commands/extract.ts`** - Integrate pipeline
5. **Add review_reasons column to emails table**
6. **Update CLI output** - Show violations clearly
7. **Add tests** - Test each layer independently

---

## Testing Strategy

### Unit Tests for Legal Constraints

```typescript
describe('enforceAustrianLegalConstraints', () => {
  it('should disable VAT for Kleinunternehmer', () => {
    const result = enforceAustrianLegalConstraints(
      { category: 'full', incomeTaxPercent: 100, vatRecoverable: true },
      { vatStatus: 'kleinunternehmer', /* ... */ }
    );
    expect(result.classification.vatRecoverable).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].legalReference).toBe('§6 Abs 1 Z 27 UStG');
  });
  
  it('should disable VAT for ICE vehicle expenses', () => {
    const result = enforceAustrianLegalConstraints(
      { category: 'vehicle', vatRecoverable: true },
      { hasCompanyCar: true, companyCarType: 'ice' }
    );
    expect(result.classification.vatRecoverable).toBe(false);
  });
  
  it('should allow VAT for electric vehicle expenses', () => {
    const result = enforceAustrianLegalConstraints(
      { category: 'vehicle', vatRecoverable: true },
      { hasCompanyCar: true, companyCarType: 'electric', vatStatus: 'regelbesteuert' }
    );
    expect(result.classification.vatRecoverable).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
  
  it('should enforce 50% EST for meals', () => {
    const result = enforceAustrianLegalConstraints(
      { category: 'meals', incomeTaxPercent: 100 },
      { vatStatus: 'regelbesteuert' }
    );
    expect(result.classification.incomeTaxPercent).toBe(50);
  });
});
```

---

## Future Enhancements

1. **Machine Learning Feedback Loop**: Use corrected classifications to improve prompts
2. **Vendor DB Auto-Update**: Learn from user corrections
3. **Steuerberater Export**: Include violation log for tax advisor review
4. **Multi-Jurisdiction Support**: Abstract rules per country (AT, DE, CH)
