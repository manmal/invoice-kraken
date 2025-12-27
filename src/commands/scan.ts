/**
 * Scan command - Scan Gmail for invoice-related emails
 */

import * as process from 'node:process';
import { checkAccount, searchGmail, buildInvoiceQuery } from '../lib/gmail.js';
import { getDb, insertEmail } from '../lib/db.js';
import { extractSenderDomain } from '../lib/extract.js';
import { parseDateRange, iterateMonths, getYearMonth } from '../lib/dates.js';
import { 
  startAction, 
  updateActionProgress, 
  completeAction, 
  failAction,
  markInterruptedActions 
} from '../lib/action-log.js';
import type { ScanOptions, Email } from '../types.js';

/** Email data for insertion (subset of Email fields) */
type EmailInsertData = Pick<Email, 
  | 'id' 
  | 'thread_id' 
  | 'account' 
  | 'year' 
  | 'month' 
  | 'subject' 
  | 'sender' 
  | 'sender_domain' 
  | 'date' 
  | 'snippet' 
  | 'labels' 
  | 'raw_json'
>;

/** Thread data returned from Gmail search (subset of message properties) */
interface GmailThreadData {
  id: string;
  threadId?: string;
  from?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  internalDate?: string;
}

export async function scanCommand(options: ScanOptions): Promise<void> {
  const { account } = options;
  
  // Parse date range from options
  let dateRange;
  try {
    dateRange = parseDateRange(options);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
  
  // Check if account exists
  console.log(`Checking account: ${account}...`);
  const accountExists = await checkAccount(account);
  
  if (!accountExists) {
    console.error(`Error: Account "${account}" is not authenticated.`);
    console.log(`The authentication flow will start now to link this account.`);
  }
  
  console.log(`✓ Account verified: ${account}`);
  console.log(`\nScanning for invoices: ${dateRange.display}...\n`);
  
  // Initialize database and mark any interrupted actions
  getDb();
  const interrupted = markInterruptedActions();
  if (interrupted > 0) {
    console.log(`⚠ Marked ${interrupted} interrupted action(s) from previous run\n`);
  }
  
  // Get year range for action log
  const fromYM = getYearMonth(dateRange.from);
  const toYM = getYearMonth(dateRange.to);
  
  // Start action log
  const actionId = startAction({
    action: 'scan',
    account,
    year: fromYM.year,
    monthFrom: fromYM.month,
    monthTo: toYM.year === fromYM.year ? toYM.month : 12,
  });
  
  let totalNew = 0;
  let totalSkipped = 0;
  let totalFound = 0;
  
  try {
    // Search each month in range
    for (const { year, month } of iterateMonths(dateRange.from, dateRange.to)) {
      const monthName = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });
      process.stdout.write(`Scanning ${monthName} ${year}... `);
      
      const query = buildInvoiceQuery(year, month);
      const emails = await searchGmail(account, query) as unknown as GmailThreadData[];
      
      totalFound += emails.length;
      
      let newCount = 0;
      let skippedCount = 0;
      
      for (const email of emails) {
        // Parse email data
        const sender = extractSender(email);
        const senderDomain = extractSenderDomain(sender);
        
        const emailData: EmailInsertData = {
          id: email.id,
          thread_id: email.threadId ?? null,
          account,
          year,
          month,
          subject: email.subject ?? extractSubject(email),
          sender,
          sender_domain: senderDomain,
          date: email.date ?? extractDate(email),
          snippet: email.snippet ?? null,
          labels: JSON.stringify(email.labelIds ?? []),
          raw_json: JSON.stringify(email),
        };
        
        const inserted = insertEmail(emailData);
        
        if (inserted) {
          newCount++;
          totalNew++;
        } else {
          skippedCount++;
          totalSkipped++;
        }
      }
      
      console.log(`found ${emails.length} (${newCount} new, ${skippedCount} existing)`);
      
      // Update progress
      updateActionProgress(actionId, {
        emailsFound: totalFound,
        emailsNew: totalNew,
        emailsSkipped: totalSkipped,
      });
    }
    
    // Complete the action
    completeAction(actionId, {
      emailsFound: totalFound,
      emailsNew: totalNew,
      emailsSkipped: totalSkipped,
    });
    
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Summary for ${dateRange.display}:`);
    console.log(`  Total emails found: ${totalFound}`);
    console.log(`  New emails added: ${totalNew}`);
    console.log(`  Already in database: ${totalSkipped}`);
    console.log(`\nRun "kraxler extract -a ${account}" to analyze the emails.`);
    
  } catch (error) {
    failAction(actionId, error as Error, {
      emailsFound: totalFound,
      emailsNew: totalNew,
    });
    throw error;
  }
}

/**
 * Extract sender from email object
 */
function extractSender(email: GmailThreadData): string {
  if (email.from) return email.from;
  
  // Try to extract from headers
  if (email.payload?.headers) {
    const fromHeader = email.payload.headers.find(
      (h) => h.name.toLowerCase() === 'from'
    );
    if (fromHeader) return fromHeader.value;
  }
  
  return 'Unknown';
}

/**
 * Extract subject from email object
 */
function extractSubject(email: GmailThreadData): string {
  if (email.subject) return email.subject;
  
  // Try to extract from headers
  if (email.payload?.headers) {
    const subjectHeader = email.payload.headers.find(
      (h) => h.name.toLowerCase() === 'subject'
    );
    if (subjectHeader) return subjectHeader.value;
  }
  
  return 'No Subject';
}

/**
 * Extract date from email object
 */
function extractDate(email: GmailThreadData): string {
  if (email.date) return email.date;
  
  // Try to extract from headers
  if (email.payload?.headers) {
    const dateHeader = email.payload.headers.find(
      (h) => h.name.toLowerCase() === 'date'
    );
    if (dateHeader) return dateHeader.value;
  }
  
  // Try internalDate (milliseconds timestamp)
  if (email.internalDate) {
    return new Date(parseInt(email.internalDate, 10)).toISOString();
  }
  
  return new Date().toISOString();
}
