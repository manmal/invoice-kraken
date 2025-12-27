/**
 * Invoice data extraction utilities
 */

// Invoice number patterns
const INVOICE_PATTERNS: RegExp[] = [
  // German formats
  /RE[-\s]?\d{4}[-\s]?\d+/i,
  /Rechnungsnr\.?\s*:?\s*([A-Z0-9][\w-]+)/i,
  /Rechnung\s*#?\s*:?\s*([A-Z0-9][\w-]+)/i,
  /Beleg[-\s]?Nr\.?\s*:?\s*([A-Z0-9][\w-]+)/i,
  /Rechnungsnummer\s*:?\s*([A-Z0-9][\w-]+)/i,
  
  // English formats
  /INV[-\s]?\d+/i,
  /Invoice\s*#?\s*:?\s*([A-Z0-9][\w-]+)/i,
  /Receipt\s*#?\s*:?\s*([A-Z0-9][\w-]+)/i,
  /Order\s*#?\s*:?\s*([A-Z0-9][\w-]+)/i,
  /Reference\s*#?\s*:?\s*([A-Z0-9][\w-]+)/i,
  
  // Generic patterns
  /\b([A-Z]{2,4}[-\s]?\d{6,})\b/,
  /\b(\d{4}[-/]\d{4,})\b/,
];

// Amount patterns
const AMOUNT_PATTERNS: RegExp[] = [
  // European format with €
  /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/,
  /€\s*(\d{1,3}(?:\.\d{3})*,\d{2})/,
  /(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/i,
  /EUR\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
  
  // European format without thousands separator
  /(\d+,\d{2})\s*€/,
  /€\s*(\d+,\d{2})/,
  
  // US format
  /\$\s*(\d{1,3}(?:,\d{3})*\.\d{2})/,
  /(\d{1,3}(?:,\d{3})*\.\d{2})\s*USD/i,
  
  // Generic with keywords
  /(?:Total|Summe|Betrag|Amount|Gesamt)[:\s]*€?\s*(\d+[.,]\d{2})/i,
  /(?:Total|Summe|Betrag|Amount|Gesamt)[:\s]*(\d+[.,]\d{2})\s*€/i,
];

// Date patterns
const DATE_PATTERNS: RegExp[] = [
  // German format: DD.MM.YYYY
  /(\d{1,2}\.\d{1,2}\.\d{4})/,
  // ISO format: YYYY-MM-DD
  /(\d{4}-\d{2}-\d{2})/,
  // US format: MM/DD/YYYY
  /(\d{1,2}\/\d{1,2}\/\d{4})/,
];

/**
 * Extracted amount with raw string and cents value
 */
export interface ExtractedAmount {
  raw: string;
  cents: number;
}

/**
 * Extracted invoice data
 */
export interface ExtractedInvoiceData {
  invoiceNumber: string | null;
  amount: ExtractedAmount | null;
  invoiceDate: string | null;
  senderDomain: string | null;
}

/**
 * Extract invoice number from text
 */
export function extractInvoiceNumber(text: string | null | undefined): string | null {
  if (!text) return null;
  
  for (const pattern of INVOICE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return null;
}

/**
 * Extract amount from text
 * Returns { raw: string, cents: number } or null
 */
export function extractAmount(text: string | null | undefined): ExtractedAmount | null {
  if (!text) return null;
  
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1] || match[0];
      const cents = parseAmountToCents(raw);
      return { raw: raw + ' €', cents };
    }
  }
  return null;
}

/**
 * Parse amount string to cents
 */
export function parseAmountToCents(amountStr: string | null | undefined): number {
  if (!amountStr) return 0;
  
  // Remove currency symbols and whitespace
  let cleaned = amountStr.replace(/[€$\s]/g, '').trim();
  
  // Detect European vs US format
  const hasCommaDecimal = /,\d{2}$/.test(cleaned);
  const hasDotDecimal = /\.\d{2}$/.test(cleaned);
  
  if (hasCommaDecimal) {
    // European: 1.234,56 -> 123456
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDotDecimal) {
    // US: 1,234.56 -> 1234.56
    cleaned = cleaned.replace(/,/g, '');
  }
  
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : Math.round(value * 100);
}

/**
 * Extract date from text
 */
export function extractDate(text: string | null | undefined): string | null {
  if (!text) return null;
  
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return normalizeDate(match[1]);
    }
  }
  return null;
}

/**
 * Normalize date to ISO format YYYY-MM-DD
 */
function normalizeDate(dateStr: string): string {
  // German format DD.MM.YYYY
  const germanMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Already ISO format
  if (/\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr;
  }
  
  // US format MM/DD/YYYY
  const usMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateStr;
}

/**
 * Extract sender domain from email address
 */
export function extractSenderDomain(sender: string | null | undefined): string | null {
  if (!sender) return null;
  
  // Extract email from "Name <email@domain.com>" format
  const emailMatch = sender.match(/<([^>]+)>/) || sender.match(/([^\s]+@[^\s]+)/);
  const email = emailMatch ? emailMatch[1] : sender;
  
  // Extract domain
  const domainMatch = email.match(/@([^@]+)$/);
  if (!domainMatch) return null;
  
  let domain = domainMatch[1].toLowerCase();
  
  // Normalize common subdomains
  domain = domain.replace(/^(mail|billing|invoice|noreply|no-reply|notifications?)\./i, '');
  
  return domain;
}

/**
 * Extract all invoice data from text
 */
export function extractInvoiceData(text: string | null | undefined, sender: string | null | undefined): ExtractedInvoiceData {
  return {
    invoiceNumber: extractInvoiceNumber(text),
    amount: extractAmount(text),
    invoiceDate: extractDate(text),
    senderDomain: extractSenderDomain(sender),
  };
}
