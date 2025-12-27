/**
 * Jurisdiction Registry
 * 
 * Central registry for loading jurisdiction-specific tax rules.
 * Supports pluggable country implementations.
 */

import type { TaxRules } from './interface.js';
import { austrianTaxRules } from './at.js';
import { germanTaxRules } from './de.js';

// ============================================================================
// Registry
// ============================================================================

const jurisdictionRegistry: Map<string, TaxRules> = new Map();

// Register built-in jurisdictions
jurisdictionRegistry.set('AT', austrianTaxRules);
jurisdictionRegistry.set('DE', germanTaxRules);

// Future: Add more jurisdictions
// jurisdictionRegistry.set('CH', swissTaxRules);

// ============================================================================
// Public API
// ============================================================================

/**
 * Get tax rules for a jurisdiction.
 * @throws Error if jurisdiction is not supported.
 */
export function getTaxRules(jurisdiction: string): TaxRules {
  const rules = jurisdictionRegistry.get(jurisdiction.toUpperCase());
  if (!rules) {
    const supported = getSupportedJurisdictions();
    throw new Error(
      `Unsupported jurisdiction: ${jurisdiction}. ` +
      `Supported: ${supported.join(', ')}`
    );
  }
  return rules;
}

/**
 * Check if a jurisdiction is supported.
 */
export function isJurisdictionSupported(jurisdiction: string): boolean {
  return jurisdictionRegistry.has(jurisdiction.toUpperCase());
}

/**
 * Get list of supported jurisdiction codes.
 */
export function getSupportedJurisdictions(): string[] {
  return Array.from(jurisdictionRegistry.keys());
}

/**
 * Get jurisdiction info for display.
 */
export function getJurisdictionInfo(): Array<{ code: string; name: string; available: boolean }> {
  const allJurisdictions = [
    { code: 'AT', name: 'Austria', available: true },
    { code: 'DE', name: 'Germany', available: true },
    { code: 'CH', name: 'Switzerland', available: false },
  ];
  
  return allJurisdictions.map(j => ({
    ...j,
    available: jurisdictionRegistry.has(j.code),
  }));
}

/**
 * Register a custom jurisdiction (for testing or extensions).
 */
export function registerJurisdiction(code: string, rules: TaxRules): void {
  jurisdictionRegistry.set(code.toUpperCase(), rules);
}

/**
 * Unregister a jurisdiction (mainly for testing).
 */
export function unregisterJurisdiction(code: string): boolean {
  return jurisdictionRegistry.delete(code.toUpperCase());
}
