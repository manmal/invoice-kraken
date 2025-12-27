/**
 * Review command - Display remaining invoices that need manual handling
 * Optionally run interactive classification
 */

import { getManualItems, getDeductibilitySummary, getEmailsByStatus, getEmailsNeedingReview } from '../lib/db.js';
import { runInteractiveReview } from '../lib/interactive-review.js';
import type { Email, ReviewOptions, DeductibleCategory } from '../types.js';

interface DeductibilitySummaryRow {
  deductible: DeductibleCategory | null;
  count: number;
  total_cents: number | null;
}

export async function reviewCommand(options: ReviewOptions): Promise<{ needsReview: number }> {
  const { account, format = 'table', deductible: deductibleFilter, summary, includeDuplicates, interactive } = options;
  
  // Interactive mode
  if (interactive) {
    await runInteractiveReview(account, options.year);
    return { needsReview: 0 };
  }
  
  // Summary mode
  if (summary) {
    printDeductibilitySummary(account, options.year);
    const needsReview = getEmailsNeedingReview(account, options.year).length;
    return { needsReview };
  }
  
  // Get items based on filter
  let items: Email[] = getManualItems(account, deductibleFilter);
  
  if (includeDuplicates) {
    const duplicates = getEmailsByStatus(account, 'duplicate', 1000);
    items = [...items, ...duplicates];
  }
  
  if (items.length === 0) {
    console.log('No items requiring manual handling.');
    
    // Show quick summary
    const downloaded = getEmailsByStatus(account, 'downloaded', 10000);
    if (downloaded.length > 0) {
      console.log(`\n✓ ${downloaded.length} invoices have been downloaded.`);
      console.log(`Run "kraxler review --account ${account} --summary" for deductibility summary.`);
    }
    return { needsReview: 0 };
  }
  
  // Format output
  if (format === 'json') {
    console.log(JSON.stringify(items, null, 2));
    return { needsReview: 0 };
  }
  
  if (format === 'markdown') {
    printMarkdown(items);
    return { needsReview: 0 };
  }
  
  // Default: table format
  printTable(items, includeDuplicates);
  
  // Summary counts
  console.log(`\n${'─'.repeat(70)}`);
  
  const manualCount = items.filter(i => i.status === 'manual').length;
  const duplicateCount = items.filter(i => i.status === 'duplicate').length;
  
  if (manualCount > 0) {
    console.log(`⚠ ${manualCount} items require manual handling`);
  }
  if (duplicateCount > 0) {
    console.log(`⊘ ${duplicateCount} duplicates`);
  }
  
  // Deductibility breakdown for manual items
  const deductCounts: Record<string, number> = {
    full: items.filter(i => i.deductible === 'full').length,
    vehicle: items.filter(i => i.deductible === 'vehicle').length,
    meals: items.filter(i => i.deductible === 'meals').length,
    telecom: items.filter(i => i.deductible === 'telecom').length,
    none: items.filter(i => i.deductible === 'none').length,
    unclear: items.filter(i => i.deductible === 'unclear' || !i.deductible).length,
  };
  
  const parts: string[] = [];
  if (deductCounts.full > 0) parts.push(`💼 ${deductCounts.full} full`);
  if (deductCounts.vehicle > 0) parts.push(`🚗 ${deductCounts.vehicle} vehicle`);
  if (deductCounts.meals > 0) parts.push(`🍽️ ${deductCounts.meals} meals`);
  if (deductCounts.telecom > 0) parts.push(`📱 ${deductCounts.telecom} telecom`);
  if (deductCounts.unclear > 0) parts.push(`❓ ${deductCounts.unclear} unclear`);
  if (deductCounts.none > 0) parts.push(`🚫 ${deductCounts.none} none`);
  
  if (parts.length > 0) {
    console.log(`\nDeductibility: ${parts.join(', ')}`);
  }
  
  return { needsReview: deductCounts.unclear };
}

