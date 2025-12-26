/**
 * Action log for tracking work performed
 */

import { getDb } from './db.js';

// Initialize action log schema
export function initActionLog() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      account TEXT NOT NULL,
      year INTEGER,
      month_from INTEGER,
      month_to INTEGER,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      emails_found INTEGER DEFAULT 0,
      emails_processed INTEGER DEFAULT 0,
      emails_new INTEGER DEFAULT 0,
      emails_skipped INTEGER DEFAULT 0,
      emails_failed INTEGER DEFAULT 0,
      error_message TEXT,
      duration_seconds REAL,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_action_log_account ON action_log(account);
    CREATE INDEX IF NOT EXISTS idx_action_log_action ON action_log(action);
    CREATE INDEX IF NOT EXISTS idx_action_log_year_month ON action_log(year, month_from, month_to);
    CREATE INDEX IF NOT EXISTS idx_action_log_status ON action_log(status);
  `);
}

/**
 * Start a new action
 */
export function startAction(options) {
  const db = getDb();
  initActionLog();
  
  const { action, account, year = null, monthFrom = null, monthTo = null } = options;
  
  const stmt = db.prepare(`
    INSERT INTO action_log (action, account, year, month_from, month_to, started_at, status)
    VALUES ($action, $account, $year, $monthFrom, $monthTo, $startedAt, 'running')
  `);
  
  const result = stmt.run({
    $action: action,
    $account: account,
    $year: year,
    $monthFrom: monthFrom,
    $monthTo: monthTo,
    $startedAt: new Date().toISOString(),
  });
  
  return result.lastInsertRowid;
}

/**
 * Update action progress
 */
export function updateActionProgress(actionId, progress) {
  const db = getDb();
  
  const updates = [];
  const params = { $id: actionId };
  
  if (progress.emailsFound !== undefined) {
    updates.push('emails_found = $emailsFound');
    params.$emailsFound = progress.emailsFound;
  }
  if (progress.emailsProcessed !== undefined) {
    updates.push('emails_processed = $emailsProcessed');
    params.$emailsProcessed = progress.emailsProcessed;
  }
  if (progress.emailsNew !== undefined) {
    updates.push('emails_new = $emailsNew');
    params.$emailsNew = progress.emailsNew;
  }
  if (progress.emailsSkipped !== undefined) {
    updates.push('emails_skipped = $emailsSkipped');
    params.$emailsSkipped = progress.emailsSkipped;
  }
  if (progress.emailsFailed !== undefined) {
    updates.push('emails_failed = $emailsFailed');
    params.$emailsFailed = progress.emailsFailed;
  }
  
  if (updates.length === 0) return;
  
  const stmt = db.prepare(`UPDATE action_log SET ${updates.join(', ')} WHERE id = $id`);
  stmt.run(params);
}

/**
 * Complete an action successfully
 */
export function completeAction(actionId, results = {}) {
  const db = getDb();
  
  // Get start time to calculate duration
  const action = db.prepare('SELECT started_at FROM action_log WHERE id = $id').get({ $id: actionId });
  const startTime = action ? new Date(action.started_at) : new Date();
  const duration = (Date.now() - startTime.getTime()) / 1000;
  
  const stmt = db.prepare(`
    UPDATE action_log SET 
      status = 'completed',
      finished_at = $finishedAt,
      duration_seconds = $duration,
      emails_found = COALESCE($emailsFound, emails_found),
      emails_processed = COALESCE($emailsProcessed, emails_processed),
      emails_new = COALESCE($emailsNew, emails_new),
      emails_skipped = COALESCE($emailsSkipped, emails_skipped),
      emails_failed = COALESCE($emailsFailed, emails_failed),
      notes = $notes
    WHERE id = $id
  `);
  
  stmt.run({
    $id: actionId,
    $finishedAt: new Date().toISOString(),
    $duration: duration,
    $emailsFound: results.emailsFound ?? null,
    $emailsProcessed: results.emailsProcessed ?? null,
    $emailsNew: results.emailsNew ?? null,
    $emailsSkipped: results.emailsSkipped ?? null,
    $emailsFailed: results.emailsFailed ?? null,
    $notes: results.notes ? JSON.stringify(results.notes) : null,
  });
}

/**
 * Mark an action as failed
 */
export function failAction(actionId, error, partialResults = {}) {
  const db = getDb();
  
  const action = db.prepare('SELECT started_at FROM action_log WHERE id = $id').get({ $id: actionId });
  const startTime = action ? new Date(action.started_at) : new Date();
  const duration = (Date.now() - startTime.getTime()) / 1000;
  
  const stmt = db.prepare(`
    UPDATE action_log SET 
      status = 'failed',
      finished_at = $finishedAt,
      duration_seconds = $duration,
      error_message = $errorMessage,
      emails_found = COALESCE($emailsFound, emails_found),
      emails_processed = COALESCE($emailsProcessed, emails_processed),
      emails_new = COALESCE($emailsNew, emails_new)
    WHERE id = $id
  `);
  
  stmt.run({
    $id: actionId,
    $finishedAt: new Date().toISOString(),
    $duration: duration,
    $errorMessage: error?.message || String(error),
    $emailsFound: partialResults.emailsFound ?? null,
    $emailsProcessed: partialResults.emailsProcessed ?? null,
    $emailsNew: partialResults.emailsNew ?? null,
  });
}

/**
 * Mark any running actions as interrupted (call on startup)
 */
export function markInterruptedActions() {
  const db = getDb();
  initActionLog();
  
  const stmt = db.prepare(`
    UPDATE action_log SET 
      status = 'interrupted',
      finished_at = $finishedAt
    WHERE status = 'running'
  `);
  
  const result = stmt.run({ $finishedAt: new Date().toISOString() });
  return result.changes;
}

/**
 * Get year status - which months have been searched/investigated
 */
export function getYearStatus(account, year) {
  const db = getDb();
  initActionLog();
  
  const result = {
    searched: [],
    notSearched: [],
    investigated: [],
    partiallyInvestigated: [],
    notInvestigated: [],
    downloaded: [],
    partiallyDownloaded: [],
    notDownloaded: [],
  };
  
  // Check each month
  for (let month = 1; month <= 12; month++) {
    // Check if searched
    const searchAction = db.prepare(`
      SELECT * FROM action_log 
      WHERE account = $account AND year = $year 
        AND month_from <= $month AND month_to >= $month
        AND action = 'search' AND status = 'completed'
      ORDER BY finished_at DESC LIMIT 1
    `).get({ $account: account, $year: year, $month: month });
    
    if (searchAction) {
      result.searched.push(month);
    } else {
      result.notSearched.push(month);
    }
    
    // Check email statuses for this month
    const emailCounts = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM emails 
      WHERE account = $account AND year = $year AND month = $month
      GROUP BY status
    `).all({ $account: account, $year: year, $month: month });
    
    const counts = Object.fromEntries(emailCounts.map(r => [r.status, r.count]));
    const pending = counts.pending || 0;
    const pendingDownload = counts.pending_download || 0;
    const downloaded = counts.downloaded || 0;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    
    if (total === 0) {
      // No emails for this month
      if (searchAction) {
        result.investigated.push(month);
        result.downloaded.push(month);
      }
    } else if (pending === 0) {
      result.investigated.push(month);
      if (pendingDownload === 0) {
        result.downloaded.push(month);
      } else {
        result.partiallyDownloaded.push(month);
      }
    } else if (pending < total) {
      result.partiallyInvestigated.push(month);
    } else {
      result.notInvestigated.push(month);
    }
  }
  
  return result;
}

