/**
 * Status command - Show completion status for a year
 */

import { getDb } from '../lib/db.js';
import { getYearStatus, getRecentActions, initActionLog } from '../lib/action-log.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function statusCommand(options) {
  const { account, year } = options;
  const yearNum = year ? parseInt(year, 10) : new Date().getFullYear();
  
  getDb();
  initActionLog();
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 STATUS FOR ${account} - ${yearNum}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  const status = getYearStatus(account, yearNum);
  
  // Search status
  console.log('Search:');
  printMonthStatus(status.searched, status.notSearched, '✓', '✗');
  
  // Investigate status
  console.log('\nInvestigate:');
  printMonthStatusDetailed(
    status.investigated,
    status.partiallyInvestigated,
    status.notInvestigated,
    status.notSearched
  );
  
  // Download status  
  console.log('\nDownload:');
  printMonthStatusDetailed(
    status.downloaded,
    status.partiallyDownloaded,
    status.notDownloaded || [],
    [...status.notSearched, ...status.notInvestigated]
  );
  
  // Recent actions
  const recent = getRecentActions(account, 5);
  if (recent.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('Recent Actions:');
    for (const action of recent) {
      const date = new Date(action.started_at).toLocaleString();
      const scope = action.year 
        ? action.month_from === action.month_to 
          ? `${action.year}/${String(action.month_from).padStart(2, '0')}`
          : `${action.year}/${action.month_from}-${action.month_to}`
        : 'all';
      const statusIcon = action.status === 'completed' ? '✓' : 
                         action.status === 'running' ? '⏳' :
                         action.status === 'interrupted' ? '⚡' : '✗';
      const counts = action.emails_new > 0 
        ? `${action.emails_found} found, ${action.emails_new} new`
        : action.emails_processed > 0
          ? `${action.emails_processed} processed`
          : '';
      
      console.log(`  ${statusIcon} ${padRight(action.action, 12)} ${padRight(scope, 12)} ${counts}`);
      console.log(`    ${date}${action.duration_seconds ? ` (${formatDuration(action.duration_seconds)})` : ''}`);
    }
  }
  
  console.log('');
}

function printMonthStatus(done, notDone, doneIcon, notDoneIcon) {
  const line = MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    if (done.includes(month)) {
      return `${doneIcon} ${name}`;
    } else if (notDone.includes(month)) {
      return `${notDoneIcon} ${name}`;
    }
    return `  ${name}`;
  }).join('  ');
  
  console.log(`  ${line}`);
}

function printMonthStatusDetailed(done, partial, notDone, skipped) {
  const line = MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    if (done.includes(month)) {
      return `✓ ${name}`;
    } else if (partial.includes(month)) {
      return `⏳${name}`;
    } else if (notDone.includes(month)) {
      return `✗ ${name}`;
    } else if (skipped.includes(month)) {
      return `- ${name}`;
    }
    return `  ${name}`;
  }).join('  ');
  
  console.log(`  ${line}`);
  
  // Legend
  const legendParts = [];
  if (done.length) legendParts.push('✓=done');
  if (partial.length) legendParts.push('⏳=partial');
  if (notDone.length) legendParts.push('✗=pending');
  if (skipped.length) legendParts.push('-=skipped');
  if (legendParts.length > 1) {
    console.log(`  (${legendParts.join(', ')})`);
  }
}

function padRight(str, len) {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
