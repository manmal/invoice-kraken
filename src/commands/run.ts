/**
 * Run command - Execute the full pipeline: scan → extract → crawl → review → report
 */

import { scanCommand } from './scan.js';
import { extractCommand } from './extract.js';
import { crawlCommand } from './crawl.js';
import { reviewCommand } from './review.js';
import { reportCommand } from './report.js';
import { closeBrowser } from '../lib/browser.js';
import { parseDateRange, getYearMonth } from '../lib/dates.js';
import { runInteractiveReview } from '../lib/interactive-review.js';
import type { RunOptions } from '../types.js';

export async function runCommand(options: RunOptions): Promise<void> {
  const { account, batchSize = 10, autoDedup = false, strict = false, noInteractive = false } = options;
  
  // Parse date range
  let dateRange;
  try {
    dateRange = parseDateRange(options);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
  
  const fromYM = getYearMonth(dateRange.from);
  
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🇦🇹 KRAXLER - Full Pipeline                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nAccount: ${account}`);
  console.log(`Period: ${dateRange.display}\n`);
  
  const startTime: number = Date.now();
  let reportPath: string | null = null;
  
  try {
    // Stage 1: Scan
    console.log('┌────────────────────────────────────────────────────────────────────────────┐');
    console.log('│  STAGE 1: SCAN                                                             │');
    console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
    
    await scanCommand({
      ...options, // Pass through date options (includes account)
    });
    
    console.log('\n');
    
    // Stage 2: Extract
    console.log('┌────────────────────────────────────────────────────────────────────────────┐');
    console.log('│  STAGE 2: EXTRACT                                                          │');
    console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
    
    await extractCommand({
      account,
      batchSize,
      autoDedup,
      strict,
    });
    
    console.log('\n');
    
    // Stage 3: Crawl
    console.log('┌────────────────────────────────────────────────────────────────────────────┐');
    console.log('│  STAGE 3: CRAWL                                                            │');
    console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
    
    await crawlCommand({
      account,
      batchSize: Math.min(batchSize, 5), // Browser automation is slower
    });
    
    console.log('\n');
    
    // Stage 4: Review (summary)
    console.log('┌────────────────────────────────────────────────────────────────────────────┐');
    console.log('│  STAGE 4: REVIEW                                                           │');
    console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
    
    const reviewResult = await reviewCommand({
      account,
      format: 'table',
      summary: true,
      year: fromYM.year,
      includeDuplicates: false,
    });
    
    console.log('\n');
    
    // Stage 4b: Interactive review (if items need review and not disabled)
    if (reviewResult.needsReview > 0 && !noInteractive) {
      console.log('┌────────────────────────────────────────────────────────────────────────────┐');
      console.log('│  STAGE 4b: INTERACTIVE REVIEW                                              │');
      console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
      
      await runInteractiveReview(account, fromYM.year);
      
      console.log('\n');
    }
    
    // Stage 5: Report
    console.log('┌────────────────────────────────────────────────────────────────────────────┐');
    console.log('│  STAGE 5: REPORT                                                           │');
    console.log('└────────────────────────────────────────────────────────────────────────────┘\n');
    
    reportPath = await reportCommand({
      ...options, // Pass through date options (includes account)
      format: 'jsonl',
    });
    
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
