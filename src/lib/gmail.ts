/**
 * Gmail API Client
 * 
 * Replaces the legacy gogcli wrapper.
 * Uses official Google APIs with OAuth2.
 */

import * as fs from 'fs';
import * as path from 'path';
import { google, gmail_v1 } from 'googleapis';
import { getAuthClient, hasValidToken } from './google-auth.js';
import type { GmailMessage } from '../types.js';

// Re-export specific types if needed by consumers
export type { GmailMessage };

// Re-use the existing interface or define what we need
interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
  snippet?: string;
}

/**
 * Check if an account is configured (authenticated)
 */
export async function checkAccount(account: string): Promise<boolean> {
  return hasValidToken(account);
}

/**
 * Get the Gmail API client
 */
async function getGmailApi(account: string): Promise<gmail_v1.Gmail> {
  const auth = await getAuthClient(account);
  return google.gmail({ version: 'v1', auth });
}

/**
 * Search Gmail for emails matching query
 */
export async function searchGmail(account: string, query: string, maxResults: number = 500): Promise<GmailThread[]> {
  try {
    const gmail = await getGmailApi(account);
    const threads: GmailThread[] = [];
    let pageToken: string | undefined = undefined;
    
    // The API returns a list of thread IDs, we might need to fetch details if the caller expects them.
    // gogcli's `search` command seemed to return thread objects.
    // However, `gog.ts` return type is `GmailThread[]`.
    // The `gmail.users.threads.list` returns `{ threads: [{id, snippet, historyId}, ...] }`.
    // It does NOT return messages inside the threads by default.
    // Let's check `gog.ts` again. It returns `GogSearchResult | GmailThread[]`.
    // The caller `scan.ts` iterates over these threads.
    
    // We will fetch the list first.
    do {
      const res = await gmail.users.threads.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(maxResults - threads.length, 100), // Page size
        pageToken,
      }) as any; // Cast to any to avoid TS7022 circular inference
      
      if (res.data.threads) {
        // Map to our interface. Note: `messages` will be missing here compared to `threads.get`.
        // If the caller needs messages, they usually call `getThread` later.
        // Let's verify `scan.ts` usage.
        threads.push(...(res.data.threads as GmailThread[]));
      }
      
      pageToken = res.data.nextPageToken || undefined;
      
    } while (pageToken && threads.length < maxResults);

    return threads;
    
  } catch (error) {
    console.error(`Error searching Gmail for ${account}:`, error);
    return [];
  }
}

/**
 * Get full email message with body
 */
export async function getMessage(account: string, messageId: string): Promise<GmailMessage | null> {
  try {
    const gmail = await getGmailApi(account);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full', 
    });
    
    return res.data as GmailMessage;
  } catch (error) {
    console.error(`Error getting message ${messageId}:`, error);
    return null;
  }
}

/**
 * Get thread with all messages
 */
export async function getThread(account: string, threadId: string): Promise<GmailThread | null> {
  try {
    const gmail = await getGmailApi(account);
    const res = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });
    
    return res.data as GmailThread;
  } catch (error) {
    console.error(`Error getting thread ${threadId}:`, error);
    return null;
  }
}

/**
 * Download attachment
 */
export async function downloadAttachment(account: string, messageId: string, attachmentId: string, outputPath: string): Promise<boolean> {
  try {
    const gmail = await getGmailApi(account);
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId,
    });
    
    const data = res.data.data;
    if (!data) {
      console.error(`No data found for attachment ${attachmentId}`);
      return false;
    }
    
    // Data is base64url encoded
    const buffer = Buffer.from(data, 'base64url');
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, buffer);
    return true;
    
  } catch (error) {
    console.error(`Error downloading attachment:`, error);
    return false;
  }
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
