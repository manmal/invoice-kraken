/**
 * Pre-filter emails to skip obvious non-invoices
 * This saves AI API calls by filtering out emails that are clearly not invoices
 */

import type { Email } from "../types.js";

// Patterns that indicate the email is definitely NOT an invoice
const NOT_INVOICE_PATTERNS: { subject: RegExp[]; sender: RegExp[] } = {
  // Subject patterns
  subject: [
    // Order/shipping confirmations (invoice comes separately)
    /^Bestellt:/i, // Amazon order confirmation
    /^Versendet:/i, // Amazon shipping confirmation
    /^Ihre .* Bestellung .* eingegangen/i, // Order received
    /^Ihre .* Bestellung .* verarbeitet/i, // Order processing
    /^Ihre .* Bestellung .* verschickt/i, // Order shipped
    /^Bestellbestätigung/i, // Order confirmation
    /order (has been |is now |was )?received/i,
    /order (is )?now complete/i,
    /order (has been |is )?shipped/i,
    /order confirmation/i,

    // Shipping/tracking
    /Versandbestätigung/i, // Shipping confirmation
    /Paket versendet/i, // Package shipped
    /ist unterwegs/i, // Is on the way
    /tracking/i,

    // Policy/info updates (not invoices)
    /Policy Update/i,
    /Tax collection update/i,
    /Updates to.*API/i,

    // Refunds (not invoices - money coming back)
    /refund.*on the way/i,
    /Rückerstattung/i,

    // Payment reminders (not the invoice itself)
    /Bezahle sicher und flexibel/i, // Klarna reminder
    /Entscheide selbst, wie du bezahlst/i, // Klarna
    /Zahlung eingegangen/i, // Payment received notification

    // Account/verification emails
    /Bestätigung Ihrer E-Mail/i,
    /verify your email/i,
    /confirm your email/i,

    // More order confirmations (not invoices)
    /Bestelleingangsbestätigung/i, // Order receipt confirmation
    /Bestellbestätigung$/i, // Just "order confirmation" at end
    /haben wir gerade verschickt/i, // We just shipped
    /wurde versendet/i, // Was shipped

    // Forwarded emails (usually duplicates)
    /^Fwd:/i,
    /^FW:/i,

    // Other non-invoice patterns
    /Note added to your.*order/i, // Order note
  ],

  // Sender patterns that are almost never invoices
  sender: [
    /bestellbestaetigung@amazon/i, // Amazon order confirmation
    /versandbestaetigung@amazon/i, // Amazon shipping confirmation
    /noreply@hello\.klarna/i, // Klarna marketing
    /@n\.refurbed\.com/i, // refurbed marketing
    /@brevosend\.com/i, // Marketing platform (unless receipt)
    /googleplay-noreply@google/i, // Google Play policy updates
    /@aufstehn\.at/i, // Newsletter
    /dan@f6s\.com/i, // F6S newsletter
  ],
};

// Patterns that indicate the email IS likely an invoice (override NOT patterns)
const IS_INVOICE_PATTERNS: { subject: RegExp[]; sender: RegExp[] } = {
  subject: [
    /\bRechnung\b/i, // German: Invoice
    /\bInvoice\b/i, // English: Invoice
    /\bReceipt\b/i, // Receipt
    /\bQuittung\b/i, // German: Receipt
    /\bBeleg\b/i, // German: Receipt/voucher
    /invoice.*available/i, // Invoice available
    /your receipt from/i, // Your receipt from X
    /steht zum Abruf bereit/i, // Available for download
    /Invoice \d+/i, // Invoice with number
    /Rechnung.*\d+/i, // Rechnung with number
    /#\d{4,}/, // Reference number like #1234-5678
  ],

  sender: [
    /invoice/i, // Sender contains "invoice"
    /billing/i, // Sender contains "billing"
    /rechnung/i, // Sender contains "rechnung"
    /receipt/i, // Sender contains "receipt"
    /payments.*@google/i, // Google Payments
    /accounting/i, // Accounting department
    /@stripe\.com/i, // Stripe receipts
    /@paypal/i, // PayPal receipts
  ],
};

export interface SkipResult {
  skip: boolean;
  reason: string | null;
}

export interface SkippedEmail {
  email: Email;
  reason: string | null;
}

export interface PrefilterResult {
  toAnalyze: Email[];
  toSkip: SkippedEmail[];
}

export interface PrefilterStats {
  total: number;
  toAnalyze: number;
  toSkip: number;
  skipReasons: Record<string, number>;
}

/**
 * Check if an email should be skipped (definitely not an invoice)
 * Returns: { skip: boolean, reason: string | null }
 */
export function shouldSkipEmail(email: Email): SkipResult {
  const subject = email.subject || "";
  const sender = email.sender || "";

  // First check if it matches invoice patterns (don't skip these)
  for (const pattern of IS_INVOICE_PATTERNS.subject) {
    if (pattern.test(subject)) {
      return { skip: false, reason: null };
    }
  }

  for (const pattern of IS_INVOICE_PATTERNS.sender) {
    if (pattern.test(sender)) {
      return { skip: false, reason: null };
    }
  }

  // Check if it matches NOT invoice patterns
  for (const pattern of NOT_INVOICE_PATTERNS.subject) {
    if (pattern.test(subject)) {
      return {
        skip: true,
        reason: `Subject matches non-invoice pattern: ${pattern}`,
      };
    }
  }

  for (const pattern of NOT_INVOICE_PATTERNS.sender) {
    if (pattern.test(sender)) {
      return {
        skip: true,
        reason: `Sender matches non-invoice pattern: ${pattern}`,
      };
    }
  }

  // Don't skip - needs AI analysis
  return { skip: false, reason: null };
}

/**
 * Filter a batch of emails, separating into needs-analysis and skip
 * Returns: { toAnalyze: Email[], toSkip: { email: Email, reason: string }[] }
 */
export function prefilterEmails(emails: Email[]): PrefilterResult {
  const toAnalyze: Email[] = [];
  const toSkip: SkippedEmail[] = [];

  for (const email of emails) {
    const result = shouldSkipEmail(email);
    if (result.skip) {
      toSkip.push({ email, reason: result.reason });
    } else {
      toAnalyze.push(email);
    }
  }

  return { toAnalyze, toSkip };
}

/**
 * Get stats on what would be filtered
 */
export function getPrefilterStats(emails: Email[]): PrefilterStats {
  const { toAnalyze, toSkip } = prefilterEmails(emails);

  const skipReasons: Record<string, number> = {};
  for (const { reason } of toSkip) {
    const key = reason?.split(":")[0] ?? "unknown";
    skipReasons[key] = (skipReasons[key] || 0) + 1;
  }

  return {
    total: emails.length,
    toAnalyze: toAnalyze.length,
    toSkip: toSkip.length,
    skipReasons,
  };
}
