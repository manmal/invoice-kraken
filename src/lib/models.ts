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
import { ModelConfig } from '../types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type TierType = 'fast' | 'balanced' | 'quality';
export type TaskName = keyof typeof DEFAULT_MODEL_CONFIG;
export type PresetName = keyof typeof MODEL_PRESETS;

export interface TaskModelConfig {
  provider: string;
  modelId: string;
  description: string;
  thinkingLevel: ThinkingLevel;
  tier: TierType;
}

export interface ModelCandidate {
  provider: string;
  modelId: string;
}

export interface PresetTiers {
  fast: ModelCandidate[];
  balanced: ModelCandidate[];
  quality: ModelCandidate[];
}

export interface RuntimeOverrides {
  model: string | null;
  provider: string | null;
}

export interface ModelForTaskResult {
  model: RegistryModel;
  thinkingLevel: ThinkingLevel;
  description: string;
  source: string;
}

export interface AvailableModel {
  provider: string;
  id: string;
  name: string;
}

// Registry types from pi-coding-agent
interface ModelRegistry {
  find(provider: string, modelId: string): RegistryModel | null;
  getAvailable(): Promise<AvailableModel[]>;
}

interface RegistryModel {
  provider: string;
  id: string;
  name?: string;
}

// ============================================================================
// Model Registry Cache
// ============================================================================

// Cache for model registry
let _modelRegistry: ModelRegistry | null = null;

function getModelRegistry(): ModelRegistry {
  if (!_modelRegistry) {
    const authStorage = discoverAuthStorage();
    _modelRegistry = discoverModels(authStorage) as ModelRegistry;
  }
  return _modelRegistry;
}

// ============================================================================
// Default Model Configuration
// ============================================================================

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
export const DEFAULT_MODEL_CONFIG: Record<string, TaskModelConfig> = {
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
} as const;

// ============================================================================
// Model Presets
// ============================================================================

/**
 * Model presets - predefined configurations for common use cases
 * 
 * Each tier maps to specific models per provider.
 * The first available model from the list is used.
 */
export const MODEL_PRESETS: Record<string, PresetTiers> = {
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

// ============================================================================
// Runtime Overrides
// ============================================================================

// Runtime overrides from CLI/env (set via setModelOverrides)
let _runtimeOverrides: RuntimeOverrides = {
  model: null,
  provider: null,
};

/**
 * Set runtime model overrides from CLI flags or env vars
 * Call this early in command execution
 */
export function setModelOverrides(overrides: { model?: string; provider?: string }): void {
  _runtimeOverrides = {
    model: overrides.model || process.env.KRAXLER_MODEL || null,
    provider: overrides.provider || process.env.KRAXLER_PROVIDER || null,
  };
}

/**
 * Get current runtime overrides
 */
export function getModelOverrides(): RuntimeOverrides {
  return {
    model: _runtimeOverrides.model || process.env.KRAXLER_MODEL || null,
    provider: _runtimeOverrides.provider || process.env.KRAXLER_PROVIDER || null,
  };
}

// ============================================================================
// Model Resolution Functions
// ============================================================================

/**
 * Find first available model from a list of candidates
 */
function findFirstAvailable(candidates: ModelCandidate[]): RegistryModel | null {
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
 */
function resolveModel(provider: string, modelId: string): RegistryModel | null {
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
 */
export function getModelForTask(task: string): ModelForTaskResult | null {
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
    const taskOverride = config.models[task] as ModelConfig & { thinkingLevel?: ThinkingLevel; model?: string };
    const provider = taskOverride.provider || defaultConfig.provider;
    const modelId = taskOverride.modelId || taskOverride.model; // Support both keys
    if (modelId) {
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
  }
  
  // 3. Preset from config.json
  if (config.model_preset && MODEL_PRESETS[config.model_preset]) {
    const preset = MODEL_PRESETS[config.model_preset];
    const tier: TierType = defaultConfig.tier || 'balanced';
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
export function getTaskNames(): string[] {
  return Object.keys(DEFAULT_MODEL_CONFIG);
}

/**
 * List all configured models and their tasks
 */
export function listModelConfig(): void {
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
export function listPresets(): void {
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
 */
export function validateModel(provider: string, modelId: string): boolean {
  const registry = getModelRegistry();
  return registry.find(provider, modelId) !== null;
}

/**
 * Get available models for a provider
 */
export async function getAvailableModels(providerFilter: string | null = null): Promise<AvailableModel[]> {
  const registry = getModelRegistry();
  try {
    const available = await registry.getAvailable();
    if (providerFilter) {
      return available.filter((m: AvailableModel) => m.provider.toLowerCase() === providerFilter.toLowerCase());
    }
    return available;
  } catch (error) {
    console.error('Error fetching available models:', (error as Error).message);
    return [];
  }
}
