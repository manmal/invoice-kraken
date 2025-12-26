/**
 * Investigate command - Analyze found emails and classify invoices
 */

import * as path from 'path';
import { 
  getEmailsByStatus, 
  updateEmailStatus,
  findDuplicateByInvoiceNumber,
  findDuplicateByFuzzyMatch,
} from '../lib/db.js';
import { prefilterEmails } from '../lib/prefilter.js';
import { getMessage, downloadAttachment } from '../lib/gog.js';
import { analyzeEmailsForInvoices, checkAuth } from '../lib/ai.js';
import { parseAmountToCents } from '../lib/extract.js';
import { classifyDeductibility } from '../lib/vendors.js';
import { generatePdfFromText, generatePdfFromEmailHtml } from '../lib/pdf.js';
import { hashFile } from '../utils/hash.js';
import { getInvoiceOutputPath } from '../utils/paths.js';
import { emptyUsage, addUsage, formatUsageReport } from '../lib/tokens.js';
import type { Usage, PhaseUsageReport } from '../lib/tokens.js';
import type { 
  Email, 
  ExtractOptions, 
  GmailMessage,
  GmailPayload,
  DeductibleCategory,
} from '../types.js';

interface ExtractStats {
  invoices: number;
  noInvoice: number;
  duplicates: number;
  downloaded: number;
  pendingDownload: number;
  manual: number;
  errors: number;
}

interface EmailAnalysis {
  id?: string;
  has_invoice?: boolean;
  invoice_type?: string;
  invoice_number?: string | null;
  amount?: string | null;
  invoice_date?: string | null;
  vendor_product?: string | null;
  notes?: string | null;
  deductible?: DeductibleCategory | 'unclear';
  deductible_reason?: string;
  deductible_percent?: number;
  income_tax_percent?: number;
  vat_recoverable?: boolean;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  originalId?: string;
  confidence?: 'exact' | 'high' | 'medium' | 'low';
}

interface ProcessOptions {
  autoDedup: boolean;
  strict: boolean;
}

interface ExtraData {
  deductible: DeductibleCategory | 'unclear' | undefined;
  deductible_reason: string | undefined;
  income_tax_percent: number | null | undefined;
  vat_recoverable: number;
  invoice_amount_cents: number | null;
}

interface EmailContent {
  text: string | null;
  html: string | null;
}

interface PdfAttachmentInfo {
  filename: string;
  attachmentId: string | undefined;
  mimeType: string | undefined;
}

interface PdfMetadata {
  subject?: string;
  sender?: string;
  date?: string;
  invoiceNumber?: string;
  amount?: string;
}

