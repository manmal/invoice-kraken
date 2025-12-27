/**
 * Cross-Validation with Vendor Database
 * 
 * Compares LLM classifications against the known vendor database
 * to detect potential errors and disagreements.
 */

import type { DeductibleCategory } from '../types.js';
import { findVendor, KNOWN_VENDORS } from './vendors.js';

// ============================================================================
// Types
// ============================================================================

export interface CrossValidationResult {
  match: 'agree' | 'disagree' | 'unknown_vendor';
  llmCategory: DeductibleCategory;
  vendorDbCategory: DeductibleCategory | null;
  vendorName: string | null;
  confidence: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}

// Personal service domains that should NEVER be classified as business
const PERSONAL_SERVICES = new Set([
  'netflix.com',
  'spotify.com',
  'disneyplus.com',
  'hbomax.com',
  'primevideo.com',
  'apple.com/tv', // Apple TV+
  'tinder.com',
  'bumble.com',
  'fitinn.at',
  'mcfit.com',
  'johnreed.fitness',
]);

// Business service domains that should ALWAYS be classified as business
const BUSINESS_SERVICES = new Set([
  'github.com',
  'gitlab.com',
  'anthropic.com',
  'openai.com',
  'aws.amazon.com',
  'cloud.google.com',
  'azure.microsoft.com',
  'jetbrains.com',
  'figma.com',
  '1password.com',
  'notion.so',
  'linear.app',
  'slack.com',
  'zoom.us',
]);

// ============================================================================
// Cross-Validation
// ============================================================================

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
    // Check hardcoded lists first
    if (senderDomain) {
      const domainLower = senderDomain.toLowerCase();
      
      // Check personal services
      if (PERSONAL_SERVICES.has(domainLower) || 
          Array.from(PERSONAL_SERVICES).some(ps => domainLower.includes(ps.split('.')[0]))) {
        if (llmCategory !== 'none') {
          return {
            match: 'disagree',
            llmCategory,
            vendorDbCategory: 'none',
            vendorName: domainLower,
            confidence: 'low',
            suggestedAction: `⚠️ Personal service detected: LLM says "${llmCategory}", should be "none"`,
          };
        }
      }
      
      // Check business services
      if (BUSINESS_SERVICES.has(domainLower) ||
          Array.from(BUSINESS_SERVICES).some(bs => domainLower.includes(bs.split('.')[0]))) {
        if (llmCategory === 'none') {
          return {
            match: 'disagree',
            llmCategory,
            vendorDbCategory: 'full',
            vendorName: domainLower,
            confidence: 'low',
            suggestedAction: `⚠️ Business service detected: LLM says "none", should be "full"`,
          };
        }
      }
    }
    
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

/**
 * Check if a vendor should be forced to a specific category.
 * Returns null if no forcing is needed.
 */
export function getForceOverride(
  senderDomain: string | null,
  subject: string,
  _body: string
): { category: DeductibleCategory; reason: string } | null {
  if (!senderDomain) return null;
  
  const domainLower = senderDomain.toLowerCase();
  
  // Force personal services to 'none'
  if (PERSONAL_SERVICES.has(domainLower)) {
    return {
      category: 'none',
      reason: `Known personal service: ${domainLower}`,
    };
  }
  
  // Check for streaming services in subject
  const streamingPatterns = [
    /netflix/i,
    /spotify\s*(premium|family)?/i,
    /disney\+?/i,
    /hbo\s*max/i,
    /prime\s*video/i,
    /apple\s*(tv\+?|music)/i,
  ];
  
  for (const pattern of streamingPatterns) {
    if (pattern.test(subject)) {
      return {
        category: 'none',
        reason: `Streaming/entertainment service detected in subject`,
      };
    }
  }
  
  // Force supermarket/grocery to 'none'
  const groceryPatterns = [
    /billa|spar|hofer|lidl|aldi|penny|merkur|interspar/i,
  ];
  
  for (const pattern of groceryPatterns) {
    if (pattern.test(subject) || pattern.test(senderDomain)) {
      return {
        category: 'none',
        reason: `Supermarket/grocery detected`,
      };
    }
  }
  
  return null;
}

/**
 * Get statistics about vendor database coverage.
 */
export function getVendorDbStats(): {
  totalVendors: number;
  byCategory: Record<DeductibleCategory, number>;
} {
  const byCategory: Record<DeductibleCategory, number> = {
    full: 0,
    vehicle: 0,
    meals: 0,
    telecom: 0,
    gifts: 0,
    partial: 0,
    none: 0,
    unclear: 0,
  };
  
  let total = 0;
  
  for (const [category, vendors] of Object.entries(KNOWN_VENDORS)) {
    byCategory[category as DeductibleCategory] = vendors.length;
    total += vendors.length;
  }
  
  return {
    totalVendors: total,
    byCategory,
  };
}
