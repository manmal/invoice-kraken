/**
 * Config command - View and update configuration
 */

import { 
  loadConfig, 
  updateConfig, 
  runSetupWizard, 
  printConfig,
  needsSetup 
} from '../lib/config.js';

export async function configCommand(options) {
  const { reset, show, set } = options;
  
  // Reset config and run setup again
  if (reset) {
    console.log('Resetting configuration...\n');
    updateConfig({ setup_completed: false });
    await runSetupWizard();
    return;
  }
  
  // Set a specific value
  if (set) {
    const [key, value] = set.split('=');
    if (!key || value === undefined) {
      console.error('Usage: --set key=value');
      console.error('Available keys:');
      console.error('  has_company_car=true|false');
      console.error('  company_car_type=ice|electric|hybrid_plugin|hybrid');
      console.error('  is_kleinunternehmer=true|false');
      console.error('  telecom_business_percent=50|60|70|80|100');
      console.error('  internet_business_percent=50|60|70|80|100');
      process.exit(1);
    }
    
    let parsedValue = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(value)) parsedValue = parseInt(value, 10);
    
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
