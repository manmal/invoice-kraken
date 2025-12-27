/**
 * SQLite database helpers using better-sqlite3
 * 
 * Handles schema creation, migrations, and CRUD operations.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType, RunResult } from 'better-sqlite3';
import { getDatabasePath } from './paths.js';
import type { 
  Email, 
  EmailStatus, 
  DeductibleCategory, 
  ReviewableCategory, 
  ManualReview,
  AssignmentStatus,
} from '../types.js';
// Allocation type used in allocation_json column
import type { Allocation as _Allocation } from './jurisdictions/interface.js';

let db: DatabaseType | null = null;
let currentDbPath: string | null = null;

// ============================================================================
// Database Connection
// ============================================================================

export function getDb(): DatabaseType {
  const dbPath = getDatabasePath();
  
  // If workdir changed, close old db and open new one
  if (db && currentDbPath !== dbPath) {
    db.close();
    db = null;
  }
  
  if (!db) {
    currentDbPath = dbPath;
    db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    initSchema();
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Schema Initialization
// ============================================================================

function initSchema(): void {
  if (!db) return;
  
  // Main emails table
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
  
  // Run migrations for new columns
  runMigrations();
  
  // Create situations table (synced from config)
  db.exec(`
    CREATE TABLE IF NOT EXISTS situations (
      id INTEGER PRIMARY KEY,
      from_date TEXT NOT NULL,
      to_date TEXT,
      jurisdiction TEXT NOT NULL,
      vat_status TEXT NOT NULL,
      has_company_car INTEGER NOT NULL,
      company_car_type TEXT,
      company_car_name TEXT,
      car_business_percent INTEGER,
      telecom_business_percent INTEGER NOT NULL,
      internet_business_percent INTEGER NOT NULL,
      home_office_type TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create income_sources table (synced from config)
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      valid_to TEXT,
      telecom_percent_override INTEGER,
      internet_percent_override INTEGER,
      vehicle_percent_override INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create allocation_rules table (synced from config)
  db.exec(`
    CREATE TABLE IF NOT EXISTS allocation_rules (
      id TEXT PRIMARY KEY,
      vendor_domain TEXT,
      vendor_pattern TEXT,
      deductible_category TEXT,
      min_amount_cents INTEGER,
      strategy TEXT NOT NULL,
      allocations_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create manual_reviews table
  initManualReviewsTable();
}

/**
 * Run column migrations for emails table.
 */
