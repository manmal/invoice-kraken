/**
 * pi CLI wrapper for AI-powered analysis
 */

import { spawn } from 'child_process';
import fs from 'fs';

/**
 * Run pi with a prompt and return the result
 */
export async function runPi(prompt, options = {}) {
  const { timeout = 120000, cwd = process.cwd() } = options;
  
  return new Promise((resolve, reject) => {
    const tempFile = `/tmp/invoice-kraken-prompt-${Date.now()}.md`;
    fs.writeFileSync(tempFile, prompt);
    
    let output = '';
    let errorOutput = '';
    
    const proc = spawn('pi', ['-p', tempFile, '--no-save'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    const timer = setTimeout(() => {
      proc.kill();
      try { fs.unlinkSync(tempFile); } catch {}
      reject(new Error('pi command timed out'));
    }, timeout);
    
    proc.on('close', (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(tempFile); } catch {}
      
      if (code !== 0) {
        reject(new Error(`pi exited with code ${code}: ${errorOutput}`));
      } else {
        resolve(output.trim());
      }
    });
    
    proc.on('error', (error) => {
      clearTimeout(timer);
      try { fs.unlinkSync(tempFile); } catch {}
      reject(error);
    });
  });
}

/**
 * Analyze emails for invoice classification using pi scout
 */
export async function analyzeEmailsForInvoices(emails) {
  const emailsJson = JSON.stringify(emails.map(e => ({
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    date: e.date,
    snippet: e.snippet,
    hasAttachment: e.raw_json ? JSON.parse(e.raw_json).payload?.parts?.some(p => p.filename) : false,
  })), null, 2);
  
  const prompt = `Analyze these emails and categorize each one for invoice processing.

For each email, determine:
1. Does it contain an invoice? (yes/no/uncertain)
2. Invoice type:
   - text (invoice content is in email body)
   - pdf_attachment (has PDF attachment)
   - link (has link to download invoice)
   - none (not an invoice)
3. Extract if present:
   - Invoice number
   - Amount (with currency, e.g., "149.00 €")
   - Invoice date (YYYY-MM-DD format)
4. Tax deductibility for Austrian freelance software developer:
   
   CONTEXT: The freelancer has a COMPANY CAR (Firmen-KFZ), so car-related expenses ARE deductible.
   
   Categories:
   - full: 100% deductible business expenses:
     * Software, cloud services, dev tools, hosting, domains
     * Professional services (accountant, legal)
     * Hardware for work (computers, monitors, keyboards)
     * Education (tech courses, books, conferences)
     * COMPANY CAR expenses: fuel/petrol (Tankstelle), car service/repair, car wash, parking (business), tolls, car insurance, Vignette, ÖAMTC/ARBÖ
   - partial: Partially deductible with percentage:
     * Telecom/mobile phone (~50% business use)
     * Internet (~60% business use)
     * Home office costs (if applicable)
   - none: Not deductible (personal):
     * Entertainment (Netflix, Spotify, streaming)
     * Groceries, restaurants (unless client entertainment)
     * Personal subscriptions, gym, etc.
   - unclear: Needs manual review:
     * Amazon (could be business or personal)
     * General electronics stores
     * Mixed-use items

Emails to analyze:
${emailsJson}

Return ONLY a valid JSON array (no markdown, no explanation) with this structure:
[{
  "id": "email_id",
  "has_invoice": true/false,
  "invoice_type": "text"|"pdf_attachment"|"link"|"none",
  "invoice_number": "string or null",
  "amount": "string or null (e.g., '149.00 €')",
  "invoice_date": "YYYY-MM-DD or null",
  "deductible": "full"|"partial"|"none"|"unclear",
  "deductible_reason": "brief explanation",
  "deductible_percent": number or null,
  "confidence": "high"|"medium"|"low",
  "notes": "any relevant notes"
}]`;

  try {
    const result = await runPi(prompt, { timeout: 180000 });
    
    // Extract JSON from response (it might have markdown code blocks)
    let jsonStr = result;
    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Try to find JSON array in the output
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error analyzing emails with pi:', error.message);
    // Return empty analysis on error
    return emails.map(e => ({
      id: e.id,
      has_invoice: false,
      invoice_type: 'none',
      confidence: 'low',
      notes: `Analysis failed: ${error.message}`,
    }));
  }
}

/**
 * Use pi to download invoice from a link
 */
export async function downloadInvoiceWithPi(email, outputPath) {
  const prompt = `Download the invoice from this email.

Email details:
- Subject: ${email.subject}
- From: ${email.sender}
- Date: ${email.date}
- Body/Notes: ${email.notes || email.snippet}

Instructions:
1. Use the browser skill to navigate to any invoice download link
2. If login is required, note it and skip (don't try to log in)
3. If invoice PDF is available, download it to: ${outputPath}
4. If there's no downloadable invoice, explain why

Return ONLY valid JSON (no markdown):
{
  "success": true/false,
  "path": "path to downloaded file or null",
  "needs_login": true/false,
  "login_url": "URL if login needed",
  "error": "error message if failed"
}`;

  try {
    const result = await runPi(prompt, { timeout: 300000 }); // 5 min timeout for browser ops
    
    // Extract JSON
    let jsonStr = result;
    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }
    
    return JSON.parse(jsonStr);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
