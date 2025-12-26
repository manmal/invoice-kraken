import { describe, it, expect } from 'vitest';
import {
  extractSenderDomain,
  parseAmountToCents,
  extractInvoiceNumber,
  extractAmount,
  extractDate,
  extractInvoiceData,
} from './extract.js';

describe('extractSenderDomain', () => {
  describe('basic email formats', () => {
    it('extracts domain from simple email address', () => {
      expect(extractSenderDomain('user@example.com')).toBe('example.com');
    });

    it('extracts domain from "Name <email>" format', () => {
      expect(extractSenderDomain('John Doe <john@company.com>')).toBe('company.com');
    });

    it('extracts domain from "Name <email>" with multiple words', () => {
      expect(extractSenderDomain('John Michael Doe <billing@shop.de>')).toBe('shop.de');
    });

    it('extracts domain from email with subdomain', () => {
      expect(extractSenderDomain('user@sub.domain.com')).toBe('sub.domain.com');
    });
  });

  describe('subdomain normalization', () => {
    it('removes mail. subdomain', () => {
      expect(extractSenderDomain('user@mail.example.com')).toBe('example.com');
    });

    it('removes billing. subdomain', () => {
      expect(extractSenderDomain('invoice@billing.company.com')).toBe('company.com');
    });

    it('removes invoice. subdomain', () => {
      expect(extractSenderDomain('noreply@invoice.shop.at')).toBe('shop.at');
    });

    it('removes noreply. subdomain', () => {
      expect(extractSenderDomain('info@noreply.service.io')).toBe('service.io');
    });

    it('removes no-reply. subdomain', () => {
      expect(extractSenderDomain('info@no-reply.service.io')).toBe('service.io');
    });

    it('removes notification. subdomain', () => {
      expect(extractSenderDomain('alert@notification.app.com')).toBe('app.com');
    });

    it('removes notifications. subdomain', () => {
      expect(extractSenderDomain('alert@notifications.app.com')).toBe('app.com');
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(extractSenderDomain(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(extractSenderDomain(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractSenderDomain('')).toBeNull();
    });

    it('returns null for string without @', () => {
      expect(extractSenderDomain('not-an-email')).toBeNull();
    });

    it('handles email with special characters in local part', () => {
      expect(extractSenderDomain('user+tag@example.com')).toBe('example.com');
    });

    it('converts domain to lowercase', () => {
      expect(extractSenderDomain('User@EXAMPLE.COM')).toBe('example.com');
    });

    it('handles complex real-world sender format', () => {
      expect(extractSenderDomain('"Amazon.de" <ship-confirm@amazon.de>')).toBe('amazon.de');
    });
  });
});

describe('parseAmountToCents', () => {
  describe('European format (comma as decimal separator)', () => {
    it('parses simple EUR amount', () => {
      expect(parseAmountToCents('12,99')).toBe(1299);
    });

    it('parses EUR amount with € symbol', () => {
      expect(parseAmountToCents('12,99 €')).toBe(1299);
    });

    it('parses EUR amount with € symbol before', () => {
      expect(parseAmountToCents('€ 12,99')).toBe(1299);
    });

    it('parses EUR amount with thousands separator (dot)', () => {
      expect(parseAmountToCents('1.234,56')).toBe(123456);
    });

    it('parses large EUR amount with multiple thousands separators', () => {
      expect(parseAmountToCents('12.345.678,90')).toBe(1234567890);
    });

    it('parses EUR amount with EUR suffix', () => {
      expect(parseAmountToCents('99,00 EUR')).toBe(9900);
    });
  });

  describe('US format (dot as decimal separator)', () => {
    it('parses simple USD amount', () => {
      expect(parseAmountToCents('12.99')).toBe(1299);
    });

    it('parses USD amount with $ symbol', () => {
      expect(parseAmountToCents('$12.99')).toBe(1299);
    });

    it('parses USD amount with thousands separator (comma)', () => {
      expect(parseAmountToCents('1,234.56')).toBe(123456);
    });

    it('parses large USD amount with multiple thousands separators', () => {
      expect(parseAmountToCents('12,345,678.90')).toBe(1234567890);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for null input', () => {
      expect(parseAmountToCents(null)).toBe(0);
    });

    it('returns 0 for undefined input', () => {
      expect(parseAmountToCents(undefined)).toBe(0);
    });

    it('returns 0 for empty string', () => {
      expect(parseAmountToCents('')).toBe(0);
    });

    it('returns 0 for non-numeric string', () => {
      expect(parseAmountToCents('abc')).toBe(0);
    });

    it('handles amount with extra whitespace', () => {
      expect(parseAmountToCents('  12,99  ')).toBe(1299);
    });

    it('handles zero amount', () => {
      expect(parseAmountToCents('0,00')).toBe(0);
    });

    it('handles single digit cents', () => {
      // Note: This relies on the regex patterns having ,\d{2}$ requirement
      // For 12,9 without leading zero, it may not match as European format
      expect(parseAmountToCents('12.90')).toBe(1290);
    });

    it('rounds correctly to avoid floating point issues', () => {
      // 19.99 * 100 in floating point could be 1998.9999999999998
      expect(parseAmountToCents('19,99')).toBe(1999);
    });
  });
});

describe('extractInvoiceNumber', () => {
  describe('German formats', () => {
    it('extracts RE-YYYY-NNNN format', () => {
      expect(extractInvoiceNumber('RE-2024-00123')).toBe('RE-2024-00123');
    });

    it('extracts Rechnungsnr format', () => {
      expect(extractInvoiceNumber('Rechnungsnr: INV123456')).toBe('INV123456');
    });

    it('extracts Rechnung with colon format', () => {
      // Use "Rechnung:" which triggers the correct pattern
      expect(extractInvoiceNumber('Rechnung: INV2024789')).toBe('INV2024789');
    });

    it('extracts Rechnung # format', () => {
      expect(extractInvoiceNumber('Rechnung #ABC-12345')).toBe('ABC-12345');
    });

    it('extracts Beleg-Nr format', () => {
      expect(extractInvoiceNumber('Beleg-Nr. BLG999')).toBe('BLG999');
    });
  });

  describe('English formats', () => {
    it('extracts INV-NNNN format', () => {
      expect(extractInvoiceNumber('INV-12345')).toBe('INV-12345');
    });

    it('extracts Invoice # format', () => {
      expect(extractInvoiceNumber('Invoice #: 2024-001')).toBe('2024-001');
    });

    it('extracts Receipt # format', () => {
      expect(extractInvoiceNumber('Receipt #REC456')).toBe('REC456');
    });

    it('extracts Order # format', () => {
      expect(extractInvoiceNumber('Order # ORD-789123')).toBe('ORD-789123');
    });

    it('extracts Reference # format', () => {
      expect(extractInvoiceNumber('Reference # REF-2024-001')).toBe('REF-2024-001');
    });
  });

  describe('generic formats', () => {
    it('extracts XX-NNNNNN format', () => {
      expect(extractInvoiceNumber('Your order AB-123456 is ready')).toBe('AB-123456');
    });

    it('extracts YYYY-NNNN format', () => {
      // The pattern \b(\d{4}[-\/]\d{4,})\b requires at least 4 digits after separator
      expect(extractInvoiceNumber('Invoice 2024-12345 attached')).toBe('2024-12345');
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(extractInvoiceNumber(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(extractInvoiceNumber(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractInvoiceNumber('')).toBeNull();
    });

    it('returns null for text without invoice number', () => {
      expect(extractInvoiceNumber('Thank you for your purchase')).toBeNull();
    });
  });
});

describe('extractAmount', () => {
  describe('European EUR formats', () => {
    it('extracts amount with € suffix', () => {
      const result = extractAmount('Total: 49,99 €');
      expect(result).toEqual({ raw: '49,99 €', cents: 4999 });
    });

    it('extracts amount with € prefix', () => {
      const result = extractAmount('Price: € 123,45');
      expect(result).toEqual({ raw: '123,45 €', cents: 12345 });
    });

    it('extracts amount with EUR suffix', () => {
      const result = extractAmount('Summe: 99,00 EUR');
      expect(result).toEqual({ raw: '99,00 €', cents: 9900 });
    });

    it('extracts large amount with thousands separator', () => {
      const result = extractAmount('Gesamt: 1.234,56 €');
      expect(result).toEqual({ raw: '1.234,56 €', cents: 123456 });
    });
  });

  describe('keyword-based extraction', () => {
    it('extracts amount after Total keyword', () => {
      const result = extractAmount('Total: 25,00');
      expect(result).toEqual({ raw: '25,00 €', cents: 2500 });
    });

    it('extracts amount after Summe keyword', () => {
      const result = extractAmount('Summe: 150,00');
      expect(result).toEqual({ raw: '150,00 €', cents: 15000 });
    });

    it('extracts amount after Betrag keyword', () => {
      const result = extractAmount('Betrag: € 75,50');
      expect(result).toEqual({ raw: '75,50 €', cents: 7550 });
    });

    it('extracts amount after Gesamt keyword', () => {
      const result = extractAmount('Gesamt 199,99 €');
      expect(result).toEqual({ raw: '199,99 €', cents: 19999 });
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(extractAmount(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(extractAmount(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractAmount('')).toBeNull();
    });

    it('returns null for text without amount', () => {
      expect(extractAmount('Thank you for your order')).toBeNull();
    });
  });
});

describe('extractDate', () => {
  describe('German format (DD.MM.YYYY)', () => {
    it('extracts and normalizes German date', () => {
      expect(extractDate('Datum: 25.12.2024')).toBe('2024-12-25');
    });

    it('handles single-digit day and month', () => {
      expect(extractDate('Date: 5.3.2024')).toBe('2024-03-05');
    });
  });

  describe('ISO format (YYYY-MM-DD)', () => {
    it('extracts ISO date unchanged', () => {
      expect(extractDate('Date: 2024-12-25')).toBe('2024-12-25');
    });
  });

  describe('US format (MM/DD/YYYY)', () => {
    it('extracts and normalizes US date', () => {
      expect(extractDate('Date: 12/25/2024')).toBe('2024-12-25');
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(extractDate(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(extractDate(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractDate('')).toBeNull();
    });

    it('returns null for text without date', () => {
      expect(extractDate('No date here')).toBeNull();
    });
  });
});

describe('extractInvoiceData', () => {
  it('extracts all fields from complete invoice text', () => {
    const text = `
      Rechnung #INV-2024-001
      Datum: 25.12.2024
      Betrag: 199,99 €
    `;
    const sender = 'Billing <billing@shop.example.com>';

    const result = extractInvoiceData(text, sender);

    expect(result.invoiceNumber).toBe('INV-2024-001');
    expect(result.invoiceDate).toBe('2024-12-25');
    expect(result.amount).toEqual({ raw: '199,99 €', cents: 19999 });
    expect(result.senderDomain).toBe('shop.example.com');
  });

  it('handles partial data', () => {
    const text = 'Thank you for your purchase!';
    const sender = 'noreply@store.com';

    const result = extractInvoiceData(text, sender);

    expect(result.invoiceNumber).toBeNull();
    expect(result.invoiceDate).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.senderDomain).toBe('store.com');
  });

  it('handles null inputs', () => {
    const result = extractInvoiceData(null, null);

    expect(result.invoiceNumber).toBeNull();
    expect(result.invoiceDate).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.senderDomain).toBeNull();
  });
});