export async function extractCommand(options: ExtractOptions): Promise<void> {
  const { account, batchSize = 10, autoDedup = false, strict = false } = options;
  
  console.log(`Investigating emails for account: ${account}`);
  console.log(`Batch size: ${batchSize}, Auto-dedup: ${autoDedup}, Strict: ${strict}\n`);
  
  // Check authentication before starting
  const authError = await checkAuth();
  if (authError) {
    console.error(authError);
    process.exit(1);
  }
  
  // Get pending emails
  const pendingEmails = getEmailsByStatus(account, 'pending', 1000);
  
  if (pendingEmails.length === 0) {
    console.log('No pending emails to investigate.');
    console.log('Run "kraxler scan" first to find invoice emails.');
    return;
  }
  
  // Pre-filter obvious non-invoices
  const { toAnalyze, toSkip } = prefilterEmails(pendingEmails);
  
  console.log(`Found ${pendingEmails.length} pending emails.`);
  console.log(`  → ${toSkip.length} auto-skipped (obvious non-invoices)`);
  console.log(`  → ${toAnalyze.length} to analyze with AI\n`);
  
  // Mark skipped emails as no_invoice
  for (const { email, reason } of toSkip) {
    updateEmailStatus(email.id, account, 'no_invoice', {
      notes: `Auto-skipped: ${reason}`,
    });
  }
  
  if (toAnalyze.length === 0) {
    console.log('No emails require AI analysis.');
    return;
  }
  
  // Process in batches
  const batches: Email[][] = [];
  for (let i = 0; i < toAnalyze.length; i += batchSize) {
    batches.push(toAnalyze.slice(i, i + batchSize));
  }
  
  const stats: ExtractStats = {
    invoices: 0,
    noInvoice: 0,
    duplicates: 0,
    downloaded: 0,
    pendingDownload: 0,
    manual: 0,
    errors: 0,
  };
  
  // Track token usage per phase
  const usageByPhase: PhaseUsageReport[] = [];
  
  let batchNum = 0;
  for (const batch of batches) {
    batchNum++;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Batch ${batchNum}/${batches.length}: Analyzing ${batch.length} emails...`);
    console.log(`${'─'.repeat(50)}`);
    
    // Analyze batch with AI (pass account for email body fetching)
    const { results: analyses, usage, model, provider } = await analyzeEmailsForInvoices(batch, { account });
    
    // Track usage for this batch
    let classificationPhase = usageByPhase.find(p => p.phase === 'emailClassification');
    if (!classificationPhase) {
      classificationPhase = { phase: 'emailClassification', model, provider, calls: 0, usage: emptyUsage() };
      usageByPhase.push(classificationPhase);
    }
    classificationPhase.calls += 1;
    addUsage(classificationPhase.usage, usage as Partial<Usage>);
    
    // Process each email
    for (let i = 0; i < batch.length; i++) {
      const email = batch[i];
      const analysis: EmailAnalysis = (analyses as EmailAnalysis[]).find((a: EmailAnalysis) => a.id === email.id) || (analyses as EmailAnalysis[])[i] || {};
      
      await processEmail(email, analysis, account, { autoDedup, strict }, stats);
    }
  }
  
  // Print summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log('INVESTIGATION COMPLETE');
  console.log(`${'═'.repeat(50)}`);
  console.log(`  ✓ Invoices found: ${stats.invoices}`);
  console.log(`  ✓ Downloaded: ${stats.downloaded}`);
  console.log(`  ⏳ Pending download: ${stats.pendingDownload}`);
  console.log(`  ⊘ Duplicates: ${stats.duplicates}`);
  console.log(`  ✗ Not invoices: ${stats.noInvoice}`);
  console.log(`  ⚠ Manual review: ${stats.manual}`);
  console.log(`  ✗ Errors: ${stats.errors}`);
  
  // Print token usage report
  if (usageByPhase.length > 0) {
    console.log(formatUsageReport(usageByPhase));
  }
  
  if (stats.pendingDownload > 0) {
    console.log(`Run "kraxler crawl --account ${account}" to download remaining invoices.`);
  }
  if (stats.manual > 0) {
    console.log(`Run "kraxler review --account ${account}" to see items needing manual handling.`);
  }
}

async function processEmail(
  email: Email, 
  analysis: EmailAnalysis, 
  account: string, 
  options: ProcessOptions, 
  stats: ExtractStats
): Promise<void> {
  const { autoDedup, strict } = options;
  
  try {
    // Check if it's an invoice
    if (!analysis.has_invoice) {
      updateEmailStatus(email.id, account, 'no_invoice', {
        notes: analysis.notes || 'Not identified as invoice',
      });
      console.log(`  ✗ ${truncate(email.subject, 50)} - Not an invoice`);
      stats.noInvoice++;
      return;
    }
    
    stats.invoices++;
    
    // Get deductibility (from AI or fallback to vendor DB)
    let deductible: DeductibleCategory | 'unclear' | undefined = analysis.deductible;
    let deductibleReason: string | undefined = analysis.deductible_reason;
    let incomeTaxPercent: number | null | undefined = analysis.income_tax_percent;
    let vatRecoverable: boolean | null | undefined = analysis.vat_recoverable;
    
    // Fallback to vendor DB if AI didn't provide clear classification
    if (!deductible || deductible === 'unclear') {
      const vendorClassification = classifyDeductibility(
        email.sender_domain,
        email.subject ?? '',
        email.snippet ?? ''
      );
      deductible = vendorClassification.deductible;
      deductibleReason = vendorClassification.reason;
      incomeTaxPercent = vendorClassification.income_tax_percent;
      vatRecoverable = vendorClassification.vat_recoverable;
    }
    
    // Legacy support: convert deductible_percent to new fields if needed
    if (incomeTaxPercent === undefined && analysis.deductible_percent !== undefined) {
      incomeTaxPercent = analysis.deductible_percent;
    }
    
    // Parse amount
    const amountCents: number | null = analysis.amount ? parseAmountToCents(analysis.amount) : null;
    
    // Check for duplicates
    const dupCheck = await checkForDuplicate(email, analysis, account, { autoDedup, strict });
    
    if (dupCheck.isDuplicate) {
      updateEmailStatus(email.id, account, 'duplicate', {
        duplicate_of: dupCheck.originalId,
        duplicate_confidence: dupCheck.confidence,
        invoice_number: analysis.invoice_number,
        invoice_amount: analysis.amount,
        invoice_amount_cents: amountCents,
        invoice_date: analysis.invoice_date,
        deductible,
        deductible_reason: deductibleReason,
      });
      console.log(`  ⊘ ${truncate(email.subject, 50)} - Duplicate (${dupCheck.confidence})`);
      stats.duplicates++;
      return;
    }
    
    // Common extra data for all handlers
    const extraData: ExtraData = {
      deductible,
      deductible_reason: deductibleReason,
      income_tax_percent: incomeTaxPercent,
      vat_recoverable: vatRecoverable ? 1 : 0,
      invoice_amount_cents: amountCents,
    };
    
    // IMPORTANT: Always check for PDF attachments first, regardless of AI classification
    // The AI sometimes misclassifies pdf_attachment as text
    const fullMessage: GmailMessage | null = await getMessage(account, email.id);
    const pdfAttachment: PdfAttachmentInfo | null = fullMessage ? findPdfAttachment(fullMessage) : null;
    
    // Determine actual invoice type - prioritize PDF attachment if found
    let invoiceType: string = analysis.invoice_type || 'unknown';
    if (pdfAttachment && invoiceType !== 'pdf_attachment') {
      console.log(`    (Correcting type: ${invoiceType} → pdf_attachment, found: ${pdfAttachment.filename})`);
      invoiceType = 'pdf_attachment';
    }
    
    if (invoiceType === 'pdf_attachment') {
      await handlePdfAttachment(email, analysis, account, stats, extraData, fullMessage, pdfAttachment);
    } else if (invoiceType === 'text') {
      await handleTextInvoice(email, analysis, account, stats, extraData, fullMessage);
    } else if (invoiceType === 'link') {
      updateEmailStatus(email.id, account, 'pending_download', {
        invoice_type: 'link',
        invoice_number: analysis.invoice_number,
        invoice_amount: analysis.amount,
        invoice_date: analysis.invoice_date,
        notes: analysis.notes || 'Has download link',
        ...extraData,
      });
      console.log(`  ⏳ ${truncate(email.subject, 50)} - Has link, pending download`);
      printDeductibility(deductible, deductibleReason, incomeTaxPercent, vatRecoverable);
      stats.pendingDownload++;
    } else {
      updateEmailStatus(email.id, account, 'manual', {
        invoice_type: invoiceType,
        invoice_number: analysis.invoice_number,
        invoice_amount: analysis.amount,
        invoice_date: analysis.invoice_date,
        notes: analysis.notes || 'Unknown invoice type',
        ...extraData,
      });
      console.log(`  ⚠ ${truncate(email.subject, 50)} - Needs manual review`);
      printDeductibility(deductible, deductibleReason, incomeTaxPercent, vatRecoverable);
      stats.manual++;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Error processing ${email.id}: ${errorMessage}`);
    updateEmailStatus(email.id, account, 'manual', {
      notes: `Error: ${errorMessage}`,
    });
    stats.errors++;
  }
}