function runMigrations(): void {
  if (!db) return;
  
  const migrations = [
    // V1 migrations
    'ALTER TABLE emails ADD COLUMN income_tax_percent INTEGER',
    'ALTER TABLE emails ADD COLUMN vat_recoverable INTEGER',
    'ALTER TABLE emails ADD COLUMN file_hash TEXT',
    'ALTER TABLE emails ADD COLUMN file_verified_at TEXT',
    'ALTER TABLE emails ADD COLUMN prefilter_reason TEXT',
    
    // V2 migrations
    'ALTER TABLE emails ADD COLUMN situation_id INTEGER',
    'ALTER TABLE emails ADD COLUMN income_source_id TEXT',
    'ALTER TABLE emails ADD COLUMN allocation_json TEXT',
    'ALTER TABLE emails ADD COLUMN assignment_status TEXT',
    'ALTER TABLE emails ADD COLUMN assignment_metadata TEXT',
    'ALTER TABLE emails ADD COLUMN migration_source TEXT',
    
    // V2.1: Reclassification support
    'ALTER TABLE emails ADD COLUMN situation_hash TEXT',
    'ALTER TABLE emails ADD COLUMN last_classified_at TEXT',
  ];
  
  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // Column may already exist - ignore
    }
  }
  
  // Create new indexes
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_situation_id ON emails(situation_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_income_source_id ON emails(income_source_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_assignment_status ON emails(assignment_status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_situation_hash ON emails(situation_hash)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_emails_invoice_date ON emails(invoice_date)');
  } catch {
    // Indexes may already exist
  }
  
  // Initialize classification history table
  initClassificationHistoryTable();
}

/**
 * Initialize classification_history table for audit trail.
 */
function initClassificationHistoryTable(): void {
  if (!db) return;
  
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

// ============================================================================
// Email CRUD Operations
// ============================================================================

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

// ============================================================================
// V2: Allocation Updates
// ============================================================================

export interface AllocationUpdate {
  situationId: number | null;
  incomeSourceId: string | null;
  allocationJson: string | null;
  assignmentStatus: AssignmentStatus;
  assignmentMetadata: string | null;
}

export function updateEmailAllocation(
  id: string,
  account: string,
  allocation: AllocationUpdate
): RunResult {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE emails SET
      situation_id = @situationId,
      income_source_id = @incomeSourceId,
      allocation_json = @allocationJson,
      assignment_status = @assignmentStatus,
      assignment_metadata = @assignmentMetadata,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND account = @account
  `);
  
  return stmt.run({
    id,
    account,
    situationId: allocation.situationId,
    incomeSourceId: allocation.incomeSourceId,
    allocationJson: allocation.allocationJson,
    assignmentStatus: allocation.assignmentStatus,
    assignmentMetadata: allocation.assignmentMetadata,
  });
}

export function getEmailsNeedingAllocation(account: string, limit: number = 100): Email[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM emails 
    WHERE account = @account 
      AND status = 'downloaded'
      AND (assignment_status IS NULL OR assignment_status = 'manual_review')
    ORDER BY date ASC
    LIMIT @limit
  `);
  return stmt.all({ account, limit }) as Email[];
}

export function getEmailsByAssignmentStatus(
  account: string,
  status: AssignmentStatus,
  limit: number = 100
): Email[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM emails 
    WHERE account = @account AND assignment_status = @status
    ORDER BY date ASC
    LIMIT @limit
  `);
  return stmt.all({ account, status, limit }) as Email[];
}

// ============================================================================
// Duplicate Detection
// ============================================================================

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

// ============================================================================
// Summaries & Reports
// ============================================================================

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

export interface SourceSummaryRow {
  income_source_id: string | null;
  count: number;
  total_cents: number | null;
}

export function getIncomeSourceSummary(account: string, year: number | null = null): SourceSummaryRow[] {
  const db = getDb();
  let query = `
    SELECT 
      income_source_id,
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
  
  query += ' GROUP BY income_source_id';
  
  const stmt = db.prepare(query);
  return stmt.all(params) as SourceSummaryRow[];
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

// ============================================================================
// Manual Reviews Table
// ============================================================================

function initManualReviewsTable(): void {
  if (!db) return;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id TEXT NOT NULL,
      account TEXT NOT NULL,
      original_deductible TEXT,
      reviewed_deductible TEXT NOT NULL,
      reviewed_reason TEXT,
      reviewed_income_tax_percent INTEGER NOT NULL,
      reviewed_vat_recoverable INTEGER NOT NULL,
      reviewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email_id, account)
    );
    
    CREATE INDEX IF NOT EXISTS idx_manual_reviews_account ON manual_reviews(account);
  `);
}

export interface ManualReviewInput {
  category: ReviewableCategory;
  reason?: string;
  incomeTaxPercent: number;
  vatRecoverable: boolean;
}

export function saveManualReview(emailId: string, account: string, review: ManualReviewInput): void {
  const db = getDb();
  
  const email = getEmailById(emailId, account);
  const originalDeductible = email?.deductible || null;
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO manual_reviews (
      email_id, account, original_deductible, reviewed_deductible,
      reviewed_reason, reviewed_income_tax_percent, reviewed_vat_recoverable, reviewed_at
    ) VALUES (
      @emailId, @account, @originalDeductible, @reviewedDeductible,
      @reviewedReason, @reviewedIncomeTaxPercent, @reviewedVatRecoverable, CURRENT_TIMESTAMP
    )
  `);
  
  stmt.run({
    emailId,
    account,
    originalDeductible,
    reviewedDeductible: review.category,
    reviewedReason: review.reason || null,
    reviewedIncomeTaxPercent: review.incomeTaxPercent,
    reviewedVatRecoverable: review.vatRecoverable ? 1 : 0,
  });
  
  updateEmailDeductibility(emailId, account, review);
}

export function updateEmailDeductibility(emailId: string, account: string, review: ManualReviewInput): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE emails SET
      deductible = @deductible,
      deductible_reason = @reason,
      income_tax_percent = @incomeTaxPercent,
      vat_recoverable = @vatRecoverable,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @emailId AND account = @account
  `);
  
  stmt.run({
    emailId,
    account,
    deductible: review.category,
    reason: review.reason || null,
    incomeTaxPercent: review.incomeTaxPercent,
    vatRecoverable: review.vatRecoverable ? 1 : 0,
  });
}

export function getManualReview(emailId: string, account: string): ManualReview | undefined {
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT * FROM manual_reviews 
    WHERE email_id = @emailId AND account = @account
  `);
  return stmt.get({ emailId, account }) as ManualReview | undefined;
}

export function getEmailsNeedingReview(account: string, year?: number): Email[] {
  const db = getDb();
  
  let query = `
    SELECT e.* FROM emails e
    LEFT JOIN manual_reviews mr ON e.id = mr.email_id AND e.account = mr.account
    WHERE e.account = @account 
      AND e.deductible = 'unclear'
      AND e.status IN ('downloaded', 'manual')
      AND mr.id IS NULL
  `;
  const params: Record<string, unknown> = { account };
  
  if (year) {
    query += ' AND e.year = @year';
    params.year = year;
  }
  
  query += ' ORDER BY e.date ASC';
  
  const stmt = db.prepare(query);
  return stmt.all(params) as Email[];
}

export function getReviewedCount(account: string, year?: number): number {
  const db = getDb();
  
  let query = `
    SELECT COUNT(*) as count FROM manual_reviews mr
    JOIN emails e ON mr.email_id = e.id AND mr.account = e.account
    WHERE mr.account = @account
  `;
  const params: Record<string, unknown> = { account };
  
  if (year) {
    query += ' AND e.year = @year';
    params.year = year;
  }
  
  const stmt = db.prepare(query);
  const result = stmt.get(params) as { count: number };
  return result.count;
}

