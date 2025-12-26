#!/usr/bin/env bun

/**
 * Invoice Kraken - Search Gmail for invoices using gogcli and pi's scout/browser skills
 * 
 * ⚠️  DISCLAIMER: This tool provides tax deductibility suggestions based on the
 * AUSTRIAN TAX SYSTEM. These are for informational purposes only and do NOT
 * constitute tax advice. Always consult a qualified Steuerberater.
 */

import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { investigateCommand } from './commands/investigate.js';
import { downloadCommand } from './commands/download.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';
import { logCommand } from './commands/log.js';
import { configCommand } from './commands/config.js';
import { closeDb } from './lib/db.js';
import { needsSetup, runSetupWizard } from './lib/config.js';

const program = new Command();

program
  .name('invoice-kraken')
  .description('🦑 Search Gmail for invoices using gogcli and pi')
  .version('0.1.0');

program
  .command('search')
  .description('Search Gmail for invoice-related emails')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .requiredOption('-y, --year <year>', 'Year to search (e.g., 2024)')
  .option('--from <month>', 'Start month (1-12, default: 1)', '1')
  .option('--to <month>', 'End month (1-12, default: 12)', '12')
  .action(async (options) => {
    try {
      options.fromMonth = parseInt(options.from, 10);
      options.toMonth = parseInt(options.to, 10);
      await searchCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('investigate')
  .description('Investigate found emails and filter/extract invoices')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-b, --batch-size <n>', 'Number of emails to process per batch', '10')
  .option('--auto-dedup', 'Automatically mark high-confidence duplicates')
  .option('--strict', 'Also auto-mark medium-confidence duplicates')
  .action(async (options) => {
    try {
      options.batchSize = parseInt(options.batchSize, 10);
      await investigateCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('download')
  .description('Download remaining invoices using pi scout/browser')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-b, --batch-size <n>', 'Number of invoices to process per batch', '5')
  .action(async (options) => {
    try {
      options.batchSize = parseInt(options.batchSize, 10);
      await downloadCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('list')
  .description('List remaining invoices that need manual handling')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-f, --format <format>', 'Output format: table, json, markdown', 'table')
  .option('-d, --deductible <type>', 'Filter by deductibility: full, partial, none, unclear')
  .option('--summary', 'Show tax deductibility summary')
  .option('--year <year>', 'Filter summary by year')
  .option('--include-duplicates', 'Include duplicates in the list')
  .action(async (options) => {
    try {
      if (options.year) options.year = parseInt(options.year, 10);
      await listCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('status')
  .description('Show completion status for a year')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-y, --year <year>', 'Year to show status for (default: current year)')
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('log')
  .description('Show action history')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-l, --limit <n>', 'Number of actions to show', '20')
  .option('--failed', 'Show only failed/interrupted actions')
  .action(async (options) => {
    try {
      await logCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('config')
  .description('View or update configuration (tax settings, company car, etc.)')
  .option('--reset', 'Reset configuration and run setup wizard again')
  .option('--show', 'Show current configuration')
  .option('--set <key=value>', 'Set a specific configuration value')
  .action(async (options) => {
    try {
      await configCommand(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Check for first-run setup before any command that needs config
const setupRequiredCommands = ['search', 'investigate', 'download', 'list', 'status'];
const originalParse = program.parse.bind(program);
program.parse = async function(args) {
  // Check if running a command that needs setup
  const commandArg = args?.[2] || process.argv[2];
  
  if (setupRequiredCommands.includes(commandArg) && needsSetup()) {
    console.log('First run detected. Running initial setup...\n');
    await runSetupWizard();
  }
  
  return originalParse(args);
};

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught error:', error.message);
  closeDb();
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error.message);
  closeDb();
  process.exit(1);
});

program.parse();
