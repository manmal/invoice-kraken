/**
 * List command - Display remaining invoices that need manual handling
 */

import { getDb, getManualItems, getDeductibilitySummary, getEmailsByStatus } from '../lib/db.js';

export async function listCommand(options) {
  const { account, format = 'table', deductible: deductibleFilter, summary, includeDuplicates } = options;
  
  const db = getDb();
  
  // Summary mode
  if (summary) {
    printDeductibilitySummary(account, options.year);
    return;
  }
  
  // Get items based on filter
  let items = getManualItems(account, deductibleFilter);
  
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
      console.log(`Run "npm run list -- --account ${account} --summary" for deductibility summary.`);
    }
    return;
  }
  
  // Format output
  if (format === 'json') {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  
  if (format === 'markdown') {
    printMarkdown(items);
    return;
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
  const deductCounts = {
    full: items.filter(i => i.deductible === 'full').length,
    vehicle: items.filter(i => i.deductible === 'vehicle').length,
    meals: items.filter(i => i.deductible === 'meals').length,
    telecom: items.filter(i => i.deductible === 'telecom').length,
    none: items.filter(i => i.deductible === 'none').length,
    unclear: items.filter(i => i.deductible === 'unclear' || !i.deductible).length,
  };
  
  const parts = [];
  if (deductCounts.full > 0) parts.push(`💼 ${deductCounts.full} full`);
  if (deductCounts.vehicle > 0) parts.push(`🚗 ${deductCounts.vehicle} vehicle`);
  if (deductCounts.meals > 0) parts.push(`🍽️ ${deductCounts.meals} meals`);
  if (deductCounts.telecom > 0) parts.push(`📱 ${deductCounts.telecom} telecom`);
  if (deductCounts.unclear > 0) parts.push(`❓ ${deductCounts.unclear} unclear`);
  if (deductCounts.none > 0) parts.push(`🚫 ${deductCounts.none} none`);
  
  if (parts.length > 0) {
    console.log(`\nDeductibility: ${parts.join(', ')}`);
  }
}

function printTable(items, includeDuplicates) {
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
    const from = truncate(extractDomain(item.sender) || item.sender, 23);
    const deduct = getDeductIcon(item.deductible);
    const status = item.status === 'duplicate' ? '⊘ dup' : '⚠ manual';
    
    let details = '';
    if (item.status === 'duplicate') {
      details = `Duplicate of ${item.duplicate_of?.substring(0, 8)}...`;
    } else if (item.notes) {
      details = truncate(item.notes, 35);
    } else {
      details = truncate(item.subject, 35);
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

function printMarkdown(items) {
  console.log('# Invoices Requiring Manual Handling\n');
  console.log('| Date | From | Deductible | Status | Details |');
  console.log('|------|------|------------|--------|---------|');
  
  for (const item of items) {
    const date = formatDate(item.date);
    const from = extractDomain(item.sender) || item.sender;
    const deduct = item.deductible || 'unclear';
    const status = item.status;
    const details = item.notes || item.subject;
    
    console.log(`| ${date} | ${from} | ${deduct} | ${status} | ${details} |`);
  }
}

function printDeductibilitySummary(account, year) {
  const summary = getDeductibilitySummary(account, year);
  
  if (summary.length === 0) {
    console.log('No downloaded invoices found.');
    return;
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
}

function getDeductIcon(deductible) {
  const icons = {
    full: '💼',
    partial: '📊',
    none: '🚫',
    unclear: '❓',
  };
  return icons[deductible] || '❓';
}

function getDeductLabel(deductible) {
  const labels = {
    full: 'Fully Deductible',
    partial: 'Partially Deductible',
    none: 'Not Deductible',
    unclear: 'Needs Review',
  };
  return labels[deductible] || 'Unknown';
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr.substring(0, 10);
    return date.toISOString().substring(0, 10);
  } catch {
    return dateStr.substring(0, 10);
  }
}

function formatCurrency(cents) {
  if (!cents) return '€0.00';
  const euros = cents / 100;
  return `€${euros.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function extractDomain(sender) {
  if (!sender) return null;
  const match = sender.match(/@([^@>]+)/);
  return match ? match[1] : null;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

function padRight(str, len) {
  str = str || '';
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = str || '';
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}
