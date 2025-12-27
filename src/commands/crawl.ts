/**
 * Download command - Download remaining invoices using browser automation
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  getEmailsByStatus, 
  updateEmailStatus,
  findDuplicateByHash,
} from '../lib/db.js';
import {
  startAction,
  completeAction,
  failAction,
} from '../lib/action-log.js';
import { getCached } from '../lib/email-cache.js';
import { downloadInvoice, closeBrowser } from '../lib/browser.js';
import { hashFile } from '../utils/hash.js';
import { getInvoiceOutputPath } from '../utils/paths.js';
import type { Email, CrawlOptions, DownloadResult } from '../types.js';

interface CrawlStats {
  downloaded: number;
  duplicates: number;
  needsLogin: number;
  failed: number;
}

export async function crawlCommand(options: CrawlOptions): Promise<void> {
  const { account, batchSize = 5 } = options;
  
  console.log(`Downloading invoices for account: ${account}`);
  console.log(`Batch size: ${batchSize}\n`);
  
  // Get pending download emails
  const pendingEmails: Email[] = getEmailsByStatus(account, 'pending_download', 100);
  
  if (pendingEmails.length === 0) {
    console.log('No invoices pending download.');
    console.log('Run "kraxler extract" first to analyze emails.');
    return;
  }
  
  console.log(`Found ${pendingEmails.length} invoices pending download.\n`);
  
  // Start action log
  const actionId = startAction({
    action: 'crawl',
    account,
  });
  
  const stats: CrawlStats = {
    downloaded: 0,
    duplicates: 0,
    needsLogin: 0,
    failed: 0,
  };
  
  // Process one at a time (browser automation is sequential)
  try {
    for (let i = 0; i < pendingEmails.length; i++) {
      const email = pendingEmails[i];
      
      console.log(`\n[${i + 1}/${pendingEmails.length}] ${truncate(email.subject, 50)}`);
      console.log(`  From: ${email.sender}`);
      
      // Extract download URL from notes/snippet
      const downloadUrl = extractDownloadUrl(email);
      
      if (!downloadUrl) {
        console.log(`  ⚠ No download URL found`);
        updateEmailStatus(email.id, account, 'manual', {
          notes: 'No download URL could be extracted from email',
        });
        stats.failed++;
        continue;
      }
      
      try {
        // Determine output path
        const outputPath = getInvoiceOutputPath(
          email.invoice_date || email.date,
          email.sender_domain || email.sender,
          email.invoice_number
        );
        
        console.log(`  URL: ${truncate(downloadUrl, 60)}`);
        
        // Use browser automation to download
        const result: DownloadResult = await downloadInvoice(downloadUrl, outputPath);
        
        if (result.success && result.path) {
          const filePath = result.path;
          
          if (fs.existsSync(filePath)) {
            // Hash the downloaded file
            const fileHash = hashFile(filePath);
            
            // Check for duplicate by hash
            const existingDup = findDuplicateByHash(fileHash, email.id, account);
            
            if (existingDup) {
              // It's a duplicate
              fs.unlinkSync(filePath);
              updateEmailStatus(email.id, account, 'duplicate', {
                duplicate_of: existingDup.id,
                duplicate_confidence: 'exact',
                attachment_hash: fileHash,
              });
              console.log(`  ⊘ Duplicate of existing invoice`);
              stats.duplicates++;
            } else {
              // Successfully downloaded
              updateEmailStatus(email.id, account, 'downloaded', {
                invoice_path: filePath,
                attachment_hash: fileHash,
              });
              const relativePath = path.relative(process.cwd(), filePath);
              console.log(`  ✓ Downloaded: ${relativePath}`);
              stats.downloaded++;
            }
          } else {
            updateEmailStatus(email.id, account, 'manual', {
              notes: `Download reported success but file not found`,
            });
            console.log(`  ⚠ File not found after download`);
            stats.failed++;
          }
        } else if (result.needsLogin) {
          const loginUrl = result.loginUrl || downloadUrl;
          updateEmailStatus(email.id, account, 'manual', {
            notes: `Requires login: ${loginUrl}`,
          });
          console.log(`  🔐 Requires login`);
          stats.needsLogin++;
        } else {
          const errorMsg = result.error || 'Unknown error';
          updateEmailStatus(email.id, account, 'manual', {
            notes: `Download failed: ${errorMsg}`,
          });
          console.log(`  ✗ Failed: ${errorMsg}`);
          stats.failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ Error: ${errorMessage}`);
        updateEmailStatus(email.id, account, 'manual', {
          notes: `Error: ${errorMessage}`,
        });
        stats.failed++;
      }
    }
    // Complete action log
    completeAction(actionId, {
      emailsFound: pendingEmails.length,
      emailsProcessed: stats.downloaded + stats.duplicates + stats.needsLogin + stats.failed,
      emailsFailed: stats.failed + stats.needsLogin,
    });
  } catch (error) {
    failAction(actionId, error as Error, {
      emailsFound: pendingEmails.length,
      emailsProcessed: stats.downloaded + stats.duplicates,
    });
    throw error;
  } finally {
    await closeBrowser();
  }
  
  // Print summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log('DOWNLOAD COMPLETE');
  console.log(`${'═'.repeat(50)}`);
  console.log(`  ✓ Downloaded: ${stats.downloaded}`);
  console.log(`  ⊘ Duplicates: ${stats.duplicates}`);
  console.log(`  🔐 Needs login: ${stats.needsLogin}`);
  console.log(`  ✗ Failed: ${stats.failed}`);
  
  if (stats.needsLogin > 0 || stats.failed > 0) {
    console.log(`\nRun "kraxler review --account ${account}" to see items needing manual handling.`);
  }
}

/**
 * Extract download URL from email - checks notes, snippet, and email body cache
 */
