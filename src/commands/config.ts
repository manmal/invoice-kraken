/**
 * Config command - View and update configuration
 */

import { 
  updateConfig, 
  runSetupWizard, 
  printConfig,
  needsSetup 
} from '../lib/config.js';
import { 
  MODEL_PRESETS, 
  getTaskNames, 
  validateModel,
  getAvailableModels,
  listPresets,
} from '../lib/models.js';
import * as readline from 'readline';

interface ChoiceOption<T> {
  label: string;
  value: T;
}

interface ConfigCommandOptions {
  reset?: boolean;
  show?: boolean;
  set?: string;
  models?: boolean;
}

/**
 * Create readline interface for prompts
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a choice question with arrow key navigation (simple version)
 */
async function askChoice<T>(rl: readline.Interface, question: string, options: ChoiceOption<T>[]): Promise<T> {
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt.label}`);
  });
  
  return new Promise((resolve) => {
    rl.question(`Enter choice (1-${options.length}): `, (answer: string) => {
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx].value);
      } else {
        resolve(options[0].value);
      }
    });
  });
}

/**
 * Interactive model configuration
 */
async function configureModels(): Promise<void> {
  const rl = createPrompt();
  
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║  🤖 MODEL CONFIGURATION                                                    ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Configure which AI models Kraxler uses for different tasks.               ║
║                                                                            ║
║  Options:                                                                  ║
║  • Preset: Quick setup with predefined model combinations                  ║
║  • Per-task: Fine-grained control over each task's model                   ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

  // Show available models
  console.log('Checking available models...\n');
  const available = await getAvailableModels();
  
  if (available.length === 0) {
    console.log('⚠️  No models available. Run `pi` and use `/login` to authenticate.\n');
    rl.close();
    return;
  }
  
  // Group by provider
  const byProvider: Record<string, string[]> = {};
  for (const m of available) {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m.id);
  }
  
  console.log('Available providers:');
  for (const [provider, models] of Object.entries(byProvider)) {
    console.log(`  ${provider}: ${models.slice(0, 3).join(', ')}${models.length > 3 ? ` (+${models.length - 3} more)` : ''}`);
  }
  console.log();
  
  // Choose configuration method
  const method = await askChoice(rl, 'How would you like to configure models?', [
    { label: 'Use a preset (recommended)', value: 'preset' },
    { label: 'Configure each task individually', value: 'per-task' },
    { label: 'Keep current settings', value: 'keep' },
  ]);
  
  if (method === 'keep') {
    console.log('\nKeeping current model settings.');
    rl.close();
    return;
  }
  
  if (method === 'preset') {
    listPresets();
    
    const preset = await askChoice(rl, 'Select a preset:', [
      { label: 'balanced - Default: fast for simple, smart for complex', value: 'balanced' },
      { label: 'cheap - Fast & cheap models for all tasks', value: 'cheap' },
      { label: 'quality - Best models for all tasks', value: 'quality' },
      { label: 'local - Local models via Ollama (requires Ollama setup)', value: 'local' },
    ]);
    
    updateConfig({ model_preset: preset, models: undefined });
    console.log(`\n✓ Model preset set to: ${preset}`);
  } else {
    // Per-task configuration
    const tasks = getTaskNames();
    const models: Record<string, { provider: string; modelId: string }> = {};
    
    console.log('\nConfigure each task (press Enter to use default):\n');
    
    for (const task of tasks) {
      const answer: string = await new Promise((resolve) => {
        rl.question(`${task} [default]: `, (ans: string) => resolve(ans.trim()));
      });
      
      if (answer) {
        // Parse provider/model format
        let provider = 'anthropic';
        let modelId = answer;
        
        if (answer.includes('/')) {
          [provider, modelId] = answer.split('/');
        }
        
        if (validateModel(provider, modelId)) {
          models[task] = { provider, modelId };
          console.log(`  ✓ Set to ${provider}/${modelId}`);
        } else {
          console.log(`  ⚠️ Model not found, using default`);
        }
      }
    }
    
    if (Object.keys(models).length > 0) {
      updateConfig({ models, model_preset: undefined });
      console.log(`\n✓ Custom model configuration saved.`);
    } else {
      console.log(`\nNo changes made.`);
    }
  }
  
  rl.close();
  console.log('\nRun `npx kraxler models` to see current configuration.\n');
}

export async function configCommand(options: ConfigCommandOptions): Promise<void> {
  const { reset, show: _show, set, models: configModels } = options;
  
  // Reset config and run setup again
  if (reset) {
    console.log('Resetting configuration...\n');
    updateConfig({ setup_completed: false });
    await runSetupWizard();
    return;
  }
  
  // Configure models interactively
  if (configModels) {
    await configureModels();
    return;
  }
  
  // Set a specific value
  if (set) {
    const eqIndex = set.indexOf('=');
    if (eqIndex === -1) {
      console.error('Usage: --set key=value');
      console.error('\nAvailable keys:');
      console.error('  has_company_car=true|false');
      console.error('  company_car_type=ice|electric|hybrid_plugin|hybrid');
      console.error('  is_kleinunternehmer=true|false');
      console.error('  telecom_business_percent=50|60|70|80|100');
      console.error('  internet_business_percent=50|60|70|80|100');
      console.error('  model_preset=cheap|balanced|quality|local');
      process.exit(1);
    }
    
    const key = set.substring(0, eqIndex);
    const value = set.substring(eqIndex + 1);
    
    // Validate model_preset
    if (key === 'model_preset') {
      if (!MODEL_PRESETS[value]) {
        console.error(`Invalid preset: ${value}`);
        console.error('Valid presets: cheap, balanced, quality, local');
        process.exit(1);
      }
      updateConfig({ model_preset: value, models: undefined }); // Clear per-task when setting preset
      console.log(`✓ Set ${key} = ${value}`);
      return;
    }
    
    let parsedValue: string | boolean | number = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = parseInt(value, 10);
    
    updateConfig({ [key]: parsedValue });
    console.log(`✓ Set ${key} = ${parsedValue}`);
    return;
  }
  
  // Default: show current config
  if (needsSetup()) {
    console.log('No configuration found. Running setup...\n');
    await runSetupWizard();
  } else {
    printConfig();
  }
}
