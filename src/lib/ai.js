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
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from '@mariozechner/pi-coding-agent';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { getModelForTask, DEFAULT_MODEL_CONFIG } from './models.js';
import { loadConfig, getVehicleVatRecovery, getTelecomBusinessPercent, isKleinunternehmer } from './config.js';
import { emptyUsage, addUsage } from './tokens.js';
import { getEmailBodiesBatch, getTruncatedBody } from './email-cache.js';

let authStorage = null;
let modelRegistry = null;

/**
 * Get the pi agent directory
 */
function getAgentDir() {
  return path.join(os.homedir(), '.pi', 'agent');
}

/**
 * Initialize auth storage and model registry
 * pi stores OAuth tokens in oauth.json (not auth.json)
 */
function initAuth() {
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
  return { authStorage, modelRegistry };
}

/**
 * Check if authentication is available
 * Returns error message if not authenticated, null if OK
 */
export async function checkAuth() {
  const { modelRegistry } = initAuth();
  
  try {
    const available = await modelRegistry.getAvailable();
    
    // Check if any Anthropic models are available
    const anthropicModels = available.filter(m => m.provider.toLowerCase() === 'anthropic');
    
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
    return `Authentication check failed: ${error.message}`;
  }
}

/**
 * Create a simple prompt-response session for classification tasks
 * No tools, no persistence, just LLM completion
 * 
 * @param {string} prompt - The prompt to send
 * @param {string} task - Task name for model selection
 * @param {string} [modelOverride] - Override model ID (e.g., 'claude-opus-4-5')
 * @returns {Promise<{output: string, usage: Object, model: string, provider: string}>}
 */
async function simplePrompt(prompt, task = 'emailClassification', modelOverride = null) {
  const { authStorage, modelRegistry } = initAuth();
  
  const taskConfig = getModelForTask(task);
  if (!taskConfig) {
    throw new Error(`Unknown task: ${task}`);
  }
  
  // Allow model override for comparison testing
  let modelToUse = taskConfig.model;
  if (modelOverride) {
    const overrideModel = modelRegistry.find('anthropic', modelOverride);
    if (overrideModel) {
      modelToUse = overrideModel;
    } else {
      console.warn(`Model override '${modelOverride}' not found, using default`);
    }
  }
  
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    authStorage,
    modelRegistry,
    model: modelToUse,
    thinkingLevel: taskConfig.thinkingLevel,
    tools: [], // No tools for simple classification
    customTools: [], // Prevent subagent discovery
    skills: [],
    hooks: [],
    contextFiles: [],
    systemPrompt: 'You are a data extraction assistant. Always respond with valid JSON only, no markdown formatting, no explanation.',
  });
  
  let output = '';
  const usage = emptyUsage();
  let modelId = modelToUse.id;
  let providerId = modelToUse.provider;
  
  session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
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

/**
 * Build the email classification prompt with user config context
 * @param {Object[]} emails - Emails with optional bodyPreview field
 */
