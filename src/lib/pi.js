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
   - Vendor/product name for filename (e.g., "1password_family", "anthropic_api", "hetzner_cloud", "apple_icloud", "spusu_mobile")
4. Tax deductibility for Austrian Einzelunternehmer (sole proprietor) freelance software developer:
   
   IMPORTANT AUSTRIAN TAX RULES:
   - Income Tax (EST) and VAT (Vorsteuer) deductibility are SEPARATE
   - The freelancer has a COMPANY CAR (Firmen-KFZ)
   - PKW/Kombi in Austria: NO Vorsteuerabzug (VAT recovery) regardless of business use!
   - Business meals: 50% income tax, but 100% VAT recovery
   
   Categories:
   - full: 100% income tax + 100% VAT recovery:
     * Software, cloud services, dev tools, hosting, domains
     * Professional services (accountant, legal)
     * Hardware for work (computers, monitors, keyboards)
     * Education (tech courses, books, conferences)
   
   - vehicle: 100% income tax BUT NO VAT recovery (Austrian PKW rule!):
     * Fuel/petrol (Tankstelle: OMV, BP, Shell, etc.)
     * Car service/repair, car wash
     * Tolls (ASFINAG), Vignette
     * ÖAMTC, ARBÖ membership
     * Parking (business)
     * Car insurance
   
   - meals: 50% income tax, 100% VAT recovery:
     * Business meals with clients
     * Restaurant expenses for business purposes
   
   - telecom: Partial (typically 50%) for both EST and VAT:
     * Mobile phone (A1, Magenta, Drei, spusu, etc.)
     * Internet (~50-60% business use)
   
   - none: Not deductible (personal):
     * Entertainment (Netflix, Spotify, streaming)
     * Groceries
     * Personal restaurants (not business meals)
     * Cosmetics, personal care
     * Health supplements
     * Candy/sweets shops
   
   - unclear: Needs manual review:
     * Amazon (could be business or personal)
     * General electronics stores (MediaMarkt, Saturn)
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
  "vendor_product": "snake_case name for filename (e.g., 'anthropic_api', 'hetzner_cloud')",
  "deductible": "full"|"vehicle"|"meals"|"telecom"|"none"|"unclear",
  "deductible_reason": "brief explanation",
  "income_tax_percent": number or null (100 for full/vehicle, 50 for meals/telecom, 0 for none),
  "vat_recoverable": true/false/null (false for vehicle!, true for meals despite 50% EST),
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
