/**
 * Configuration management for Kraxler
 * Stores user preferences and tax-relevant settings
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { getConfigDir, getConfigPath } from './paths.js';

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = getConfigPath();

const DEFAULT_CONFIG = {
  // Tax jurisdiction
  tax_jurisdiction: 'AT', // Austria
  
  // Company car settings
  has_company_car: null,        // null = not configured yet
  company_car_type: null,       // 'ice' | 'electric' | 'hybrid_plugin' | null
  
  // Kleinunternehmer status
  is_kleinunternehmer: null,    // null = not configured, true = no VAT recovery at all
  
  // Default business use percentages
  telecom_business_percent: 50,
  internet_business_percent: 50,
  
  // Configured accounts
  accounts: [],
  
  // First run completed
  setup_completed: false,
  
  // Version for future migrations
  config_version: 1,
  
  // Model configuration
  // Preset: 'cheap' | 'balanced' | 'quality' | 'local'
  model_preset: null,
  
  // Per-task model overrides (optional)
  // models: {
  //   emailClassification: { provider: 'google', modelId: 'gemini-2.0-flash' },
  //   browserDownload: { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
  // }
  models: null,
};

let cachedConfig = null;

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from disk
 */
export function loadConfig() {
  if (cachedConfig) return cachedConfig;
  
  ensureConfigDir();
  
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (error) {
      console.error('Warning: Could not parse config file, using defaults');
      cachedConfig = { ...DEFAULT_CONFIG };
    }
  } else {
    cachedConfig = { ...DEFAULT_CONFIG };
  }
  
  return cachedConfig;
}

/**
 * Save configuration to disk
 */
export function saveConfig(config) {
  ensureConfigDir();
  cachedConfig = config;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Update specific config values
 */
export function updateConfig(updates) {
  const config = loadConfig();
  const newConfig = { ...config, ...updates };
  saveConfig(newConfig);
  return newConfig;
}

/**
 * Check if initial setup is needed
 */
export function needsSetup() {
  const config = loadConfig();
  return !config.setup_completed;
}

/**
 * Create readline interface for prompts
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a yes/no question
 */
async function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Ask a multiple choice question
 */
async function askChoice(rl, question, options) {
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt.label}`);
  });
  
  return new Promise((resolve) => {
    rl.question(`Enter choice (1-${options.length}): `, (answer) => {
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx].value);
      } else {
        resolve(options[0].value); // Default to first option
      }
    });
  });
}

/**
 * Run initial setup wizard
 */
export async function runSetupWizard() {
  const rl = createPrompt();
  
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                        🦑 INVOICE KRAKEN SETUP                             ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  ⚠️  IMPORTANT DISCLAIMER                                                  ║
║                                                                            ║
║  This tool provides tax deductibility suggestions based on the             ║
║  AUSTRIAN TAX SYSTEM (Einkommensteuer & Umsatzsteuer) for                 ║
║  Einzelunternehmer (sole proprietors).                                     ║
║                                                                            ║
║  These suggestions are for informational purposes only and do NOT          ║
║  constitute tax advice. Always consult with a qualified Steuerberater      ║
║  for your specific situation.                                              ║
║                                                                            ║
║  Tax rules vary by jurisdiction and change over time. The information      ║
║  in this tool may be incomplete or outdated.                               ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

  const understood = await askYesNo(rl, 'Do you understand and accept this disclaimer?');
  
  if (!understood) {
    console.log('\nSetup cancelled. You must accept the disclaimer to use this tool.');
    rl.close();
    process.exit(1);
  }
  
  console.log('\n── Company Car (Firmen-KFZ) ──────────────────────────────────────────\n');
  console.log('Company car expenses have special VAT rules in Austria.');
  console.log('For regular ICE/hybrid cars: NO Vorsteuerabzug (VAT recovery)');
  console.log('For electric vehicles (0g CO₂): FULL Vorsteuerabzug allowed!\n');
  
  const hasCompanyCar = await askYesNo(rl, 'Do you have a company car (Firmen-KFZ)?');
  
  let companyCarType = null;
  if (hasCompanyCar) {
    companyCarType = await askChoice(rl, 'What type of company car do you have?', [
      { label: 'Gasoline/Diesel (ICE) - No VAT recovery', value: 'ice' },
      { label: 'Full Electric (BEV, 0g CO₂) - Full VAT recovery!', value: 'electric' },
      { label: 'Plug-in Hybrid (PHEV) - Partial VAT (check with Steuerberater)', value: 'hybrid_plugin' },
      { label: 'Regular Hybrid (not plug-in) - No VAT recovery', value: 'hybrid' },
    ]);
  }
  
  console.log('\n── Kleinunternehmerregelung ──────────────────────────────────────────\n');
  console.log('If your annual revenue is under €55,000 (2025), you may be exempt from');
  console.log('charging VAT, but you also CANNOT recover any input VAT (Vorsteuer).\n');
  
  const isKleinunternehmer = await askYesNo(rl, 'Are you a Kleinunternehmer (< €55k revenue, VAT exempt)?');
  
  console.log('\n── Business Use Percentages ─────────────────────────────────────────\n');
  console.log('For mixed-use expenses, what percentage is typically business use?');
  console.log('(You can change these later with: kraxler config)\n');
  
  const telecomPercent = await askChoice(rl, 'Mobile phone business use:', [
    { label: '50% (default)', value: 50 },
    { label: '60%', value: 60 },
    { label: '70%', value: 70 },
    { label: '80%', value: 80 },
    { label: '100% (dedicated business phone)', value: 100 },
  ]);
  
  const internetPercent = await askChoice(rl, 'Internet business use:', [
    { label: '50% (default)', value: 50 },
    { label: '60%', value: 60 },
    { label: '70%', value: 70 },
    { label: '80%', value: 80 },
    { label: '100% (dedicated business line)', value: 100 },
  ]);
  
  rl.close();
  
  // Save configuration
  const config = updateConfig({
    has_company_car: hasCompanyCar,
    company_car_type: companyCarType,
    is_kleinunternehmer: isKleinunternehmer,
    telecom_business_percent: telecomPercent,
    internet_business_percent: internetPercent,
    setup_completed: true,
  });
  
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║  ✅ SETUP COMPLETE                                                         ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Your settings:                                                            ║`);
  
  if (hasCompanyCar) {
    const carTypeLabels = {
      ice: 'Gasoline/Diesel (no VAT recovery)',
      electric: 'Electric (full VAT recovery)',
      hybrid_plugin: 'Plug-in Hybrid (partial VAT)',
      hybrid: 'Hybrid (no VAT recovery)',
    };
    console.log(`║    • Company car: ${carTypeLabels[companyCarType].padEnd(43)}║`);
  } else {
    console.log(`║    • Company car: None                                             ║`);
  }
  
  console.log(`║    • Kleinunternehmer: ${isKleinunternehmer ? 'Yes (no VAT recovery)' : 'No (VAT recovery allowed)'}${' '.repeat(isKleinunternehmer ? 23 : 17)}║`);
  console.log(`║    • Telecom business use: ${telecomPercent}%                                      ║`);
  console.log(`║    • Internet business use: ${internetPercent}%                                     ║`);
  console.log(`║                                                                            ║`);
  console.log(`║  Config saved to: ${CONFIG_FILE.replace(process.env.HOME, '~').substring(0, 50).padEnd(50)}   ║`);
  console.log(`║  Run 'kraxler config' to change settings anytime.                   ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════════╝
`);
  
  return config;
}

