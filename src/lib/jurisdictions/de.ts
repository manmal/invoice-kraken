/**
 * German Tax Rules Implementation
 * 
 * Implements TaxRules interface for German Einzelunternehmer (sole proprietors).
 * Based on EStG and UStG as of 2025.
 * 
 * Key German rules:
 * - Kleinunternehmer: Revenue prev year ≤ 25k AND curr year ≤ 100k
 * - Business Meals: 70% Income Tax, 100% VAT (if proper invoice)
 * - Gifts: < 35 EUR = 100% deducible, > 35 EUR = 0% deductible.
 * - Home Office: €6/day (max €1260) -> 'daily_rate'
 * - Vehicle: 1% Rule (Phantom Income) often used if >50% business use.
 */

import type {
  TaxRules,
  Situation,
  IncomeSource,
  Allocation,
  ValidationError,
  VatRecoveryResult,
  IncomeTaxResult,
  KnownVendor,
  IncomeCategory,
  VatStatus,
  HomeOfficeType,
  TaxCalculationContext,
  ImputedIncomeResult,
} from './interface.js';
import type { DeductibleCategory } from '../../types.js';

// ============================================================================
// Constants
// ============================================================================

/** Kleinunternehmer threshold in cents (Curr Year) */
const KLEINUNTERNEHMER_THRESHOLD_CURR_YEAR_CENTS = 100_000_00;

/** Home office Pauschale amounts in cents */
const HOME_OFFICE_PAUSCHALE = {
  pauschale_gross: 0,         // AT specific
  pauschale_klein: 0,         // AT specific
  actual: 0,                  // Variable
  none: 0,
  daily_rate: 6_00,           // €6 per day (up to 210 days)
};

const GIFT_LIMIT_CENTS = 35_00;

/** Fixed income tax percentages by category */
const FIXED_INCOME_TAX_PERCENT: Record<DeductibleCategory, number | null> = {
  full: 100,
  vehicle: 100,      // Usually 100% booked, then private use added back as income
  meals: 70,         // 70% Fixed by law
  telecom: null,     // Variable
  partial: null,     // Variable
  gifts: null,       // Depends on amount (<35€)
  none: 0,
  unclear: null,
};

// ============================================================================
// German Tax Rules Implementation
// ============================================================================