async function handlePdfAttachment(
  email: Email, 
  analysis: EmailAnalysis, 
  account: string, 
  stats: ExtractStats, 
  extra: ExtraData, 
  preloadedMessage: GmailMessage | null = null, 
  preloadedAttachment: PdfAttachmentInfo | null = null
): Promise<void> {
  const { deductible, deductible_reason, income_tax_percent, vat_recoverable, invoice_amount_cents } = extra;
  
  // Use pre-loaded message if available, otherwise fetch
  const fullMessage: GmailMessage | null = preloadedMessage || await getMessage(account, email.id);
  
  if (!fullMessage) {
    updateEmailStatus(email.id, account, 'manual', {
      invoice_type: 'pdf_attachment',
      notes: 'Could not fetch full message',
      ...extra,
    });
    console.log(`  ⚠ ${truncate(email.subject, 50)} - Could not fetch message`);
    stats.manual++;
    return;
  }
  
  // Use pre-loaded attachment if available, otherwise find it
  const attachment: PdfAttachmentInfo | null = preloadedAttachment || findPdfAttachment(fullMessage);
  
  if (!attachment) {
    updateEmailStatus(email.id, account, 'manual', {
      invoice_type: 'pdf_attachment',
      notes: 'No PDF attachment found',
      ...extra,
    });
    console.log(`  ⚠ ${truncate(email.subject, 50)} - No PDF attachment found`);
    stats.manual++;
    return;
  }
  
  // Download attachment
  const outputPath: string = getInvoiceOutputPath(
    analysis.invoice_date || email.date,
    analysis.vendor_product || email.sender_domain || email.sender,
    analysis.invoice_number ?? null
  );
  
  const success: boolean = await downloadAttachment(
    account,
    email.id,
    attachment.attachmentId!,
    outputPath
  );
  
  if (!success) {
    updateEmailStatus(email.id, account, 'manual', {
      invoice_type: 'pdf_attachment',
      notes: 'Failed to download attachment',
      ...extra,
    });
    console.log(`  ⚠ ${truncate(email.subject, 50)} - Download failed`);
    stats.manual++;
    return;
  }
  
  // Hash the downloaded file
  const fileHash: string = hashFile(outputPath);
  
  updateEmailStatus(email.id, account, 'downloaded', {
    invoice_type: 'pdf_attachment',
    invoice_path: outputPath,
    invoice_number: analysis.invoice_number,
    invoice_amount: analysis.amount,
    invoice_amount_cents: invoice_amount_cents,
    invoice_date: analysis.invoice_date,
    attachment_hash: fileHash,
    file_hash: fileHash,
    deductible,
    deductible_reason,
    income_tax_percent,
    vat_recoverable,
  });
  
  const relativePath: string = path.relative(process.cwd(), outputPath);
  console.log(`  ✓ ${truncate(email.subject, 50)}`);
  console.log(`    → ${relativePath}`);
  printDeductibility(deductible, deductible_reason, income_tax_percent, vat_recoverable ? true : false);
  stats.downloaded++;
}

