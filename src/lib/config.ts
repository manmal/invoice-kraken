/**
 * Configuration management for Kraxler
 * 
 * Handles loading, saving, and migrating configuration.
 * Supports both v1 (legacy) and v2 (situations/sources) formats.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConfigPath } from './paths.js';
import type { 
  KraxlerConfig, 
  LegacyKraxlerConfig,
  DeductibleCategory,
} from '../types.js';
import type {
  Situation,
  IncomeSource,
  VatStatus,
  CompanyCarType,
  HomeOfficeType,
} from './jurisdictions/interface.js';

// Note: These are functions, not constants, so they respect --workdir
function getConfigFile(): string {
  return getConfigPath();
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: KraxlerConfig = {
  version: 2,
  jurisdiction: 'AT',
  situations: [],
  incomeSources: [],
  allocationRules: [],
  categoryDefaults: {},
  accounts: [],
  setupCompleted: false,
  modelPreset: undefined,
  models: undefined,
};

// ============================================================================
// Config Cache
// ============================================================================

let cachedConfig: KraxlerConfig | null = null;

/**
 * Clear the config cache (useful for testing).
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Ensure config directory exists.
 */
function ensureConfigDir(): void {
  const configDir = path.dirname(getConfigFile());
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Load configuration from disk.
 * Automatically migrates v1 configs to v2.
 */
export function loadConfig(): KraxlerConfig {
  if (cachedConfig) return cachedConfig;
  
  ensureConfigDir();
  
  if (fs.existsSync(getConfigFile())) {
    try {
      const data = fs.readFileSync(getConfigFile(), 'utf-8');
      const parsed = JSON.parse(data);
      
      // Check version and migrate if needed
      if (isLegacyConfig(parsed)) {
        console.log('Migrating v1 config to v2 format...');
        cachedConfig = migrateV1ToV2(parsed);
        saveConfig(cachedConfig);
        console.log('Migration complete.');
      } else {
        cachedConfig = { ...DEFAULT_CONFIG, ...parsed } as KraxlerConfig;
      }
    } catch {
      console.error('Warning: Could not parse config file, using defaults');
      cachedConfig = { ...DEFAULT_CONFIG };
    }
  } else {
    cachedConfig = { ...DEFAULT_CONFIG };
  }
  
  return cachedConfig;
}

/**
 * Save configuration to disk.
 */
export function saveConfig(config: KraxlerConfig): void {
  ensureConfigDir();
  cachedConfig = config;
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2));
}

/**
 * Update specific config values.
 */
export function updateConfig(updates: Partial<KraxlerConfig>): KraxlerConfig {
  const config = loadConfig();
  const newConfig = { ...config, ...updates };
  saveConfig(newConfig);
  return newConfig;
}

// ============================================================================
// Version Detection & Migration
// ============================================================================

/**
 * Check if config is legacy v1 format.
 */
function isLegacyConfig(config: unknown): config is LegacyKraxlerConfig {
  if (typeof config !== 'object' || config === null) return false;
  const obj = config as Record<string, unknown>;
  
  // v1 has 'config_version' or 'tax_jurisdiction' without 'version: 2'
  return (
    ('config_version' in obj || 'tax_jurisdiction' in obj) &&
    obj.version !== 2
  );
}

/**
 * Migrate v1 config to v2 format.
 */
export function migrateV1ToV2(legacy: LegacyKraxlerConfig): KraxlerConfig {
  // Create a default situation from legacy settings
  const situation: Situation = {
    id: 1,
    from: '1970-01-01',  // Far past to cover all historical data
    to: null,            // Ongoing
    jurisdiction: legacy.tax_jurisdiction || 'AT',
    vatStatus: (legacy.is_kleinunternehmer ? 'kleinunternehmer' : 'regelbesteuert') as VatStatus,
    hasCompanyCar: legacy.has_company_car || false,
    companyCarType: legacy.company_car_type as CompanyCarType | null,
    companyCarName: null,
    carBusinessPercent: legacy.has_company_car ? 100 : 0,
    telecomBusinessPercent: legacy.telecom_business_percent || 50,
    internetBusinessPercent: legacy.internet_business_percent || 50,
    homeOffice: 'none' as HomeOfficeType,
  };
  
  // Create a default income source
  const defaultSource: IncomeSource = {
    id: 'default_business',
    name: 'Default Business',
    category: 'selbstaendige_arbeit',
    validFrom: '1970-01-01',
    validTo: null,
  };
  
  // Create category defaults pointing to the default source
  const categoryDefaults: Partial<Record<DeductibleCategory, string>> = {
    full: 'default_business',
    vehicle: 'default_business',
    meals: 'default_business',
    telecom: 'default_business',
    partial: 'default_business',
  };
  
  return {
    version: 2,
    jurisdiction: legacy.tax_jurisdiction || 'AT',
    situations: [situation],
    incomeSources: [defaultSource],
    allocationRules: [],
    categoryDefaults,
    accounts: legacy.accounts || [],
    setupCompleted: legacy.setup_completed || false,
    modelPreset: legacy.model_preset,
    models: legacy.models,
  };
}

// ============================================================================
// Setup Status
// ============================================================================

/**
 * Check if initial setup is needed.
 */
export function needsSetup(): boolean {
  const config = loadConfig();
  return !config.setupCompleted;
}

/**
 * Check if configuration is valid and complete.
 */