export const germanTaxRules: TaxRules = {
  jurisdiction: 'DE',
  jurisdictionName: 'Germany',

  // ===========================================================================
  // Validation
  // ===========================================================================

  validateAllocations(allocations: Allocation[]): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Check total doesn't exceed 100%
    const total = allocations.reduce((sum, a) => sum + a.percent, 0);
    if (total > 100) {
      errors.push({
        field: 'allocations',
        message: `Total allocation is ${total}%, cannot exceed 100%`,
        code: 'ALLOCATION_EXCEEDS_100',
      });
    }
    
    // No specific 10% rule in DE like in AT, but allocations should be positive
    for (const alloc of allocations) {
      if (alloc.percent < 0 || alloc.percent > 100) {
        errors.push({
          field: `allocations.${alloc.sourceId}`,
          message: `Allocation must be between 0% and 100%, got ${alloc.percent}%`,
          code: 'INVALID_PERCENT',
        });
      }
    }
    
    return errors;
  },

  validateSituation(situation: Situation): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Basic date validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(situation.from)) {
      errors.push({ field: 'from', message: 'Invalid format', code: 'INVALID_DATE' });
    }

    // Validate Home Office Type (Must be DE compatible)
    if (situation.homeOffice === 'pauschale_gross' || situation.homeOffice === 'pauschale_klein') {
      errors.push({
        field: 'homeOffice',
        message: 'Home Office type "pauschale_gross/klein" is Austria-specific. Use "daily_rate" or "actual" for Germany.',
        code: 'INVALID_HOME_OFFICE_TYPE',
      });
    }

    // Validate Car Config
    if (situation.hasCompanyCar) {
        if (!situation.carListPrice && situation.carBusinessPercent > 50) {
            // Warn/Error about missing list price for 1% rule?
            // Optional, but good practice.
            // Leaving as valid for now to avoid breaking simple setups.
        }
    }

    return errors;
  },

  validateIncomeSource(source: IncomeSource): ValidationError[] {
    // Standard validation
    const errors: ValidationError[] = [];
    if (!source.name) errors.push({ field: 'name', message: 'Required', code: 'MISSING_NAME' });

    // DE Restriction: Self-employment/Business only
    if (source.category === 'nichtselbstaendige') {
      errors.push({
        field: 'category',
        message: 'German module currently only supports Self-Employment (Freiberufler) or Business (Gewerbe). Employment income (Nichtselbständige Arbeit) is not supported.',
        code: 'DE_EMPLOYMENT_NOT_SUPPORTED',
      });
    }

    return errors;
  },

  // ===========================================================================
  // Tax Calculations
  // ===========================================================================

  calculateVatRecovery(
    category: DeductibleCategory,
    situation: Situation,
    context?: TaxCalculationContext
  ): VatRecoveryResult {
    // Kleinunternehmer: no VAT recovery
    if (situation.vatStatus === 'kleinunternehmer') {
      return {
        recoverable: false,
        percent: 0,
        reason: 'Kleinunternehmer (§19 UStG) - no VAT recovery',
      };
    }
    
    // Non-deductible
    if (category === 'none') {
      return { recoverable: false, percent: 0, reason: 'Personal expense' };
    }
    
    // Vehicle: If in business assets (>50% use or opted in), usually 100% input VAT
    // Then private use is taxed as output VAT.
    if (category === 'vehicle') {
        if (situation.hasCompanyCar) {
            return {
                recoverable: true,
                percent: 100, 
                reason: 'Company Car (Business Asset) - 100% Input VAT (Private use taxed as Output VAT)',
            };
        } else {
            // Private car used for business? No input VAT usually, just mileage allowance (Income Tax).
            return {
                recoverable: false,
                percent: 0,
                reason: 'Private car - Mileage allowance only (no VAT recovery)',
            };
        }
    }

    // Meals: 100% VAT recoverable (even if 70% income tax)
    if (category === 'meals') {
        return {
            recoverable: true,
            percent: 100,
            reason: 'Business meals - 100% VAT recovery (§15 UStG)',
        };
    }

    // Gifts
    if (category === 'gifts') {
        // If > 35 EUR, NO VAT recovery (§15 Abs 1a UStG)
        if (context?.amountCents && context.amountCents > GIFT_LIMIT_CENTS) {
            return {
                recoverable: false,
                percent: 0,
                reason: 'Gift > 35€ - No VAT recovery (§15 Abs 1a UStG)',
            };
        }
        return {
            recoverable: true,
            percent: 100,
            reason: 'Gift <= 35€ - Full VAT recovery',
        };
    }

    // Telecom
    if (category === 'telecom') {
        return {
            recoverable: true,
            percent: situation.telecomBusinessPercent,
            reason: `Telecom - ${situation.telecomBusinessPercent}% business use`,
        };
    }

    return {
        recoverable: true,
        percent: 100,
        reason: 'Business expense',
    };
  },

  calculateIncomeTaxPercent(
    category: DeductibleCategory,
    situation: Situation,
    context?: TaxCalculationContext
  ): IncomeTaxResult {
    switch (category) {
      case 'full':
        return { percent: 100, reason: 'Fully deductible' };
      
      case 'meals':
        return { percent: 70, reason: 'Business meals - 70% deductible (§4 Abs 5 EStG)' };
        
      case 'gifts':
        if (context?.amountCents && context.amountCents > GIFT_LIMIT_CENTS) {
            return { percent: 0, reason: 'Gift > 35€ - Non-deductible (§4 Abs 5 EStG)' };
        }
        return { percent: 100, reason: 'Gift <= 35€ - Fully deductible' };

      case 'vehicle':
        if (situation.hasCompanyCar) {
            // If 1% rule is used, we deduct 100% of expenses here,
            // and add imputed income separately.
            return { percent: 100, reason: 'Company Car - 100% Expense (Private use taxed via 1% rule)' };
        } else {
            // Private car
            return { percent: 0, reason: 'Private car - Use Mileage Allowance (0.30€/km) instead of actual costs' };
        }

      case 'telecom':
        return { percent: situation.telecomBusinessPercent, reason: 'Business portion' };
        
      case 'none':
        return { percent: 0, reason: 'Personal' };

      default:
        return { percent: 0, reason: 'Unknown' };
    }
  },

  calculateImputedIncome(
    situation: Situation,
    _year: number,
    _month: number
  ): ImputedIncomeResult {
      if (situation.hasCompanyCar && situation.carListPrice) {
          // 1% Rule
          const monthlyAmount = Math.round(situation.carListPrice * 0.01);
          return {
              amountCents: monthlyAmount,
              reason: '1% Rule (Private Use of Company Car)',
          };
      }
      return { amountCents: 0, reason: 'No imputed income' };
  },

  // ===========================================================================
  // Defaults & Constants
  // ===========================================================================

  getFixedPercentages(): Record<DeductibleCategory, number | null> {
    return { ...FIXED_INCOME_TAX_PERCENT };
  },

  getDefaultIncomeCategory(vendor: KnownVendor): IncomeCategory | null {
    const softwareCategories = ['Software', 'Dev Tools', 'Cloud', 'AI Services', 'Hosting'];
    if (softwareCategories.includes(vendor.category)) {
      return 'selbstaendige_arbeit'; // Freiberufler usually
    }
    return null;
  },

  getHomeOfficeDeduction(type: HomeOfficeType): number {
    return HOME_OFFICE_PAUSCHALE[type] || 0;
  },

  getKleinunternehmerThreshold(): number {
    // This simple getter is insufficient for DE's 2-tier system.
    // It returns the "current year" hard cap for safety.
    return KLEINUNTERNEHMER_THRESHOLD_CURR_YEAR_CENTS;
  },

  // ===========================================================================
  // Display Labels
  // ===========================================================================

  getIncomeCategoryLabels(): Record<IncomeCategory, string> {
    return {
      selbstaendige_arbeit: 'Selbständige Arbeit (Freiberufler)',
      gewerbebetrieb: 'Gewerbebetrieb',
      nichtselbstaendige: 'Nichtselbständige Arbeit',
      vermietung: 'Vermietung und Verpachtung',
      land_forstwirtschaft: 'Land- und Forstwirtschaft',
    };
  },

  getVatStatusLabels(): Record<VatStatus, string> {
    return {
      kleinunternehmer: 'Kleinunternehmer (§19 UStG)',
      regelbesteuert: 'Regelbesteuert',
    };
  },

  getHomeOfficeLabels(): Record<HomeOfficeType, string> {
    return {
      daily_rate: 'Tagespauschale (€6/Tag)',
      actual: 'Tatsächliche Kosten (Arbeitszimmer)',
      pauschale_gross: 'N/A (AT Only)',
      pauschale_klein: 'N/A (AT Only)',
      none: 'Kein Home Office',
    };
  },

  // ===========================================================================
  // AI Prompt Instructions
  // ===========================================================================

  getPromptInstructions(situation: Situation): string {
    const telecomPercent = situation.telecomBusinessPercent;
    
    return `
   IMPORTANT GERMAN TAX RULES (2025):
   - Income Tax (EStG) and VAT (UStG) often differ!
   - Kleinunternehmer: Revenue prev year <= 25k, curr <= 100k. If yes, NO VAT recovery.
   
   Categories:
   - full: 100% deductible + VAT recovery (if not Kleinunternehmer).
     * Software, Hardware, Professional Services.
   
   - meals: 70% Income Tax deductible, but 100% VAT recovery.
     * Business meals (Bewirtung).
   
   - gifts: 
     * < 35 EUR: 100% Deductible + VAT recovery.
     * > 35 EUR: 0% Deductible + NO VAT recovery.
   
   - vehicle:
     ${situation.hasCompanyCar 
       ? '* Company Car: 100% Expenses booked. Private use taxed via 1% method (Phantom Income).' 
       : '* Private Car: Use Mileage Allowance (0.30€/km). Actual costs NOT deductible.'}
   
   - telecom: ${telecomPercent}% Business Use.
    `;
  }
};

export default germanTaxRules;
