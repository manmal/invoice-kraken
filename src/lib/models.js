/**
 * Model configuration for Invoice Kraken
 * 
 * Central configuration for which AI models are used for different tasks.
 * Models are identified by provider and model ID.
 * 
 * Available providers: anthropic, openai, google, etc.
 * Use `invoice-kraken models` or `pi models` to see available models.
 * 
 * Model IDs must match those from the pi-ai package exactly.
 * Run: bun -e "import {discoverAuthStorage,discoverModels} from '@mariozechner/pi-coding-agent'; 
 *              const r=discoverModels(discoverAuthStorage()); r.getAll().forEach(m=>console.log(m.provider+'/'+m.id))"
 */

import { discoverAuthStorage, discoverModels } from '@mariozechner/pi-coding-agent';

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
 * Model configuration by task
 * 
 * Each task specifies:
 * - provider: The AI provider (anthropic, openai, google, etc.)
 * - modelId: The specific model ID (must match pi-ai exactly)
 * - description: What this task does
 * - thinkingLevel: Optional thinking level (off, minimal, low, medium, high, xhigh)
 * 
 * Haiku (claude-3-5-haiku-latest) - fast and cheap, good for simple classification
 * Sonnet (claude-sonnet-4-5) - balanced, good for complex analysis
 * Opus (claude-opus-4-5) - most capable, for critical decisions
 */
export const MODEL_CONFIG = {
  // Email invoice classification (batch analysis)
  // Uses Haiku for speed - analyzing many emails quickly
  emailClassification: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Classify emails as invoices and extract metadata',
    thinkingLevel: 'off',
  },
  
  // Invoice deductibility analysis
  // Uses Haiku - straightforward categorization based on vendor/type
  deductibilityAnalysis: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Determine tax deductibility for Austrian Einzelunternehmer',
    thinkingLevel: 'off',
  },
  
  // Complex invoice extraction (when simple extraction fails)
  // Uses Sonnet for better accuracy on edge cases
  complexExtraction: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    description: 'Extract invoice details from complex or unclear formats',
    thinkingLevel: 'minimal',
  },
  
  // Browser-based invoice download
  // Uses Sonnet - needs to navigate websites intelligently
  browserDownload: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    description: 'Navigate websites to download invoices via browser automation',
    thinkingLevel: 'minimal',
  },
  
  // Duplicate detection with fuzzy matching
  // Uses Haiku - pattern matching is straightforward
  duplicateDetection: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Detect duplicate invoices with fuzzy matching',
    thinkingLevel: 'off',
  },
  
  // Report generation
  // Uses Haiku - summarization is straightforward
  reportGeneration: {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-latest',
    description: 'Generate summary reports from invoice data',
    thinkingLevel: 'off',
  },
};

/**
 * Get model instance for a specific task
 * @param {keyof typeof MODEL_CONFIG} task - The task name
 * @returns {{ model: any, thinkingLevel: string } | null}
 */
export function getModelForTask(task) {
  const config = MODEL_CONFIG[task];
  if (!config) {
    console.error(`Unknown task: ${task}`);
    return null;
  }
  
  const registry = getModelRegistry();
  const model = registry.find(config.provider, config.modelId);
  
  if (!model) {
    console.error(`Model not found: ${config.provider}/${config.modelId}`);
    console.error(`Run 'invoice-kraken models' to see available models.`);
    return null;
  }
  
  return {
    model,
    thinkingLevel: config.thinkingLevel || 'off',
    description: config.description,
  };
}

/**
 * List all configured models and their tasks
 */
export function listModelConfig() {
  console.log('\n📋 Model Configuration\n');
  console.log('Task                    Provider    Model           Thinking');
  console.log('─'.repeat(70));
  
  for (const [task, config] of Object.entries(MODEL_CONFIG)) {
    const taskPadded = task.padEnd(22);
    const providerPadded = config.provider.padEnd(10);
    const modelPadded = config.modelId.padEnd(14);
    console.log(`${taskPadded}  ${providerPadded}  ${modelPadded}  ${config.thinkingLevel}`);
  }
  console.log();
}
