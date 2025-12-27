/**
 * Austrian Tax Rules Implementation
 * 
 * Implements TaxRules interface for Austrian Einzelunternehmer (sole proprietors).
 * Based on EStG and UStG as of 2025.
 * 
 * Key Austrian rules:
 * - Kleinunternehmer threshold: €55,000 gross (2025)
 * - Vehicle VAT: No recovery for PKW/Kombi, except electric (0g CO₂)
 * - Business meals: 50% income tax, 100% VAT
 * - 10% rule: Allocations must be 0% or ≥10%
 * - Home office Pauschale: €1,200 (no other workplace) or €300 (has other workplace)
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

/** Kleinunternehmer threshold in cents (€55,000 = 5,500,000 cents) */
const KLEINUNTERNEHMER_THRESHOLD_CENTS = 55_000_00;

/** Home office Pauschale amounts in cents */
const HOME_OFFICE_PAUSCHALE = {
  pauschale_gross: 1_200_00,  // €1,200 - no other workplace available
  pauschale_klein: 300_00,    // €300 - has other workplace
  actual: 0,                  // Actual costs (variable)
  none: 0,
  daily_rate: 0,              // Not applicable in AT (DE only)
};

/** Fixed income tax percentages by category */
const FIXED_INCOME_TAX_PERCENT: Record<DeductibleCategory, number | null> = {
  full: 100,
  vehicle: 100,      // 100% of business portion
  meals: 50,         // Fixed by law
  telecom: null,     // Configurable (typically 50%)
  partial: null,     // Variable
  gifts: 100,        // Deductible if ad purposes, not rep.
  none: 0,
  unclear: null,
};

// ============================================================================
// Austrian Tax Rules Implementation
// ============================================================================

