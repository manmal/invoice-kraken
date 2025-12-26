/**
 * gogcli wrapper
 */

import * as child_process from 'child_process';
import type { GmailMessage } from '../types.js';

interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
  snippet?: string;
}

interface GogSearchResult {
  threads?: GmailThread[];
  nextPageToken?: string;
}

interface GogMessageResult {
  message?: GmailMessage;
}

interface GogThreadResult {
  thread?: GmailThread;
}

interface GogRawResult {
  message?: { raw?: string };
  raw?: string;
}

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

/**
 * Check if an account is configured in gog
 */
export async function checkAccount(account: string): Promise<boolean> {
  try {
    const output = child_process.execSync('gog auth list', { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const email = line.split('\t')[0];
      if (email === account) {
        return true;
      }
    }
    return false;
  } catch (error) {
    const err = error as ExecError;
    console.error('Error checking gog account:', err.message);
    return false;
  }
}

/**
 * Search Gmail for emails matching query
 */
export async function searchGmail(account: string, query: string, maxResults: number = 500): Promise<GmailThread[]> {
  try {
    const output = child_process.execSync(
      `gog gmail search '${query.replace(/'/g, "'\\''")}' --account ${account} --output json --max ${maxResults}`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
    
    if (!output.trim()) {
      return [];
    }
    
    const result = JSON.parse(output) as GogSearchResult | GmailThread[];
    
    // gog returns { threads: [...], nextPageToken: ... }
    if ('threads' in result && result.threads && Array.isArray(result.threads)) {
      return result.threads;
    }
    
    // If it's already an array, return as-is
    if (Array.isArray(result)) {
      return result;
    }
    
    return [];
  } catch (error) {
    const err = error as ExecError;
    if (err.stdout) {
      try {
        const result = JSON.parse(err.stdout) as GogSearchResult | GmailThread[];
        if ('threads' in result && result.threads) return result.threads;
        if (Array.isArray(result)) return result;
      } catch {
        // Ignore parse error
      }
    }
    console.error('Error searching Gmail:', err.message);
    return [];
  }
}

/**
 * Get full email message with body
 */
export async function getMessage(account: string, messageId: string): Promise<GmailMessage | null> {
  try {
    const output = child_process.execSync(
      `gog gmail get ${messageId} --account ${account} --output json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const result = JSON.parse(output) as GogMessageResult | GmailMessage;
    // gog wraps the response in { message: {...} }
    return ('message' in result && result.message) ? result.message : result as GmailMessage;
  } catch (error) {
    const err = error as ExecError;
    console.error(`Error getting message ${messageId}:`, err.message);
    return null;
  }
}

/**
 * Get thread with all messages
 */
export async function getThread(account: string, threadId: string): Promise<GmailThread | null> {
  try {
    const output = child_process.execSync(
      `gog gmail thread ${threadId} --account ${account} --output json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const result = JSON.parse(output) as GogThreadResult | GmailThread;
    // gog wraps the response
    return ('thread' in result && result.thread) ? result.thread : result as GmailThread;
  } catch (error) {
    const err = error as ExecError;
    console.error(`Error getting thread ${threadId}:`, err.message);
    return null;
  }
}

/**
 * Download attachment
 * Falls back to extracting from raw email if gog attachment command fails
 */
export async function downloadAttachment(account: string, messageId: string, attachmentId: string, outputPath: string): Promise<boolean> {
  // First try the gog attachment command
  try {
    child_process.execSync(
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
    const err = error as ExecError;
    console.error(`Error downloading attachment:`, err.message);
    return false;
  }
}

/**
 * Download attachment by extracting from raw email format
 */
async function downloadAttachmentFromRaw(account: string, messageId: string, outputPath: string): Promise<boolean> {
  // Get raw email
  const output = child_process.execSync(
    `gog gmail get ${messageId} --account ${account} --format raw --output json`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );
  
  const result = JSON.parse(output) as GogRawResult;
  const rawBase64 = result.message?.raw || result.raw;
  
  if (!rawBase64) {
    throw new Error('No raw email data');
  }
  
  // Decode the raw email
  const rawEmail = Buffer.from(rawBase64, 'base64').toString('utf-8');
  
  // Find PDF attachment in the raw email
  // Look for Content-Disposition: attachment with .pdf filename
  // Handle both inline and multiline formats:
  // - filename="Invoice.pdf"
  // - filename=Invoice.pdf (no quotes)
  // - filename on next line after Content-Disposition
  let pdfMatch: RegExpMatchArray | null = rawEmail.match(/Content-Disposition:\s*attachment;\s*filename="([^"]+\.pdf)"/i);
  
  if (!pdfMatch) {
    // Try without quotes
    pdfMatch = rawEmail.match(/Content-Disposition:\s*attachment;\s*filename=([^\s;]+\.pdf)/i);
  }
  
  if (!pdfMatch) {
    // Try multiline format (filename on next line)
    pdfMatch = rawEmail.match(/Content-Disposition:\s*attachment;\s*[\r\n]+\s*filename="?([^"\s;]+\.pdf)"?/i);
  }
  
  if (!pdfMatch) {
    throw new Error('No PDF attachment found in raw email');
  }
  
  // filename available in pdfMatch[1] if needed
  
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
export function buildInvoiceQuery(year: number, month: number): string {
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