export function isConfigValid(): boolean {
  const config = loadConfig();
  return (
    config.setupCompleted &&
    config.situations.length > 0 &&
    config.incomeSources.length > 0
  );
}

// ============================================================================
// Situation Helpers
// ============================================================================

/**
 * Add a new situation to the config.
 */
export function addSituation(situation: Situation): KraxlerConfig {
  const config = loadConfig();
  
  // Find max ID
  const maxId = config.situations.reduce((max, s) => Math.max(max, s.id), 0);
  situation.id = maxId + 1;
  
  config.situations.push(situation);
  saveConfig(config);
  return config;
}

/**
 * Update an existing situation.
 */
export function updateSituation(id: number, updates: Partial<Situation>): KraxlerConfig {
  const config = loadConfig();
  const index = config.situations.findIndex(s => s.id === id);
  
  if (index === -1) {
    throw new Error(`Situation with id ${id} not found`);
  }
  
  config.situations[index] = { ...config.situations[index], ...updates };
  saveConfig(config);
  return config;
}

/**
 * Remove a situation.
 */
export function removeSituation(id: number): KraxlerConfig {
  const config = loadConfig();
  config.situations = config.situations.filter(s => s.id !== id);
  saveConfig(config);
  return config;
}

// ============================================================================
// Income Source Helpers
// ============================================================================

/**
 * Add a new income source to the config.
 */
export function addIncomeSource(source: IncomeSource): KraxlerConfig {
  const config = loadConfig();
  
  // Check for duplicate ID
  if (config.incomeSources.some(s => s.id === source.id)) {
    throw new Error(`Income source with id '${source.id}' already exists`);
  }
  
  config.incomeSources.push(source);
  saveConfig(config);
  return config;
}

/**
 * Update an existing income source.
 */
export function updateIncomeSource(id: string, updates: Partial<IncomeSource>): KraxlerConfig {
  const config = loadConfig();
  const index = config.incomeSources.findIndex(s => s.id === id);
  
  if (index === -1) {
    throw new Error(`Income source with id '${id}' not found`);
  }
  
  config.incomeSources[index] = { ...config.incomeSources[index], ...updates };
  saveConfig(config);
  return config;
}

/**
 * Remove an income source.
 */
export function removeIncomeSource(id: string): KraxlerConfig {
  const config = loadConfig();
  config.incomeSources = config.incomeSources.filter(s => s.id !== id);
  
  // Also remove from category defaults
  for (const [category, sourceId] of Object.entries(config.categoryDefaults)) {
    if (sourceId === id) {
      delete config.categoryDefaults[category as DeductibleCategory];
    }
  }
  
  // Also remove from allocation rules
  for (const rule of config.allocationRules) {
    rule.allocations = rule.allocations.filter(a => a.sourceId !== id);
  }
  // Remove empty rules
  config.allocationRules = config.allocationRules.filter(r => r.allocations.length > 0);
  
  saveConfig(config);
  return config;
}

// ============================================================================
// Allocation Rule Helpers
// ============================================================================

/**
 * Add a new allocation rule.
 */
export function addAllocationRule(rule: Omit<typeof DEFAULT_CONFIG.allocationRules[0], 'id'> & { id?: string }): KraxlerConfig {
  const config = loadConfig();
  
  // Generate ID if not provided
  if (!rule.id) {
    const timestamp = Date.now().toString(36);
    rule.id = `rule_${timestamp}`;
  }
  
  config.allocationRules.push(rule as typeof DEFAULT_CONFIG.allocationRules[0]);
  saveConfig(config);
  return config;
}

/**
 * Remove an allocation rule.
 */
export function removeAllocationRule(id: string): KraxlerConfig {
  const config = loadConfig();
  config.allocationRules = config.allocationRules.filter(r => r.id !== id);
  saveConfig(config);
  return config;
}

// ============================================================================
// Display
// ============================================================================

/**
 * Print current configuration summary.
 */
export function printConfig(): void {
  const config = loadConfig();
  
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║  🇦🇹🇩🇪 KRAXLER CONFIGURATION (v${config.version})                                    ║
╠════════════════════════════════════════════════════════════════════════════╣`);
  
  console.log(`║  Jurisdiction: ${config.jurisdiction.padEnd(58)}║`);
  
  if (config.situations.length === 0) {
    console.log(`║  Situations: None configured                                               ║`);
  } else {
    console.log(`║  Situations: ${String(config.situations.length).padEnd(60)}║`);
    for (const sit of config.situations) {
      const dateRange = sit.to ? `${sit.from} → ${sit.to}` : `${sit.from} → ongoing`;
      const vatLabel = sit.vatStatus === 'kleinunternehmer' ? 'KU' : 'Regel';
      console.log(`║    • ${dateRange.padEnd(30)} ${vatLabel.padEnd(25)}║`);
    }
  }
  
  if (config.incomeSources.length === 0) {
    console.log(`║  Income Sources: None configured                                           ║`);
  } else {
    console.log(`║  Income Sources: ${String(config.incomeSources.length).padEnd(56)}║`);
    for (const src of config.incomeSources) {
      console.log(`║    • ${src.name.substring(0, 40).padEnd(40)} (${src.category.substring(0, 15)})     ║`);
    }
  }
  
  console.log(`║                                                                            ║`);
  console.log(`║  Config: ${getConfigFile().replace(process.env.HOME || '', '~').padEnd(60)}  ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════════╝
`);
}
