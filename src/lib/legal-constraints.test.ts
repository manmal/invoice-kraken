import { describe, it, expect } from 'vitest';
import { 
  enforceAustrianLegalConstraints, 
  enforceGermanLegalConstraints,
  enforceLegalConstraints,
} from './legal-constraints.js';
import type { Situation } from './jurisdictions/interface.js';

// Helper to create a mock situation
function createSituation(overrides: Partial<Situation> = {}): Situation {
  return {
    id: 1,
    from: '2024-01-01',
    to: null,
    jurisdiction: 'AT',
    vatStatus: 'regelbesteuert',
    hasCompanyCar: false,
    companyCarType: null,
    companyCarName: null,
    carBusinessPercent: 0,
    telecomBusinessPercent: 50,
    internetBusinessPercent: 50,
    homeOffice: 'none',
    ...overrides,
  };
}

describe('Austrian Legal Constraints', () => {
  describe('Kleinunternehmer VAT Rule', () => {
    it('should disable VAT recovery for Kleinunternehmer', () => {
      const situation = createSituation({ vatStatus: 'kleinunternehmer' });
      const result = enforceAustrianLegalConstraints(
        { category: 'full', incomeTaxPercent: 100, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].legalReference).toBe('§6 Abs 1 Z 27 UStG');
      expect(result.wasModified).toBe(true);
    });
    
    it('should not modify if already false', () => {
      const situation = createSituation({ vatStatus: 'kleinunternehmer' });
      const result = enforceAustrianLegalConstraints(
        { category: 'full', incomeTaxPercent: 100, vatRecoverable: false },
        situation
      );
      
      expect(result.violations).toHaveLength(0);
      expect(result.wasModified).toBe(false);
    });
  });
  
  describe('Vehicle VAT Rule', () => {
    it('should disable VAT for vehicle expenses without electric car', () => {
      const situation = createSituation({ 
        hasCompanyCar: true, 
        companyCarType: 'ice' 
      });
      const result = enforceAustrianLegalConstraints(
        { category: 'vehicle', incomeTaxPercent: 100, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(false);
      expect(result.violations[0].rule).toContain('ICE/Hybrid');
    });
    
    it('should allow VAT for electric vehicle expenses', () => {
      const situation = createSituation({ 
        hasCompanyCar: true, 
        companyCarType: 'electric',
        vatStatus: 'regelbesteuert',
      });
      const result = enforceAustrianLegalConstraints(
        { category: 'vehicle', incomeTaxPercent: 100, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
    
    it('should still disable VAT for electric if Kleinunternehmer', () => {
      const situation = createSituation({ 
        hasCompanyCar: true, 
        companyCarType: 'electric',
        vatStatus: 'kleinunternehmer',
      });
      const result = enforceAustrianLegalConstraints(
        { category: 'vehicle', incomeTaxPercent: 100, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(false);
    });
    
    it('should enforce 100% income tax for vehicle expenses', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'vehicle', incomeTaxPercent: 50, vatRecoverable: false },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(100);
    });
  });
  
  describe('Meals Rule', () => {
    it('should enforce 50% income tax for meals', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'meals', incomeTaxPercent: 100, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(50);
      expect(result.violations[0].legalReference).toBe('§20 EStG (Repräsentationsaufwendungen)');
    });
    
    it('should allow 100% VAT recovery for meals', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'meals', incomeTaxPercent: 50, vatRecoverable: false },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(true);
    });
    
    it('should not allow VAT for meals if Kleinunternehmer', () => {
      const situation = createSituation({ vatStatus: 'kleinunternehmer' });
      const result = enforceAustrianLegalConstraints(
        { category: 'meals', incomeTaxPercent: 50, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(false);
    });
  });
  
  describe('Gifts Rule', () => {
    it('should disable VAT for gifts over €40', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'gifts', incomeTaxPercent: 100, vatRecoverable: true, amountCents: 50_00 },
        situation
      );
      
      expect(result.classification.vatRecoverable).toBe(false);
      expect(result.violations[0].rule).toContain('€40');
    });
    
    it('should allow VAT for gifts under €40', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'gifts', incomeTaxPercent: 100, vatRecoverable: true, amountCents: 30_00 },
        situation
      );
      
      expect(result.violations).toHaveLength(0);
    });
  });
  
  describe('None Category', () => {
    it('should enforce 0% for non-deductible category', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'none', incomeTaxPercent: 50, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(0);
      expect(result.classification.vatRecoverable).toBe(false);
    });
  });
  
  describe('Full Category', () => {
    it('should enforce 100% for fully deductible category', () => {
      const situation = createSituation();
      const result = enforceAustrianLegalConstraints(
        { category: 'full', incomeTaxPercent: 50, vatRecoverable: false },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(100);
      expect(result.classification.vatRecoverable).toBe(true);
    });
  });
  
  describe('Telecom Category', () => {
    it('should use configured telecom percentage', () => {
      const situation = createSituation({ telecomBusinessPercent: 70 });
      const result = enforceAustrianLegalConstraints(
        { category: 'telecom', incomeTaxPercent: 50, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(70);
    });
  });
});

describe('German Legal Constraints', () => {
  describe('Meals Rule', () => {
    it('should enforce 70% for meals (German rule)', () => {
      const situation = createSituation({ jurisdiction: 'DE' });
      const result = enforceGermanLegalConstraints(
        { category: 'meals', incomeTaxPercent: 50, vatRecoverable: true },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(70);
    });
  });
  
  describe('Gifts Rule', () => {
    it('should disable deductibility for gifts over €35 (German rule)', () => {
      const situation = createSituation({ jurisdiction: 'DE' });
      const result = enforceGermanLegalConstraints(
        { category: 'gifts', incomeTaxPercent: 100, vatRecoverable: true, amountCents: 40_00 },
        situation
      );
      
      expect(result.classification.incomeTaxPercent).toBe(0);
    });
  });
});

describe('Jurisdiction Dispatcher', () => {
  it('should use Austrian rules for AT', () => {
    const situation = createSituation({ jurisdiction: 'AT' });
    const result = enforceLegalConstraints(
      { category: 'meals', incomeTaxPercent: 100, vatRecoverable: true },
      situation,
      'AT'
    );
    
    expect(result.classification.incomeTaxPercent).toBe(50); // AT rule
  });
  
  it('should use German rules for DE', () => {
    const situation = createSituation({ jurisdiction: 'DE' });
    const result = enforceLegalConstraints(
      { category: 'meals', incomeTaxPercent: 100, vatRecoverable: true },
      situation,
      'DE'
    );
    
    expect(result.classification.incomeTaxPercent).toBe(70); // DE rule
  });
});
