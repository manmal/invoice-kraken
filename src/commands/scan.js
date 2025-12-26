/**
 * Search command - Search Gmail for invoice-related emails
 */

import { checkAccount, searchGmail, buildInvoiceQuery } from '../lib/gog.js';
import { getDb, insertEmail } from '../lib/db.js';
import { extractSenderDomain } from '../lib/extract.js';
import { 
  startAction, 
  updateActionProgress, 
  completeAction, 
  failAction,
  markInterruptedActions 
} from '../lib/action-log.js';

export async function scanCommand(options) {
  const { account, year, fromMonth = 1, toMonth = 12 } = options;
  const yearNum = parseInt(year, 10);
  
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    console.error(`Error: Invalid year "${year}". Please provide a valid year (e.g., 2024).`);
    process.exit(1);
  }
  
  if (fromMonth < 1 || fromMonth > 12 || toMonth < 1 || toMonth > 12) {
    console.error(`Error: Invalid month range. Months must be between 1 and 12.`);
    process.exit(1);
  }
  
  if (fromMonth > toMonth) {
    console.error(`Error: --from month must be <= --to month.`);
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
  const monthRange = fromMonth === toMonth 
    ? `month ${fromMonth}` 
    : `months ${fromMonth}-${toMonth}`;
  console.log(`\nSearching for invoices in ${yearNum} (${monthRange})...\n`);
  
  // Initialize database and mark any interrupted actions
  getDb();
  const interrupted = markInterruptedActions();
  if (interrupted > 0) {
    console.log(`⚠ Marked ${interrupted} interrupted action(s) from previous run\n`);
  }
  
  // Start action log
  const actionId = startAction({
    action: 'search',
    account,
    year: yearNum,
    monthFrom: fromMonth,
    monthTo: toMonth,
  });
  
  let totalNew = 0;
  let totalSkipped = 0;
  let totalFound = 0;
  
  try {
  // Search each month in range
  for (let month = fromMonth; month <= toMonth; month++) {
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
  console.log(`Summary for ${yearNum}:`);
  console.log(`  Total emails found: ${totalFound}`);
  console.log(`  New emails added: ${totalNew}`);
  console.log(`  Already in database: ${totalSkipped}`);
  console.log(`\nRun "kraxler extract --account ${account}" to analyze the emails.`);
  
  } catch (error) {
    failAction(actionId, error, {
      emailsFound: totalFound,
      emailsNew: totalNew,
    });
    throw error;
  }
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
