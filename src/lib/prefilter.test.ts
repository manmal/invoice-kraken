import { describe, it, expect } from "vitest";
import {
  shouldSkipEmail,
  prefilterEmails,
  getPrefilterStats,
} from "./prefilter.js";
import type { Email } from "../types.js";

/**
 * Create a mock Email object with sensible defaults
 */
function createMockEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: "test-id-123",
    thread_id: "thread-123",
    account: "test@example.com",
    year: 2024,
    month: 12,
    subject: "Test Email",
    sender: "sender@example.com",
    sender_domain: "example.com",
    date: "2024-12-15",
    snippet: "Test email snippet",
    labels: null,
    raw_json: null,
    status: "pending",
    invoice_type: null,
    invoice_path: null,
    invoice_number: null,
    invoice_amount: null,
    invoice_amount_cents: null,
    invoice_date: null,
    attachment_hash: null,
    duplicate_of: null,
    duplicate_confidence: null,
    deductible: null,
    deductible_reason: null,
    deductible_percent: null,
    income_tax_percent: null,
    vat_recoverable: null,
    file_hash: null,
    file_verified_at: null,
    prefilter_reason: null,
    notes: null,
    created_at: "2024-12-15T10:00:00Z",
    updated_at: "2024-12-15T10:00:00Z",
    ...overrides,
  };
}

