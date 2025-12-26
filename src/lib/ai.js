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
import { getModelForTask, MODEL_CONFIG } from './models.js';
import { loadConfig, getVehicleVatRecovery, getTelecomBusinessPercent, isKleinunternehmer } from './config.js';

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
 */
async function simplePrompt(prompt, task = 'emailClassification') {
  const { authStorage, modelRegistry } = initAuth();
  
  const taskConfig = getModelForTask(task);
  if (!taskConfig) {
    throw new Error(`Unknown task: ${task}`);
  }
  
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    authStorage,
    modelRegistry,
    model: taskConfig.model,
    thinkingLevel: taskConfig.thinkingLevel,
    tools: [], // No tools for simple classification
    skills: [],
    hooks: [],
    contextFiles: [],
    systemPrompt: 'You are a data extraction assistant. Always respond with valid JSON only, no markdown formatting, no explanation.',
  });
  
  let output = '';
  
  session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
    }
  });
  
  try {
    await session.prompt(prompt);
    return output.trim();
  } finally {
    session.dispose();
  }
}

/**
 * Build the email classification prompt with user config context
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

USER CONFIGURATION:
- ${vehicleContext}
- ${vatContext}
- Telecom/internet business use: ${telecomPercent}%

For each email, determine:
1. Does it contain an invoice? (yes/no/uncertain)
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
 */
export async function analyzeEmailsForInvoices(emails) {
  // Check authentication first
  const authError = await checkAuth();
  if (authError) {
    console.error(authError);
    throw new Error('Authentication required. Run `pi` and use `/login` to authenticate.');
  }
  
  const prompt = buildClassificationPrompt(emails);
  
  try {
    const result = await simplePrompt(prompt, 'emailClassification');
    
    // Extract JSON from response (it might have markdown code blocks)
    let jsonStr = result;
    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Try to find JSON array in the output
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error analyzing emails:', error.message);
    // Return empty analysis on error
    return emails.map(e => ({
      id: e.id,
      has_invoice: false,
      invoice_type: 'none',
      confidence: 'low',
      notes: `Analysis failed: ${error.message}`,
    }));
  }
}

/**
 * Download invoice via browser automation
 * This still uses a full agent session with tools
 */
export async function downloadInvoiceWithBrowser(email, outputPath) {
  const authError = await checkAuth();
  if (authError) {
    console.error(authError);
    throw new Error('Authentication required');
  }
  
  const { authStorage, modelRegistry } = initAuth();
  const taskConfig = getModelForTask('browserDownload');
  
  if (!taskConfig) {
    throw new Error('Browser download task not configured');
  }
  
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    authStorage,
    modelRegistry,
    model: taskConfig.model,
    thinkingLevel: taskConfig.thinkingLevel,
    // Use default tools for browser operations
  });
  
  let output = '';
  
  session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
    }
  });
  
  const prompt = `Download the invoice from this email.

Email details:
- Subject: ${email.subject}
- From: ${email.sender}
- Date: ${email.date}
- Body/Notes: ${email.notes || email.snippet}

Instructions:
1. Use the browser skill to navigate to any invoice download link
2. If login is required, note it and skip (don't try to log in)
3. If invoice PDF is available, download it to: ${outputPath}
4. If there's no downloadable invoice, explain why

Return ONLY valid JSON (no markdown):
{
  "success": true/false,
  "path": "path to downloaded file or null",
  "needs_login": true/false,
  "login_url": "URL if login needed",
  "error": "error message if failed"
}`;

  try {
    await session.prompt(prompt);
    
    // Extract JSON from output
    let jsonStr = output;
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }
    
    return JSON.parse(jsonStr);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    session.dispose();
  }
}
