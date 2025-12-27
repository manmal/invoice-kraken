/**
 * Run command - Execute the full pipeline or from a specific stage
 * 
 * Stages: scan → prefilter → classify → extract → crawl → review → report
 * 
 * Usage:
 *   kraxler run                    # Run full pipeline
 *   kraxler run --from classify    # Start from classification
 *   kraxler run --from extract     # Start from extraction
 *   kraxler run --force            # Ignore situation hashes
 */

import { scanCommand } from './scan.js';
import { extractCommand } from './extract.js';
import { crawlCommand } from './crawl.js';
import { reviewCommand } from './review.js';
import { reportCommand } from './report.js';
import { closeBrowser } from '../lib/browser.js';
import { parseDateRange, getYearMonth } from '../lib/dates.js';
import { runInteractiveReview } from '../lib/interactive-review.js';
import { loadConfig } from '../lib/config.js';
import { 
  detectReclassificationNeeded, 
  summarizeReclassificationNeeds,
  markForReclassification,
} from '../lib/reclassification.js';
import type { RunOptions, PipelineStage } from '../types.js';
import { PIPELINE_STAGES } from '../types.js';

// ============================================================================
// Stage Runner
// ============================================================================

interface StageContext {
  account: string;
  year: number;
  month?: number;
  batchSize: number;
  autoDedup: boolean;
  strict: boolean;
  noInteractive: boolean;
  force: boolean;
  dateRangeDisplay: string;
  options: RunOptions;
}

async function runStage(
  stage: PipelineStage,
  context: StageContext
): Promise<void> {
  const { account, year, batchSize, autoDedup, strict, noInteractive, options } = context;
  
  switch (stage) {
    case 'scan':
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: SCAN                                                               │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      await scanCommand(options);
      break;
      
    case 'prefilter':
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: PREFILTER                                                          │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      // Prefilter is currently part of scan, so this is a no-op
      console.log('  (Prefiltering is integrated into scan stage)\n');
      break;
      
    case 'classify':
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: CLASSIFY                                                           │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      // Classification is part of extract - but here we handle reclassification
      await handleReclassification(context);
      break;
      
    case 'extract':
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: EXTRACT                                                            │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      await extractCommand({
        account,
        batchSize,
        autoDedup,
        strict,
      });
      break;
      
    case 'crawl':
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: CRAWL                                                              │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      await crawlCommand({
        account,
        batchSize: Math.min(batchSize, 5), // Browser automation is slower
      });
      break;
      
    case 'review': {
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: REVIEW                                                             │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      const reviewResult = await reviewCommand({
        account,
        format: 'table',
        summary: true,
        year,
        includeDuplicates: false,
      });
      
      // Interactive review if needed
      if (reviewResult.needsReview > 0 && !noInteractive) {
        console.log('\n');
        console.log('┌────────────────────────────────────────────────────────────────────────────┐');
        console.log('│  INTERACTIVE REVIEW                                                        │');
        console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
        await runInteractiveReview(account, year);
      }
      break;
    }
      
    case 'report':
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE: REPORT                                                             │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      await reportCommand({
        ...options,
        format: 'jsonl',
      });
      break;
  }
}

// ============================================================================
// Reclassification Handling
// ============================================================================

