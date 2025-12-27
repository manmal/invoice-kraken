/**
 * PDF generation utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Metadata for PDF generation from email content
 */
interface PdfMetadata {
  sender?: string;
  subject?: string;
  date?: string;
  invoiceNumber?: string;
  amount?: string;
}

/**
 * Generate a simple text-based PDF from HTML content
 * Uses the system's html-to-pdf capabilities or falls back to text file
 */
export async function generatePdfFromHtml(html: string, outputPath: string): Promise<boolean> {
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  
  // Try using wkhtmltopdf if available
  try {
    const tempHtmlPath = `/tmp/kraxler-${Date.now()}.html`;
    fs.writeFileSync(tempHtmlPath, html);
    
    execSync(`wkhtmltopdf --quiet "${tempHtmlPath}" "${outputPath}"`, {
      stdio: 'pipe'
    });
    
    fs.unlinkSync(tempHtmlPath);
    return true;
  } catch {
    // wkhtmltopdf not available, try alternatives
  }
  
  // Try using Chrome/Chromium headless
  try {
    const tempHtmlPath = `/tmp/kraxler-${Date.now()}.html`;
    fs.writeFileSync(tempHtmlPath, html);
    
    // Try different Chrome paths
    const chromePaths: string[] = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      'google-chrome',
      'chromium',
    ];
    
    for (const chromePath of chromePaths) {
      try {
        execSync(
          `"${chromePath}" --headless --disable-gpu --print-to-pdf="${outputPath}" "file://${tempHtmlPath}"`,
          { stdio: 'pipe' }
        );
        fs.unlinkSync(tempHtmlPath);
        return true;
      } catch {
        // This Chrome path not available, try next
      }
    }
    
    fs.unlinkSync(tempHtmlPath);
  } catch {
    // Chrome not available
  }
  
  // Fall back to saving as HTML with .pdf extension (not ideal but works)
  console.warn(`Warning: No PDF generator available. Saving as HTML: ${outputPath}`);
  fs.writeFileSync(outputPath.replace('.pdf', '.html'), html);
  return false;
}

/**
 * Generate PDF from email HTML content
 * Cleans up CSS that might cause rendering issues (external fonts, etc.)
 */
export async function generatePdfFromEmailHtml(html: string, metadata: PdfMetadata, outputPath: string): Promise<boolean> {
  // Clean the HTML for offline rendering
  let cleanedHtml = html
    // Remove @font-face rules that reference external URLs
    .replace(/@font-face\s*\{[^}]*url\s*\([^)]+\)[^}]*\}/gi, '')
    // Remove other @font-face rules (they won't work offline anyway)
    .replace(/@font-face\s*\{[^}]*\}/gi, '')
    // Replace custom font families with system fonts
    .replace(/font-family:\s*[^;]*SupremeLLTest[^;]*/gi, 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
    .replace(/font-family:\s*[^;]*PayPalSans[^;]*/gi, 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
    // Remove mso-* CSS properties (Outlook-specific)
    .replace(/mso-[^:]+:[^;]+;?/gi, '');
  
  // Add a wrapper with metadata header if not already a complete HTML document
  if (!cleanedHtml.includes('<!DOCTYPE') && !cleanedHtml.includes('<html')) {
    cleanedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
${cleanedHtml}
</body>
</html>`;
  }
  
  // Inject a header with email metadata before the body content
  const headerHtml = `
<div style="border-bottom: 2px solid #333; padding: 15px; margin-bottom: 20px; background: #f5f5f5;">
  <div style="font-size: 12px; color: #666;">
    <strong>From:</strong> ${escapeHtml(metadata.sender || 'Unknown')}<br>
    <strong>Subject:</strong> ${escapeHtml(metadata.subject || 'Invoice')}<br>
    <strong>Date:</strong> ${escapeHtml(metadata.date || 'Unknown')}
    ${metadata.invoiceNumber ? `<br><strong>Invoice #:</strong> ${escapeHtml(metadata.invoiceNumber)}` : ''}
    ${metadata.amount ? `<br><strong>Amount:</strong> ${escapeHtml(metadata.amount)}` : ''}
  </div>
</div>
`;
  
  // Insert header after <body> tag
  cleanedHtml = cleanedHtml.replace(/(<body[^>]*>)/i, `$1\n${headerHtml}`);
  
  return generatePdfFromHtml(cleanedHtml, outputPath);
}

/**
 * Generate PDF from plain text email content
 */
export async function generatePdfFromText(text: string, metadata: PdfMetadata, outputPath: string): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .meta {
      color: #666;
      font-size: 14px;
    }
    .meta p {
      margin: 5px 0;
    }
    .content {
      white-space: pre-wrap;
      font-family: inherit;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(metadata.subject || 'Invoice')}</h1>
    <div class="meta">
      <p><strong>From:</strong> ${escapeHtml(metadata.sender || 'Unknown')}</p>
      <p><strong>Date:</strong> ${escapeHtml(metadata.date || 'Unknown')}</p>
      ${metadata.invoiceNumber ? `<p><strong>Invoice #:</strong> ${escapeHtml(metadata.invoiceNumber)}</p>` : ''}
      ${metadata.amount ? `<p><strong>Amount:</strong> ${escapeHtml(metadata.amount)}</p>` : ''}
    </div>
  </div>
  <div class="content">${escapeHtml(text)}</div>
  <div class="footer">
    Generated by Kraxler on ${new Date().toISOString()}
  </div>
</body>
</html>
  `.trim();
  
  return generatePdfFromHtml(html, outputPath);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get the invoice output path
 */
export function getInvoicePath(baseDir: string, date: Date | string, name: string): string {
  // Parse date
  let year: number | string, month: string, day: string;
  
  if (date instanceof Date) {
    year = date.getFullYear();
    month = String(date.getMonth() + 1).padStart(2, '0');
    day = String(date.getDate()).padStart(2, '0');
  } else if (typeof date === 'string') {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      year = parsed.getFullYear();
      month = String(parsed.getMonth() + 1).padStart(2, '0');
      day = String(parsed.getDate()).padStart(2, '0');
    } else {
      // Try parsing YYYY-MM-DD format
      const match = date.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        [, year, month, day] = match as [string, string, string, string];
      } else {
        year = new Date().getFullYear();
        month = '01';
        day = '01';
      }
    }
  } else {
    year = new Date().getFullYear();
    month = '01';
    day = '01';
  }
  
  // Sanitize filename
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  
  const filename = `${day}-${safeName}.pdf`;
  
  return path.join(baseDir, String(year), month, filename);
}