export const austrianTaxRules: TaxRules = {
  jurisdiction: 'AT',
  jurisdictionName: 'Austria',

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
    
    // Austrian 10% rule: each allocation must be 0% or ≥10%
    for (const alloc of allocations) {
      if (alloc.percent > 0 && alloc.percent < 10) {
        errors.push({
          field: `allocations.${alloc.sourceId}`,
          message: `Allocation of ${alloc.percent}% violates Austrian 10% rule. Must be 0% or at least 10%.`,
          code: 'AT_10_PERCENT_RULE',
        });
      }
      
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
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(situation.from)) {
      errors.push({
        field: 'from',
        message: 'Start date must be in YYYY-MM-DD format',
        code: 'INVALID_DATE_FORMAT',
      });
    }
    
    if (situation.to && !/^\d{4}-\d{2}-\d{2}$/.test(situation.to)) {
      errors.push({
        field: 'to',
        message: 'End date must be in YYYY-MM-DD format',
        code: 'INVALID_DATE_FORMAT',
      });
    }
    
    // Validate date order
    if (situation.to && situation.from > situation.to) {
      errors.push({
        field: 'to',
        message: 'End date must be after start date',
        code: 'INVALID_DATE_RANGE',
      });
    }
    
    // Validate percentages (10% rule)
    const percentFields = [
      { field: 'carBusinessPercent', value: situation.carBusinessPercent },
      { field: 'telecomBusinessPercent', value: situation.telecomBusinessPercent },
      { field: 'internetBusinessPercent', value: situation.internetBusinessPercent },
    ];
    
    for (const { field, value } of percentFields) {
      if (value > 0 && value < 10) {
        errors.push({
          field,
          message: `${field} of ${value}% violates Austrian 10% rule. Must be 0% or at least 10%.`,
          code: 'AT_10_PERCENT_RULE',
        });
      }
      if (value < 0 || value > 100) {
        errors.push({
          field,
          message: `${field} must be between 0% and 100%`,
          code: 'INVALID_PERCENT',
        });
      }
    }
    
    // Validate car configuration
    if (situation.hasCompanyCar && !situation.companyCarType) {
      errors.push({
        field: 'companyCarType',
        message: 'Car type is required when hasCompanyCar is true',
        code: 'MISSING_CAR_TYPE',
      });
    }
    
    if (!situation.hasCompanyCar && situation.carBusinessPercent > 0) {
      errors.push({
        field: 'carBusinessPercent',
        message: 'Car business percent should be 0 when no company car',
        code: 'INVALID_CAR_CONFIG',
      });
    }
    
    // Validate Home Office Type (Must be AT compatible)
    if (situation.homeOffice === 'daily_rate') {
      errors.push({
        field: 'homeOffice',
        message: 'Home Office type "daily_rate" is not supported in Austria. Use "pauschale_gross" or "pauschale_klein".',
        code: 'INVALID_HOME_OFFICE_TYPE',
      });
    }

    return errors;
  },

  validateIncomeSource(source: IncomeSource): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Validate ID format (slug-like)
    if (!/^[a-z0-9_]+$/.test(source.id)) {
      errors.push({
        field: 'id',
        message: 'ID must contain only lowercase letters, numbers, and underscores',
        code: 'INVALID_ID_FORMAT',
      });
    }
    
    // Validate name
    if (!source.name || source.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Name is required',
        code: 'MISSING_NAME',
      });
    }
    
    // Validate dates
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.validFrom)) {
      errors.push({
        field: 'validFrom',
        message: 'Start date must be in YYYY-MM-DD format',
        code: 'INVALID_DATE_FORMAT',
      });
    }
    
    if (source.validTo && !/^\d{4}-\d{2}-\d{2}$/.test(source.validTo)) {
      errors.push({
        field: 'validTo',
        message: 'End date must be in YYYY-MM-DD format',
        code: 'INVALID_DATE_FORMAT',
      });
    }
    
    if (source.validTo && source.validFrom > source.validTo) {
      errors.push({
        field: 'validTo',
        message: 'End date must be after start date',
        code: 'INVALID_DATE_RANGE',
      });
    }
    
    // Validate percentage overrides (10% rule)
    const overrides = [
      { field: 'telecomPercentOverride', value: source.telecomPercentOverride },
      { field: 'internetPercentOverride', value: source.internetPercentOverride },
      { field: 'vehiclePercentOverride', value: source.vehiclePercentOverride },
    ];
    
    for (const { field, value } of overrides) {
      if (value !== undefined) {
        if (value > 0 && value < 10) {
          errors.push({
            field,
            message: `${field} of ${value}% violates Austrian 10% rule`,
            code: 'AT_10_PERCENT_RULE',
          });
        }
        if (value < 0 || value > 100) {
          errors.push({
            field,
            message: `${field} must be between 0% and 100%`,
            code: 'INVALID_PERCENT',
          });
        }
      }
    }
    
    return errors;
  },

  // ===========================================================================
  // Tax Calculations
  // ===========================================================================

  calculateVatRecovery(
    category: DeductibleCategory,
    situation: Situation,
    _context?: TaxCalculationContext
  ): VatRecoveryResult {
    // Kleinunternehmer: no VAT recovery at all
    if (situation.vatStatus === 'kleinunternehmer') {
      return {
        recoverable: false,
        percent: 0,
        reason: 'Kleinunternehmer - no VAT recovery allowed (§6 Abs 1 Z 27 UStG)',
      };
    }
    
    // Non-deductible: no VAT recovery
    if (category === 'none') {
      return {
        recoverable: false,
        percent: 0,
        reason: 'Personal expense - not deductible',
      };
    }
    
    // Unclear: cannot determine
    if (category === 'unclear') {
      return {
        recoverable: false,
        percent: 0,
        reason: 'Deductibility unclear - needs review',
      };
    }
    
    // Vehicle: special Austrian rules
    if (category === 'vehicle') {
      if (!situation.hasCompanyCar) {
        return {
          recoverable: false,
          percent: 0,
          reason: 'No company car configured',
        };
      }
      
      switch (situation.companyCarType) {
        case 'electric':
          return {
            recoverable: true,
            percent: 100,
            reason: 'Electric vehicle (0g CO₂) - full VAT recovery allowed',
          };
        case 'hybrid_plugin':
          return {
            recoverable: true,
            percent: 50,  // Simplified - should consult Steuerberater
            reason: 'Plug-in hybrid - partial VAT recovery (consult Steuerberater)',
          };
        case 'ice':
        case 'hybrid':
        default:
          return {
            recoverable: false,
            percent: 0,
            reason: 'PKW/Kombi - no VAT recovery in Austria (§12 Abs 2 Z 2b UStG)',
          };
      }
    }
    
    // Telecom: business portion only
    if (category === 'telecom') {
      return {
        recoverable: true,
        percent: situation.telecomBusinessPercent,
        reason: `Telecom - ${situation.telecomBusinessPercent}% business use`,
      };
    }
    
    // Meals: full VAT recovery (even though only 50% income tax!)
    if (category === 'meals') {
      return {
        recoverable: true,
        percent: 100,
        reason: 'Business meals - 100% VAT recovery (§12 UStG)',
      };
    }
    
    // Gifts: AT typically full VAT recovery if it's "Werbeaufwand" (ad expense)
    // Gifts for representation are non-deductible for VAT too usually.
    // Assuming 'gifts' category here means small ad gifts.
    if (category === 'gifts') {
      return {
        recoverable: true,
        percent: 100,
        reason: 'Gifts (Werbeaufwand) - full VAT recovery',
      };
    }

    // Full, partial: standard VAT recovery
    return {
      recoverable: true,
      percent: 100,
      reason: 'Business expense - full VAT recovery',
    };
  },

  calculateIncomeTaxPercent(
    category: DeductibleCategory,
    situation: Situation,
    _context?: TaxCalculationContext
  ): IncomeTaxResult {
    switch (category) {
      case 'full':
        return {
          percent: 100,
          reason: 'Fully deductible business expense',
        };
      
      case 'vehicle':
        return {
          percent: situation.carBusinessPercent,
          reason: `Vehicle expense - ${situation.carBusinessPercent}% business use`,
        };
      
      case 'meals':
        return {
          percent: 50,
          reason: 'Business meals - 50% deductible (§20 Abs 1 Z 3 EStG)',
        };
      
      case 'telecom':
        return {
          percent: situation.telecomBusinessPercent,
          reason: `Telecom - ${situation.telecomBusinessPercent}% business use`,
        };
      
      case 'gifts':
        // In Austria, gifts for advertising are deductible. 
        // Representation gifts are not. Assuming 'gifts' means ad gifts here.
        return {
            percent: 100,
            reason: 'Advertising gifts - 100% deductible',
        };

      case 'partial':
        // Partial is variable - use telecom as default proxy
        return {
          percent: 50,
          reason: 'Partially deductible - 50% default',
        };
      
      case 'none':
        return {
          percent: 0,
          reason: 'Personal expense - not deductible (§20 EStG)',
        };
      
      case 'unclear':
        return {
          percent: 0,
          reason: 'Deductibility unclear - needs review',
        };
      
      default:
        return {
          percent: 0,
          reason: 'Unknown category',
        };
    }
  },

  calculateImputedIncome(
    _situation: Situation,
    _year: number,
    _month: number
  ): ImputedIncomeResult {
    // Austria typically uses percentage deduction for cars, not 1% rule phantom income
    // (There is a specialized Sachbezug for employees, but for self-employed usually % is used).
    return {
        amountCents: 0,
        reason: 'Austria typically handles private use via expense reduction, not imputed income for sole proprietors.'
    };
  },

  // ===========================================================================
  // Defaults & Constants
  // ===========================================================================

  getFixedPercentages(): Record<DeductibleCategory, number | null> {
    return { ...FIXED_INCOME_TAX_PERCENT };
  },

  getDefaultIncomeCategory(vendor: KnownVendor): IncomeCategory | null {
    // Software/dev tools → typically self-employment or business
    const softwareCategories = ['Software', 'Dev Tools', 'Cloud', 'AI Services', 'Hosting'];
    if (softwareCategories.includes(vendor.category)) {
      return 'selbstaendige_arbeit';
    }
    
    // Building/property related → rental
    if (vendor.category.includes('Property') || vendor.category.includes('Building')) {
      return 'vermietung';
    }
    
    // Agriculture related
    if (vendor.category.includes('Agriculture') || vendor.category.includes('Farming')) {
      return 'land_forstwirtschaft';
    }
    
    return null;
  },

  getHomeOfficeDeduction(type: HomeOfficeType): number {
    return HOME_OFFICE_PAUSCHALE[type] || 0;
  },

  getKleinunternehmerThreshold(): number {
    return KLEINUNTERNEHMER_THRESHOLD_CENTS;
  },

  // ===========================================================================
  // Display Labels
  // ===========================================================================

  getIncomeCategoryLabels(): Record<IncomeCategory, string> {
    return {
      selbstaendige_arbeit: 'Selbständige Arbeit (Freiberufler)',
      gewerbebetrieb: 'Gewerbebetrieb (Unternehmen)',
      nichtselbstaendige: 'Nichtselbständige Arbeit (Angestellt)',
      vermietung: 'Vermietung und Verpachtung',
      land_forstwirtschaft: 'Land- und Forstwirtschaft',
    };
  },

  getVatStatusLabels(): Record<VatStatus, string> {
    return {
      kleinunternehmer: 'Kleinunternehmer (< €55k, keine USt)',
      regelbesteuert: 'Regelbesteuert (USt-pflichtig)',
    };
  },

  getHomeOfficeLabels(): Record<HomeOfficeType, string> {
    return {
      pauschale_gross: 'Pauschale €1.200/Jahr (kein anderer Arbeitsplatz)',
      pauschale_klein: 'Pauschale €300/Jahr (anderer Arbeitsplatz vorhanden)',
      actual: 'Tatsächliche Kosten (eigenes Arbeitszimmer)',
      daily_rate: 'Tagespauschale (Not valid in AT)',
      none: 'Kein Home Office',
    };
  },

  // ===========================================================================
  // AI Prompt Instructions
  // ===========================================================================

  getPromptInstructions(situation: Situation): string {
    const kleinunternehmer = situation.vatStatus === 'kleinunternehmer';
    const telecomPercent = situation.telecomBusinessPercent;
    
    // Calculate vehicle VAT status
    let vehicleVatReason = 'No company car';
    let vehicleVatRecoverable = false;
    
    if (situation.hasCompanyCar) {
      const vatResult = this.calculateVatRecovery('vehicle', situation);
      vehicleVatRecoverable = vatResult.recoverable;
      vehicleVatReason = vatResult.reason;
    }

    const vehicleContext = situation.hasCompanyCar
        ? `${vehicleVatReason}`
        : 'No company car';

    return `
   IMPORTANT AUSTRIAN TAX RULES:
   - Income Tax (EST) and VAT (Vorsteuer) deductibility are SEPARATE
   ${situation.hasCompanyCar ? `- Company car type: ${situation.companyCarType?.toUpperCase()}` : '- No company car'}
   - ${vehicleContext}
   - Business meals: 50% income tax, but 100% VAT recovery${kleinunternehmer ? ' (except Kleinunternehmer!)' : ''}
   
   Categories:
   - full: 100% income tax + ${kleinunternehmer ? 'NO' : '100%'} VAT recovery:
     * Software, cloud services, dev tools, hosting, domains
     * Professional services (accountant, legal)
     * Hardware for work (computers, monitors, keyboards)
     * Education (tech courses, books, conferences)
   
   - vehicle: 100% income tax, ${vehicleVatRecoverable ? 'WITH' : 'NO'} VAT recovery:
     * Fuel/petrol (Tankstelle: OMV, BP, Shell, etc.)
     * Car service/repair, car wash
     * Tolls (ASFINAG), Vignette
     * ÖAMTC, ARBÖ membership
     * Parking (business)
     * Car insurance
     ${vehicleVatRecoverable ? '* Electric vehicle = full VAT recovery!' : '* ICE/Hybrid = no VAT recovery (Austrian rule)'}
   
   - meals: 50% income tax, ${kleinunternehmer ? 'NO' : '100%'} VAT recovery:
     * Business meals with clients
     * Restaurant expenses for business purposes
   
   - telecom: ${telecomPercent}% for both EST and VAT:
     * Mobile phone (A1, Magenta, Drei, spusu, etc.)
     * Internet (${telecomPercent}% business use)

   - gifts: 100% deductible if advertising (small value).
   
   - none: Not deductible (personal):
     * Entertainment (Netflix, Spotify, streaming)
     * Groceries
     * Personal restaurants (not business meals)
     * Cosmetics, personal care
     * Health supplements
     * Candy/sweets shops
   
   - unclear: Needs manual review:
     * Amazon (could be business or personal)
     * General electronics stores (MediaMarkt, Saturn)
     * Mixed-use items
    `;
  }
};

export default austrianTaxRules;