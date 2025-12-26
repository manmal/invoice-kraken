/**
 * Models command - View AI model configuration and auth status
 */

import { MODEL_CONFIG, listModelConfig } from '../lib/models.js';
import { checkAuth } from '../lib/ai.js';

export async function modelsCommand(options) {
  // Always check auth and show status
  const authError = await checkAuth();
  
  if (authError) {
    console.error(authError);
  } else {
    console.log('✓ Authentication OK\n');
  }
  
  listModelConfig();
  
  console.log('To change models, edit: src/lib/models.js');
  console.log('Available providers: anthropic, openai, google');
  console.log('Run `pi models` to see all available model IDs.\n');
}
