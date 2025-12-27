/**
 * AI module using pi-coding-agent SDK
 *
 * This module provides AI-powered analysis capabilities using the pi SDK
 * directly, instead of spawning the pi CLI executable.
 *
 * Authentication: Uses Anthropic OAuth tokens stored by pi in ~/.pi/agent/auth.json
 * If not logged in or token expired, user must run `pi` and use `/login` command.
 */

import {
  discoverAuthStorage,
  discoverModels,
  AuthStorage,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from '@mariozechner/pi-coding-agent';
import type { ModelRegistry } from '@mariozechner/pi-coding-agent';
import type { Model, Api } from '@mariozechner/pi-ai';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { getModelForTask, DEFAULT_MODEL_CONFIG } from './models.js';
import { loadConfig } from './config.js';
import type { KraxlerConfig } from '../types.js';
import { getTaxRules } from './jurisdictions/registry.js';
import { emptyUsage, addUsage } from './tokens.js';
import type { Usage } from './tokens.js';
import { getEmailBodiesBatch, getTruncatedBody } from './email-cache.js';
import type { Email } from '../types.js';

interface AgentEvent {
  type: string;
  assistantMessageEvent?: {
    type: string;
    delta?: string;
  };
  message?: {
    usage?: Partial<Usage>;
    model?: string;
    provider?: string;
  };
}

interface AgentSession {
  subscribe: (callback: (event: AgentEvent) => void) => void;
  prompt: (text: string) => Promise<void>;
  dispose: () => void;
}

// Module-level state
let authStorage: AuthStorage | null = null;
let modelRegistry: ModelRegistry | null = null;

/**
 * Get the pi agent directory
 */
function getAgentDir(): string {
  return path.join(os.homedir(), '.pi', 'agent');
}

/**
 * Initialize auth storage and model registry
 * pi stores OAuth tokens in oauth.json (not auth.json)
 */
function initAuth(): { authStorage: AuthStorage; modelRegistry: ModelRegistry } {
  if (!authStorage) {
    // pi stores OAuth in oauth.json, not auth.json
    const agentDir = getAgentDir();
    const oauthPath = path.join(agentDir, 'oauth.json');

    // Check if oauth.json exists and use it
    if (fs.existsSync(oauthPath)) {
      authStorage = new AuthStorage(oauthPath);
    } else {
      // Fall back to standard discovery
      authStorage = discoverAuthStorage();
    }

    modelRegistry = discoverModels(authStorage);
  }
  return { authStorage: authStorage!, modelRegistry: modelRegistry! };
}

/**
 * Check if authentication is available
 * Returns error message if not authenticated, null if OK
 */
export async function checkAuth(): Promise<string | null> {
  const { modelRegistry } = initAuth();

  try {
    const available = await modelRegistry.getAvailable();

    // Check if any Anthropic models are available
    const anthropicModels = available.filter(
      (m) => m.provider.toLowerCase() === 'anthropic'
    );

    if (anthropicModels.length === 0) {
      return `
╔════════════════════════════════════════════════════════════════════════════╗
║  ⚠️  AUTHENTICATION REQUIRED                                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  No Anthropic API key or OAuth token found.                                ║
║                                                                            ║
║  To authenticate:                                                          ║
║  1. Run: pi                                                                ║
║  2. Type: /login                                                           ║
║  3. Follow the OAuth flow in your browser                                  ║
║                                                                            ║
║  Alternatively, set ANTHROPIC_API_KEY environment variable.                ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`;
    }

    return null; // Auth OK
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Authentication check failed: ${errorMessage}`;
  }
}

/**
 * Create a simple prompt-response session for classification tasks
 * No tools, no persistence, just LLM completion
 */
async function simplePrompt(
  prompt: string,
  task: keyof typeof DEFAULT_MODEL_CONFIG = 'emailClassification',
  modelOverride: string | null = null
): Promise<{ output: string; usage: Usage; model: string; provider: string }> {
  const { authStorage, modelRegistry } = initAuth();

  const taskConfig = getModelForTask(task);
  if (!taskConfig) {
    throw new Error(`Unknown task: ${task}`);
  }

  // Allow model override for comparison testing
  let modelToUse: Model<Api> = taskConfig.model as Model<Api>;
  if (modelOverride) {
    const overrideModel = modelRegistry.find('anthropic', modelOverride);
    if (overrideModel) {
      modelToUse = overrideModel;
    } else {
      console.warn(`Model override '${modelOverride}' not found, using default`);
    }
  }

  const { session } = (await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    authStorage,
    modelRegistry,
    model: modelToUse,
    thinkingLevel: taskConfig.thinkingLevel as
      | 'off'
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high'
      | 'xhigh',
    tools: [], // No tools for simple classification
    customTools: [], // Prevent subagent discovery
    skills: [],
    hooks: [],
    contextFiles: [],
    systemPrompt:
      'You are a data extraction assistant. Always respond with valid JSON only, no markdown formatting, no explanation.',
  })) as { session: AgentSession };

  let output = '';
  const usage = emptyUsage();
  let modelId = modelToUse.id;
  let providerId = modelToUse.provider;

  session.subscribe((event: AgentEvent) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      output += event.assistantMessageEvent.delta || '';
    }
    // Collect token usage from turn_end events
    if (event.type === 'turn_end' && event.message?.usage) {
      addUsage(usage, event.message.usage);
      modelId = event.message.model || modelId;
      providerId = event.message.provider || providerId;
    }
  });

  try {
    await session.prompt(prompt);
    return { output: output.trim(), usage, model: modelId, provider: providerId };
  } finally {
    session.dispose();
  }
}

/** Email with optional enriched body preview */
interface EnrichedEmail extends Partial<Email> {
  id: string;
  subject?: string | null;
  sender?: string | null;
  date?: string | null;
  snippet?: string | null;
  raw_json?: string | null;
  bodyPreview?: string | null;
}

/**
 * Get current situation from config (latest ongoing or most recent).
 */
function getCurrentSituation(config: KraxlerConfig): { 
  hasCompanyCar: boolean;
  companyCarType: string | null;
  vatStatus: string;
  telecomPercent: number;
} {
  if (config.situations.length === 0) {
    return {
      hasCompanyCar: false,
      companyCarType: null,
      vatStatus: 'regelbesteuert',
      telecomPercent: 50,
    };
  }
  
  // Find ongoing situation or most recent
  const situation = config.situations.find(s => s.to === null) || 
                    config.situations[config.situations.length - 1];
  
  return {
    hasCompanyCar: situation.hasCompanyCar,
    companyCarType: situation.companyCarType,
    vatStatus: situation.vatStatus,
    telecomPercent: situation.telecomBusinessPercent,
  };
}

/**
 * Build the email classification prompt with user config context
 */
function buildClassificationPrompt(emails: EnrichedEmail[]): string {
  const config = loadConfig();
  const currentSituation = getCurrentSituation(config);
  
  // Get tax rules for the jurisdiction
  const taxRules = getTaxRules(config.jurisdiction || 'AT');
  
  // Calculate values from situation
  const kleinunternehmer = currentSituation.vatStatus === 'kleinunternehmer';
  const telecomPercent = currentSituation.telecomPercent;

  const emailsJson = JSON.stringify(
    emails.map((e) => ({
      id: e.id,
      subject: e.subject,
      sender: e.sender,
      date: e.date,
      snippet: e.snippet,
      bodyPreview: e.bodyPreview || null, // Truncated body content (max 1KB)
      hasAttachment: e.raw_json
        ? JSON.parse(e.raw_json).payload?.parts?.some((p: { filename?: string }) => p.filename)
        : false,
    })),
    null,
    2
  );

  // Get jurisdiction-specific instructions
  const situation = config.situations.find(s => s.to === null) || config.situations[config.situations.length - 1] || config.situations[0];
  const taxInstructions = taxRules.getPromptInstructions(situation);

  // Build context based on user config
  const vatContext = kleinunternehmer
    ? 'User is KLEINUNTERNEHMER - NO VAT recovery on ANY expenses!'
    : 'User is NOT Kleinunternehmer - VAT recovery applies per category';

  return `Analyze these emails and categorize each one for invoice processing.

CRITICAL RULES FOR "has_invoice":
═══════════════════════════════════════════════════════════════════════════════
YES - These ARE invoices/receipts:
  • PayPal "Receipt for Your Payment to [merchant]" - ALWAYS an invoice!
  • Subject contains "Rechnung" (German for invoice)
  • Subject contains "Invoice" or "Receipt from"  
  • Subject contains "Ihre Rechnung" or "Deine Rechnung"
  • Subject contains "Beleg für" (receipt for)
  • Stripe/Paddle receipts

NO - These are NOT invoices:
  • "Order confirmed" / "Bestellung bestätigt" - just confirmation, invoice comes later
  • "Subscription will renew soon" - reminder, not actual invoice
  • "Payment authorized" / "authorized a payment" - authorization ≠ receipt
  • "Shipment" / "Versendet" / "shipped" - shipping notification
  • "Refunded" / "Refund" - refund notification
  • "Rücksendung" - return notification
  • "good to go" / "welcome" - confirmation messages
  • Marketing emails with "sale" / "rabatt" / "discount"
═══════════════════════════════════════════════════════════════════════════════

USER CONFIGURATION:
- Jurisdiction: ${config.jurisdiction || 'AT'}
- ${vatContext}
- Telecom/internet business use: ${telecomPercent}%

For each email, determine:
1. Does it contain an invoice? (yes/no/uncertain) - USE THE RULES ABOVE!
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
4. Tax deductibility for ${config.jurisdiction || 'AT'} freelance software developer:
   
   ${taxInstructions}

Emails to analyze:
${emailsJson}

Return ONLY a valid JSON array with this structure:
[{
  "id": "email_id",
  "has_invoice": true/false,
  "invoice_type": "text"|"pdf_attachment"|"link"|"none",
  "invoice_number": "string or null",
  "amount": "string or null (e.g., '149.00 €')",
  "invoice_date": "YYYY-MM-DD or null",
  "vendor_product": "snake_case name for filename (e.g., 'anthropic_api', 'hetzner_cloud')",
  "deductible": "full"|"vehicle"|"meals"|"telecom"|"gifts"|"none"|"unclear",
  "deductible_reason": "brief explanation",
  "income_tax_percent": number or null (100 for full/vehicle, 50/70 for meals, etc.),
  "vat_recoverable": true/false/null (false for vehicle in AT usually, etc.),
  "confidence": "high"|"medium"|"low",
  "notes": "any relevant notes"
}]`;
}

/** Result from AI classification for a single email */
export interface EmailClassificationResult {
  id: string;
  has_invoice: boolean;
  invoice_type: 'text' | 'pdf_attachment' | 'link' | 'none';
  invoice_number?: string | null;
  amount?: string | null;
  invoice_date?: string | null;
  vendor_product?: string | null;
  deductible?: 'full' | 'vehicle' | 'meals' | 'telecom' | 'gifts' | 'none' | 'unclear';
  deductible_reason?: string | null;
  income_tax_percent?: number | null;
  vat_recoverable?: boolean | null;
  confidence: 'high' | 'medium' | 'low';
  notes?: string | null;
}

/** Options for analyzeEmailsForInvoices */
export interface AnalyzeEmailsOptions {
  account?: string;
  modelOverride?: string;
}

/** Return type for analyzeEmailsForInvoices */
export interface AnalyzeEmailsResult {
  results: EmailClassificationResult[];
  usage: Usage;
  model: string;
  provider: string;
}

/**
 * Analyze emails for invoice classification
 */
export async function analyzeEmailsForInvoices(
  emails: EnrichedEmail[],
  options: AnalyzeEmailsOptions = {}
): Promise<AnalyzeEmailsResult> {
  // Check authentication first
  const authError = await checkAuth();
  if (authError) {
    console.error(authError);
    throw new Error('Authentication required. Run `pi` and use `/login` to authenticate.');
  }

  // Fetch email bodies (cached) if account is provided
  const account = options.account;
  let enrichedEmails: EnrichedEmail[] = emails;

  if (account) {
    const messageIds = emails.map((e) => e.id);
    const bodies = await getEmailBodiesBatch(account, messageIds, 4);

    enrichedEmails = emails.map((e) => {
      const body = bodies.get(e.id);
      return {
        ...e,
        bodyPreview: body ? getTruncatedBody(body.textBody, body.htmlBody, 1024) : null,
      };
    });
  }

  const prompt = buildClassificationPrompt(enrichedEmails);

  try {
    const { output, usage, model, provider } = await simplePrompt(
      prompt,
      'emailClassification',
      options.modelOverride ?? null
    );

    // Extract JSON from response (it might have markdown code blocks)
    let jsonStr = output;
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON array in the output
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    const results = JSON.parse(jsonStr) as EmailClassificationResult[];
    return { results, usage, model, provider };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error analyzing emails:', errorMessage);
    // Return empty analysis on error
    return {
      results: emails.map((e) => ({
        id: e.id,
        has_invoice: false,
        invoice_type: 'none' as const,
        confidence: 'low' as const,
        notes: `Analysis failed: ${errorMessage}`,
      })),
      usage: emptyUsage(),
      model: 'unknown',
      provider: 'unknown',
    };
  }
}

// Browser download is now handled directly in src/lib/browser.js