function extractDownloadUrl(email: Email): string | null {
  // First check notes/snippet
  const sources: (string | null)[] = [email.notes, email.snippet, email.raw_json];
  
  // Also get the cached email body
  const cached = getCached(email.id);
  if (cached) {
    sources.push(cached.body_text, cached.body_html);
  }
  
  // URL patterns in priority order
  const urlPatterns: RegExp[] = [
    // Direct PDF links
    /https?:\/\/[^\s<>"']+\.pdf[^\s<>"']*/gi,
    // Common invoice portal patterns
    /https?:\/\/[^\s<>"']*(?:invoice|rechnung|download|bill|receipt|billing)[^\s<>"']*/gi,
    // Dashboard/account portals
    /https?:\/\/[^\s<>"']*(?:dashboard|account|portal|my\.|mein)[^\s<>"']*/gi,
  ];
  
  // Skip patterns
  const skipPatterns: RegExp[] = [
    /unsubscribe/i,
    /tracking/i,
    /click\./i,
    /mailchimp/i,
    /sendgrid/i,
    /fonts\.googleapis/i,
    /gstatic\.com/i,
    /\.(png|jpg|jpeg|gif|svg|ico|css|js)$/i,
    /privacy|datenschutz|impressum|agb|faq|contact|kontakt|support|help/i,
  ];
  
  for (const pattern of urlPatterns) {
    for (const source of sources) {
      if (!source) continue;
      
      // Decode HTML entities
      const decoded = source.replace(/&amp;/g, '&');
      
      const matches = decoded.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          // Skip unwanted URLs
          const shouldSkip = skipPatterns.some((skip: RegExp) => skip.test(match));
          if (shouldSkip) continue;
          
          // Clean up the URL (remove trailing punctuation)
          const cleanUrl = match.replace(/[.,;:!?)]+$/, '');
          return cleanUrl;
        }
      }
    }
  }
  
  return null;
}

function truncate(str: string | null, len: number): string {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}
