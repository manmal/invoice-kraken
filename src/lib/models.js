/**
 * Model configuration for Kraxler
 * 
 * Central configuration for which AI models are used for different tasks.
 * Models can be configured via:
 * 1. CLI flags (--model, --provider) - overrides all tasks
 * 2. Environment variables (KRAXLER_MODEL, KRAXLER_PROVIDER)
 * 3. Per-task config in config.json → models object
 * 4. Preset in config.json → model_preset
 * 5. Hardcoded defaults below
 * 
 * Run `npx kraxler models` to see available models and current configuration.
 */

import { discoverAuthStorage, discoverModels } from '@mariozechner/pi-coding-agent';
import { loadConfig } from './config.js';

// Cache for model registry
let _modelRegistry = null;

function getModelRegistry() {
  if (!_modelRegistry) {
    const authStorage = discoverAuthStorage();
    _modelRegistry = discoverModels(authStorage);
  }
  return _modelRegistry;
}

/**
 * Default model configuration by task
 * 
 * Each task specifies:
 * - provider: The AI provider (anthropic, openai, google, etc.)
 * - modelId: The specific model ID (must match pi-ai exactly)
 * - description: What this task does
 * - thinkingLevel: Optional thinking level (off, minimal, low, medium, high, xhigh)
 * - tier: Which preset tier this task uses (fast, balanced, quality)
 */
export const DEFAULT_MODEL_CONFIG = {
  // Email invoice classification (batch analysis)
  // Uses fast tier - analyzing many emails quickly
  emailClassification: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Classify emails as invoices and extract metadata',
    thinkingLevel: 'off',
    tier: 'fast',
  },
  
  // Invoice deductibility analysis
  // Uses fast tier - straightforward categorization based on vendor/type
  deductibilityAnalysis: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Determine tax deductibility for Austrian Einzelunternehmer',
    thinkingLevel: 'off',
    tier: 'fast',
  },
  
  // Complex invoice extraction (when simple extraction fails)
  // Uses balanced tier for better accuracy on edge cases
  complexExtraction: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    description: 'Extract invoice details from complex or unclear formats',
    thinkingLevel: 'minimal',
    tier: 'balanced',
  },
  
  // Browser-based invoice download
  // Uses balanced tier - needs to navigate websites intelligently
  browserDownload: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    description: 'Navigate websites to download invoices via browser automation',
    thinkingLevel: 'minimal',
    tier: 'balanced',
  },
  
  // Duplicate detection with fuzzy matching
  // Uses fast tier - pattern matching is straightforward
  duplicateDetection: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Detect duplicate invoices with fuzzy matching',
    thinkingLevel: 'off',
    tier: 'fast',
  },
  
  // Report generation
  // Uses fast tier - summarization is straightforward
  reportGeneration: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Generate summary reports from invoice data',
    thinkingLevel: 'off',
    tier: 'fast',
  },
};

/**
 * Model presets - predefined configurations for common use cases
 * 
 * Each tier maps to specific models per provider.
 * The first available model from the list is used.
 */
