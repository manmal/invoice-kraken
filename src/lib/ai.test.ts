/**
 * Tests for the AI module
 *
 * These tests mock the pi-coding-agent and pi-ai modules completely,
 * focusing on testing the logic around the AI calls, not the AI itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pi-coding-agent before any imports
// The mocks object will be accessed via the module
vi.mock('@mariozechner/pi-coding-agent', () => {
  // Create mock state that can be accessed and modified
  const state = {
    subscribeCallback: null as ((event: unknown) => void) | null,
    promptHandler: null as (() => Promise<void>) | null,
    getAvailableResult: [
      { provider: 'anthropic', id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
    ] as Array<{ provider: string; id: string; name: string }>,
    getAvailableError: null as Error | null,
    findResult: { provider: 'anthropic', id: 'claude-3-5-haiku-latest' } as object | null,
    sessionCreationError: null as Error | null,
    disposeCalled: false,
  };

  return {
    // Export state for test access
    __testState: state,

    discoverAuthStorage: vi.fn(() => ({})),
    discoverModels: vi.fn(() => ({
      find: vi.fn(() => state.findResult),
      getAvailable: vi.fn(async () => {
        if (state.getAvailableError) {
          throw state.getAvailableError;
        }
        return state.getAvailableResult;
      }),
    })),
    AuthStorage: vi.fn(),
    SessionManager: {
      inMemory: vi.fn(() => ({})),
    },
    SettingsManager: {
      inMemory: vi.fn(() => ({})),
    },
    createAgentSession: vi.fn(async () => {
      if (state.sessionCreationError) {
        throw state.sessionCreationError;
      }
      return {
        session: {
          subscribe: vi.fn((cb: (event: unknown) => void) => {
            state.subscribeCallback = cb;
          }),
          prompt: vi.fn(async () => {
            if (state.promptHandler) {
              await state.promptHandler();
            }
          }),
          dispose: vi.fn(() => {
            state.disposeCalled = true;
          }),
        },
      };
    }),
  };
});

// Mock config module
vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => ({
    tax_jurisdiction: 'AT',
    has_company_car: false,
    company_car_type: null,
    is_kleinunternehmer: false,
    telecom_business_percent: 50,
    internet_business_percent: 50,
    accounts: ['test@example.com'],
    setup_completed: true,
    config_version: 1,
  })),
  getVehicleVatRecovery: vi.fn(() => ({
    recoverable: false,
    reason: 'No company car configured',
  })),
  getTelecomBusinessPercent: vi.fn(() => 50),
  isKleinunternehmer: vi.fn(() => false),
}));

// Mock models module
vi.mock('./models.js', () => ({
  getModelForTask: vi.fn(() => ({
    model: { provider: 'anthropic', id: 'claude-3-5-haiku-latest' },
    thinkingLevel: 'off',
    description: 'Test model',
    source: 'test',
  })),
  DEFAULT_MODEL_CONFIG: {
    emailClassification: {
      provider: 'anthropic',
      modelId: 'claude-3-5-haiku-latest',
      description: 'Classify emails as invoices',
      thinkingLevel: 'off',
      tier: 'fast',
    },
  },
}));

// Mock email-cache module
vi.mock('./email-cache.js', () => ({
  getEmailBodiesBatch: vi.fn().mockResolvedValue(new Map()),
  getTruncatedBody: vi.fn(() => null),
}));

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '{}'),
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
}));

// Type for the test state
interface TestState {
  subscribeCallback: ((event: unknown) => void) | null;
  promptHandler: (() => Promise<void>) | null;
  getAvailableResult: Array<{ provider: string; id: string; name: string }>;
  getAvailableError: Error | null;
  findResult: object | null;
  sessionCreationError: Error | null;
  disposeCalled: boolean;
}

// Helper to get test state from the mock module
async function getTestState(): Promise<TestState> {
  const mod = await import('@mariozechner/pi-coding-agent');
  return (mod as unknown as { __testState: TestState }).__testState;
}

// Helper to reset test state
async function resetTestState(): Promise<void> {
  const state = await getTestState();
  state.subscribeCallback = null;
  state.promptHandler = null;
  state.getAvailableResult = [
    { provider: 'anthropic', id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
  ];
  state.getAvailableError = null;
  state.findResult = { provider: 'anthropic', id: 'claude-3-5-haiku-latest' };
  state.sessionCreationError = null;
  state.disposeCalled = false;
}

describe('AI Module', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTestState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAuth', () => {
    it('returns null when authenticated with Anthropic models available', async () => {
      vi.resetModules();
      await resetTestState();

      const { checkAuth: freshCheckAuth } = await import('./ai.js');
      const result = await freshCheckAuth();
      expect(result).toBeNull();
    });

    it('returns error message when no Anthropic models available', async () => {
      vi.resetModules();
      const state = await getTestState();
      state.getAvailableResult = [{ provider: 'openai', id: 'gpt-4', name: 'GPT-4' }];

      const { checkAuth: freshCheckAuth } = await import('./ai.js');
      const result = await freshCheckAuth();

      expect(result).toContain('AUTHENTICATION REQUIRED');
    });

    it('returns error message when getAvailable throws', async () => {
      vi.resetModules();
      const state = await getTestState();
      state.getAvailableError = new Error('Network error');

      const { checkAuth: freshCheckAuth } = await import('./ai.js');
      const result = await freshCheckAuth();

      expect(result).toContain('Authentication check failed');
      expect(result).toContain('Network error');
    });
  });

  describe('analyzeEmailsForInvoices', () => {
    const mockEmails = [
      {
        id: 'email-1',
        subject: 'Your Invoice #12345',
        sender: 'billing@example.com',
        date: '2024-01-15',
        snippet: 'Thank you for your purchase...',
        raw_json: JSON.stringify({ payload: { parts: [{ filename: 'invoice.pdf' }] } }),
      },
      {
        id: 'email-2',
        subject: 'Newsletter: January Edition',
        sender: 'newsletter@example.com',
        date: '2024-01-16',
        snippet: 'Check out our latest news...',
        raw_json: JSON.stringify({ payload: {} }),
      },
    ];

    const mockAIResponse = JSON.stringify([
      {
        id: 'email-1',
        has_invoice: true,
        invoice_type: 'pdf_attachment',
        invoice_number: '12345',
        amount: '99.00 €',
        invoice_date: '2024-01-15',
        vendor_product: 'example_service',
        deductible: 'full',
        deductible_reason: 'Software service',
        income_tax_percent: 100,
        vat_recoverable: true,
        confidence: 'high',
        notes: null,
      },
      {
        id: 'email-2',
        has_invoice: false,
        invoice_type: 'none',
        confidence: 'high',
        notes: 'Newsletter, not an invoice',
      },
    ]);

    beforeEach(async () => {
      vi.resetModules();
      await resetTestState();
    });

    it('returns correct structure with invoice classification', async () => {
      const state = await getTestState();

      // Setup mock to simulate AI response
      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          // Send text deltas
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: mockAIResponse },
          });
          // Send turn_end with usage
          state.subscribeCallback({
            type: 'turn_end',
            message: {
              usage: {
                input: 100,
                output: 50,
                cacheRead: 10,
                cacheWrite: 5,
                totalTokens: 165,
                cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
              },
              model: 'claude-3-5-haiku-latest',
              provider: 'anthropic',
            },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const result = await freshAnalyze(mockEmails);

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('provider');

      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results).toHaveLength(2);

      // Check first result (invoice)
      const invoiceResult = result.results.find((r) => r.id === 'email-1');
      expect(invoiceResult).toBeDefined();
      expect(invoiceResult?.has_invoice).toBe(true);
      expect(invoiceResult?.invoice_type).toBe('pdf_attachment');
      expect(invoiceResult?.invoice_number).toBe('12345');
      expect(invoiceResult?.amount).toBe('99.00 €');

      // Check second result (not an invoice)
      const nonInvoiceResult = result.results.find((r) => r.id === 'email-2');
      expect(nonInvoiceResult).toBeDefined();
      expect(nonInvoiceResult?.has_invoice).toBe(false);
      expect(nonInvoiceResult?.invoice_type).toBe('none');
    });

    it('handles JSON wrapped in markdown code blocks', async () => {
      const wrappedResponse = '```json\n' + mockAIResponse + '\n```';
      const state = await getTestState();

      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: wrappedResponse },
          });
          state.subscribeCallback({
            type: 'turn_end',
            message: { usage: {}, model: 'claude-3-5-haiku-latest', provider: 'anthropic' },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const result = await freshAnalyze(mockEmails);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].has_invoice).toBe(true);
    });

    it('returns empty results with error notes when JSON parsing fails', async () => {
      const state = await getTestState();

      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'This is not valid JSON!' },
          });
          state.subscribeCallback({
            type: 'turn_end',
            message: { usage: {}, model: 'claude-3-5-haiku-latest', provider: 'anthropic' },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const result = await freshAnalyze(mockEmails);

      // Should return fallback results for each email
      expect(result.results).toHaveLength(2);
      expect(result.results[0].has_invoice).toBe(false);
      expect(result.results[0].invoice_type).toBe('none');
      expect(result.results[0].confidence).toBe('low');
      expect(result.results[0].notes).toContain('Analysis failed');
    });

    it('tracks token usage correctly', async () => {
      const state = await getTestState();

      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: mockAIResponse },
          });
          state.subscribeCallback({
            type: 'turn_end',
            message: {
              usage: {
                input: 500,
                output: 200,
                cacheRead: 50,
                cacheWrite: 25,
                totalTokens: 775,
                cost: {
                  input: 0.005,
                  output: 0.01,
                  cacheRead: 0.001,
                  cacheWrite: 0.002,
                  total: 0.018,
                },
              },
              model: 'claude-3-5-haiku-latest',
              provider: 'anthropic',
            },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const result = await freshAnalyze(mockEmails);

      expect(result.usage.input).toBe(500);
      expect(result.usage.output).toBe(200);
      expect(result.usage.cacheRead).toBe(50);
      expect(result.usage.cacheWrite).toBe(25);
      expect(result.usage.cost.total).toBe(0.018);
    });

    it('returns model and provider info', async () => {
      const state = await getTestState();

      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: mockAIResponse },
          });
          state.subscribeCallback({
            type: 'turn_end',
            message: {
              usage: {},
              model: 'claude-sonnet-4-5',
              provider: 'anthropic',
            },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const result = await freshAnalyze(mockEmails);

      expect(result.model).toBe('claude-sonnet-4-5');
      expect(result.provider).toBe('anthropic');
    });

    it('disposes session after completion', async () => {
      const state = await getTestState();

      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: mockAIResponse },
          });
          state.subscribeCallback({
            type: 'turn_end',
            message: { usage: {}, model: 'claude-3-5-haiku-latest', provider: 'anthropic' },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      await freshAnalyze(mockEmails);

      expect(state.disposeCalled).toBe(true);
    });
  });

  describe('Error handling for API failures', () => {
    beforeEach(async () => {
      vi.resetModules();
      await resetTestState();
    });

    it('handles session creation failure gracefully', async () => {
      const state = await getTestState();
      state.sessionCreationError = new Error('API connection failed');

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const mockEmailsSingle = [{ id: 'email-1', subject: 'Test' }];

      const result = await freshAnalyze(mockEmailsSingle);

      // Should return fallback results
      expect(result.results).toHaveLength(1);
      expect(result.results[0].has_invoice).toBe(false);
      expect(result.results[0].notes).toContain('Analysis failed');
      expect(result.results[0].notes).toContain('API connection failed');
    });

    it('handles prompt execution failure', async () => {
      const state = await getTestState();

      state.promptHandler = async () => {
        throw new Error('Rate limit exceeded');
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const mockEmailsSingle = [{ id: 'email-1', subject: 'Test' }];

      const result = await freshAnalyze(mockEmailsSingle);

      // Should return fallback results
      expect(result.results).toHaveLength(1);
      expect(result.results[0].notes).toContain('Analysis failed');
    });

    it('handles empty email array', async () => {
      const state = await getTestState();

      state.promptHandler = async () => {
        if (state.subscribeCallback) {
          state.subscribeCallback({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: '[]' },
          });
          state.subscribeCallback({
            type: 'turn_end',
            message: { usage: {}, model: 'claude-3-5-haiku-latest', provider: 'anthropic' },
          });
        }
      };

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const result = await freshAnalyze([]);

      expect(result.results).toHaveLength(0);
    });

    it('throws when authentication fails', async () => {
      const state = await getTestState();
      state.getAvailableResult = []; // No models available

      const { analyzeEmailsForInvoices: freshAnalyze } = await import('./ai.js');
      const mockEmailsSingle = [{ id: 'email-1', subject: 'Test' }];

      await expect(freshAnalyze(mockEmailsSingle)).rejects.toThrow('Authentication required');
    });
  });
});
