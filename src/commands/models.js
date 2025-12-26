/**
 * Models command - View AI model configuration and auth status
 */

import { 
  listModelConfig, 
  listPresets, 
  getAvailableModels,
  getModelOverrides,
} from '../lib/models.js';
import { loadConfig } from '../lib/config.js';
import { checkAuth } from '../lib/ai.js';

export async function modelsCommand(options) {
  // Always check auth and show status
  const authError = await checkAuth();
  
  if (authError) {
    console.error(authError);
  } else {
    console.log('✓ Authentication OK\n');
  }
  
  // Show current model configuration
  listModelConfig();
  
  // Show available models if requested
  if (options.available) {
    console.log('Available models:\n');
    const available = await getAvailableModels();
    
    // Group by provider
    const byProvider = {};
    for (const m of available) {
      if (!byProvider[m.provider]) byProvider[m.provider] = [];
      byProvider[m.provider].push(m);
    }
    
    for (const [provider, models] of Object.entries(byProvider)) {
      console.log(`${provider}:`);
      for (const m of models.slice(0, 10)) {
        console.log(`  ${m.id}`);
      }
      if (models.length > 10) {
        console.log(`  ... and ${models.length - 10} more`);
      }
      console.log();
    }
  }
  
  // Show presets if requested
  if (options.presets) {
    listPresets();
  }
  
  // Show configuration help
  console.log('─'.repeat(78));
  console.log('\nTo customize models:\n');
  console.log('  Quick preset:');
  console.log('    npx kraxler config --set model_preset=cheap');
  console.log('    npx kraxler config --set model_preset=quality\n');
  console.log('  Interactive setup:');
  console.log('    npx kraxler config --models\n');
  console.log('  CLI override (applies to current command only):');
  console.log('    npx kraxler extract -a x@gmail.com --model gemini-2.5-flash --provider google\n');
  console.log('  Environment variables:');
  console.log('    KRAXLER_MODEL=gpt-4o KRAXLER_PROVIDER=openai npx kraxler extract ...\n');
  console.log('  Config file (~/.config/kraxler/config.json):');
  console.log('    {');
  console.log('      "model_preset": "balanced",');
  console.log('      "models": {');
  console.log('        "browserDownload": { "provider": "anthropic", "modelId": "claude-opus-4" }');
  console.log('      }');
  console.log('    }\n');
  
  // Show current overrides
  const overrides = getModelOverrides();
  const config = loadConfig();
  
  if (overrides.model || overrides.provider || config.model_preset || config.models) {
    console.log('Current customizations:');
    if (overrides.model) console.log(`  CLI/env model: ${overrides.model}`);
    if (overrides.provider) console.log(`  CLI/env provider: ${overrides.provider}`);
    if (config.model_preset) console.log(`  Preset: ${config.model_preset}`);
    if (config.models) {
      console.log(`  Per-task overrides: ${Object.keys(config.models).join(', ')}`);
    }
    console.log();
  }
}