function buildClassificationPrompt(emails) {
  const config = loadConfig();
  const vehicleVat = getVehicleVatRecovery();
  const telecomPercent = getTelecomBusinessPercent();
  const kleinunternehmer = isKleinunternehmer();
  
  const emailsJson = JSON.stringify(emails.map(e => ({
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    date: e.date,
    snippet: e.snippet,
    bodyPreview: e.bodyPreview || null, // Truncated body content (max 1KB)
    hasAttachment: e.raw_json ? JSON.parse(e.raw_json).payload?.parts?.some(p => p.filename) : false,
  })), null, 2);
  
  // Build context based on user config
  let vehicleContext = 'No company car configured';
  if (config.has_company_car) {
    if (config.company_car_type === 'electric') {
      vehicleContext = 'ELECTRIC company car - FULL VAT recovery on vehicle expenses!';
    } else if (config.company_car_type === 'hybrid_plugin') {
      vehicleContext = 'Plug-in hybrid company car - partial VAT recovery (check with Steuerberater)';
    } else {
      vehicleContext = 'ICE/Hybrid company car - NO VAT recovery on vehicle expenses (Austrian rule)';
    }
  }
  
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
- ${vehicleContext}
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
4. Tax deductibility for Austrian Einzelunternehmer (sole proprietor) freelance software developer:
   
   IMPORTANT AUSTRIAN TAX RULES:
   - Income Tax (EST) and VAT (Vorsteuer) deductibility are SEPARATE
   ${config.has_company_car ? `- Company car type: ${config.company_car_type?.toUpperCase()}` : '- No company car'}
   - ${vehicleVat.reason}
   - Business meals: 50% income tax, but 100% VAT recovery${kleinunternehmer ? ' (except Kleinunternehmer!)' : ''}
   
   Categories:
   - full: 100% income tax + ${kleinunternehmer ? 'NO' : '100%'} VAT recovery:
     * Software, cloud services, dev tools, hosting, domains
     * Professional services (accountant, legal)
     * Hardware for work (computers, monitors, keyboards)
     * Education (tech courses, books, conferences)
   
   - vehicle: 100% income tax, ${vehicleVat.recoverable ? 'WITH' : 'NO'} VAT recovery:
     * Fuel/petrol (Tankstelle: OMV, BP, Shell, etc.)
     * Car service/repair, car wash
     * Tolls (ASFINAG), Vignette
     * ÖAMTC, ARBÖ membership
     * Parking (business)
     * Car insurance
     ${vehicleVat.recoverable ? '* Electric vehicle = full VAT recovery!' : '* ICE/Hybrid = no VAT recovery (Austrian rule)'}
   
   - meals: 50% income tax, ${kleinunternehmer ? 'NO' : '100%'} VAT recovery:
     * Business meals with clients
     * Restaurant expenses for business purposes
   
   - telecom: ${telecomPercent}% for both EST and VAT:
     * Mobile phone (A1, Magenta, Drei, spusu, etc.)
     * Internet (${telecomPercent}% business use)
   
   - none: Not deductible (personal):
     * Entertainment (Netflix, Spotify, streaming)
     * Groceries
     * Personal restaurants (not business meals)
     * Cosmetics, personal care
     * Health supplements
     * Candy/sweets shops
   
   - unclear: Needs manual review:
     * Amazon (could be business or personal)
     * General electronics stores (MediaMarkt, Saturn)
     * Mixed-use items

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
  "deductible": "full"|"vehicle"|"meals"|"telecom"|"none"|"unclear",
  "deductible_reason": "brief explanation",
  "income_tax_percent": number or null (100 for full/vehicle, 50 for meals/telecom, 0 for none),
  "vat_recoverable": true/false/null (false for vehicle!, true for meals despite 50% EST),
  "confidence": "high"|"medium"|"low",
  "notes": "any relevant notes"
}]`;
}

/**
 * Analyze emails for invoice classification
 * @param {Object[]} emails - Emails to analyze
 * @param {Object} [options] - Options
 * @param {string} [options.modelOverride] - Override model ID (e.g., 'claude-opus-4-5')
 * @returns {Promise<{results: Object[], usage: Object, model: string, provider: string}>}
 */
export async function analyzeEmailsForInvoices(emails, options = {}) {
  // Check authentication first
  const authError = await checkAuth();
  if (authError) {
    console.error(authError);
    throw new Error('Authentication required. Run `pi` and use `/login` to authenticate.');
  }
  
  // Fetch email bodies (cached) if account is provided
  const account = options.account;
  let enrichedEmails = emails;
  
  if (account) {
    const messageIds = emails.map(e => e.id);
    const bodies = await getEmailBodiesBatch(account, messageIds, 4);
    
    enrichedEmails = emails.map(e => {
      const body = bodies.get(e.id);
      return {
        ...e,
        bodyPreview: body ? getTruncatedBody(body.textBody, body.htmlBody, 1024) : null,
      };
    });
  }
  
  const prompt = buildClassificationPrompt(enrichedEmails);
  
  try {
    const { output, usage, model, provider } = await simplePrompt(prompt, 'emailClassification', options.modelOverride);
    
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
    
    const results = JSON.parse(jsonStr);
    return { results, usage, model, provider };
  } catch (error) {
    console.error('Error analyzing emails:', error.message);
    // Return empty analysis on error
    return {
      results: emails.map(e => ({
        id: e.id,
        has_invoice: false,
        invoice_type: 'none',
        confidence: 'low',
        notes: `Analysis failed: ${error.message}`,
      })),
      usage: emptyUsage(),
      model: 'unknown',
      provider: 'unknown',
    };
  }
}

// Browser download is now handled directly in src/lib/browser.js
