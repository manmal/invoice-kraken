/**
 * Download command - Download remaining invoices using pi + browser
 */

import fs from 'fs';
import path from 'path';
import { 
  getDb, 
  getEmailsByStatus, 
  updateEmailStatus,
  findDuplicateByHash,
} from '../lib/db.js';
import { downloadInvoiceWithBrowser, checkAuth } from '../lib/ai.js';
import { hashFile } from '../utils/hash.js';
import { getInvoiceOutputPath } from '../utils/paths.js';

export async function downloadCommand(options) {
  const { account, batchSize = 5 } = options;
  
  console.log(`Downloading invoices for account: ${account}`);
  console.log(`Batch size: ${batchSize}\n`);
  
  // Get pending download emails
  const db = getDb();
  const pendingEmails = getEmailsByStatus(account, 'pending_download', 100);
  
  if (pendingEmails.length === 0) {
    console.log('No invoices pending download.');
    console.log('Run "npm run investigate" first to analyze emails.');
    return;
  }
  
  console.log(`Found ${pendingEmails.length} invoices pending download.\n`);
  
  // Check authentication before starting
  const authError = await checkAuth();
  if (authError) {
    console.error(authError);
    process.exit(1);
  }
  
  let stats = {
    downloaded: 0,
    duplicates: 0,
    needsLogin: 0,
    failed: 0,
  };
  
  // Process one at a time (browser automation is sequential)
  for (let i = 0; i < pendingEmails.length; i++) {
    const email = pendingEmails[i];
    
    console.log(`\n[${i + 1}/${pendingEmails.length}] ${truncate(email.subject, 50)}`);
    console.log(`  From: ${email.sender}`);
    
    try {
      // Determine output path
      const outputPath = getInvoiceOutputPath(
        email.invoice_date || email.date,
        email.sender_domain || email.sender,
        email.invoice_number
      );
      
      console.log(`  Attempting download with browser automation...`);
      
      // Use browser automation to download
      const result = await downloadInvoiceWithBrowser(email, outputPath);
      
      if (result.success && result.path) {
        // Check if file exists
        const filePath = result.path || outputPath;
        
        if (fs.existsSync(filePath)) {
          // Hash the downloaded file
          const fileHash = hashFile(filePath);
          
          // Check for duplicate by hash
          const existingDup = findDuplicateByHash(fileHash, email.id, account);
          
          if (existingDup) {
            // It's a duplicate
            fs.unlinkSync(filePath); // Remove duplicate file
            updateEmailStatus(email.id, account, 'duplicate', {
              duplicate_of: existingDup.id,
              duplicate_confidence: 'exact',
              attachment_hash: fileHash,
            });
            console.log(`  ⊘ Duplicate of existing invoice (same PDF)`);
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
          // File doesn't exist despite success=true
          updateEmailStatus(email.id, account, 'manual', {
            notes: `Download reported success but file not found: ${filePath}`,
          });
          console.log(`  ⚠ File not found after download`);
          stats.failed++;
        }
      } else if (result.needs_login) {
        // Requires login
        const loginUrl = result.login_url || 'Unknown URL';
        updateEmailStatus(email.id, account, 'manual', {
          notes: `Requires login: ${loginUrl}`,
        });
        console.log(`  🔐 Requires login: ${loginUrl}`);
        stats.needsLogin++;
      } else {
        // Failed
        const errorMsg = result.error || 'Unknown error';
        updateEmailStatus(email.id, account, 'manual', {
          notes: `Download failed: ${errorMsg}`,
        });
        console.log(`  ✗ Failed: ${errorMsg}`);
        stats.failed++;
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      updateEmailStatus(email.id, account, 'manual', {
        notes: `Error: ${error.message}`,
      });
      stats.failed++;
    }
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
    console.log(`\nRun "npm run list -- --account ${account}" to see items needing manual handling.`);
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}
