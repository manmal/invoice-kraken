#!/usr/bin/env node

/**
 * Invoice Kraken - Search Gmail for invoices using gogcli and pi's scout/browser skills
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('invoice-kraken')
  .description('Search Gmail for invoices using gogcli and pi')
  .version('0.1.0');

program
  .command('search')
  .description('Search Gmail for invoice-related emails')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .requiredOption('-y, --year <year>', 'Year to search (e.g., 2024)')
  .action(async (options) => {
    console.log('Search command not yet implemented');
    console.log('Options:', options);
  });

program
  .command('investigate')
  .description('Investigate found emails and filter/extract invoices')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .action(async (options) => {
    console.log('Investigate command not yet implemented');
    console.log('Options:', options);
  });

program
  .command('download')
  .description('Download remaining invoices using pi scout/browser')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .action(async (options) => {
    console.log('Download command not yet implemented');
    console.log('Options:', options);
  });

program
  .command('list')
  .description('List remaining invoices that need manual handling')
  .requiredOption('-a, --account <email>', 'Gmail account to use')
  .action(async (options) => {
    console.log('List command not yet implemented');
    console.log('Options:', options);
  });

program.parse();