async function handleReclassification(context: StageContext): Promise<void> {
  const { account, force } = context;
  const config = loadConfig();
  
  // Detect invoices needing reclassification
  const needs = detectReclassificationNeeded(account, config);
  
  if (needs.length === 0 && !force) {
    console.log('  ✓ No invoices need reclassification.\n');
    return;
  }
  
  if (force) {
    console.log('  ⚠️  Force flag set - all invoices will be reclassified.\n');
    // Mark all for reclassification by clearing their hashes
    // This will happen in the extract stage
    return;
  }
  
  const summary = summarizeReclassificationNeeds(needs);
  
  console.log(`  Found ${summary.total} invoice(s) needing reclassification:\n`);
  
  if (summary.byReason.situation_changed > 0) {
    console.log(`    • ${summary.byReason.situation_changed} with changed situation config`);
  }
  if (summary.byReason.never_classified > 0) {
    console.log(`    • ${summary.byReason.never_classified} never classified with situation context`);
  }
  if (summary.byReason.no_situation_coverage > 0) {
    console.log(`    • ${summary.byReason.no_situation_coverage} with no situation coverage`);
  }
  
  if (summary.dateRange) {
    console.log(`\n    Date range: ${summary.dateRange.from} to ${summary.dateRange.to}`);
  }
  
  // Mark them for reclassification
  const emailIds = needs.map(n => n.emailId);
  const marked = markForReclassification(account, emailIds);
  
  console.log(`\n  ✓ Marked ${marked} invoice(s) for reclassification.`);
  console.log('    They will be processed in the extract stage.\n');
}

// ============================================================================
// Main Run Command
// ============================================================================

export async function runCommand(options: RunOptions): Promise<void> {
  const { 
    account, 
    batchSize = 10, 
    autoDedup = false, 
    strict = false, 
    noInteractive = false,
    from,
    force = false,
  } = options;
  
  // Parse date range
  let dateRange;
  try {
    dateRange = parseDateRange(options);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
  
  const fromYM = getYearMonth(dateRange.from);
  
  // Validate --from stage
  let startIndex = 0;
  if (from) {
    startIndex = PIPELINE_STAGES.indexOf(from);
    if (startIndex === -1) {
      console.error(`Error: Unknown stage "${from}"`);
      console.log(`Valid stages: ${PIPELINE_STAGES.join(', ')}`);
      process.exit(1);
    }
  }
  
  const stagesToRun = PIPELINE_STAGES.slice(startIndex);
  
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🇦🇹 KRAXLER - Invoice Processing Pipeline                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nAccount: ${account}`);
  console.log(`Period: ${dateRange.display}`);
  
  if (from) {
    console.log(`Starting from: ${from}`);
  }
  if (force) {
    console.log(`Mode: Force reclassification`);
  }
  
  console.log(`\nStages: ${stagesToRun.join(' → ')}\n`);
  
  // Check for reclassification needs before running
  if (!force && startIndex === 0) {
    const config = loadConfig();
    const reclassNeeds = detectReclassificationNeeded(account, config);
    
    if (reclassNeeds.length > 0) {
      const summary = summarizeReclassificationNeeds(reclassNeeds);
      
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  ⚠️  RECLASSIFICATION NEEDED                                                │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      
      console.log(`  ${summary.total} invoice(s) may need reclassification due to config changes.`);
      
      if (summary.dateRange) {
        console.log(`  Date range: ${summary.dateRange.from} to ${summary.dateRange.to}`);
      }
      
      console.log(`\n  These will be automatically processed during the extract stage.`);
      console.log(`  Use --from classify to explicitly trigger reclassification.\n`);
    }
  }
  
  const startTime: number = Date.now();
  const reportPath: string | null = null;
  
  const context: StageContext = {
    account,
    year: fromYM.year,
    month: fromYM.month,
    batchSize,
    autoDedup,
    strict,
    noInteractive,
    force,
    dateRangeDisplay: dateRange.display,
    options,
  };
  
  try {
    for (const stage of stagesToRun) {
      console.log('\n');
      await runStage(stage, context);
    }
  } finally {
    await closeBrowser();
  }
  
  const duration: string = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ PIPELINE COMPLETE                                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal time: ${duration}s`);
  console.log(`\nOutputs:`);
  console.log(`  📁 Invoices: ./invoices/`);
  if (reportPath) {
    console.log(`  📄 Report: ${reportPath}`);
  }
  console.log(`\nNext steps:`);
  console.log(`  • Review any manual items listed above`);
  console.log(`  • Run "kraxler review -a ${account} --summary" for tax summary`);
}
