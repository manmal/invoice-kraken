/**
 * Log command - Show action history
 */

import { getDb } from '../lib/db.js';
import { getRecentActions, getFailedActions, initActionLog } from '../lib/action-log.js';

export async function logCommand(options) {
  const { account, failed, limit = 20 } = options;
  
  getDb();
  initActionLog();
  
  const actions = failed 
    ? getFailedActions(account)
    : getRecentActions(account, parseInt(limit, 10));
  
  if (actions.length === 0) {
    console.log(failed 
      ? 'No failed actions found.'
      : 'No actions recorded yet.');
    return;
  }
  
  console.log(`\n${'═'.repeat(90)}`);
  console.log(failed ? 'FAILED ACTIONS' : 'ACTION LOG');
  console.log(`${'═'.repeat(90)}\n`);
  
  console.log(
    padRight('Date/Time', 20) +
    padRight('Action', 12) +
    padRight('Scope', 14) +
    padRight('Status', 12) +
    padRight('Duration', 10) +
    'Results'
  );
  console.log('─'.repeat(90));
  
  for (const action of actions) {
    const date = formatDate(action.started_at);
    const scope = formatScope(action);
    const status = formatStatus(action.status);
    const duration = action.duration_seconds ? formatDuration(action.duration_seconds) : '-';
    const results = formatResults(action);
    
    console.log(
      padRight(date, 20) +
      padRight(action.action, 12) +
      padRight(scope, 14) +
      padRight(status, 12) +
      padRight(duration, 10) +
      results
    );
    
    if (action.error_message) {
      console.log(`  └─ Error: ${action.error_message}`);
    }
  }
  
  console.log('');
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatScope(action) {
  if (!action.year) return 'all';
  if (action.month_from === action.month_to) {
    return `${action.year}/${String(action.month_from).padStart(2, '0')}`;
  }
  return `${action.year}/${action.month_from}-${action.month_to}`;
}

function formatStatus(status) {
  const icons = {
    completed: '✓ done',
    running: '⏳ running',
    failed: '✗ failed',
    interrupted: '⚡ stopped',
  };
  return icons[status] || status;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatResults(action) {
  const parts = [];
  
  if (action.emails_found > 0) {
    parts.push(`${action.emails_found} found`);
  }
  if (action.emails_new > 0) {
    parts.push(`${action.emails_new} new`);
  }
  if (action.emails_processed > 0) {
    parts.push(`${action.emails_processed} processed`);
  }
  if (action.emails_skipped > 0) {
    parts.push(`${action.emails_skipped} skipped`);
  }
  if (action.emails_failed > 0) {
    parts.push(`${action.emails_failed} failed`);
  }
  
  return parts.join(', ') || '-';
}

function padRight(str, len) {
  str = String(str);
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}
