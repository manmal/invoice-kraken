/**
 * Email content cache using SQLite
 * 
 * Caches full email content from `gog gmail get` to avoid repeated API calls.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as child_process from 'child_process';
import { getDatabasePath } from './paths.js';
import type { GmailPayload } from '../types.js';

const DB_PATH: string = getDatabasePath();

let db: DatabaseType | null = null;

interface EmailCacheRow {
  id: string;
  account: string;
  body_text: string | null;
  body_html: string | null;
  fetched_at: string;
}

interface CacheStats {
  totalCached: number;
}

interface EmailBody {
  textBody: string;
  htmlBody: string;
}

function getDb(): DatabaseType {
  if (!db) {
    db = new Database(DB_PATH);
    initSchema();
  }
  return db;
}

function initSchema(): void {
  if (!db) return;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_cache (
      id TEXT PRIMARY KEY,
      account TEXT NOT NULL,
      body_text TEXT,
      body_html TEXT,
      fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_cache_account ON email_cache(account)`);
}

/**
 * Get cached email content
 */
export function getCached(messageId: string): EmailCacheRow | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM email_cache WHERE id = ?').get(messageId) as EmailCacheRow | undefined;
  return row || null;
}

/**
 * Store email content in cache
 */
export function setCache(messageId: string, account: string, bodyText: string | null, bodyHtml: string | null): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO email_cache (id, account, body_text, body_html, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(messageId, account, bodyText, bodyHtml);
}

/**
 * Extract text content from Gmail message payload
 */
function extractBodyFromPayload(payload: GmailPayload | undefined): EmailBody {
  let textBody = '';
  let htmlBody = '';
  
  if (!payload) return { textBody, htmlBody };
  
  // Direct body data
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/plain') {
      textBody = decoded;
    } else if (payload.mimeType === 'text/html') {
      htmlBody = decoded;
    }
  }
  
  // Check parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      const { textBody: t, htmlBody: h } = extractBodyFromPayload(part);
      if (t) textBody = t;
      if (h) htmlBody = h;
    }
  }
  
  return { textBody, htmlBody };
}

interface GmailGetResult {
  message?: {
    payload?: GmailPayload;
  };
  payload?: GmailPayload;
}

/**
 * Fetch email from gog and cache it
 */
async function fetchAndCache(account: string, messageId: string): Promise<EmailBody | null> {
  try {
    const output = child_process.execSync(
      `gog gmail get ${messageId} --account ${account} --output json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
    );
    
    const result: GmailGetResult = JSON.parse(output);
    const message = result.message || result;
    
    // Extract body content
    const { textBody, htmlBody } = extractBodyFromPayload(message.payload);
    
    // Cache it
    setCache(messageId, account, textBody, htmlBody);
    
    return { textBody, htmlBody };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching message ${messageId}:`, errorMessage);
    return null;
  }
}

/**
 * Get email body content, using cache first
 */
export async function getEmailBody(account: string, messageId: string): Promise<EmailBody | null> {
  // Check cache first
  const cached = getCached(messageId);
  if (cached) {
    return { textBody: cached.body_text || '', htmlBody: cached.body_html || '' };
  }
  
  // Fetch and cache
  return await fetchAndCache(account, messageId);
}

/**
 * Get email bodies in parallel with concurrency limit
 */
export async function getEmailBodiesBatch(
  account: string, 
  messageIds: string[], 
  concurrency: number = 4
): Promise<Map<string, EmailBody>> {
  const results = new Map<string, EmailBody>();
  
  // Check cache first, collect misses
  const misses: string[] = [];
  for (const id of messageIds) {
    const cached = getCached(id);
    if (cached) {
      results.set(id, { textBody: cached.body_text || '', htmlBody: cached.body_html || '' });
    } else {
      misses.push(id);
    }
  }
  
  if (misses.length === 0) {
    return results;
  }
  
  // Fetch misses in parallel batches
  for (let i = 0; i < misses.length; i += concurrency) {
    const batch = misses.slice(i, i + concurrency);
    const promises = batch.map(id => 
      fetchAndCache(account, id).then(result => ({ id, result }))
    );
    
    const batchResults = await Promise.all(promises);
    
    for (const { id, result } of batchResults) {
      if (result) {
        results.set(id, result);
      }
    }
  }
  
  return results;
}

/**
 * Get truncated body text for classification (max 1KB)
 * Strips HTML tags if only HTML is available
 */
export function getTruncatedBody(bodyText: string | null, bodyHtml: string | null, maxLength: number = 1024): string {
  let text = bodyText || '';
  
  // If no text body, strip HTML tags from HTML body
  if (!text && bodyHtml) {
    text = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Truncate to max length
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }
  
  return text;
}

/**
 * Get cache stats
 */
export function getCacheStats(): CacheStats {
  const database = getDb();
  const total = database.prepare('SELECT COUNT(*) as count FROM email_cache').get() as { count: number };
  return { totalCached: total.count };
}