async function handleTextInvoice(
  email: Email, 
  analysis: EmailAnalysis, 
  account: string, 
  stats: ExtractStats, 
  extra: ExtraData, 
  preloadedMessage: GmailMessage | null = null
): Promise<void> {
  const { deductible, deductible_reason, income_tax_percent, vat_recoverable, invoice_amount_cents } = extra;
  
  // Use pre-loaded message if available, otherwise fetch
  const fullMessage: GmailMessage | null = preloadedMessage || await getMessage(account, email.id);
  
  if (!fullMessage) {
    updateEmailStatus(email.id, account, 'manual', {
      invoice_type: 'text',
      notes: 'Could not fetch full message',
      ...extra,
    });
    console.log(`  ⚠ ${truncate(email.subject, 50)} - Could not fetch message`);
    stats.manual++;
    return;
  }
  
  // Check if email has HTML content - prefer rendering HTML for better formatting
  const emailContent: EmailContent = extractEmailContent(fullMessage);
  
  if (!emailContent.text && !emailContent.html) {
    updateEmailStatus(email.id, account, 'manual', {
      invoice_type: 'text',
      notes: 'Could not extract email content',
      ...extra,
    });
    console.log(`  ⚠ ${truncate(email.subject, 50)} - No text content`);
    stats.manual++;
    return;
  }
  
  // Generate PDF
  const outputPath: string = getInvoiceOutputPath(
    analysis.invoice_date || email.date,
    analysis.vendor_product || email.sender_domain || email.sender,
    analysis.invoice_number ?? null
  );
  
  const metadata: PdfMetadata = {
    subject: email.subject ?? undefined,
    sender: email.sender ?? undefined,
    date: email.date ?? undefined,
    invoiceNumber: analysis.invoice_number ?? undefined,
    amount: analysis.amount ?? undefined,
  };
  
  // Use HTML rendering if we have HTML content (better formatting for receipts)
  // Fall back to text rendering if only plain text available
  if (emailContent.html) {
    await generatePdfFromEmailHtml(emailContent.html, metadata, outputPath);
  } else {
    await generatePdfFromText(emailContent.text!, metadata, outputPath);
  }
  
  // Hash the generated file
  let fileHash: string | null = null;
  try {
    fileHash = hashFile(outputPath);
  } catch {
    // Ignore hash errors
  }
  
  updateEmailStatus(email.id, account, 'downloaded', {
    invoice_type: 'text',
    invoice_path: outputPath,
    invoice_number: analysis.invoice_number,
    invoice_amount: analysis.amount,
    invoice_amount_cents,
    invoice_date: analysis.invoice_date,
    attachment_hash: fileHash,
    file_hash: fileHash,
    deductible,
    deductible_reason,
    income_tax_percent,
    vat_recoverable,
  });
  
  const relativePath: string = path.relative(process.cwd(), outputPath);
  console.log(`  ✓ ${truncate(email.subject, 50)}`);
  console.log(`    → ${relativePath}`);
  printDeductibility(deductible, deductible_reason, income_tax_percent, vat_recoverable ? true : false);
  stats.downloaded++;
}

