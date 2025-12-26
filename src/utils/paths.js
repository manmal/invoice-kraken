/**
 * Path utilities
 */

import path from 'path';
import fs from 'fs';

/**
 * Get the base invoices directory
 */
export function getInvoicesDir() {
  return path.join(process.cwd(), 'invoices');
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Sanitize a string for use in filenames
 */
export function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'unknown';
}

/**
 * Generate invoice output path
 */
export function getInvoiceOutputPath(date, senderName, invoiceNumber) {
  const invoicesDir = getInvoicesDir();
  
  // Parse date
  let year, month, day;
  if (date) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = String(d.getMonth() + 1).padStart(2, '0');
      day = String(d.getDate()).padStart(2, '0');
    }
  }
  
  // Fallback to current date
  if (!year) {
    const now = new Date();
    year = now.getFullYear();
    month = String(now.getMonth() + 1).padStart(2, '0');
    day = String(now.getDate()).padStart(2, '0');
  }
  
  // Build filename
  const safeSender = sanitizeFilename(senderName || 'unknown');
  const safeInvoice = invoiceNumber ? `-${sanitizeFilename(invoiceNumber)}` : '';
  const filename = `${day}-${safeSender}${safeInvoice}.pdf`;
  
  const outputPath = path.join(invoicesDir, String(year), month, filename);
  
  // Ensure directory exists
  ensureDir(path.dirname(outputPath));
  
  return outputPath;
}
