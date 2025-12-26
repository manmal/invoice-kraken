/**
 * Search command - Search Gmail for invoice-related emails
 */

import { checkAccount, searchGmail, buildInvoiceQuery } from '../lib/gog.js';
import { getDb, insertEmail } from '../lib/db.js';
import { extractSenderDomain } from '../lib/extract.js';

export async function searchCommand(options) {
  const { account, year } = options;
  const yearNum = parseInt(year, 10);
  
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    console.error(`Error: Invalid year "${year}". Please provide a valid year (e.g., 2024).`);
    process.exit(1);
  }
  
  // Check if account exists
  console.log(`Checking account: ${account}...`);
  const accountExists = await checkAccount(account);
  
  if (!accountExists) {
    console.error(`Error: Account "${account}" is not configured in gog.`);
    console.error('Run "gog auth list" to see configured accounts.');
    console.error(`Run "gog auth add ${account}" to add this account.`);
    process.exit(1);
  }
  
  console.log(`✓ Account verified: ${account}`);
  console.log(`\nSearching for invoices in ${yearNum}...\n`);
  
  // Initialize database
  getDb();
  
  let totalNew = 0;
  let totalSkipped = 0;
  let totalFound = 0;
  
  // Search each month
  for (let month = 1; month <= 12; month++) {
    const monthName = new Date(yearNum, month - 1, 1).toLocaleString('en', { month: 'long' });
    process.stdout.write(`Searching ${monthName} ${yearNum}... `);
    
    const query = buildInvoiceQuery(yearNum, month);
    const emails = await searchGmail(account, query);
    
    totalFound += emails.length;
    
    let newCount = 0;
    let skippedCount = 0;
    
    for (const email of emails) {
      // Parse email data
      const sender = extractSender(email);
      const senderDomain = extractSenderDomain(sender);
      
      const emailData = {
        id: email.id,
        thread_id: email.threadId,
        account,
        year: yearNum,
        month,
        subject: email.subject || extractSubject(email),
        sender,
        sender_domain: senderDomain,
        date: email.date || extractDate(email),
        snippet: email.snippet,
        labels: JSON.stringify(email.labelIds || []),
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
  }
  
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Summary for ${yearNum}:`);
  console.log(`  Total emails found: ${totalFound}`);
  console.log(`  New emails added: ${totalNew}`);
  console.log(`  Already in database: ${totalSkipped}`);
  console.log(`\nRun "npm run investigate -- --account ${account}" to analyze the emails.`);
}

/**
 * Extract sender from email object
 */
function extractSender(email) {
  if (email.from) return email.from;
  
  // Try to extract from headers
  if (email.payload?.headers) {
    const fromHeader = email.payload.headers.find(
      h => h.name.toLowerCase() === 'from'
    );
    if (fromHeader) return fromHeader.value;
  }
  
  return 'Unknown';
}

/**
 * Extract subject from email object
 */
function extractSubject(email) {
  if (email.subject) return email.subject;
  
  // Try to extract from headers
  if (email.payload?.headers) {
    const subjectHeader = email.payload.headers.find(
      h => h.name.toLowerCase() === 'subject'
    );
    if (subjectHeader) return subjectHeader.value;
  }
  
  return 'No Subject';
}

/**
 * Extract date from email object
 */
function extractDate(email) {
  if (email.date) return email.date;
  
  // Try to extract from headers
  if (email.payload?.headers) {
    const dateHeader = email.payload.headers.find(
      h => h.name.toLowerCase() === 'date'
    );
    if (dateHeader) return dateHeader.value;
  }
  
  // Try internalDate (milliseconds timestamp)
  if (email.internalDate) {
    return new Date(parseInt(email.internalDate, 10)).toISOString();
  }
  
  return new Date().toISOString();
}
