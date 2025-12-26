/**
 * Path utilities
 */

import * as path from 'path';
import { getInvoicesDir as getInvoicesDirFromPaths, ensureDir as ensureDirFromPaths } from '../lib/paths.js';

/**
 * Get the base invoices directory
 */
export function getInvoicesDir(): string {
  return getInvoicesDirFromPaths();
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): string {
  return ensureDirFromPaths(dirPath);
}

/**
 * Sanitize a string for use in filenames (snake_case)
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    // Replace German umlauts
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Remove non-alphanumeric except spaces and hyphens
    .replace(/[^a-z0-9\s-]/gi, '')
    // Replace spaces and hyphens with underscores for snake_case
    .replace(/[\s-]+/g, '_')
    // Remove multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    .substring(0, 50) || 'unknown';
}

/**
 * Generate invoice output path
 */
export function getInvoiceOutputPath(date: string | null, senderName: string | null, invoiceNumber: string | null): string {
  const invoicesDir = getInvoicesDir();
  
  // Parse date
  let year: number | undefined, month: string | undefined, day: string | undefined;
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
  
  const outputPath = path.join(invoicesDir, String(year), month!, filename);
  
  // Ensure directory exists
  ensureDir(path.dirname(outputPath));
  
  return outputPath;
}