// ============================================================================
// Migration Support
// ============================================================================

/**
 * Mark all existing emails as migrated from v1.
 */
export function markEmailsAsMigrated(account: string): number {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE emails 
    SET migration_source = 'v1'
    WHERE account = @account AND migration_source IS NULL
  `);
  const result = stmt.run({ account });
  return result.changes;
}

/**
 * Set default situation and source for migrated emails.
 */
export function setDefaultAllocationForMigratedEmails(
  account: string,
  situationId: number,
  sourceId: string
): number {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE emails 
    SET 
      situation_id = @situationId,
      income_source_id = @sourceId,
      assignment_status = 'heuristic',
      assignment_metadata = '{"source":"migration","logicVersion":"2.0.0"}'
    WHERE account = @account 
      AND migration_source = 'v1'
      AND situation_id IS NULL
      AND status = 'downloaded'
  `);
  const result = stmt.run({ account, situationId, sourceId });
  return result.changes;
}

// ============================================================================
// Sync from Config
// ============================================================================

import type { KraxlerConfig } from '../types.js';
// These types are used for sync functions
import type { Situation as _Situation, IncomeSource as _IncomeSource, AllocationRule as _AllocationRule } from './jurisdictions/interface.js';

/**
 * Sync situations from config to database.
 */
export function syncSituationsToDb(config: KraxlerConfig): void {
  const db = getDb();
  
  // Clear existing
  db.exec('DELETE FROM situations');
  
  // Insert from config
  const stmt = db.prepare(`
    INSERT INTO situations (
      id, from_date, to_date, jurisdiction, vat_status,
      has_company_car, company_car_type, company_car_name, car_business_percent,
      telecom_business_percent, internet_business_percent, home_office_type
    ) VALUES (
      @id, @from, @to, @jurisdiction, @vatStatus,
      @hasCompanyCar, @companyCarType, @companyCarName, @carBusinessPercent,
      @telecomBusinessPercent, @internetBusinessPercent, @homeOffice
    )
  `);
  
  for (const sit of config.situations) {
    stmt.run({
      id: sit.id,
      from: sit.from,
      to: sit.to,
      jurisdiction: sit.jurisdiction,
      vatStatus: sit.vatStatus,
      hasCompanyCar: sit.hasCompanyCar ? 1 : 0,
      companyCarType: sit.companyCarType,
      companyCarName: sit.companyCarName,
      carBusinessPercent: sit.carBusinessPercent,
      telecomBusinessPercent: sit.telecomBusinessPercent,
      internetBusinessPercent: sit.internetBusinessPercent,
      homeOffice: sit.homeOffice,
    });
  }
}

/**
 * Sync income sources from config to database.
 */
export function syncIncomeSourcesToDb(config: KraxlerConfig): void {
  const db = getDb();
  
  // Clear existing
  db.exec('DELETE FROM income_sources');
  
  // Insert from config
  const stmt = db.prepare(`
    INSERT INTO income_sources (
      id, name, category, valid_from, valid_to,
      telecom_percent_override, internet_percent_override, vehicle_percent_override, notes
    ) VALUES (
      @id, @name, @category, @validFrom, @validTo,
      @telecomPercentOverride, @internetPercentOverride, @vehiclePercentOverride, @notes
    )
  `);
  
  for (const src of config.incomeSources) {
    stmt.run({
      id: src.id,
      name: src.name,
      category: src.category,
      validFrom: src.validFrom,
      validTo: src.validTo,
      telecomPercentOverride: src.telecomPercentOverride ?? null,
      internetPercentOverride: src.internetPercentOverride ?? null,
      vehiclePercentOverride: src.vehiclePercentOverride ?? null,
      notes: src.notes ?? null,
    });
  }
}

/**
 * Sync allocation rules from config to database.
 */
export function syncAllocationRulesToDb(config: KraxlerConfig): void {
  const db = getDb();
  
  // Clear existing
  db.exec('DELETE FROM allocation_rules');
  
  // Insert from config
  const stmt = db.prepare(`
    INSERT INTO allocation_rules (
      id, vendor_domain, vendor_pattern, deductible_category,
      min_amount_cents, strategy, allocations_json
    ) VALUES (
      @id, @vendorDomain, @vendorPattern, @deductibleCategory,
      @minAmountCents, @strategy, @allocationsJson
    )
  `);
  
  for (const rule of config.allocationRules) {
    stmt.run({
      id: rule.id,
      vendorDomain: rule.vendorDomain ?? null,
      vendorPattern: rule.vendorPattern ?? null,
      deductibleCategory: rule.deductibleCategory ?? null,
      minAmountCents: rule.minAmountCents ?? null,
      strategy: rule.strategy,
      allocationsJson: JSON.stringify(rule.allocations),
    });
  }
}

/**
 * Sync all config tables to database.
 */
export function syncConfigToDb(config: KraxlerConfig): void {
  syncSituationsToDb(config);
  syncIncomeSourcesToDb(config);
  syncAllocationRulesToDb(config);
}