function printTable(items: Email[], _includeDuplicates: boolean): void {
  console.log(`\n${'─'.repeat(100)}`);
  console.log(
    padRight('Date', 12) +
    padRight('From', 25) +
    padRight('Deduct', 10) +
    padRight('Status', 12) +
    'Details'
  );
  console.log(`${'─'.repeat(100)}`);
  
  for (const item of items) {
    const date = formatDate(item.date);
    const from = truncate(extractDomain(item.sender) || item.sender || '', 23);
    const deduct = getDeductIcon(item.deductible);
    const status = item.status === 'duplicate' ? '⊘ dup' : '⚠ manual';
    
    let details = '';
    if (item.status === 'duplicate') {
      details = `Duplicate of ${item.duplicate_of?.substring(0, 8)}...`;
    } else if (item.notes) {
      details = truncate(item.notes, 35);
    } else {
      details = truncate(item.subject || '', 35);
    }
    
    console.log(
      padRight(date, 12) +
      padRight(from, 25) +
      padRight(deduct, 10) +
      padRight(status, 12) +
      details
    );
    
    // Show link if available
    if (item.notes && item.notes.includes('http')) {
      const urlMatch = item.notes.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        console.log(`  🔗 ${urlMatch[0]}`);
      }
    }
  }
}

function printMarkdown(items: Email[]): void {
  console.log('# Invoices Requiring Manual Handling\n');
  console.log('| Date | From | Deductible | Status | Details |');
  console.log('|------|------|------------|--------|---------|');
  
  for (const item of items) {
    const date = formatDate(item.date);
    const from = extractDomain(item.sender) || item.sender || '';
    const deduct = item.deductible || 'unclear';
    const status = item.status;
    const details = item.notes || item.subject || '';
    
    console.log(`| ${date} | ${from} | ${deduct} | ${status} | ${details} |`);
  }
}

function printDeductibilitySummary(account: string, year: number | undefined): { needsReview: number } {
  const summary = getDeductibilitySummary(account, year) as DeductibilitySummaryRow[];
  
  if (summary.length === 0) {
    console.log('No downloaded invoices found.');
    return { needsReview: 0 };
  }
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 TAX DEDUCTIBILITY SUMMARY${year ? ` FOR ${year}` : ''}`);
  console.log(`${'═'.repeat(50)}\n`);
  
  let totalDeductible = 0;
  let partialDeductible = 0;
  
  for (const row of summary) {
    const icon = getDeductIcon(row.deductible);
    const amount = formatCurrency(row.total_cents);
    const label = getDeductLabel(row.deductible);
    
    console.log(`${icon} ${padRight(label + ':', 25)} ${padLeft(amount, 12)} (${row.count} invoices)`);
    
    if (row.deductible === 'full') {
      totalDeductible += row.total_cents || 0;
    } else if (row.deductible === 'partial') {
      // Assume 50% average for partial
      partialDeductible += Math.round((row.total_cents || 0) * 0.5);
    }
  }
  
  const estimatedTotal = totalDeductible + partialDeductible;
  
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`💰 Estimated deductible: ${formatCurrency(estimatedTotal)}`);
  console.log(`   (Full: ${formatCurrency(totalDeductible)} + ~50% of partial: ${formatCurrency(partialDeductible)})`);
  
  // Get counts
  const downloaded = getEmailsByStatus(account, 'downloaded', 10000);
  const manual = getManualItems(account);
  const duplicates = getEmailsByStatus(account, 'duplicate', 10000);
  
  console.log(`\n📁 Status:`);
  console.log(`   ✓ Downloaded: ${downloaded.length}`);
  console.log(`   ⊘ Duplicates: ${duplicates.length}`);
  console.log(`   ⚠ Manual: ${manual.length}`);
  
  // Count unclear items
  const needsReview = getEmailsNeedingReview(account, year).length;
  return { needsReview };
}

function getDeductIcon(deductible: DeductibleCategory | null): string {
  const icons: Record<string, string> = {
    full: '💼',
    partial: '📊',
    none: '🚫',
    unclear: '❓',
  };
  return icons[deductible || 'unclear'] || '❓';
}

function getDeductLabel(deductible: DeductibleCategory | null): string {
  const labels: Record<string, string> = {
    full: 'Fully Deductible',
    partial: 'Partially Deductible',
    none: 'Not Deductible',
    unclear: 'Needs Review',
  };
  return labels[deductible || 'unclear'] || 'Unknown';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr.substring(0, 10);
    return date.toISOString().substring(0, 10);
  } catch {
    return dateStr.substring(0, 10);
  }
}

function formatCurrency(cents: number | null): string {
  if (!cents) return '€0.00';
  const euros = cents / 100;
  return `€${euros.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function extractDomain(sender: string | null): string | null {
  if (!sender) return null;
  const match = sender.match(/@([^@>]+)/);
  return match ? match[1] : null;
}

function truncate(str: string | null, len: number): string {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

function padRight(str: string | null, len: number): string {
  const s = str || '';
  return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

function padLeft(str: string | null, len: number): string {
  const s = str || '';
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}
