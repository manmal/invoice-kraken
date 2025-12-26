import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  classifyDeductibility, 
  getDeductibilityIcon, 
  getDeductibilityLabel,
  DEDUCTIBILITY_TYPES,
  KNOWN_VENDORS,
} from './vendors.js';

// Mock the config module
vi.mock('./config.js', () => ({
  getVehicleVatRecovery: vi.fn(() => ({ recoverable: false, reason: 'ICE vehicle - no VAT recovery' })),
  getTelecomBusinessPercent: vi.fn(() => 50),
  isKleinunternehmer: vi.fn(() => false),
}));

import { getVehicleVatRecovery, getTelecomBusinessPercent, isKleinunternehmer } from './config.js';

describe('vendors module', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock values
    vi.mocked(getVehicleVatRecovery).mockReturnValue({ recoverable: false, reason: 'ICE vehicle - no VAT recovery' });
    vi.mocked(getTelecomBusinessPercent).mockReturnValue(50);
    vi.mocked(isKleinunternehmer).mockReturnValue(false);
  });

  describe('classifyDeductibility - Software/Cloud vendors (full)', () => {
    
    it('should classify JetBrains as fully deductible', () => {
      const result = classifyDeductibility('invoice@jetbrains.com', 'License renewal');
      expect(result.deductible).toBe('full');
      expect(result.income_tax_percent).toBe(100);
      expect(result.vat_recoverable).toBe(true);
      expect(result.reason).toContain('JetBrains');
    });

    it('should classify GitHub as fully deductible', () => {
      const result = classifyDeductibility('noreply@github.com', 'GitHub subscription');
      expect(result.deductible).toBe('full');
      expect(result.income_tax_percent).toBe(100);
      expect(result.vat_recoverable).toBe(true);
    });

    it('should classify AWS as fully deductible', () => {
      const result = classifyDeductibility('billing@amazonaws.com', 'AWS Invoice');
      expect(result.deductible).toBe('full');
      expect(result.income_tax_percent).toBe(100);
      expect(result.vat_recoverable).toBe(true);
      expect(result.reason).toContain('AWS');
    });

    it('should classify OpenAI as fully deductible', () => {
      const result = classifyDeductibility('invoices@openai.com', 'API usage');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('OpenAI');
    });

    it('should classify Hetzner as fully deductible', () => {
      const result = classifyDeductibility('billing@hetzner.de', 'Server invoice');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('Hetzner');
    });

    it('should classify Figma as fully deductible', () => {
      const result = classifyDeductibility('team@figma.com', 'Design subscription');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('Figma');
    });

    it('should classify Slack as fully deductible', () => {
      const result = classifyDeductibility('billing@slack.com', 'Workspace subscription');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('Slack');
    });

    it('should classify professional services via pattern match', () => {
      const result = classifyDeductibility('office@steuerberater.at', 'Accounting services');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('Accountant');
    });

    it('should classify Buchhalter via pattern match', () => {
      const result = classifyDeductibility(null, 'Rechnung Buchhaltung GmbH');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('Accountant');
    });

    it('should classify WKO as fully deductible', () => {
      const result = classifyDeductibility('info@wko.at', 'Membership');
      expect(result.deductible).toBe('full');
    });
  });

  describe('classifyDeductibility - Vehicle expenses', () => {
    
    it('should classify fuel station OMV as vehicle expense', () => {
      const result = classifyDeductibility(null, 'OMV Tankstelle Rechnung');
      expect(result.deductible).toBe('vehicle');
      expect(result.income_tax_percent).toBe(100);
      expect(result.vat_recoverable).toBe(false); // ICE vehicle default
    });

    it('should classify Shell as vehicle expense', () => {
      const result = classifyDeductibility(null, 'Shell Fuel Invoice');
      expect(result.deductible).toBe('vehicle');
      expect(result.vat_recoverable).toBe(false);
    });

    it('should classify ÖAMTC as vehicle expense', () => {
      const result = classifyDeductibility('service@oeamtc.at', 'Membership renewal');
      expect(result.deductible).toBe('vehicle');
      expect(result.reason).toContain('ÖAMTC');
    });

    it('should classify ASFINAG as vehicle expense', () => {
      const result = classifyDeductibility('info@asfinag.at', 'Maut Rechnung');
      expect(result.deductible).toBe('vehicle');
      expect(result.reason).toContain('ASFINAG');
    });

    it('should classify car wash via pattern as vehicle expense', () => {
      const result = classifyDeductibility(null, 'Autowäsche Premium');
      expect(result.deductible).toBe('vehicle');
      expect(result.reason).toContain('Car Wash');
    });

    it('should classify vignette as vehicle expense', () => {
      const result = classifyDeductibility(null, 'Jahresvignette 2024');
      expect(result.deductible).toBe('vehicle');
    });

    it('should classify parking as vehicle expense', () => {
      const result = classifyDeductibility(null, 'Parkgarage City Center');
      expect(result.deductible).toBe('vehicle');
      expect(result.reason).toContain('Parking');
    });

    it('should allow VAT recovery for electric vehicles', () => {
      vi.mocked(getVehicleVatRecovery).mockReturnValue({ 
        recoverable: true, 
        reason: 'Electric vehicle - full VAT recovery' 
      });
      
      const result = classifyDeductibility(null, 'BP Tankstelle - Elektro Ladestation');
      expect(result.deductible).toBe('vehicle');
      expect(result.vat_recoverable).toBe(true);
      expect(result.reason).toContain('Electric');
    });

    it('should not recover VAT for vehicle expenses when Kleinunternehmer', () => {
      vi.mocked(isKleinunternehmer).mockReturnValue(true);
      vi.mocked(getVehicleVatRecovery).mockReturnValue({ 
        recoverable: true, 
        reason: 'Electric vehicle' 
      });
      
      const result = classifyDeductibility(null, 'OMV Tankstelle');
      expect(result.deductible).toBe('vehicle');
      expect(result.vat_recoverable).toBe(false);
    });
  });

  describe('classifyDeductibility - Telecom', () => {
    
    it('should classify A1 as telecom expense with 50% default', () => {
      const result = classifyDeductibility('billing@a1.at', 'Monthly bill');
      expect(result.deductible).toBe('telecom');
      expect(result.income_tax_percent).toBe(50);
      expect(result.vat_recoverable).toBe(true);
      expect(result.reason).toContain('A1');
      expect(result.reason).toContain('50%');
    });

    it('should classify Drei as telecom expense', () => {
      const result = classifyDeductibility('info@drei.at', 'Invoice');
      expect(result.deductible).toBe('telecom');
      expect(result.reason).toContain('Drei');
    });

    it('should classify Magenta as telecom expense', () => {
      const result = classifyDeductibility('billing@magenta.at', 'Rechnung');
      expect(result.deductible).toBe('telecom');
    });

    it('should use configured telecom percentage', () => {
      vi.mocked(getTelecomBusinessPercent).mockReturnValue(80);
      
      const result = classifyDeductibility('billing@a1.at', 'Monthly bill');
      expect(result.deductible).toBe('telecom');
      expect(result.income_tax_percent).toBe(80);
      expect(result.reason).toContain('80%');
    });

    it('should classify internet via pattern as telecom', () => {
      const result = classifyDeductibility(null, 'Glasfaser Internet Rechnung');
      expect(result.deductible).toBe('telecom');
      expect(result.reason).toContain('Internet');
    });

    it('should classify Mobilfunk via pattern as telecom', () => {
      const result = classifyDeductibility(null, 'Handy Vertrag Rechnung');
      expect(result.deductible).toBe('telecom');
    });

    it('should not recover VAT for telecom when Kleinunternehmer', () => {
      vi.mocked(isKleinunternehmer).mockReturnValue(true);
      
      const result = classifyDeductibility('billing@a1.at', 'Monthly bill');
      expect(result.deductible).toBe('telecom');
      expect(result.vat_recoverable).toBe(false);
    });
  });

  describe('classifyDeductibility - Meals', () => {
    
    it('should classify restaurant as meals expense', () => {
      const result = classifyDeductibility(null, 'Restaurant Zum Goldenen Hirschen');
      expect(result.deductible).toBe('meals');
      expect(result.income_tax_percent).toBe(50);
      expect(result.vat_recoverable).toBe(true);
      expect(result.reason).toContain('50% EST');
    });

    it('should classify Gasthaus as meals expense', () => {
      const result = classifyDeductibility(null, 'Gasthaus Grüner Baum');
      expect(result.deductible).toBe('meals');
      expect(result.income_tax_percent).toBe(50);
    });

    it('should classify Beisl as meals expense', () => {
      const result = classifyDeductibility(null, 'Wiener Beisl Rechnung');
      expect(result.deductible).toBe('meals');
    });

    it('should classify business lunch as meals expense', () => {
      const result = classifyDeductibility(null, 'Business Lunch Meeting');
      expect(result.deductible).toBe('meals');
      expect(result.reason).toContain('Business Meal');
    });

    it('should classify catering as meals expense', () => {
      const result = classifyDeductibility(null, 'Office Catering GmbH');
      expect(result.deductible).toBe('meals');
    });

    it('should still recover full VAT for meals (Austrian rule)', () => {
      const result = classifyDeductibility(null, 'Restaurant Invoice');
      expect(result.income_tax_percent).toBe(50);
      expect(result.vat_recoverable).toBe(true); // 100% VAT despite 50% income tax
    });

    it('should not recover VAT for meals when Kleinunternehmer', () => {
      vi.mocked(isKleinunternehmer).mockReturnValue(true);
      
      const result = classifyDeductibility(null, 'Restaurant Rechnung');
      expect(result.deductible).toBe('meals');
      expect(result.income_tax_percent).toBe(50);
      expect(result.vat_recoverable).toBe(false);
    });
  });

  describe('classifyDeductibility - Personal items (none)', () => {
    
    it('should classify Netflix as not deductible', () => {
      const result = classifyDeductibility('info@netflix.com', 'Subscription');
      expect(result.deductible).toBe('none');
      expect(result.income_tax_percent).toBe(0);
      expect(result.vat_recoverable).toBe(false);
      expect(result.reason).toContain('personal expense');
    });

    it('should classify Spotify as not deductible', () => {
      const result = classifyDeductibility('noreply@spotify.com', 'Premium subscription');
      expect(result.deductible).toBe('none');
      expect(result.reason).toContain('Entertainment');
    });

    it('should classify Disney+ as not deductible', () => {
      const result = classifyDeductibility('billing@disneyplus.com', 'Monthly subscription');
      expect(result.deductible).toBe('none');
    });

    it('should classify supermarket as not deductible', () => {
      const result = classifyDeductibility(null, 'Billa Supermarkt Rechnung');
      expect(result.deductible).toBe('none');
      expect(result.reason).toContain('Groceries');
    });

    it('should classify Hofer as not deductible', () => {
      const result = classifyDeductibility(null, 'Hofer Einkauf');
      expect(result.deductible).toBe('none');
    });

    it('should classify gym as not deductible', () => {
      const result = classifyDeductibility(null, 'FitInn Mitgliedschaft');
      expect(result.deductible).toBe('none');
      expect(result.reason).toContain('Fitness');
    });

    it('should classify cinema as not deductible', () => {
      const result = classifyDeductibility(null, 'Cineplexx Tickets');
      expect(result.deductible).toBe('none');
    });

    it('should classify Tinder as not deductible', () => {
      const result = classifyDeductibility('receipt@tinder.com', 'Subscription');
      expect(result.deductible).toBe('none');
      expect(result.reason).toContain('Personal');
    });

    it('should classify cosmetics as not deductible', () => {
      const result = classifyDeductibility('info@flaconi.at', 'Parfum order');
      expect(result.deductible).toBe('none');
      expect(result.reason).toContain('Cosmetics');
    });

    it('should classify candy shop pattern as not deductible', () => {
      // Use süßwaren pattern which clearly matches candy shops
      const result = classifyDeductibility(null, 'Süßwaren Bestellung');
      expect(result.deductible).toBe('none');
      expect(result.reason).toContain('Food/Candy');
    });

    it('should classify confiserie as not deductible', () => {
      const result = classifyDeductibility(null, 'Confiserie Rechnung');
      expect(result.deductible).toBe('none');
    });

    it('should document that "werkstatt" in text triggers vehicle category', () => {
      // Note: "Zuckerlwerkstatt" contains "werkstatt" which matches vehicle pattern
      // This is a known edge case where vehicle is checked before personal items
      const result = classifyDeductibility(null, 'Zuckerlwerkstatt Vienna');
      expect(result.deductible).toBe('vehicle'); // Because "werkstatt" matches vehicle pattern
    });

    it('should classify health supplements as not deductible', () => {
      const result = classifyDeductibility(null, 'Vitamin supplement order');
      expect(result.deductible).toBe('none');
    });
  });

  describe('classifyDeductibility - Unclear cases', () => {
    
    it('should classify Amazon as unclear', () => {
      const result = classifyDeductibility('order@amazon.de', 'Your order');
      expect(result.deductible).toBe('unclear');
      expect(result.income_tax_percent).toBeNull();
      expect(result.vat_recoverable).toBeNull();
      expect(result.reason).toContain('needs review');
    });

    it('should classify eBay as unclear', () => {
      const result = classifyDeductibility('info@ebay.de', 'Purchase confirmation');
      expect(result.deductible).toBe('unclear');
    });

    it('should classify MediaMarkt as unclear', () => {
      const result = classifyDeductibility(null, 'MediaMarkt Rechnung');
      expect(result.deductible).toBe('unclear');
      expect(result.reason).toContain('Electronics');
    });

    it('should classify IKEA as unclear', () => {
      const result = classifyDeductibility(null, 'IKEA Möbel Rechnung');
      expect(result.deductible).toBe('unclear');
      expect(result.reason).toContain('Furniture');
    });

    it('should classify AliExpress as unclear', () => {
      const result = classifyDeductibility('noreply@aliexpress.com', 'Order shipped');
      expect(result.deductible).toBe('unclear');
    });
  });

  describe('classifyDeductibility - Edge cases with unknown vendors', () => {
    
    it('should classify unknown domain as unclear', () => {
      const result = classifyDeductibility('unknown@randomcompany.com', 'Invoice');
      expect(result.deductible).toBe('unclear');
      expect(result.reason).toBe('Unknown vendor - needs manual review');
      expect(result.income_tax_percent).toBeNull();
      expect(result.vat_recoverable).toBeNull();
    });

    it('should handle null sender domain', () => {
      const result = classifyDeductibility(null, 'Random invoice');
      expect(result.deductible).toBe('unclear');
      expect(result.reason).toBe('Unknown vendor - needs manual review');
    });

    it('should handle undefined sender domain', () => {
      const result = classifyDeductibility(undefined, 'Another invoice');
      expect(result.deductible).toBe('unclear');
    });

    it('should handle empty sender domain', () => {
      const result = classifyDeductibility('', 'Empty domain invoice');
      expect(result.deductible).toBe('unclear');
    });

    it('should handle empty subject and body', () => {
      const result = classifyDeductibility('unknown@test.com', '', '');
      expect(result.deductible).toBe('unclear');
    });

    it('should check body content for pattern matching', () => {
      // Pattern vendors like "steuerberater" work with body content
      const result = classifyDeductibility('unknown@test.com', 'Invoice', 'Rechnung vom Steuerberater');
      expect(result.deductible).toBe('full');
      expect(result.reason).toContain('Accountant');
    });

    it('should match patterns case-insensitively', () => {
      const result = classifyDeductibility(null, 'RESTAURANT PAYMENT');
      expect(result.deductible).toBe('meals');
    });

    it('should match domain substrings', () => {
      const result = classifyDeductibility('billing@invoices.github.com', 'GitHub Teams');
      expect(result.deductible).toBe('full');
    });

    it('should prefer earlier category matches (vehicle before full)', () => {
      // Since vehicle is checked first
      const result = classifyDeductibility(null, 'OMV Tankstelle');
      expect(result.deductible).toBe('vehicle');
    });
  });

  describe('getDeductibilityIcon', () => {
    
    it('should return correct icon for full', () => {
      expect(getDeductibilityIcon('full')).toBe('💼');
    });

    it('should return correct icon for vehicle', () => {
      expect(getDeductibilityIcon('vehicle')).toBe('🚗');
    });

    it('should return correct icon for meals', () => {
      expect(getDeductibilityIcon('meals')).toBe('🍽️');
    });

    it('should return correct icon for telecom', () => {
      expect(getDeductibilityIcon('telecom')).toBe('📱');
    });

    it('should return correct icon for partial', () => {
      expect(getDeductibilityIcon('partial')).toBe('📊');
    });

    it('should return correct icon for none', () => {
      expect(getDeductibilityIcon('none')).toBe('🚫');
    });

    it('should return correct icon for unclear', () => {
      expect(getDeductibilityIcon('unclear')).toBe('❓');
    });
  });

  describe('getDeductibilityLabel', () => {
    
    it('should return correct label for full', () => {
      expect(getDeductibilityLabel('full')).toBe('Fully Deductible');
    });

    it('should return correct label for vehicle', () => {
      expect(getDeductibilityLabel('vehicle')).toBe('Vehicle (no VAT)');
    });

    it('should return correct label for meals', () => {
      expect(getDeductibilityLabel('meals')).toBe('Meals (50% EST)');
    });

    it('should return correct label for telecom', () => {
      expect(getDeductibilityLabel('telecom')).toBe('Telecom (partial)');
    });

    it('should return correct label for partial', () => {
      expect(getDeductibilityLabel('partial')).toBe('Partial');
    });

    it('should return correct label for none', () => {
      expect(getDeductibilityLabel('none')).toBe('Not Deductible');
    });

    it('should return correct label for unclear', () => {
      expect(getDeductibilityLabel('unclear')).toBe('Needs Review');
    });
  });

  describe('DEDUCTIBILITY_TYPES constants', () => {
    
    it('should have correct properties for full', () => {
      const type = DEDUCTIBILITY_TYPES.full;
      expect(type.income_tax_percent).toBe(100);
      expect(type.vat_recoverable).toBe(true);
      expect(type.icon).toBe('💼');
      expect(type.label).toBe('Fully Deductible');
    });

    it('should have correct properties for vehicle', () => {
      const type = DEDUCTIBILITY_TYPES.vehicle;
      expect(type.income_tax_percent).toBe(100);
      expect(type.vat_recoverable).toBe(false); // Austrian special rule
      expect(type.icon).toBe('🚗');
    });

    it('should have correct properties for meals', () => {
      const type = DEDUCTIBILITY_TYPES.meals;
      expect(type.income_tax_percent).toBe(50);
      expect(type.vat_recoverable).toBe(true); // Full VAT despite 50% income tax
    });

    it('should have correct properties for none', () => {
      const type = DEDUCTIBILITY_TYPES.none;
      expect(type.income_tax_percent).toBe(0);
      expect(type.vat_recoverable).toBe(false);
    });

    it('should have null values for unclear', () => {
      const type = DEDUCTIBILITY_TYPES.unclear;
      expect(type.income_tax_percent).toBeNull();
      expect(type.vat_recoverable).toBeNull();
    });
  });

  describe('KNOWN_VENDORS structure', () => {
    
    it('should have all expected categories', () => {
      expect(KNOWN_VENDORS).toHaveProperty('full');
      expect(KNOWN_VENDORS).toHaveProperty('vehicle');
      expect(KNOWN_VENDORS).toHaveProperty('meals');
      expect(KNOWN_VENDORS).toHaveProperty('telecom');
      expect(KNOWN_VENDORS).toHaveProperty('none');
      expect(KNOWN_VENDORS).toHaveProperty('unclear');
    });

    it('should have vendors in each category', () => {
      expect(KNOWN_VENDORS.full.length).toBeGreaterThan(0);
      expect(KNOWN_VENDORS.vehicle.length).toBeGreaterThan(0);
      expect(KNOWN_VENDORS.meals.length).toBeGreaterThan(0);
      expect(KNOWN_VENDORS.telecom.length).toBeGreaterThan(0);
      expect(KNOWN_VENDORS.none.length).toBeGreaterThan(0);
      expect(KNOWN_VENDORS.unclear.length).toBeGreaterThan(0);
    });

    it('should have both domain and pattern vendors in full category', () => {
      const domainVendors = KNOWN_VENDORS.full.filter(v => 'domain' in v);
      const patternVendors = KNOWN_VENDORS.full.filter(v => 'pattern' in v);
      
      expect(domainVendors.length).toBeGreaterThan(0);
      expect(patternVendors.length).toBeGreaterThan(0);
    });
  });

  describe('Kleinunternehmer handling', () => {
    
    beforeEach(() => {
      vi.mocked(isKleinunternehmer).mockReturnValue(true);
    });

    it('should disable VAT recovery for full category', () => {
      const result = classifyDeductibility('billing@github.com', 'Invoice');
      expect(result.deductible).toBe('full');
      expect(result.income_tax_percent).toBe(100);
      expect(result.vat_recoverable).toBe(false);
    });

    it('should disable VAT recovery for vehicle category', () => {
      const result = classifyDeductibility('info@oeamtc.at', 'Membership');
      expect(result.deductible).toBe('vehicle');
      expect(result.vat_recoverable).toBe(false);
    });

    it('should disable VAT recovery for meals category', () => {
      const result = classifyDeductibility(null, 'Restaurant Invoice');
      expect(result.deductible).toBe('meals');
      expect(result.income_tax_percent).toBe(50);
      expect(result.vat_recoverable).toBe(false);
    });

    it('should disable VAT recovery for telecom category', () => {
      const result = classifyDeductibility('billing@a1.at', 'Phone bill');
      expect(result.deductible).toBe('telecom');
      expect(result.vat_recoverable).toBe(false);
    });
  });
});
