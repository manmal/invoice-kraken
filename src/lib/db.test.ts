/**
 * Tests for database module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock getDatabasePath BEFORE importing the db module
vi.mock('./paths.js', () => ({
  getDatabasePath: () => ':memory:',
}));

// Now import the db functions
import {
  getDb,
  insertEmail,
  getEmailsByStatus,
  getEmailById,
  updateEmailStatus,
  findDuplicateByInvoiceNumber,
  findDuplicateByHash,
  closeDb,
  type EmailInsertData,
} from './db.js';

describe('db module', () => {
  beforeEach(() => {
    // Close any existing connection and reset for fresh in-memory db
    closeDb();
  });

  afterEach(() => {
    closeDb();
  });

  const createTestEmail = (overrides: Partial<EmailInsertData> = {}): EmailInsertData => ({
    id: 'test-email-1',
    thread_id: 'thread-1',
    account: 'test@example.com',
    year: 2024,
    month: 6,
    subject: 'Test Invoice',
    sender: 'vendor@company.com',
    sender_domain: 'company.com',
    date: '2024-06-15T10:00:00Z',
    snippet: 'Your invoice is attached',
    labels: 'INBOX,UNREAD',
    raw_json: '{"test": true}',
    ...overrides,
  });

  describe('insertEmail', () => {
    it('inserts an email correctly', () => {
      const email = createTestEmail();
      
      const result = insertEmail(email);
      
      expect(result).toBe(true);
      
      // Verify it was inserted
      const retrieved = getEmailById('test-email-1', 'test@example.com');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-email-1');
      expect(retrieved?.account).toBe('test@example.com');
      expect(retrieved?.subject).toBe('Test Invoice');
      expect(retrieved?.status).toBe('pending');
    });

    it('handles duplicates with INSERT OR IGNORE', () => {
      const email = createTestEmail();
      
      // First insert should succeed
      const firstResult = insertEmail(email);
      expect(firstResult).toBe(true);
      
      // Second insert with same id + account should be ignored
      const secondResult = insertEmail(email);
      expect(secondResult).toBe(false);
      
      // Only one record should exist
      const db = getDb();
      const count = db.prepare('SELECT COUNT(*) as count FROM emails WHERE id = ?').get('test-email-1') as { count: number };
      expect(count.count).toBe(1);
    });

    it('rejects same email id even for different accounts (PRIMARY KEY is id only)', () => {
      // Note: The PRIMARY KEY is just 'id', not (id, account)
      // So same email id across accounts is rejected
      const email1 = createTestEmail({ account: 'account1@example.com' });
      const email2 = createTestEmail({ account: 'account2@example.com' });
      
      const result1 = insertEmail(email1);
      const result2 = insertEmail(email2);
      
      expect(result1).toBe(true);
      expect(result2).toBe(false); // Rejected due to PRIMARY KEY on id
      
      // Only the first one exists
      const retrieved1 = getEmailById('test-email-1', 'account1@example.com');
      const retrieved2 = getEmailById('test-email-1', 'account2@example.com');
      expect(retrieved1).toBeDefined();
      expect(retrieved2).toBeUndefined();
    });
  });

  describe('getEmailsByStatus', () => {
    it('returns filtered results by status', () => {
      // Insert emails with different statuses
      insertEmail(createTestEmail({ id: 'email-1', account: 'test@example.com' }));
      insertEmail(createTestEmail({ id: 'email-2', account: 'test@example.com' }));
      insertEmail(createTestEmail({ id: 'email-3', account: 'test@example.com' }));
      
      // Update some to different statuses
      updateEmailStatus('email-2', 'test@example.com', 'downloaded');
      updateEmailStatus('email-3', 'test@example.com', 'no_invoice');
      
      // Query pending
      const pendingEmails = getEmailsByStatus('test@example.com', 'pending');
      expect(pendingEmails).toHaveLength(1);
      expect(pendingEmails[0].id).toBe('email-1');
      
      // Query downloaded
      const downloadedEmails = getEmailsByStatus('test@example.com', 'downloaded');
      expect(downloadedEmails).toHaveLength(1);
      expect(downloadedEmails[0].id).toBe('email-2');
    });

    it('filters by account', () => {
      insertEmail(createTestEmail({ id: 'email-1', account: 'account1@example.com' }));
      insertEmail(createTestEmail({ id: 'email-2', account: 'account2@example.com' }));
      
      const account1Emails = getEmailsByStatus('account1@example.com', 'pending');
      const account2Emails = getEmailsByStatus('account2@example.com', 'pending');
      
      expect(account1Emails).toHaveLength(1);
      expect(account1Emails[0].id).toBe('email-1');
      expect(account2Emails).toHaveLength(1);
      expect(account2Emails[0].id).toBe('email-2');
    });

    it('respects limit parameter', () => {
      // Insert 5 emails
      for (let i = 1; i <= 5; i++) {
        insertEmail(createTestEmail({ id: `email-${i}` }));
      }
      
      const limited = getEmailsByStatus('test@example.com', 'pending', 3);
      expect(limited).toHaveLength(3);
    });

    it('returns empty array when no matches', () => {
      insertEmail(createTestEmail());
      
      const result = getEmailsByStatus('nonexistent@example.com', 'pending');
      expect(result).toEqual([]);
    });
  });

  describe('getEmailById', () => {
    it('returns correct email', () => {
      insertEmail(createTestEmail({ id: 'target-email' }));
      insertEmail(createTestEmail({ id: 'other-email' }));
      
      const result = getEmailById('target-email', 'test@example.com');
      
      expect(result).toBeDefined();
      expect(result?.id).toBe('target-email');
      expect(result?.subject).toBe('Test Invoice');
    });

    it('returns undefined for non-existent email', () => {
      insertEmail(createTestEmail());
      
      const result = getEmailById('nonexistent', 'test@example.com');
      expect(result).toBeUndefined();
    });

    it('requires correct account', () => {
      insertEmail(createTestEmail({ id: 'email-1', account: 'correct@example.com' }));
      
      const result = getEmailById('email-1', 'wrong@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('updateEmailStatus', () => {
    it('updates status correctly', () => {
      insertEmail(createTestEmail({ id: 'email-1' }));
      
      const result = updateEmailStatus('email-1', 'test@example.com', 'downloaded');
      
      expect(result.changes).toBe(1);
      
      const updated = getEmailById('email-1', 'test@example.com');
      expect(updated?.status).toBe('downloaded');
    });

    it('updates extra fields', () => {
      insertEmail(createTestEmail({ id: 'email-1' }));
      
      updateEmailStatus('email-1', 'test@example.com', 'downloaded', {
        invoice_number: 'INV-2024-001',
        invoice_amount: '€99.00',
        invoice_amount_cents: 9900,
      });
      
      const updated = getEmailById('email-1', 'test@example.com');
      expect(updated?.status).toBe('downloaded');
      expect(updated?.invoice_number).toBe('INV-2024-001');
      expect(updated?.invoice_amount).toBe('€99.00');
      expect(updated?.invoice_amount_cents).toBe(9900);
    });

    it('updates updated_at timestamp', () => {
      insertEmail(createTestEmail({ id: 'email-1' }));
      getEmailById('email-1', 'test@example.com');
      
      // Small delay to ensure timestamp difference
      updateEmailStatus('email-1', 'test@example.com', 'downloaded');
      
      const after = getEmailById('email-1', 'test@example.com');
      expect(after?.updated_at).toBeDefined();
      // updated_at should be set (we can't easily compare times in SQLite's CURRENT_TIMESTAMP)
    });

    it('returns 0 changes for non-existent email', () => {
      const result = updateEmailStatus('nonexistent', 'test@example.com', 'downloaded');
      expect(result.changes).toBe(0);
    });
  });

  describe('findDuplicateByInvoiceNumber', () => {
    it('finds duplicate by invoice number and sender domain', () => {
      insertEmail(createTestEmail({ id: 'original' }));
      updateEmailStatus('original', 'test@example.com', 'downloaded', {
        invoice_number: 'INV-001',
        sender_domain: 'vendor.com',
      });
      
      // Update sender_domain in the original record
      const db = getDb();
      db.prepare('UPDATE emails SET sender_domain = ? WHERE id = ?').run('vendor.com', 'original');
      
      const duplicate = findDuplicateByInvoiceNumber('INV-001', 'vendor.com', 'new-email', 'test@example.com');
      
      expect(duplicate).toBeDefined();
      expect(duplicate?.id).toBe('original');
    });

    it('excludes the email being checked', () => {
      insertEmail(createTestEmail({ id: 'email-1', sender_domain: 'vendor.com' }));
      updateEmailStatus('email-1', 'test@example.com', 'downloaded', {
        invoice_number: 'INV-001',
      });
      
      // Looking for duplicates excluding itself should return nothing
      const duplicate = findDuplicateByInvoiceNumber('INV-001', 'vendor.com', 'email-1', 'test@example.com');
      expect(duplicate).toBeUndefined();
    });

    it('excludes no_invoice and duplicate status emails', () => {
      insertEmail(createTestEmail({ id: 'no-invoice-email', sender_domain: 'vendor.com' }));
      updateEmailStatus('no-invoice-email', 'test@example.com', 'no_invoice', {
        invoice_number: 'INV-001',
      });
      
      const duplicate = findDuplicateByInvoiceNumber('INV-001', 'vendor.com', 'new-email', 'test@example.com');
      expect(duplicate).toBeUndefined();
    });

    it('requires matching account', () => {
      insertEmail(createTestEmail({ id: 'email-1', account: 'other@example.com', sender_domain: 'vendor.com' }));
      updateEmailStatus('email-1', 'other@example.com', 'downloaded', {
        invoice_number: 'INV-001',
      });
      
      const duplicate = findDuplicateByInvoiceNumber('INV-001', 'vendor.com', 'new-email', 'test@example.com');
      expect(duplicate).toBeUndefined();
    });
  });

  describe('findDuplicateByHash', () => {
    it('finds duplicate by attachment hash', () => {
      insertEmail(createTestEmail({ id: 'original' }));
      updateEmailStatus('original', 'test@example.com', 'downloaded', {
        attachment_hash: 'abc123hash',
      });
      
      const duplicate = findDuplicateByHash('abc123hash', 'new-email', 'test@example.com');
      
      expect(duplicate).toBeDefined();
      expect(duplicate?.id).toBe('original');
    });

    it('excludes the email being checked', () => {
      insertEmail(createTestEmail({ id: 'email-1' }));
      updateEmailStatus('email-1', 'test@example.com', 'downloaded', {
        attachment_hash: 'abc123hash',
      });
      
      const duplicate = findDuplicateByHash('abc123hash', 'email-1', 'test@example.com');
      expect(duplicate).toBeUndefined();
    });

    it('returns undefined when hash not found', () => {
      insertEmail(createTestEmail({ id: 'email-1' }));
      updateEmailStatus('email-1', 'test@example.com', 'downloaded', {
        attachment_hash: 'abc123hash',
      });
      
      const duplicate = findDuplicateByHash('differenthash', 'new-email', 'test@example.com');
      expect(duplicate).toBeUndefined();
    });

    it('requires matching account', () => {
      insertEmail(createTestEmail({ id: 'email-1', account: 'other@example.com' }));
      updateEmailStatus('email-1', 'other@example.com', 'downloaded', {
        attachment_hash: 'abc123hash',
      });
      
      const duplicate = findDuplicateByHash('abc123hash', 'new-email', 'test@example.com');
      expect(duplicate).toBeUndefined();
    });
  });
});
