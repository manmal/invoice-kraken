#!/usr/bin/env node

/**
 * Kraxler - Invoice extraction from Gmail with AI-powered classification
 * 
 * ⚠️  DISCLAIMER: This tool provides tax deductibility suggestions based on the
 * AUSTRIAN TAX SYSTEM. These are for informational purposes only and do NOT
 * constitute tax advice. Always consult a qualified Steuerberater.
 */

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { extractCommand } from './commands/extract.js';
import { crawlCommand } from './commands/crawl.js';
import { reviewCommand } from './commands/review.js';
import { reportCommand } from './commands/report.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { logCommand } from './commands/log.js';
import { configCommand } from './commands/config.js';
import { modelsCommand } from './commands/models.js';
import { closeDb } from './lib/db.js';
import { closeBrowser } from './lib/browser.js';
import { needsSetup, runSetupWizard } from './lib/config.js';
import { printPaths, getAllPaths } from './lib/paths.js';
import { setModelOverrides } from './lib/models.js';

const program: Command = new Command();

program
  .name('kraxler')
  .description('🇦🇹 Invoice extraction from Gmail with AI-powered classification')
  .version('0.1.0');

// ============================================================================
// MAIN PIPELINE COMMANDS
// ============================================================================

program
  .command('scan')
  .description('Stage 1: Scan Gmail for invoice-related emails')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-y, --year <year>', 'Year to scan (e.g., 2025)')
  .option('-m, --month <month>', 'Month to scan (e.g., 2025-12)')
  .option('-q, --quarter <quarter>', 'Quarter to scan (e.g., 2025-Q4)')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options: any): Promise<void> => {
    try {
      await scanCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('extract')
  .description('Stage 2: Extract invoices from emails using AI classification')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-b, --batch-size <n>', 'Number of emails to process per batch', '10')
  .option('--auto-dedup', 'Automatically mark high-confidence duplicates')
  .option('--strict', 'Also auto-mark medium-confidence duplicates')
  .option('--model <id>', 'Override AI model (e.g., gemini-2.5-flash, gpt-4o)')
  .option('--provider <name>', 'Override AI provider (e.g., google, openai, anthropic)')
  .action(async (options: any): Promise<void> => {
    try {
      if (options.model || options.provider) {
        setModelOverrides({ model: options.model, provider: options.provider });
      }
      options.batchSize = parseInt(options.batchSize, 10);
      await extractCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('crawl')
  .description('Stage 3: Crawl links to download remaining invoices via browser')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-b, --batch-size <n>', 'Number of invoices to process per batch', '5')
  .action(async (options: any): Promise<void> => {
    try {
      options.batchSize = parseInt(options.batchSize, 10);
      await crawlCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('review')
  .description('Stage 4: Review items needing manual handling')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-f, --format <format>', 'Output format: table, json, markdown', 'table')
  .option('-d, --deductible <type>', 'Filter by deductibility: full, partial, none, unclear')
  .option('--summary', 'Show tax deductibility summary')
  .option('--year <year>', 'Filter summary by year')
  .option('--include-duplicates', 'Include duplicates in the list')
  .option('-i, --interactive', 'Interactively classify invoices needing review')
  .action(async (options: any): Promise<void> => {
    try {
      if (options.year) options.year = parseInt(options.year, 10);
      await reviewCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('report')
  .description('Stage 5: Generate JSONL/JSON/CSV report of extracted invoices')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-y, --year <year>', 'Year to report (e.g., 2025)')
  .option('-m, --month <month>', 'Month to report (e.g., 2025-12)')
  .option('-q, --quarter <quarter>', 'Quarter to report (e.g., 2025-Q4)')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format: jsonl, json, csv', 'jsonl')
  .option('--status <status>', 'Filter by status: downloaded, manual, all', 'downloaded')
  .action(async (options: any): Promise<void> => {
    try {
      await reportCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('run')
  .description('Run full pipeline: scan → extract → crawl → review → report')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-y, --year <year>', 'Year to process (e.g., 2025)')
  .option('-m, --month <month>', 'Month to process (e.g., 2025-12)')
  .option('-q, --quarter <quarter>', 'Quarter to process (e.g., 2025-Q4)')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('-b, --batch-size <n>', 'Number of emails to process per batch', '10')
  .option('--auto-dedup', 'Automatically mark high-confidence duplicates')
  .option('--strict', 'Also auto-mark medium-confidence duplicates')
  .option('--model <id>', 'Override AI model (e.g., gemini-2.5-flash, gpt-4o)')
  .option('--provider <name>', 'Override AI provider (e.g., google, openai, anthropic)')
  .option('--no-interactive', 'Skip interactive review at the end')
  .action(async (options: any): Promise<void> => {
    try {
      if (options.model || options.provider) {
        setModelOverrides({ model: options.model, provider: options.provider });
      }
      options.batchSize = parseInt(options.batchSize, 10);
      options.noInteractive = !options.interactive;
      await runCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    } finally {
      await closeBrowser();
      closeDb();
    }
  });

// ============================================================================
// UTILITY COMMANDS
// ============================================================================

program
  .command('status')
  .description('Show completion status for a year')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .option('-y, --year <year>', 'Year to show status for (default: current year)')
  .action(async (options: any): Promise<void> => {
    try {
      await statusCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
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
  .action(async (options: any): Promise<void> => {
    try {
      await logCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
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
  .option('--models', 'Interactive model configuration')
  .action(async (options: any): Promise<void> => {
    try {
      await configCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('models')
  .description('View AI model configuration and auth status')
  .option('--available', 'Show all available models')
  .option('--presets', 'Show available presets')
  .action(async (options: any): Promise<void> => {
    try {
      await modelsCommand(options);
    } catch (error: unknown) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('paths')
  .description('Show storage locations (database, config, cache)')
  .option('--json', 'Output as JSON')
  .action((options: any): void => {
    if (options.json) {
      console.log(JSON.stringify(getAllPaths(), null, 2));
    } else {
      printPaths();
    }
  });

// ============================================================================
// SETUP & ERROR HANDLING
// ============================================================================

const setupRequiredCommands: string[] = ['scan', 'extract', 'crawl', 'review', 'report', 'run', 'status'];
const originalParse = program.parse.bind(program);
(program as any).parse = async function(args?: readonly string[]): Promise<Command> {
  const allArgs: readonly string[] = args || process.argv;
  
  if (allArgs.includes('--help') || allArgs.includes('-h')) {
    return originalParse(args);
  }
  
  const commandArg: string = allArgs[2];
  
  if (setupRequiredCommands.includes(commandArg) && needsSetup()) {
    console.log('First run detected. Running initial setup...\n');
    await runSetupWizard();
  }
  
  return originalParse(args);
};

process.on('uncaughtException', (error: Error): void => {
  console.error('Uncaught error:', error.message);
  closeDb();
  process.exit(1);
});

process.on('unhandledRejection', (error: unknown): void => {
  console.error('Unhandled rejection:', (error as Error).message);
  closeDb();
  process.exit(1);
});

program.parse();