/**
 * Get vehicle VAT recovery status based on config
 */
export function getVehicleVatRecovery() {
  const config = loadConfig();
  
  // Kleinunternehmer never gets VAT recovery
  if (config.is_kleinunternehmer) {
    return { recoverable: false, reason: 'Kleinunternehmer - no VAT recovery' };
  }
  
  // No company car = no vehicle expenses
  if (!config.has_company_car) {
    return { recoverable: false, reason: 'No company car configured' };
  }
  
  // Check car type
  switch (config.company_car_type) {
    case 'electric':
      return { recoverable: true, reason: 'Electric vehicle - full VAT recovery' };
    case 'hybrid_plugin':
      return { recoverable: 'partial', reason: 'Plug-in hybrid - check with Steuerberater' };
    case 'ice':
    case 'hybrid':
    default:
      return { recoverable: false, reason: 'ICE/Hybrid vehicle - no VAT recovery (Austrian rule)' };
  }
}

/**
 * Get telecom business percentage
 */
export function getTelecomBusinessPercent() {
  const config = loadConfig();
  return config.telecom_business_percent || 50;
}

/**
 * Get internet business percentage
 */
export function getInternetBusinessPercent() {
  const config = loadConfig();
  return config.internet_business_percent || 50;
}

/**
 * Check if user is Kleinunternehmer (no VAT recovery at all)
 */
export function isKleinunternehmer() {
  const config = loadConfig();
  return config.is_kleinunternehmer === true;
}

/**
 * Print current configuration
 */
export function printConfig() {
  const config = loadConfig();
  
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║  🦑 INVOICE KRAKEN CONFIGURATION                                          ║
╠════════════════════════════════════════════════════════════════════════════╣`);
  
  console.log(`║  Tax jurisdiction: Austria (AT)                                            ║`);
  
  if (config.has_company_car) {
    const carTypeLabels = {
      ice: 'Gasoline/Diesel',
      electric: 'Electric (0g CO₂)',
      hybrid_plugin: 'Plug-in Hybrid',
      hybrid: 'Hybrid',
    };
    const vatStatus = getVehicleVatRecovery();
    console.log(`║  Company car: ${(carTypeLabels[config.company_car_type] || 'Unknown').padEnd(49)}║`);
    console.log(`║    VAT recovery: ${vatStatus.recoverable ? 'Yes' : 'No'} - ${vatStatus.reason.substring(0, 40).padEnd(40)}║`);
  } else {
    console.log(`║  Company car: None                                                         ║`);
  }
  
  console.log(`║  Kleinunternehmer: ${config.is_kleinunternehmer ? 'Yes (no VAT recovery)' : 'No (VAT recovery allowed)'}${' '.repeat(config.is_kleinunternehmer ? 35 : 29)}║`);
  console.log(`║  Telecom business use: ${config.telecom_business_percent}%                                              ║`);
  console.log(`║  Internet business use: ${config.internet_business_percent}%                                             ║`);
  console.log(`║                                                                            ║`);
  
  // Model configuration
  if (config.model_preset) {
    console.log(`║  Model preset: ${config.model_preset.padEnd(53)}║`);
  }
  if (config.models && Object.keys(config.models).length > 0) {
    console.log(`║  Custom models: ${Object.keys(config.models).join(', ').substring(0, 51).padEnd(51)}║`);
  }
  
  console.log(`║                                                                            ║`);
  console.log(`║  Config: ${CONFIG_FILE.replace(process.env.HOME, '~').padEnd(60)}  ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════════╝

Run 'npx kraxler models' to see full AI model configuration.
`);
}