async function checkForDuplicate(
  email: Email, 
  analysis: EmailAnalysis, 
  account: string, 
  options: ProcessOptions
): Promise<DuplicateCheckResult> {
  const { autoDedup, strict } = options;
  
  // Check by invoice number
  if (analysis.invoice_number) {
    const existing = findDuplicateByInvoiceNumber(
      analysis.invoice_number,
      email.sender_domain ?? '',
      email.id,
      account
    );
    if (existing) {
      return { isDuplicate: true, originalId: existing.id, confidence: 'exact' };
    }
  }
  
  // Check by amount + date (fuzzy)
  if (analysis.amount && analysis.invoice_date && (autoDedup || strict)) {
    const existing = findDuplicateByFuzzyMatch(
      email.sender_domain ?? '',
      analysis.amount,
      analysis.invoice_date,
      email.id,
      account
    );
    if (existing) {
      const confidence: 'high' | 'medium' = strict ? 'high' : 'medium';
      if (autoDedup) {
        return { isDuplicate: true, originalId: existing.id, confidence };
      }
    }
  }
  
  return { isDuplicate: false };
}

function findPdfAttachment(message: GmailMessage): PdfAttachmentInfo | null {
  const parts: GmailPayload[] = message.payload?.parts || [];
  
  for (const part of parts) {
    if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
      return {
        filename: part.filename,
        attachmentId: part.body?.attachmentId,
        mimeType: part.mimeType,
      };
    }
    
    // Check nested parts
    if (part.parts) {
      for (const subPart of part.parts) {
        if (subPart.filename && subPart.filename.toLowerCase().endsWith('.pdf')) {
          return {
            filename: subPart.filename,
            attachmentId: subPart.body?.attachmentId,
            mimeType: subPart.mimeType,
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract both text and HTML content from email message
 * Returns { text: string|null, html: string|null }
 */
function extractEmailContent(message: GmailMessage): EmailContent {
  const parts: GmailPayload[] = message.payload?.parts || [];
  let text: string | null = null;
  let html: string | null = null;
  
  // Look for text/plain and text/html parts
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data && !text) {
      text = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    // Check nested parts (multipart/alternative inside multipart/mixed)
    if (part.parts) {
      for (const subPart of part.parts) {
        if (subPart.mimeType === 'text/plain' && subPart.body?.data && !text) {
          text = Buffer.from(subPart.body.data, 'base64').toString('utf-8');
        }
        if (subPart.mimeType === 'text/html' && subPart.body?.data && !html) {
          html = Buffer.from(subPart.body.data, 'base64').toString('utf-8');
        }
      }
    }
  }
  
  // Try body directly (single-part email)
  if (!text && !html && message.payload?.body?.data) {
    const content: string = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    // Check if it's HTML
    if (content.trim().startsWith('<') || /<html|<body|<div|<table/i.test(content)) {
      html = content;
    } else {
      text = content;
    }
  }
  
  // Last resort: use snippet
  if (!text && !html) {
    text = message.snippet || null;
  }
  
  return { text, html };
}

/**
 * Convert HTML to plain text, properly stripping CSS and scripts
 */
function htmlToText(html: string): string {
  return html
    // Remove style blocks (handles <style>, <style type="...">, etc.)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove script blocks
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove invisible elements
    .replace(/<(head|title|meta|link)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(head|title|meta|link)\b[^>]*\/?>/gi, '')
    // Convert common block elements to newlines
    .replace(/<\/(p|div|tr|li|h[1-6]|br)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Convert table cells to tabs
    .replace(/<\/td>/gi, '\t')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&euro;/gi, '€')
    .replace(/&#\d+;/g, (match: string): string => {
      const code: number = parseInt(match.slice(2, -1), 10);
      return String.fromCharCode(code);
    })
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')  // Collapse horizontal whitespace
    .replace(/\n\s*\n/g, '\n\n')  // Collapse multiple newlines
    .replace(/^\s+|\s+$/gm, '')  // Trim each line
    .trim();
}

function printDeductibility(
  deductible: DeductibleCategory | 'unclear' | undefined, 
  reason: string | undefined, 
  incomeTaxPercent: number | null | undefined, 
  vatRecoverable: boolean | null | undefined
): void {
  const icons: Record<string, string> = {
    full: '💼',
    vehicle: '🚗',
    meals: '🍽️',
    telecom: '📱',
    partial: '📊',
    none: '🚫',
    unclear: '❓',
  };
  const icon: string = (deductible && icons[deductible]) || '❓';
  
  let details: string = capitalize(deductible || 'unclear');
  
  // Show income tax percentage if not 100%
  if (incomeTaxPercent !== null && incomeTaxPercent !== undefined && incomeTaxPercent !== 100) {
    details += ` (${incomeTaxPercent}% EST)`;
  }
  
  // Show VAT recovery status for special cases
  if (deductible === 'vehicle') {
    details += ' (no VAT)';
  } else if (deductible === 'meals' && vatRecoverable) {
    details += ' (100% VAT)';
  }
  
  console.log(`    ${icon} ${details}: ${reason || 'No reason provided'}`);
}

function truncate(str: string | null, len: number): string {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

function capitalize(str: string | undefined): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Keep htmlToText available for potential future use
void htmlToText;