export const MODEL_PRESETS = {
  // Cheap/fast models for all tasks
  cheap: {
    fast: [
      { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest' },
      { provider: 'google', modelId: 'gemini-2.0-flash' },
      { provider: 'openai', modelId: 'gpt-4o-mini' },
    ],
    balanced: [
      { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest' },
      { provider: 'google', modelId: 'gemini-2.0-flash' },
      { provider: 'openai', modelId: 'gpt-4o-mini' },
    ],
    quality: [
      { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest' },
      { provider: 'google', modelId: 'gemini-2.0-flash' },
      { provider: 'openai', modelId: 'gpt-4o-mini' },
    ],
  },
  
  // Default balanced configuration (current defaults)
  balanced: {
    fast: [
      { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest' },
      { provider: 'google', modelId: 'gemini-2.0-flash' },
      { provider: 'openai', modelId: 'gpt-4o-mini' },
    ],
    balanced: [
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      { provider: 'google', modelId: 'gemini-2.5-pro' },
      { provider: 'openai', modelId: 'gpt-4o' },
    ],
    quality: [
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      { provider: 'google', modelId: 'gemini-2.5-pro' },
      { provider: 'openai', modelId: 'gpt-4o' },
    ],
  },
  
  // High quality models for all tasks
  quality: {
    fast: [
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      { provider: 'google', modelId: 'gemini-2.5-pro' },
      { provider: 'openai', modelId: 'gpt-4o' },
    ],
    balanced: [
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      { provider: 'google', modelId: 'gemini-2.5-pro' },
      { provider: 'openai', modelId: 'gpt-4o' },
    ],
    quality: [
      { provider: 'anthropic', modelId: 'claude-opus-4' },
      { provider: 'google', modelId: 'gemini-2.5-pro' },
      { provider: 'openai', modelId: 'gpt-4o' },
    ],
  },
  
  // Local models via Ollama (free, private)
  local: {
    fast: [
      { provider: 'ollama', modelId: 'llama3.2' },
      { provider: 'ollama', modelId: 'mistral' },
    ],
    balanced: [
      { provider: 'ollama', modelId: 'llama3.2' },
      { provider: 'ollama', modelId: 'mixtral' },
    ],
    quality: [
      { provider: 'ollama', modelId: 'llama3.2:70b' },
      { provider: 'ollama', modelId: 'mixtral' },
    ],
  },
};

// Runtime overrides from CLI/env (set via setModelOverrides)
let _runtimeOverrides = {
  model: null,
  provider: null,
};

/**
 * Set runtime model overrides from CLI flags or env vars
 * Call this early in command execution
 * 
 * @param {Object} overrides
 * @param {string} [overrides.model] - Model ID override
 * @param {string} [overrides.provider] - Provider override
 */
export function setModelOverrides(overrides) {
  _runtimeOverrides = {
    model: overrides.model || process.env.KRAXLER_MODEL || null,
    provider: overrides.provider || process.env.KRAXLER_PROVIDER || null,
  };
}

/**
 * Get current runtime overrides
 */
export function getModelOverrides() {
  return {
    model: _runtimeOverrides.model || process.env.KRAXLER_MODEL || null,
    provider: _runtimeOverrides.provider || process.env.KRAXLER_PROVIDER || null,
  };
}

/**
 * Find first available model from a list of candidates
 * @param {Array<{provider: string, modelId: string}>} candidates
 * @returns {Object|null} Model object or null
 */
function findFirstAvailable(candidates) {
  const registry = getModelRegistry();
  
  for (const candidate of candidates) {
    const model = registry.find(candidate.provider, candidate.modelId);
    if (model) {
      return model;
    }
  }
  return null;
}

/**
 * Resolve a model by provider and ID
 * @param {string} provider
 * @param {string} modelId
 * @returns {Object|null} Model object or null
 */
function resolveModel(provider, modelId) {
  const registry = getModelRegistry();
  return registry.find(provider, modelId);
}

/**
 * Get model instance for a specific task
 * 
 * Priority order:
 * 1. CLI override (--model, --provider) - applies to all tasks
 * 2. Environment variables (KRAXLER_MODEL, KRAXLER_PROVIDER)
 * 3. Per-task config in config.json → models[task]
 * 4. Preset from config.json → model_preset
 * 5. Hardcoded defaults
 * 
 * @param {keyof typeof DEFAULT_MODEL_CONFIG} task - The task name
 * @returns {{ model: any, thinkingLevel: string, description: string, source: string } | null}
 */
export function getModelForTask(task) {
  const defaultConfig = DEFAULT_MODEL_CONFIG[task];
  if (!defaultConfig) {
    console.error(`Unknown task: ${task}`);
    return null;
  }
  
  const config = loadConfig();
  const overrides = getModelOverrides();
  
  // 1. CLI/env override - applies to all tasks
  if (overrides.model) {
    const provider = overrides.provider || 'anthropic';
    const model = resolveModel(provider, overrides.model);
    if (model) {
      return {
        model,
        thinkingLevel: defaultConfig.thinkingLevel || 'off',
        description: defaultConfig.description,
        source: 'cli/env override',
      };
    }
    console.warn(`Override model '${provider}/${overrides.model}' not found, falling back`);
  }
  
  // 2. Per-task config from config.json
  if (config.models && config.models[task]) {
    const taskOverride = config.models[task];
    const provider = taskOverride.provider || defaultConfig.provider;
    const modelId = taskOverride.modelId || taskOverride.model; // Support both keys
    const model = resolveModel(provider, modelId);
    if (model) {
      return {
        model,
        thinkingLevel: taskOverride.thinkingLevel || defaultConfig.thinkingLevel || 'off',
        description: defaultConfig.description,
        source: 'config.json models',
      };
    }
    console.warn(`Config model '${provider}/${modelId}' for task '${task}' not found, falling back`);
  }
  
  // 3. Preset from config.json
  if (config.model_preset && MODEL_PRESETS[config.model_preset]) {
    const preset = MODEL_PRESETS[config.model_preset];
    const tier = defaultConfig.tier || 'balanced';
    const candidates = preset[tier] || preset.balanced;
    const model = findFirstAvailable(candidates);
    if (model) {
      return {
        model,
        thinkingLevel: defaultConfig.thinkingLevel || 'off',
        description: defaultConfig.description,
        source: `preset: ${config.model_preset}`,
      };
    }
    console.warn(`No models available for preset '${config.model_preset}', tier '${tier}'`);
  }
  
  // 4. Hardcoded defaults
  const model = resolveModel(defaultConfig.provider, defaultConfig.modelId);
  if (!model) {
    console.error(`Default model not found: ${defaultConfig.provider}/${defaultConfig.modelId}`);
    console.error(`Run 'npx kraxler models' to see available models.`);
    return null;
  }
  
  return {
    model,
    thinkingLevel: defaultConfig.thinkingLevel || 'off',
    description: defaultConfig.description,
    source: 'default',
  };
}

/**
 * Get all task names
 */
export function getTaskNames() {
  return Object.keys(DEFAULT_MODEL_CONFIG);
}

/**
 * List all configured models and their tasks
 */
export function listModelConfig() {
  const config = loadConfig();
  const overrides = getModelOverrides();
  
  console.log('\n📋 Model Configuration\n');
  
  // Show active overrides
  if (overrides.model || overrides.provider) {
    console.log('Active overrides:');
    if (overrides.model) console.log(`  Model: ${overrides.model}`);
    if (overrides.provider) console.log(`  Provider: ${overrides.provider}`);
    console.log();
  }
  
  // Show preset if set
  if (config.model_preset) {
    console.log(`Active preset: ${config.model_preset}`);
    console.log();
  }
  
  console.log('Task                    Provider    Model                   Source');
  console.log('─'.repeat(78));
  
  for (const task of getTaskNames()) {
    const result = getModelForTask(task);
    if (result) {
      const taskPadded = task.padEnd(22);
      const providerPadded = result.model.provider.padEnd(10);
      const modelPadded = result.model.id.substring(0, 22).padEnd(22);
      const sourcePadded = result.source;
      console.log(`${taskPadded}  ${providerPadded}  ${modelPadded}  ${sourcePadded}`);
    } else {
      console.log(`${task.padEnd(22)}  (not available)`);
    }
  }
  console.log();
}

/**
 * List available presets
 */
export function listPresets() {
  console.log('\n📦 Available Presets\n');
  console.log('Preset      Description');
  console.log('─'.repeat(60));
  console.log('cheap       Fast, inexpensive models for all tasks (haiku/flash/4o-mini)');
  console.log('balanced    Default - fast for simple tasks, smart for complex');
  console.log('quality     Best models for all tasks (sonnet/pro/4o)');
  console.log('local       Local models via Ollama (free, private)');
  console.log();
}

/**
 * Validate that a model exists
 * @param {string} provider 
 * @param {string} modelId 
 * @returns {boolean}
 */
export function validateModel(provider, modelId) {
  const registry = getModelRegistry();
  return registry.find(provider, modelId) !== null;
}

/**
 * Get available models for a provider
 * @param {string} [providerFilter] - Optional provider to filter by
 * @returns {Array<{provider: string, id: string, name: string}>}
 */
export async function getAvailableModels(providerFilter = null) {
  const registry = getModelRegistry();
  try {
    const available = await registry.getAvailable();
    if (providerFilter) {
      return available.filter(m => m.provider.toLowerCase() === providerFilter.toLowerCase());
    }
    return available;
  } catch (error) {
    console.error('Error fetching available models:', error.message);
    return [];
  }
}
