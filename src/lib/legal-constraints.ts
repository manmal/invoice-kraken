/**
 * Legal Constraint Enforcement
 * 
 * Enforces tax law constraints that MUST be applied regardless of LLM output.
 * These are hardcoded rules derived from Austrian tax law.
 */

import type { DeductibleCategory } from '../types.js';
import type { Situation } from './jurisdictions/interface.js';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Austrian Legal Constraints
// ============================================================================

/**
 * Enforce Austrian legal constraints on a classification.
 * These rules OVERRIDE LLM output when it violates tax law.
 * 
 * @param input - The classification from LLM or vendor DB
 * @param situation - The tax situation for the invoice date
 * @returns Corrected classification with list of violations
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
        rule: situation.hasCompanyCar && situation.companyCarType !== 'electric'
          ? 'ICE/Hybrid vehicle: no VAT recovery (Austrian rule)'
          : 'Vehicle expenses: no VAT recovery unless electric',
        severity: 'error',
        legalReference: '§12 Abs 2 Z 2 UStG',
      });
      result.vatRecoverable = false;
    }
    
    // Income tax is 100% of business portion
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
      if (input.vatRecoverable === true && situation.vatStatus !== 'kleinunternehmer') {
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
    if (input.incomeTaxPercent !== 0 && input.incomeTaxPercent !== null) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: 0,
        rule: 'Non-deductible category: 0% income tax',
        severity: 'error',
      });
      result.incomeTaxPercent = 0;
    }
    if (input.vatRecoverable !== false && input.vatRecoverable !== null) {
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
    if (input.incomeTaxPercent !== 100 && input.incomeTaxPercent !== null) {
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 7: Telecom → Configured percentage
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.category === 'telecom') {
    const expectedPercent = situation.telecomBusinessPercent;
    
    if (input.incomeTaxPercent !== expectedPercent && input.incomeTaxPercent !== null) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: expectedPercent,
        rule: `Telecom: ${expectedPercent}% business use (per config)`,
        severity: 'warning',
      });
      result.incomeTaxPercent = expectedPercent;
    }
  }
  
  return {
    classification: result,
    violations,
    wasModified: violations.length > 0,
  };
}

// ============================================================================
// German Legal Constraints (for future use)
// ============================================================================

/**
 * Enforce German legal constraints.
 * Different rules apply in Germany.
 */
export function enforceGermanLegalConstraints(
  input: ClassificationInput,
  situation: Situation
): ConstraintResult {
  const violations: ConstraintViolation[] = [];
  const result = { ...input };
  
  // Kleinunternehmer rule (§19 UStG)
  if (situation.vatStatus === 'kleinunternehmer' && input.vatRecoverable === true) {
    violations.push({
      field: 'vatRecoverable',
      llmValue: true,
      correctedValue: false,
      rule: 'Kleinunternehmer: no VAT recovery (§19 UStG)',
      severity: 'error',
      legalReference: '§19 UStG',
    });
    result.vatRecoverable = false;
  }
  
  // German meals: 70% EST (different from AT!)
  if (input.category === 'meals') {
    if (input.incomeTaxPercent !== 70) {
      violations.push({
        field: 'incomeTaxPercent',
        llmValue: input.incomeTaxPercent,
        correctedValue: 70,
        rule: 'Business meals (Germany): 70% income tax deductible',
        severity: 'warning',
        legalReference: '§4 Abs 5 Nr 2 EStG',
      });
      result.incomeTaxPercent = 70;
    }
  }
  
  // German gifts: €35 limit (different from AT's €40)
  if (input.category === 'gifts') {
    const GIFT_LIMIT_CENTS_DE = 35_00; // €35
    
    if (input.amountCents && input.amountCents > GIFT_LIMIT_CENTS_DE) {
      if (input.incomeTaxPercent !== 0) {
        violations.push({
          field: 'incomeTaxPercent',
          llmValue: input.incomeTaxPercent,
          correctedValue: 0,
          rule: `Business gifts over €35: not deductible (Germany)`,
          severity: 'error',
          legalReference: '§4 Abs 5 Nr 1 EStG',
        });
        result.incomeTaxPercent = 0;
      }
    }
  }
  
  return {
    classification: result,
    violations,
    wasModified: violations.length > 0,
  };
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Enforce legal constraints based on jurisdiction.
 */
export function enforceLegalConstraints(
  input: ClassificationInput,
  situation: Situation,
  jurisdiction: string = 'AT'
): ConstraintResult {
  switch (jurisdiction.toUpperCase()) {
    case 'AT':
      return enforceAustrianLegalConstraints(input, situation);
    case 'DE':
      return enforceGermanLegalConstraints(input, situation);
    default:
      // Default to Austrian rules
      return enforceAustrianLegalConstraints(input, situation);
  }
}
