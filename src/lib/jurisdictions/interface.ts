/**
 * Tax Rules Interface
 * 
 * Defines the contract for jurisdiction-specific tax logic.
 * Each country (AT, DE, CH) implements this interface.
 */

import type { DeductibleCategory } from '../../types.js';

// ============================================================================
// Core Types
// ============================================================================

export interface Situation {
  id: number;
  from: string;                    // YYYY-MM-DD
  to: string | null;               // null = ongoing
  
  jurisdiction: string;            // 'AT', 'DE', 'CH'
  vatStatus: VatStatus;
  
  hasCompanyCar: boolean;
  companyCarType: CompanyCarType | null;
  companyCarName: string | null;
  carBusinessPercent: number;
  carListPrice?: number;           // Gross list price for 1% rule (cents)
  carCo2Emission?: number;         // g/km (relevant for DE tax breaks)
  
  telecomBusinessPercent: number;
  internetBusinessPercent: number;
  
  homeOffice: HomeOfficeType;
}

export type VatStatus = 'kleinunternehmer' | 'regelbesteuert';

export type CompanyCarType = 'ice' | 'electric' | 'hybrid_plugin' | 'hybrid';

export type HomeOfficeType = 'pauschale_gross' | 'pauschale_klein' | 'daily_rate' | 'actual' | 'none';

export type IncomeCategory = 
  | 'selbstaendige_arbeit'    // Self-employed (Freiberufler)
  | 'gewerbebetrieb'          // Trade/Business
  | 'nichtselbstaendige'      // Employment
  | 'vermietung'              // Rental
  | 'land_forstwirtschaft';   // Agriculture

export interface IncomeSource {
  id: string;                      // e.g., 'freelance_dev', 'rental_apt_1'
  name: string;                    // Display name
  category: IncomeCategory;
  validFrom: string;               // YYYY-MM-DD
  validTo: string | null;          // null = ongoing
  
  // Optional per-source overrides
  telecomPercentOverride?: number;
  internetPercentOverride?: number;
  vehiclePercentOverride?: number;
  
  notes?: string;
}

export type AllocationStrategy = 'exclusive' | 'split_fixed' | 'manual';

export interface AllocationRule {
  id: string;
  
  // Matching criteria (at least one required)
  vendorDomain?: string;
  vendorPattern?: string;          // Regex pattern
  deductibleCategory?: DeductibleCategory;
  minAmountCents?: number;
  
  strategy: AllocationStrategy;
  
  // Allocations (must sum to ≤100, each must be 0 or ≥10 for AT)
  allocations: Allocation[];
}

export interface Allocation {
  sourceId: string;
  percent: number;
}

// ============================================================================
// Result Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface VatRecoveryResult {
  recoverable: boolean;
  percent: number;                 // 0-100
  reason: string;
}

export interface IncomeTaxResult {
  percent: number;                 // 0-100
  reason: string;
}

export interface AllocationResult {
  allocations: Allocation[];
  source: AllocationSource;
  ruleId?: string;
  confidence: number;              // 0-1
  reason: string;
  alternativesConsidered?: string[];
}

export type AllocationSource = 
  | 'manual_override'
  | 'allocation_rule'
  | 'ai_suggestion'
  | 'category_default'
  | 'heuristic_single_source'
  | 'heuristic_vendor_history'
  | 'review_needed';

// ============================================================================
// Known Vendor Types
// ============================================================================

export interface KnownVendor {
  domain?: string;
  pattern?: RegExp;
  name: string;
  category: string;
  deductibleCategory: DeductibleCategory;
}

// ============================================================================
// Context Types
// ============================================================================

export interface TaxCalculationContext {
  amountCents?: number;
  invoiceDate?: string;
  vendorCategory?: string;
}

export interface ImputedIncomeResult {
  amountCents: number;
  reason: string;
}

// ============================================================================
// Tax Rules Interface
// ============================================================================

/**
 * Interface for jurisdiction-specific tax rules.
 * Each country implements this to provide localized tax logic.
 */
export interface TaxRules {
  /** Jurisdiction code (e.g., 'AT', 'DE', 'CH') */
  readonly jurisdiction: string;
  
  /** Human-readable jurisdiction name */
  readonly jurisdictionName: string;
  
  // =========================================================================
  // Validation
  // =========================================================================
  
  /**
   * Validate allocation percentages according to jurisdiction rules.
   * E.g., Austrian 10% rule requires allocations to be 0 or ≥10%.
   */
  validateAllocations(allocations: Allocation[]): ValidationError[];
  
  /**
   * Validate a situation configuration.
   */
  validateSituation(situation: Situation): ValidationError[];
  
  /**
   * Validate an income source configuration.
   */
  validateIncomeSource(source: IncomeSource): ValidationError[];
  
  // =========================================================================
  // Tax Calculations
  // =========================================================================
  
  /**
   * Calculate VAT recovery for a deductibility category.
   * Takes into account Kleinunternehmer status, vehicle type, etc.
   */
  calculateVatRecovery(
    category: DeductibleCategory,
    situation: Situation,
    context?: TaxCalculationContext
  ): VatRecoveryResult;
  
  /**
   * Calculate income tax deductibility percentage.
   * E.g., meals = 50%, full = 100%, etc.
   */
  calculateIncomeTaxPercent(
    category: DeductibleCategory,
    situation: Situation,
    context?: TaxCalculationContext
  ): IncomeTaxResult;

  /**
   * Calculate imputed income (phantom income) for a given period.
   * E.g. 1% rule for company cars in DE.
   */
  calculateImputedIncome(
    situation: Situation,
    year: number,
    month: number
  ): ImputedIncomeResult;
  
  // =========================================================================
  // Defaults & Constants
  // =========================================================================
  
  /**
   * Get fixed percentages for categories (e.g., meals always 50% in AT).
   */
  getFixedPercentages(): Record<DeductibleCategory, number | null>;
  
  /**
   * Get the default income category for a known vendor.
   * E.g., JetBrains → 'selbstaendige_arbeit' or 'gewerbebetrieb'
   */
  getDefaultIncomeCategory(vendor: KnownVendor): IncomeCategory | null;
  
  /**
   * Get home office deduction amount for the given type.
   */
  getHomeOfficeDeduction(type: HomeOfficeType): number;
  
  /**
   * Get the Kleinunternehmer revenue threshold.
   */
  getKleinunternehmerThreshold(): number;
  
  // =========================================================================
  // Display & AI Prompts
  // =========================================================================
  
  /**
   * Get localized labels for income categories.
   */
  getIncomeCategoryLabels(): Record<IncomeCategory, string>;
  
  /**
   * Get localized labels for VAT status.
   */
  getVatStatusLabels(): Record<VatStatus, string>;
  
  /**
   * Get localized labels for home office types.
   */
  getHomeOfficeLabels(): Record<HomeOfficeType, string>;

  /**
   * Get jurisdiction-specific instructions for AI prompt.
   * This allows the AI to understand tax rules without hardcoding them in the prompt builder.
   */
  getPromptInstructions(situation: Situation): string;
}