/**
 * Get recent actions
 */
export function getRecentActions(account, limit = 20) {
  const db = getDb();
  initActionLog();
  
  const stmt = db.prepare(`
    SELECT * FROM action_log 
    WHERE account = $account
    ORDER BY started_at DESC
    LIMIT $limit
  `);
  
  return stmt.all({ $account: account, $limit: limit });
}

/**
 * Get failed actions
 */
export function getFailedActions(account) {
  const db = getDb();
  initActionLog();
  
  const stmt = db.prepare(`
    SELECT * FROM action_log 
    WHERE account = $account AND status IN ('failed', 'interrupted')
    ORDER BY started_at DESC
  `);
  
  return stmt.all({ $account: account });
}

/**
 * Check if a month was searched
 */
export function wasMonthSearched(account, year, month) {
  const db = getDb();
  initActionLog();
  
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM action_log 
    WHERE account = $account AND year = $year 
      AND month_from <= $month AND month_to >= $month
      AND action = 'search' AND status = 'completed'
  `);
  
  const result = stmt.get({ $account: account, $year: year, $month: month });
  return result.count > 0;
}

/**
 * Get months that haven't been searched for a year
 */
export function getUnsearchedMonths(account, year) {
  const unsearched = [];
  for (let month = 1; month <= 12; month++) {
    if (!wasMonthSearched(account, year, month)) {
      unsearched.push(month);
    }
  }
  return unsearched;
}
