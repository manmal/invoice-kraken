/**
 * Models command - View and configure AI models
 */

import { MODEL_CONFIG, listModelConfig } from '../lib/models.js';
import { checkAuth } from '../lib/ai.js';

export async function modelsCommand(options) {
  const { check } = options;
  
  if (check) {
    console.log('Checking authentication...\n');
    const authError = await checkAuth();
    if (authError) {
      console.error(authError);
      process.exit(1);
    }
    console.log('✓ Authentication OK - Anthropic models are available.\n');
  }
  
  listModelConfig();
  
  console.log('To change models, edit: src/lib/models.js');
  console.log('Available providers: anthropic, openai, google');
  console.log('Run `pi models` to see all available model IDs.\n');
}
