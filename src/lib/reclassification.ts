/**
 * Reclassification Detection
 * 
 * Detects which invoices need reclassification due to situation changes.
 * Provides utilities for managing reclassification workflows.
 */

import { getDb } from './db.js';
import { loadConfig } from './config.js';
import { computeHashForDateString, getContextForDateString } from './situation-hash.js';
import type { KraxlerConfig } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ReclassificationNeeded {
  emailId: string;
  invoiceDate: string;
  currentHash: string | null;
  newHash: string | null;
  reason: ReclassificationReason;
}

export type ReclassificationReason = 
  | 'situation_changed'
  | 'never_classified'
  | 'no_situation_coverage'
  | 'force_reclassify';

export interface ReclassificationSummary {
  total: number;
  byReason: Record<ReclassificationReason, number>;
  dateRange: { from: string; to: string } | null;
  affectedSituations: string[];
}

export interface AffectedInvoiceInfo {
  count: number;
  dateRange: { from: string; to: string } | null;
  samples: { id: string; subject: string | null; invoiceDate: string }[];
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect which invoices need reclassification.
 * Compares stored situation_hash with current config state.
 */
export function detectReclassificationNeeded(
  account: string,
  config?: KraxlerConfig,
  dateRange?: { from: string; to: string }
): ReclassificationNeeded[] {
  const cfg = config || loadConfig();
  const db = getDb();
  
  // Query invoices that have been classified
  let query = `
    SELECT id, invoice_date, situation_hash, subject
    FROM emails 
    WHERE account = @account
      AND status IN ('extracted', 'downloaded', 'reviewed', 'filed')
      AND invoice_date IS NOT NULL
  `;
  const params: Record<string, unknown> = { account };
  
  if (dateRange) {
    query += ' AND invoice_date >= @fromDate AND invoice_date <= @toDate';
    params.fromDate = dateRange.from;
    params.toDate = dateRange.to;
  }
  
  query += ' ORDER BY invoice_date ASC';
  
  const emails = db.prepare(query).all(params) as {
    id: string;
    invoice_date: string;
    situation_hash: string | null;
    subject: string | null;
  }[];
  
  const results: ReclassificationNeeded[] = [];
  
  for (const email of emails) {
    const invoiceDate = email.invoice_date;
    const context = getContextForDateString(cfg, invoiceDate);
    
    if (!context) {
      // No situation covers this date
      if (email.situation_hash !== null) {
        // Was previously classified, but now has no coverage
        results.push({
          emailId: email.id,
          invoiceDate,
          currentHash: email.situation_hash,
          newHash: null,
          reason: 'no_situation_coverage',
        });
      }
      continue;
    }
    
    const newHash = computeHashForDateString(cfg, invoiceDate);
    
    if (email.situation_hash === null) {
      // Never classified with situation context (v1 migration or new)
      results.push({
        emailId: email.id,
        invoiceDate,
        currentHash: null,
        newHash,
        reason: 'never_classified',
      });
    } else if (email.situation_hash !== newHash) {
      // Hash changed - situation config changed
      results.push({
        emailId: email.id,
        invoiceDate,
        currentHash: email.situation_hash,
        newHash,
        reason: 'situation_changed',
      });
    }
  }
  
  return results;
}

/**
 * Summarize reclassification needs.
 */
export function summarizeReclassificationNeeds(
  needs: ReclassificationNeeded[]
): ReclassificationSummary {
  const byReason: Record<ReclassificationReason, number> = {
    situation_changed: 0,
    never_classified: 0,
    no_situation_coverage: 0,
    force_reclassify: 0,
  };
  
  const affectedSituationIds = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  
  for (const need of needs) {
    byReason[need.reason]++;
    
    if (!minDate || need.invoiceDate < minDate) {
      minDate = need.invoiceDate;
    }
    if (!maxDate || need.invoiceDate > maxDate) {
      maxDate = need.invoiceDate;
    }
  }
  
  return {
    total: needs.length,
    byReason,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    affectedSituations: Array.from(affectedSituationIds),
  };
}

/**
 * Count invoices that would be affected by a situation change.
 */
export function countAffectedInvoices(
  account: string,
  situationFrom: string,
  situationTo: string | null
): AffectedInvoiceInfo {
  const db = getDb();
  
  let query = `
    SELECT id, subject, invoice_date
    FROM emails 
    WHERE account = @account
      AND status IN ('extracted', 'downloaded', 'reviewed', 'filed')
      AND invoice_date IS NOT NULL
      AND invoice_date >= @from
  `;
  const params: Record<string, unknown> = { account, from: situationFrom };
  
  if (situationTo) {
    query += ' AND invoice_date <= @to';
    params.to = situationTo;
  }
  
  query += ' ORDER BY invoice_date ASC';
  
  const emails = db.prepare(query).all(params) as {
    id: string;
    subject: string | null;
    invoice_date: string;
  }[];
  
  if (emails.length === 0) {
    return { count: 0, dateRange: null, samples: [] };
  }
  
  return {
    count: emails.length,
    dateRange: {
      from: emails[0].invoice_date,
      to: emails[emails.length - 1].invoice_date,
    },
    samples: emails.slice(0, 5).map(e => ({
      id: e.id,
      subject: e.subject,
      invoiceDate: e.invoice_date,
    })),
  };
}

// ============================================================================
// Marking for Reclassification
// ============================================================================

/**
 * Mark emails for reclassification by clearing their situation_hash.
 * They will be picked up on next classification run.
 */
export function markForReclassification(
  account: string,
  emailIds: string[]
): number {
  if (emailIds.length === 0) return 0;
  
  const db = getDb();
  const placeholders = emailIds.map(() => '?').join(',');
  
  const stmt = db.prepare(`
    UPDATE emails 
    SET 
      situation_hash = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE account = ? AND id IN (${placeholders})
  `);
  
  const result = stmt.run(account, ...emailIds);
  return result.changes;
}

/**
 * Mark all emails in a date range for reclassification.
 */
export function markDateRangeForReclassification(
  account: string,
  from: string,
  to: string | null
): number {
  const db = getDb();
  
  let query = `
    UPDATE emails 
    SET 
      situation_hash = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE account = @account
      AND status IN ('extracted', 'downloaded', 'reviewed', 'filed')
      AND invoice_date IS NOT NULL
      AND invoice_date >= @from
  `;
  const params: Record<string, unknown> = { account, from };
  
  if (to) {
    query += ' AND invoice_date <= @to';
    params.to = to;
  }
  
  const stmt = db.prepare(query);
  const result = stmt.run(params);
  return result.changes;
}

// ============================================================================
// Hash Storage
// ============================================================================

/**
 * Update the situation_hash for an email after classification.
 */
export function updateSituationHash(
  account: string,
  emailId: string,
  hash: string | null
): void {
  const db = getDb();
  
  db.prepare(`
    UPDATE emails 
    SET 
      situation_hash = @hash,
      updated_at = CURRENT_TIMESTAMP
    WHERE account = @account AND id = @emailId
  `).run({ account, emailId, hash });
}

/**
 * Update situation_hash for multiple emails.
 */
export function updateSituationHashBatch(
  account: string,
  updates: { emailId: string; hash: string | null }[]
): void {
  if (updates.length === 0) return;
  
  const db = getDb();
  
  const stmt = db.prepare(`
    UPDATE emails 
    SET 
      situation_hash = @hash,
      updated_at = CURRENT_TIMESTAMP
    WHERE account = @account AND id = @emailId
  `);
  
  const transaction = db.transaction((items: { emailId: string; hash: string | null }[]) => {
    for (const item of items) {
      stmt.run({ account, emailId: item.emailId, hash: item.hash });
    }
  });
  
  transaction(updates);
}

// ============================================================================
// Classification History
// ============================================================================

export interface ClassificationHistoryEntry {
  emailId: string;
  account: string;
  classifiedAt: string;
  situationHash: string;
  situationId: string;
  deductible: string | null;
  incomeTaxPercent: number | null;
  vatRecoverable: boolean | null;
  incomeSourceId: string | null;
  trigger: 'initial' | 'situation_change' | 'manual' | 'from_stage' | 'force';
}

/**
 * Initialize the classification_history table.
 * Called from db.ts during schema init.
 */
export function initClassificationHistoryTable(): void {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS classification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id TEXT NOT NULL,
      account TEXT NOT NULL,
      classified_at TEXT NOT NULL,
      situation_hash TEXT NOT NULL,
      situation_id TEXT NOT NULL,
      deductible TEXT,
      income_tax_percent INTEGER,
      vat_recoverable INTEGER,
      income_source_id TEXT,
      trigger TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_classification_history_email 
      ON classification_history(email_id, account);
    CREATE INDEX IF NOT EXISTS idx_classification_history_date 
      ON classification_history(classified_at);
  `);
}

/**
 * Record a classification in history.
 */
export function recordClassification(entry: ClassificationHistoryEntry): void {
  const db = getDb();
  
  db.prepare(`
    INSERT INTO classification_history (
      email_id, account, classified_at, situation_hash, situation_id,
      deductible, income_tax_percent, vat_recoverable, income_source_id, trigger
    ) VALUES (
      @emailId, @account, @classifiedAt, @situationHash, @situationId,
      @deductible, @incomeTaxPercent, @vatRecoverable, @incomeSourceId, @trigger
    )
  `).run({
    emailId: entry.emailId,
    account: entry.account,
    classifiedAt: entry.classifiedAt,
    situationHash: entry.situationHash,
    situationId: entry.situationId,
    deductible: entry.deductible,
    incomeTaxPercent: entry.incomeTaxPercent,
    vatRecoverable: entry.vatRecoverable === null ? null : (entry.vatRecoverable ? 1 : 0),
    incomeSourceId: entry.incomeSourceId,
    trigger: entry.trigger,
  });
}

/**
 * Get classification history for an email.
 */
export function getClassificationHistory(
  emailId: string,
  account: string
): ClassificationHistoryEntry[] {
  const db = getDb();
  
  const rows = db.prepare(`
    SELECT * FROM classification_history
    WHERE email_id = @emailId AND account = @account
    ORDER BY classified_at DESC
  `).all({ emailId, account }) as Array<{
    email_id: string;
    account: string;
    classified_at: string;
    situation_hash: string;
    situation_id: string;
    deductible: string | null;
    income_tax_percent: number | null;
    vat_recoverable: number | null;
    income_source_id: string | null;
    trigger: string;
  }>;
  
  return rows.map(row => ({
    emailId: row.email_id,
    account: row.account,
    classifiedAt: row.classified_at,
    situationHash: row.situation_hash,
    situationId: row.situation_id,
    deductible: row.deductible,
    incomeTaxPercent: row.income_tax_percent,
    vatRecoverable: row.vat_recoverable === null ? null : row.vat_recoverable === 1,
    incomeSourceId: row.income_source_id,
    trigger: row.trigger as ClassificationHistoryEntry['trigger'],
  }));
}
