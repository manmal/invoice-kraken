/**
 * gogcli wrapper
 */

import { execSync, spawn } from 'child_process';

/**
 * Check if an account is configured in gog
 */
export async function checkAccount(account) {
  try {
    const output = execSync('gog auth list', { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const email = line.split('\t')[0];
      if (email === account) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking gog account:', error.message);
    return false;
  }
}

/**
 * Search Gmail for emails matching query
 */
export async function searchGmail(account, query, maxResults = 500) {
  try {
    const output = execSync(
      `gog gmail search '${query.replace(/'/g, "'\\''")}' --account ${account} --output json --max ${maxResults}`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
    
    if (!output.trim()) {
      return [];
    }
    
    const result = JSON.parse(output);
    
    // gog returns { threads: [...], nextPageToken: ... }
    if (result.threads && Array.isArray(result.threads)) {
      return result.threads;
    }
    
    // If it's already an array, return as-is
    if (Array.isArray(result)) {
      return result;
    }
    
    return [];
  } catch (error) {
    if (error.stdout) {
      try {
        const result = JSON.parse(error.stdout);
        if (result.threads) return result.threads;
        if (Array.isArray(result)) return result;
      } catch {}
    }
    console.error('Error searching Gmail:', error.message);
    return [];
  }
}

/**
 * Get full email message with body
 */
export async function getMessage(account, messageId) {
  try {
    const output = execSync(
      `gog gmail get ${messageId} --account ${account} --output json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const result = JSON.parse(output);
    // gog wraps the response in { message: {...} }
    return result.message || result;
  } catch (error) {
    console.error(`Error getting message ${messageId}:`, error.message);
    return null;
  }
}

/**
 * Get thread with all messages
 */
export async function getThread(account, threadId) {
  try {
    const output = execSync(
      `gog gmail thread ${threadId} --account ${account} --output json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const result = JSON.parse(output);
    // gog wraps the response
    return result.thread || result;
  } catch (error) {
    console.error(`Error getting thread ${threadId}:`, error.message);
    return null;
  }
}

/**
 * Download attachment
 * Falls back to extracting from raw email if gog attachment command fails
 */
export async function downloadAttachment(account, messageId, attachmentId, outputPath) {
  // First try the gog attachment command
  try {
    execSync(
      `gog gmail attachment ${messageId} ${attachmentId} --account ${account} --out '${outputPath}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    // gog attachment command failed, try fallback
    console.log(`  gog attachment failed, trying raw email extraction...`);
  }
  
  // Fallback: Extract from raw email format
  try {
    return await downloadAttachmentFromRaw(account, messageId, outputPath);
  } catch (error) {
    console.error(`Error downloading attachment:`, error.message);
    return false;
  }
}

/**
 * Download attachment by extracting from raw email format
 */
async function downloadAttachmentFromRaw(account, messageId, outputPath) {
  // Get raw email
  const output = execSync(
    `gog gmail get ${messageId} --account ${account} --format raw --output json`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );
  
  const result = JSON.parse(output);
  const rawBase64 = result.message?.raw || result.raw;
  
  if (!rawBase64) {
    throw new Error('No raw email data');
  }
  
  // Decode the raw email
  const rawEmail = Buffer.from(rawBase64, 'base64').toString('utf-8');
  
  // Find PDF attachment in the raw email
  // Look for Content-Disposition: attachment with .pdf filename
  const pdfMatch = rawEmail.match(/Content-Disposition:\s*attachment;\s*filename="([^"]+\.pdf)"/i);
  
  if (!pdfMatch) {
    throw new Error('No PDF attachment found in raw email');
  }
  
  const filename = pdfMatch[1];
  
  // Find the boundary that contains this attachment
  const boundaryMatch = rawEmail.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    throw new Error('Could not find MIME boundary');
  }
  
  // Extract the base64 content between the attachment header and the next boundary
  const attachmentStart = rawEmail.indexOf(pdfMatch[0]);
  const contentStart = rawEmail.indexOf('\r\n\r\n', attachmentStart) + 4;
  
  // Find the end - next boundary
  const boundaryPattern = '--' + boundaryMatch[1];
  let contentEnd = rawEmail.indexOf(boundaryPattern, contentStart);
  
  if (contentEnd === -1) {
    // Try without the leading --
    contentEnd = rawEmail.indexOf(boundaryMatch[1], contentStart);
  }
  
  if (contentEnd === -1) {
    throw new Error('Could not find attachment end boundary');
  }
  
  // Extract and clean the base64 content
  let base64Content = rawEmail.substring(contentStart, contentEnd);
  base64Content = base64Content.replace(/[\r\n\s]/g, '');
  
  // Decode and write to file
  const fs = await import('fs');
  const path = await import('path');
  
  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  
  const pdfBuffer = Buffer.from(base64Content, 'base64');
  fs.writeFileSync(outputPath, pdfBuffer);
  
  return true;
}

/**
 * Build Gmail search query for invoice-related emails in a date range
 */
export function buildInvoiceQuery(year, month) {
  const terms = [
    'invoice',
    'rechnung', 
    'beleg',
    'billing',
    'zahlung',
    'quittung',
    'receipt',
    'buchungsbeleg',
    '(bestellbestätigung has:attachment)',
    'zahlungsbestätigung'
  ];
  
  const searchTerms = `(${terms.join(' OR ')})`;
  
  // Calculate date range
  const startDate = `${year}/${String(month).padStart(2, '0')}/01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}/${String(nextMonth).padStart(2, '0')}/01`;
  
  return `${searchTerms} after:${startDate} before:${endDate}`;
}
