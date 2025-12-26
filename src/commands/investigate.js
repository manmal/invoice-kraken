/**
 * Investigate command - Analyze found emails and classify invoices
 */

import fs from 'fs';
import path from 'path';
import { 
  getDb, 
  getEmailsByStatus, 
  updateEmailStatus,
  findDuplicateByInvoiceNumber,
  findDuplicateByHash,
  findDuplicateByFuzzyMatch,
} from '../lib/db.js';
import { prefilterEmails } from '../lib/prefilter.js';
import { getMessage, downloadAttachment } from '../lib/gog.js';
import { analyzeEmailsForInvoices, checkAuth } from '../lib/ai.js';
import { extractInvoiceData, parseAmountToCents } from '../lib/extract.js';
import { classifyDeductibility } from '../lib/vendors.js';
import { generatePdfFromText } from '../lib/pdf.js';
import { hashFile } from '../utils/hash.js';
import { getInvoiceOutputPath, getInvoicesDir, ensureDir } from '../utils/paths.js';

export async function investigateCommand(options) {
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
  const db = getDb();
  const pendingEmails = getEmailsByStatus(account, 'pending', 1000);
  
  if (pendingEmails.length === 0) {
    console.log('No pending emails to investigate.');
    console.log('Run "npm run search" first to find invoice emails.');
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
  const batches = [];
  for (let i = 0; i < toAnalyze.length; i += batchSize) {
    batches.push(toAnalyze.slice(i, i + batchSize));
  }
  
  let stats = {
    invoices: 0,
    noInvoice: 0,
    duplicates: 0,
    downloaded: 0,
    pendingDownload: 0,
    manual: 0,
    errors: 0,
  };
  
  let batchNum = 0;
  for (const batch of batches) {
    batchNum++;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Batch ${batchNum}/${batches.length}: Analyzing ${batch.length} emails...`);
    console.log(`${'─'.repeat(50)}`);
    
    // Analyze batch with AI
    const analyses = await analyzeEmailsForInvoices(batch);
    
    // Process each email
    for (let i = 0; i < batch.length; i++) {
      const email = batch[i];
      const analysis = analyses.find(a => a.id === email.id) || analyses[i] || {};
      
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
  
  if (stats.pendingDownload > 0) {
    console.log(`\nRun "npm run download -- --account ${account}" to download remaining invoices.`);
  }
  if (stats.manual > 0) {
    console.log(`Run "npm run list -- --account ${account}" to see items needing manual handling.`);
  }
}

async function processEmail(email, analysis, account, options, stats) {
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
    let deductible = analysis.deductible;
    let deductibleReason = analysis.deductible_reason;
    let incomeTaxPercent = analysis.income_tax_percent;
    let vatRecoverable = analysis.vat_recoverable;
    
    // Fallback to vendor DB if AI didn't provide clear classification
    if (!deductible || deductible === 'unclear') {
      const vendorClassification = classifyDeductibility(
        email.sender_domain,
        email.subject,
        email.snippet
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
    const amountCents = analysis.amount ? parseAmountToCents(analysis.amount) : null;
    
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
        deductible_percent: deductiblePercent,
      });
      console.log(`  ⊘ ${truncate(email.subject, 50)} - Duplicate (${dupCheck.confidence})`);
      stats.duplicates++;
      return;
    }
    
    // Process based on invoice type
    const invoiceType = analysis.invoice_type || 'unknown';
    
    // Common extra data for all handlers
    const extraData = {
      deductible,
      deductible_reason: deductibleReason,
      income_tax_percent: incomeTaxPercent,
      vat_recoverable: vatRecoverable ? 1 : 0,
      invoice_amount_cents: amountCents,
    };
    
    if (invoiceType === 'pdf_attachment') {
      await handlePdfAttachment(email, analysis, account, stats, extraData);
    } else if (invoiceType === 'text') {
      await handleTextInvoice(email, analysis, account, stats, extraData);
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
    console.error(`  ✗ Error processing ${email.id}: ${error.message}`);
    updateEmailStatus(email.id, account, 'manual', {
      notes: `Error: ${error.message}`,
    });
    stats.errors++;
  }
}

async function handlePdfAttachment(email, analysis, account, stats, extra) {
  const { deductible, deductible_reason, income_tax_percent, vat_recoverable, invoice_amount_cents } = extra;
  
  // Get full message to find attachment
  const fullMessage = await getMessage(account, email.id);
  
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
  
  // Find PDF attachment
  const attachment = findPdfAttachment(fullMessage);
  
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
  const outputPath = getInvoiceOutputPath(
    analysis.invoice_date || email.date,
    analysis.vendor_product || email.sender_domain || email.sender,
    analysis.invoice_number
  );
  
  const success = await downloadAttachment(
    account,
    email.id,
    attachment.attachmentId,
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
  const fileHash = hashFile(outputPath);
  
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
  
  const relativePath = path.relative(process.cwd(), outputPath);
  console.log(`  ✓ ${truncate(email.subject, 50)}`);
  console.log(`    → ${relativePath}`);
  printDeductibility(deductible, deductible_reason, income_tax_percent, vat_recoverable);
  stats.downloaded++;
}

async function handleTextInvoice(email, analysis, account, stats, extra) {
  const { deductible, deductible_reason, income_tax_percent, vat_recoverable, invoice_amount_cents } = extra;
  
  // Get full message
  const fullMessage = await getMessage(account, email.id);
  
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
  
  // Extract text content
  const textContent = extractTextContent(fullMessage);
  
  if (!textContent) {
    updateEmailStatus(email.id, account, 'manual', {
      invoice_type: 'text',
      notes: 'Could not extract text content',
      ...extra,
    });
    console.log(`  ⚠ ${truncate(email.subject, 50)} - No text content`);
    stats.manual++;
    return;
  }
  
  // Generate PDF
  const outputPath = getInvoiceOutputPath(
    analysis.invoice_date || email.date,
    analysis.vendor_product || email.sender_domain || email.sender,
    analysis.invoice_number
  );
  
  await generatePdfFromText(textContent, {
    subject: email.subject,
    sender: email.sender,
    date: email.date,
    invoiceNumber: analysis.invoice_number,
    amount: analysis.amount,
  }, outputPath);
  
  // Hash the generated file
  let fileHash = null;
  try {
    fileHash = hashFile(outputPath);
  } catch {}
  
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
  
  const relativePath = path.relative(process.cwd(), outputPath);
  console.log(`  ✓ ${truncate(email.subject, 50)}`);
  console.log(`    → ${relativePath}`);
  printDeductibility(deductible, deductible_reason, income_tax_percent, vat_recoverable);
  stats.downloaded++;
}

async function checkForDuplicate(email, analysis, account, options) {
  const { autoDedup, strict } = options;
  const db = getDb();
  
  // Check by invoice number
  if (analysis.invoice_number) {
    const existing = findDuplicateByInvoiceNumber(
      analysis.invoice_number,
      email.sender_domain,
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
      email.sender_domain,
      analysis.amount,
      analysis.invoice_date,
      email.id,
      account
    );
    if (existing) {
      const confidence = strict ? 'high' : 'medium';
      if (autoDedup) {
        return { isDuplicate: true, originalId: existing.id, confidence };
      }
    }
  }
  
  return { isDuplicate: false };
}

function findPdfAttachment(message) {
  const parts = message.payload?.parts || [];
  
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

function extractTextContent(message) {
  const parts = message.payload?.parts || [];
  
  // Try to find text/plain part
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }
  
  // Try text/html as fallback
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      // Basic HTML to text conversion
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
    }
  }
  
  // Try body directly
  if (message.payload?.body?.data) {
    return Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  }
  
  return message.snippet || null;
}

function printDeductibility(deductible, reason, incomeTaxPercent, vatRecoverable) {
  const icons = {
    full: '💼',
    vehicle: '🚗',
    meals: '🍽️',
    telecom: '📱',
    partial: '📊',
    none: '🚫',
    unclear: '❓',
  };
  const icon = icons[deductible] || '❓';
  
  let details = capitalize(deductible);
  
  // Show income tax percentage if not 100%
  if (incomeTaxPercent !== null && incomeTaxPercent !== 100) {
    details += ` (${incomeTaxPercent}% EST)`;
  }
  
  // Show VAT recovery status for special cases
  if (deductible === 'vehicle') {
    details += ' (no VAT)';
  } else if (deductible === 'meals' && vatRecoverable) {
    details += ' (100% VAT)';
  }
  
  console.log(`    ${icon} ${details}: ${reason}`);
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
