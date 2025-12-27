/**
 * Interactive review module for manual invoice classification
 */

import * as readline from 'readline';
import { getEmailsNeedingReview, saveManualReview, type ManualReviewInput } from './db.js';
import type { Email, ReviewableCategory } from '../types.js';

// ============================================================================
// Review Options Configuration
// ============================================================================

interface ReviewOption {
  key: string;
  category: ReviewableCategory | null;
  label: string;
  incomeTaxPercent: number;
  vatRecoverable: boolean;
}

const REVIEW_OPTIONS: ReviewOption[] = [
  { key: '1', category: 'full', label: '💼 Fully Deductible (100% EST, VAT recoverable)', incomeTaxPercent: 100, vatRecoverable: true },
  { key: '2', category: 'vehicle', label: '🚗 Vehicle Expense (100% EST, no VAT)', incomeTaxPercent: 100, vatRecoverable: false },
  { key: '3', category: 'meals', label: '🍽️  Business Meals (50% EST, VAT recoverable)', incomeTaxPercent: 50, vatRecoverable: true },
  { key: '4', category: 'telecom', label: '📱 Telecom (50% EST, 50% VAT)', incomeTaxPercent: 50, vatRecoverable: true },
  { key: '5', category: 'partial', label: '📊 Other Partial (custom %)', incomeTaxPercent: 50, vatRecoverable: true },
  { key: '6', category: 'none', label: '🚫 Not Deductible (personal)', incomeTaxPercent: 0, vatRecoverable: false },
];

const SKIP_KEY = 's';
const QUIT_KEY = 'q';
const OPEN_KEY = 'o';

// ============================================================================
// Interactive Review Runner
// ============================================================================

export interface InteractiveReviewResult {
  reviewed: number;
  skipped: number;
  total: number;
}