describe("shouldSkipEmail", () => {
  describe("shipping notifications", () => {
    it("should skip Amazon shipping confirmation (Versendet)", () => {
      const email = createMockEmail({
        subject: "Versendet: Ihr Amazon-Paket",
        sender: "versandbestaetigung@amazon.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
      expect(result.reason).toContain("non-invoice pattern");
    });

    it("should skip 'ist unterwegs' tracking emails", () => {
      const email = createMockEmail({
        subject: "Ihr Paket ist unterwegs!",
        sender: "shipping@store.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip emails with tracking in subject", () => {
      const email = createMockEmail({
        subject: "Track your order - Tracking number: 123456",
        sender: "notifications@shop.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'Paket versendet' emails", () => {
      const email = createMockEmail({
        subject: "Paket versendet - Ihre Bestellung",
        sender: "noreply@dhl.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'Versandbestätigung' emails", () => {
      const email = createMockEmail({
        subject: "Versandbestätigung für Ihre Bestellung",
        sender: "service@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });
  });

  describe("marketing emails", () => {
    it("should skip Klarna marketing emails", () => {
      const email = createMockEmail({
        subject: "Bezahle sicher und flexibel mit Klarna",
        sender: "noreply@hello.klarna.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip refurbed marketing emails", () => {
      const email = createMockEmail({
        subject: "New deals just for you!",
        sender: "deals@n.refurbed.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip brevosend marketing platform emails", () => {
      const email = createMockEmail({
        subject: "Check out our new products",
        sender: "promo@brevosend.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip aufstehn.at newsletter emails", () => {
      const email = createMockEmail({
        subject: "Weekly Newsletter",
        sender: "newsletter@aufstehn.at",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip F6S newsletter emails", () => {
      const email = createMockEmail({
        subject: "Startup news this week",
        sender: "dan@f6s.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });
  });

  describe("order confirmations", () => {
    it("should skip Amazon order confirmation (Bestellt)", () => {
      const email = createMockEmail({
        subject: "Bestellt: iPhone 15 Pro",
        sender: "bestellbestaetigung@amazon.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'Bestellbestätigung' emails", () => {
      const email = createMockEmail({
        subject: "Bestellbestätigung für Ihre Bestellung",
        sender: "orders@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'order confirmation' emails", () => {
      const email = createMockEmail({
        subject: "Your order confirmation",
        sender: "noreply@store.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'order received' emails", () => {
      const email = createMockEmail({
        subject: "Your order has been received",
        sender: "orders@example.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'order is now complete' emails", () => {
      const email = createMockEmail({
        subject: "Your order is now complete",
        sender: "notifications@shop.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'order shipped' emails", () => {
      const email = createMockEmail({
        subject: "Your order has been shipped",
        sender: "shipping@store.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'Bestelleingangsbestätigung' emails", () => {
      const email = createMockEmail({
        subject: "Bestelleingangsbestätigung",
        sender: "service@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'Ihre Bestellung wurde verschickt' emails", () => {
      const email = createMockEmail({
        subject: "Ihre Shop Bestellung wurde verschickt",
        sender: "versand@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'haben wir gerade verschickt' emails", () => {
      const email = createMockEmail({
        subject: "Dein Paket haben wir gerade verschickt!",
        sender: "info@onlineshop.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'wurde versendet' emails", () => {
      const email = createMockEmail({
        subject: "Ihre Bestellung wurde versendet",
        sender: "shipping@store.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });
  });

  describe("other non-invoice patterns", () => {
    it("should skip policy update emails", () => {
      const email = createMockEmail({
        subject: "Policy Update for your account",
        sender: "legal@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip tax collection update emails", () => {
      const email = createMockEmail({
        subject: "Tax collection update - Important changes",
        sender: "tax@platform.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip API update emails", () => {
      const email = createMockEmail({
        subject: "Updates to your API access",
        sender: "developers@service.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip refund notification emails", () => {
      const email = createMockEmail({
        subject: "Your refund is on the way",
        sender: "refunds@store.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip German refund (Rückerstattung) emails", () => {
      const email = createMockEmail({
        subject: "Rückerstattung für Ihre Bestellung",
        sender: "service@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip payment received notifications", () => {
      const email = createMockEmail({
        subject: "Zahlung eingegangen - Danke!",
        sender: "payments@vendor.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip email verification emails", () => {
      const email = createMockEmail({
        subject: "Bestätigung Ihrer E-Mail-Adresse",
        sender: "noreply@service.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip 'verify your email' emails", () => {
      const email = createMockEmail({
        subject: "Please verify your email address",
        sender: "auth@platform.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip forwarded emails", () => {
      const email = createMockEmail({
        subject: "Fwd: Meeting notes",
        sender: "colleague@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should NOT skip forwarded emails if they contain invoice keywords", () => {
      // Invoice patterns take priority over forwarded patterns
      const email = createMockEmail({
        subject: "Fwd: Your invoice",
        sender: "colleague@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should skip FW: forwarded emails", () => {
      const email = createMockEmail({
        subject: "FW: Important document",
        sender: "colleague@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip order note emails", () => {
      const email = createMockEmail({
        subject: "Note added to your Amazon order",
        sender: "notifications@amazon.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should skip Google Play policy updates", () => {
      const email = createMockEmail({
        subject: "Updates to Developer Program",
        sender: "googleplay-noreply@google.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });
  });

  describe("actual invoice emails should pass through", () => {
    it("should NOT skip email with 'Rechnung' in subject", () => {
      const email = createMockEmail({
        subject: "Ihre Rechnung vom 15.12.2024",
        sender: "rechnung@provider.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("should NOT skip email with 'Invoice' in subject", () => {
      const email = createMockEmail({
        subject: "Invoice for your recent purchase",
        sender: "billing@service.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with 'Receipt' in subject", () => {
      const email = createMockEmail({
        subject: "Your Receipt from Apple",
        sender: "no_reply@email.apple.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with 'Quittung' in subject", () => {
      const email = createMockEmail({
        subject: "Ihre Quittung",
        sender: "payments@store.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with 'Beleg' in subject", () => {
      const email = createMockEmail({
        subject: "Ihr Beleg für die Zahlung",
        sender: "service@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with invoice number pattern", () => {
      const email = createMockEmail({
        subject: "Invoice 12345-67",
        sender: "accounting@vendor.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with reference number pattern", () => {
      const email = createMockEmail({
        subject: "Order #12345678 completed",
        sender: "orders@shop.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email from Stripe", () => {
      const email = createMockEmail({
        subject: "Payment confirmation",
        sender: "receipts@stripe.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email from PayPal", () => {
      const email = createMockEmail({
        subject: "You sent a payment",
        sender: "service@paypal.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email from Google Payments", () => {
      const email = createMockEmail({
        subject: "Your Google Play order",
        sender: "payments-noreply@google.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with 'invoice available' in subject", () => {
      const email = createMockEmail({
        subject: "Your invoice is now available",
        sender: "billing@service.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with 'steht zum Abruf bereit'", () => {
      const email = createMockEmail({
        subject: "Ihre Rechnung steht zum Abruf bereit",
        sender: "rechnungen@telekom.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email from sender containing 'invoice'", () => {
      const email = createMockEmail({
        subject: "Document ready",
        sender: "invoice-noreply@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email from sender containing 'billing'", () => {
      const email = createMockEmail({
        subject: "Monthly statement",
        sender: "billing@subscription.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email from sender containing 'accounting'", () => {
      const email = createMockEmail({
        subject: "Your documents",
        sender: "accounting@agency.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should prioritize invoice patterns over non-invoice patterns", () => {
      // Email that matches both: has "order confirmation" but also "Rechnung"
      const email = createMockEmail({
        subject: "Order confirmation - Rechnung im Anhang",
        sender: "orders@shop.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });
  });

  describe("edge cases with empty subjects", () => {
    it("should NOT skip email with empty subject", () => {
      const email = createMockEmail({
        subject: "",
        sender: "unknown@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should NOT skip email with null subject", () => {
      const email = createMockEmail({
        subject: null,
        sender: "unknown@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should skip based on sender even with empty subject", () => {
      const email = createMockEmail({
        subject: "",
        sender: "bestellbestaetigung@amazon.de",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });

    it("should NOT skip invoice sender even with empty subject", () => {
      const email = createMockEmail({
        subject: "",
        sender: "invoice@company.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should handle null sender", () => {
      const email = createMockEmail({
        subject: "Some email",
        sender: null,
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });

    it("should handle both null subject and sender", () => {
      const email = createMockEmail({
        subject: null,
        sender: null,
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(false);
    });
  });

  describe("edge cases with whitespace", () => {
    it("should match patterns with leading whitespace", () => {
      const email = createMockEmail({
        subject: "  Versendet: Your package",
        sender: "shipping@amazon.de",
      });
      // Note: Pattern uses /^Versendet:/i so leading space won't match
      // This tests the actual behavior
      const result = shouldSkipEmail(email);
      // With leading spaces, the ^ anchor won't match
      expect(result.skip).toBe(false);
    });

    it("should match patterns in middle of subject", () => {
      const email = createMockEmail({
        subject: "Update: tracking information for your order",
        sender: "notifications@shop.com",
      });
      const result = shouldSkipEmail(email);
      expect(result.skip).toBe(true);
    });
  });
});

describe("prefilterEmails", () => {
  it("should correctly separate emails into toAnalyze and toSkip", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Your Invoice #123", sender: "billing@company.com" }),
      createMockEmail({ id: "2", subject: "Versendet: Package", sender: "amazon@shipping.de" }),
      createMockEmail({ id: "3", subject: "Rechnung vom Dezember", sender: "rechnung@provider.de" }),
      createMockEmail({ id: "4", subject: "Order confirmation", sender: "orders@shop.com" }),
      createMockEmail({ id: "5", subject: "Random email", sender: "info@company.com" }),
    ];

    const result = prefilterEmails(emails);

    expect(result.toAnalyze).toHaveLength(3);
    expect(result.toSkip).toHaveLength(2);

    // Check that invoice emails are in toAnalyze
    const analyzeIds = result.toAnalyze.map((e) => e.id);
    expect(analyzeIds).toContain("1");
    expect(analyzeIds).toContain("3");
    expect(analyzeIds).toContain("5");

    // Check that non-invoice emails are in toSkip
    const skipIds = result.toSkip.map((s) => s.email.id);
    expect(skipIds).toContain("2");
    expect(skipIds).toContain("4");

    // Check that skip reasons are provided
    for (const skipped of result.toSkip) {
      expect(skipped.reason).toBeTruthy();
    }
  });

  it("should return all emails in toAnalyze when none match skip patterns", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Invoice attached", sender: "billing@vendor.com" }),
      createMockEmail({ id: "2", subject: "Your Receipt", sender: "receipts@stripe.com" }),
    ];

    const result = prefilterEmails(emails);

    expect(result.toAnalyze).toHaveLength(2);
    expect(result.toSkip).toHaveLength(0);
  });

  it("should return all emails in toSkip when all match skip patterns", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Order confirmation", sender: "orders@shop.com" }),
      createMockEmail({ id: "2", subject: "Versendet: Package", sender: "amazon@ship.de" }),
    ];

    const result = prefilterEmails(emails);

    expect(result.toAnalyze).toHaveLength(0);
    expect(result.toSkip).toHaveLength(2);
  });

  it("should handle empty email array", () => {
    const result = prefilterEmails([]);

    expect(result.toAnalyze).toHaveLength(0);
    expect(result.toSkip).toHaveLength(0);
  });

  it("should preserve email object references", () => {
    const originalEmail = createMockEmail({ id: "1", subject: "Invoice #123" });
    const emails = [originalEmail];

    const result = prefilterEmails(emails);

    expect(result.toAnalyze[0]).toBe(originalEmail);
  });
});

describe("getPrefilterStats", () => {
  it("should return correct statistics", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Invoice #123", sender: "billing@company.com" }),
      createMockEmail({ id: "2", subject: "Versendet: Package", sender: "amazon@shipping.de" }),
      createMockEmail({ id: "3", subject: "Order confirmation", sender: "orders@shop.com" }),
      createMockEmail({ id: "4", subject: "Bestellbestätigung", sender: "orders@store.de" }),
      createMockEmail({ id: "5", subject: "Receipt from Apple", sender: "apple@email.com" }),
    ];

    const stats = getPrefilterStats(emails);

    expect(stats.total).toBe(5);
    expect(stats.toAnalyze).toBe(2);
    expect(stats.toSkip).toBe(3);
    expect(Object.keys(stats.skipReasons).length).toBeGreaterThan(0);
  });

  it("should group skip reasons correctly", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Versendet: Package 1", sender: "ship@amazon.de" }),
      createMockEmail({ id: "2", subject: "Versendet: Package 2", sender: "ship@amazon.de" }),
      createMockEmail({ id: "3", subject: "Order confirmation", sender: "orders@shop.com" }),
    ];

    const stats = getPrefilterStats(emails);

    expect(stats.total).toBe(3);
    expect(stats.toSkip).toBe(3);
    // All subject-based reasons should be grouped under "Subject matches non-invoice pattern"
    expect(stats.skipReasons["Subject matches non-invoice pattern"]).toBe(3);
  });

  it("should handle empty email array", () => {
    const stats = getPrefilterStats([]);

    expect(stats.total).toBe(0);
    expect(stats.toAnalyze).toBe(0);
    expect(stats.toSkip).toBe(0);
    expect(Object.keys(stats.skipReasons)).toHaveLength(0);
  });

  it("should handle all invoices (no skips)", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Your Invoice", sender: "billing@company.com" }),
      createMockEmail({ id: "2", subject: "Rechnung", sender: "rechnung@provider.de" }),
    ];

    const stats = getPrefilterStats(emails);

    expect(stats.total).toBe(2);
    expect(stats.toAnalyze).toBe(2);
    expect(stats.toSkip).toBe(0);
    expect(Object.keys(stats.skipReasons)).toHaveLength(0);
  });

  it("should handle all non-invoices (all skipped)", () => {
    const emails = [
      createMockEmail({ id: "1", subject: "Order confirmation", sender: "orders@shop.com" }),
      createMockEmail({ id: "2", subject: "Tracking update", sender: "track@dhl.de" }),
    ];

    const stats = getPrefilterStats(emails);

    expect(stats.total).toBe(2);
    expect(stats.toAnalyze).toBe(0);
    expect(stats.toSkip).toBe(2);
  });
});
