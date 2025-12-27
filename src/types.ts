/**
 * Core type definitions for Kraxler
 */

// Re-export jurisdiction types for convenience
export type {
  Situation,
  IncomeSource,
  IncomeCategory,
  AllocationRule,
  AllocationStrategy,
  Allocation,
  VatStatus,
  HomeOfficeType,
  ValidationError,
  VatRecoveryResult,
  IncomeTaxResult,
  AllocationResult,
  AllocationSource,
} from './lib/jurisdictions/interface.js';

// ============================================================================
// Email & Database Types
// ============================================================================

export interface Email {
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
  status: EmailStatus;
  invoice_type: InvoiceType | null;
  invoice_path: string | null;
  invoice_number: string | null;
  invoice_amount: string | null;
  invoice_amount_cents: number | null;
  invoice_date: string | null;
  attachment_hash: string | null;
  duplicate_of: string | null;
  duplicate_confidence: DuplicateConfidence | null;
  deductible: DeductibleCategory | null;
  deductible_reason: string | null;
  deductible_percent: number | null;
  income_tax_percent: number | null;
  vat_recoverable: number | null; // 0 = false, 1 = true
  file_hash: string | null;
  file_verified_at: string | null;
  prefilter_reason: string | null;
  notes: string | null;
  
  // V2: Situation and allocation tracking
  situation_id: number | null;
  income_source_id: string | null;
  allocation_json: string | null;        // JSON array of {sourceId, percent}
  assignment_status: AssignmentStatus | null;
  assignment_metadata: string | null;    // JSON with audit trail
  migration_source: string | null;       // 'v1' for migrated records
  
  created_at: string;
  updated_at: string;
}

export type EmailStatus = 
  | 'pending'
  | 'prefiltered'
  | 'no_invoice'
  | 'pending_download'
  | 'downloaded'
  | 'manual'
  | 'duplicate';

export type InvoiceType = 
  | 'pdf_attachment'
  | 'text'
  | 'link'
  | 'none'
  | 'unknown';

export type DuplicateConfidence = 'exact' | 'high' | 'medium' | 'low';

export type DeductibleCategory = 
  | 'full'
  | 'vehicle'
  | 'meals'
  | 'telecom'
  | 'gifts'
  | 'partial'
  | 'none'
  | 'unclear';

// Reviewable categories exclude 'unclear' - these are what users can select
export type ReviewableCategory = Exclude<DeductibleCategory, 'unclear'>;

export type AssignmentStatus =
  | 'rule_match'
  | 'ai_suggested'
  | 'category_default'
  | 'heuristic'
  | 'manual_review'
  | 'confirmed';

// ============================================================================
// Manual Review Types
// ============================================================================

export interface ManualReview {
  id: number;
  email_id: string;
  account: string;
  original_deductible: DeductibleCategory | null;
  reviewed_deductible: ReviewableCategory;
  reviewed_reason: string | null;
  reviewed_income_tax_percent: number;
  reviewed_vat_recoverable: number; // 0 = false, 1 = true
  reviewed_at: string;
}

// ============================================================================
// AI Classification Types
// ============================================================================

export interface InvoiceAnalysis {
  is_invoice: boolean;
  invoice_type: InvoiceType;
  invoice_number: string | null;
  amount: string | null;
  invoice_date: string | null;
  vendor_category: string | null;
  notes: string | null;
}

export interface DeductibilityResult {
  deductible: DeductibleCategory;
  reason: string;
  incomeTaxPercent: number;
  vatRecoverable: boolean;
}

// ============================================================================
// Gmail Types
// ============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPayload;
  internalDate?: string;
  from?: string;
  subject?: string;
  date?: string;
}

export interface GmailPayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPayload[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailBody {
  attachmentId?: string;
  size?: number;
  data?: string;
}

export interface GmailAttachment {
  filename: string;
  attachmentId: string;
  mimeType: string;
}

// ============================================================================
// Config Types (V2)
// ============================================================================

import type { 
  Situation, 
  IncomeSource, 
  AllocationRule 
} from './lib/jurisdictions/interface.js';

export interface KraxlerConfig {
  /** Config version (2 for new format) */
  version: number;
  
  /** Jurisdiction code (AT, DE, CH) - all situations use same jurisdiction */
  jurisdiction: string;
  
  /** User's tax situations over time */
  situations: Situation[];
  
  /** User's income sources */
  incomeSources: IncomeSource[];
  
  /** User-defined allocation rules */
  allocationRules: AllocationRule[];
  
  /** Category defaults: which income source for each category */
  categoryDefaults: Partial<Record<DeductibleCategory, string>>;
  
  /** Connected email accounts */
  accounts: string[];
  
  /** Initial setup completed? */
  setupCompleted: boolean;
  
  /** AI model configuration */
  modelPreset?: string;
  models?: Record<string, ModelConfig>;
}

// Legacy config type for migration
export interface LegacyKraxlerConfig {
  tax_jurisdiction: string;
  has_company_car: boolean | null;
  company_car_type: CompanyCarType | null;
  is_kleinunternehmer: boolean | null;
  telecom_business_percent: number;
  internet_business_percent: number;
  accounts: string[];
  setup_completed: boolean;
  config_version: number;
  model_preset?: string;
  models?: Record<string, ModelConfig>;
}

export type CompanyCarType = 'ice' | 'electric' | 'hybrid_plugin' | 'hybrid';

export interface ModelConfig {
  provider: string;
  modelId: string;
}

// ============================================================================
// Date Types
// ============================================================================

export interface DateRange {
  from: Date;
  to: Date;
  display: string;
}

export interface YearMonth {
  year: number;
  month: number;
}

// ============================================================================
// Action Log Types
// ============================================================================

export interface ActionLog {
  id: number;
  action: string;
  account: string;
  year: number | null;
  month_from: number | null;
  month_to: number | null;
  started_at: string;
  finished_at: string | null;
  status: ActionStatus;
  emails_found: number;
  emails_processed: number;
  emails_new: number;
  emails_skipped: number;
  emails_failed: number;
  error_message: string | null;
  duration_seconds: number | null;
  notes: string | null;
}

export type ActionStatus = 'running' | 'completed' | 'failed' | 'interrupted';

// ============================================================================
// Browser Types
// ============================================================================

export interface DownloadResult {
  success: boolean;
  path?: string;
  needsLogin?: boolean;
  loginUrl?: string;
  error?: string;
  note?: string;
}

// ============================================================================
// Token Usage Types
// ============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface PhaseUsage {
  phase: string;
  model: string | null;
  provider: string | null;
  calls: number;
  usage: TokenUsage;
}

// ============================================================================
// Command Options Types
// ============================================================================

export interface ScanOptions {
  account: string;
  year?: string;
  month?: string;
  quarter?: string;
  from?: string;
  to?: string;
}

export interface ExtractOptions {
  account: string;
  batchSize: number;
  autoDedup: boolean;
  strict: boolean;
  model?: string;
  provider?: string;
}

export interface CrawlOptions {
  account: string;
  batchSize: number;
}

export interface ReviewOptions {
  account: string;
  format: 'table' | 'json' | 'markdown';
  deductible?: DeductibleCategory;
  summary: boolean;
  year?: number;
  includeDuplicates: boolean;
  interactive?: boolean;
}

export interface RunOptions extends ScanOptions {
  batchSize: number;
  autoDedup: boolean;
  strict: boolean;
  model?: string;
  provider?: string;
  noInteractive?: boolean;
}