export async function runInteractiveReview(
  account: string,
  year?: number
): Promise<InteractiveReviewResult> {
  const emails = getEmailsNeedingReview(account, year);
  
  if (emails.length === 0) {
    console.log('✅ No invoices need manual review.\n');
    return { reviewed: 0, skipped: 0, total: 0 };
  }
  
  console.log(`\n┌────────────────────────────────────────────────────────────────────────────┐`);
  console.log(`│  📋 INTERACTIVE REVIEW                                                     │`);
  console.log(`└────────────────────────────────────────────────────────────────────────────┘\n`);
  console.log(`Found ${emails.length} invoice(s) needing classification.\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  let reviewed = 0;
  let skipped = 0;
  
  try {
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      displayEmailForReview(email, i + 1, emails.length);
      
      const choice = await promptUserChoice(rl, email);
      
      if (choice === 'quit') {
        console.log('\n👋 Exiting review. Progress saved.\n');
        break;
      }
      
      if (choice === 'skip') {
        skipped++;
        console.log('  ⏭️  Skipped\n');
        continue;
      }
      
      if (choice === 'open') {
        await openInvoiceFile(email);
        i--; // Re-show the same email
        continue;
      }
      
      // Save the review
      saveManualReview(email.id, account, choice);
      reviewed++;
      
      const icon = getCategoryIcon(choice.category);
      console.log(`  ${icon} Saved as: ${formatCategory(choice.category)}\n`);
    }
  } finally {
    rl.close();
  }
  
  // Summary
  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`Review session complete:`);
  console.log(`  ✅ Reviewed: ${reviewed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  📋 Remaining: ${emails.length - reviewed - skipped}`);
  console.log(`──────────────────────────────────────────────────────────\n`);
  
  return { reviewed, skipped, total: emails.length };
}

// ============================================================================
// Display Functions
// ============================================================================

function displayEmailForReview(email: Email, index: number, total: number): void {
  console.log(`┌──────────────────────────────────────────────────────────`);
  console.log(`│ [${index}/${total}] ${truncate(email.subject || 'No subject', 50)}`);
  console.log(`├──────────────────────────────────────────────────────────`);
  console.log(`│ From:   ${email.sender || 'Unknown'}`);
  console.log(`│ Date:   ${email.date || 'Unknown'}`);
  console.log(`│ Amount: ${email.invoice_amount || 'Unknown'}`);
  
  if (email.deductible_reason) {
    console.log(`│ AI:     ${truncate(email.deductible_reason, 50)}`);
  }
  
  if (email.invoice_path) {
    console.log(`│ File:   ${email.invoice_path}`);
  }
  console.log(`└──────────────────────────────────────────────────────────`);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function getCategoryIcon(category: ReviewableCategory): string {
  const icons: Record<ReviewableCategory, string> = {
    full: '💼',
    vehicle: '🚗',
    meals: '🍽️',
    telecom: '📱',
    gifts: '🎁',
    partial: '📊',
    none: '🚫',
  };
  return icons[category] || '❓';
}

function formatCategory(category: ReviewableCategory): string {
  const names: Record<ReviewableCategory, string> = {
    full: 'Fully Deductible',
    vehicle: 'Vehicle Expense',
    meals: 'Business Meals',
    telecom: 'Telecom',
    gifts: 'Business Gifts',
    partial: 'Partial',
    none: 'Not Deductible',
  };
  return names[category] || category;
}

// ============================================================================
// User Input Functions
// ============================================================================

type PromptResult = ManualReviewInput | 'skip' | 'quit' | 'open';

async function promptUserChoice(rl: readline.Interface, email: Email): Promise<PromptResult> {
  // Show options
  console.log(`\nSelect category:`);
  for (const opt of REVIEW_OPTIONS) {
    console.log(`  [${opt.key}] ${opt.label}`);
  }
  console.log(`  [${OPEN_KEY}] 📂 Open file`);
  console.log(`  [${SKIP_KEY}] ⏭️  Skip (review later)`);
  console.log(`  [${QUIT_KEY}] 🚪 Quit`);
  
  const answer = await question(rl, '\n> ');
  const key = answer.trim().toLowerCase();
  
  if (key === QUIT_KEY) return 'quit';
  if (key === SKIP_KEY) return 'skip';
  if (key === OPEN_KEY) return 'open';
  
  const option = REVIEW_OPTIONS.find(o => o.key === key);
  if (!option || !option.category) {
    console.log('  ⚠️  Invalid choice, please try again.');
    return promptUserChoice(rl, email);
  }
  
  let incomeTaxPercent = option.incomeTaxPercent;
  let vatRecoverable = option.vatRecoverable;
  
  // For partial, ask for custom percentage
  if (option.category === 'partial') {
    const percentStr = await question(rl, '  Income tax deductible % (0-100): ');
    const percent = parseInt(percentStr, 10);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      console.log('  ⚠️  Invalid percentage, using 50%');
      incomeTaxPercent = 50;
    } else {
      incomeTaxPercent = percent;
    }
    
    const vatStr = await question(rl, '  VAT recoverable? (y/n): ');
    vatRecoverable = vatStr.trim().toLowerCase() === 'y';
  }
  
  // Optional reason
  const reason = await question(rl, '  Reason (Enter to skip): ');
  
  return {
    category: option.category,
    reason: reason.trim() || undefined,
    incomeTaxPercent,
    vatRecoverable,
  };
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

// ============================================================================
// File Operations
// ============================================================================

async function openInvoiceFile(email: Email): Promise<void> {
  if (!email.invoice_path) {
    console.log('  ⚠️  No file available to open.\n');
    return;
  }
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Use 'open' on macOS, 'xdg-open' on Linux, 'start' on Windows
    const platform = process.platform;
    let cmd: string;
    
    if (platform === 'darwin') {
      cmd = `open "${email.invoice_path}"`;
    } else if (platform === 'win32') {
      cmd = `start "" "${email.invoice_path}"`;
    } else {
      cmd = `xdg-open "${email.invoice_path}"`;
    }
    
    await execAsync(cmd);
    console.log('  📂 Opened file. Press Enter to continue...');
  } catch (error) {
    console.log(`  ⚠️  Could not open file: ${(error as Error).message}\n`);
  }
}
