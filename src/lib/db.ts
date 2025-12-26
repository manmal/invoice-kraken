/**
 * SQLite database helpers using better-sqlite3
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType, RunResult } from 'better-sqlite3';
import { getDatabasePath } from './paths.js';
import type { Email, EmailStatus, DeductibleCategory } from '../types.js';

const DB_PATH: string = getDatabasePath();

let db: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (!db) {
    // Note: better-sqlite3 creates the database by default if it doesn't exist
    // (when fileMustExist is false/undefined)
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema(): void {
  if (!db) return;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      account TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      subject TEXT,
      sender TEXT,
      sender_domain TEXT,
      date TEXT,
      snippet TEXT,
      labels TEXT,
      raw_json TEXT,
      status TEXT DEFAULT 'pending',
      invoice_type TEXT,
      invoice_path TEXT,
      invoice_number TEXT,
      invoice_amount TEXT,
      invoice_amount_cents INTEGER,
      invoice_date TEXT,
      attachment_hash TEXT,
      duplicate_of TEXT,
      duplicate_confidence TEXT,
      deductible TEXT,
      deductible_reason TEXT,
      deductible_percent INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emails_account_year ON emails(account, year);
    CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
    CREATE INDEX IF NOT EXISTS idx_emails_invoice_number ON emails(invoice_number);
    CREATE INDEX IF NOT EXISTS idx_emails_sender_domain ON emails(sender_domain);
    CREATE INDEX IF NOT EXISTS idx_emails_attachment_hash ON emails(attachment_hash);
    CREATE INDEX IF NOT EXISTS idx_emails_deductible ON emails(deductible);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_unique ON emails(id, account);
  `);
  
  // Migration: Add new columns for Austrian tax rules (v2)
  try {
    db.exec(`ALTER TABLE emails ADD COLUMN income_tax_percent INTEGER`);
  } catch (e) { /* column may already exist */ }
  
  try {
    db.exec(`ALTER TABLE emails ADD COLUMN vat_recoverable INTEGER`); // 0 = false, 1 = true
  } catch (e) { /* column may already exist */ }
  
  try {
    db.exec(`ALTER TABLE emails ADD COLUMN file_hash TEXT`);
  } catch (e) { /* column may already exist */ }
  
  try {
    db.exec(`ALTER TABLE emails ADD COLUMN file_verified_at TEXT`);
  } catch (e) { /* column may already exist */ }
  
  try {
    db.exec(`ALTER TABLE emails ADD COLUMN prefilter_reason TEXT`);
  } catch (e) { /* column may already exist */ }
}

export interface EmailInsertData {
  id: string;
  thread_id: string | null;
  account: string;
  year: number;
  month: number;
  subject: string | null;
  sender: string | null;
  sender_domain: string | null;
  date: string | null;
  snippet: string | null;
  labels: string | null;
  raw_json: string | null;
}

export function insertEmail(email: EmailInsertData): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO emails (
      id, thread_id, account, year, month, subject, sender, sender_domain,
      date, snippet, labels, raw_json, status
    ) VALUES (
      @id, @thread_id, @account, @year, @month, @subject, @sender, @sender_domain,
      @date, @snippet, @labels, @raw_json, 'pending'
    )
  `);
  
  const result: RunResult = stmt.run({
    id: email.id,
    thread_id: email.thread_id,
    account: email.account,
    year: email.year,
    month: email.month,
    subject: email.subject,
    sender: email.sender,
    sender_domain: email.sender_domain,
    date: email.date,
    snippet: email.snippet,
    labels: email.labels,
    raw_json: email.raw_json,
  });
  
  return result.changes > 0;
}

export function getEmailsByStatus(account: string, status: EmailStatus, limit: number = 100): Email[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM emails 
    WHERE account = @account AND status = @status
    ORDER BY date ASC
    LIMIT @limit
  `);
  return stmt.all({ account, status, limit }) as Email[];
}

export function getEmailById(id: string, account: string): Email | undefined {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM emails WHERE id = @id AND account = @account`);
  return stmt.get({ id, account }) as Email | undefined;
}

export function updateEmailStatus(id: string, account: string, status: EmailStatus, extra: Record<string, unknown> = {}): RunResult {
  const db = getDb();
  const updates: string[] = ['status = @status', 'updated_at = CURRENT_TIMESTAMP'];
  const params: Record<string, unknown> = { status, id, account };
  
  let paramIndex = 0;
  for (const [key, value] of Object.entries(extra)) {
    const paramName = `p${paramIndex++}`;
    updates.push(`${key} = @${paramName}`);
    params[paramName] = value;
  }
  
  const stmt = db.prepare(`
    UPDATE emails SET ${updates.join(', ')}
    WHERE id = @id AND account = @account
  `);
  return stmt.run(params);
}

export interface DuplicateMatch {
  id: string;
}

export function findDuplicateByInvoiceNumber(invoiceNumber: string, senderDomain: string, excludeId: string, account: string): DuplicateMatch | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id FROM emails 
    WHERE invoice_number = @invoiceNumber AND sender_domain = @senderDomain AND id != @excludeId AND account = @account
    AND status NOT IN ('no_invoice', 'duplicate')
    LIMIT 1
  `);
  return stmt.get({ invoiceNumber, senderDomain, excludeId, account }) as DuplicateMatch | undefined;
}

export function findDuplicateByHash(hash: string, excludeId: string, account: string): DuplicateMatch | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id FROM emails 
    WHERE attachment_hash = @hash AND id != @excludeId AND account = @account
    LIMIT 1
  `);
  return stmt.get({ hash, excludeId, account }) as DuplicateMatch | undefined;
}

export function findDuplicateByFuzzyMatch(senderDomain: string, amount: string, invoiceDate: string, excludeId: string, account: string): DuplicateMatch | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id FROM emails 
    WHERE sender_domain = @senderDomain 
      AND invoice_amount = @amount 
      AND ABS(julianday(invoice_date) - julianday(@invoiceDate)) <= 7
      AND id != @excludeId
      AND account = @account
      AND status NOT IN ('no_invoice', 'duplicate')
    LIMIT 1
  `);
  return stmt.get({ senderDomain, amount, invoiceDate, excludeId, account }) as DuplicateMatch | undefined;
}

export interface DeductibilitySummaryRow {
  deductible: DeductibleCategory | null;
  count: number;
  total_cents: number | null;
}

export function getDeductibilitySummary(account: string, year: number | null = null): DeductibilitySummaryRow[] {
  const db = getDb();
  let query = `
    SELECT 
      deductible,
      COUNT(*) as count,
      SUM(invoice_amount_cents) as total_cents
    FROM emails 
    WHERE account = @account AND status = 'downloaded'
  `;
  const params: Record<string, unknown> = { account };
  
  if (year) {
    query += ' AND year = @year';
    params.year = year;
  }
  
  query += ' GROUP BY deductible';
  
  const stmt = db.prepare(query);
  return stmt.all(params) as DeductibilitySummaryRow[];
}

export function getManualItems(account: string, deductibleFilter: DeductibleCategory | null = null): Email[] {
  const db = getDb();
  let query = `
    SELECT * FROM emails 
    WHERE account = @account AND status = 'manual'
  `;
  const params: Record<string, unknown> = { account };
  
  if (deductibleFilter) {
    query += ' AND deductible = @deductible';
    params.deductible = deductibleFilter;
  }
  
  query += ' ORDER BY date DESC';
  
  const stmt = db.prepare(query);
  return stmt.all(params) as Email[];
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
