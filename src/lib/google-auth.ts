/**
 * Google OAuth2 Authentication Handler
 *
 * Manages credentials and tokens for Gmail API access.
 * Replaces the external gogcli authentication.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { getConfigDir, getAuthPath } from './paths.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];
const AUTH_FILE = getAuthPath();

interface AuthConfig {
  credentials?: {
    clientId: string;
    clientSecret: string;
  };
  tokens: Record<string, Credentials>;
}

/**
 * Load auth config from disk
 */
function loadAuthConfig(): AuthConfig {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    } catch {
      console.error('Error parsing auth config, resetting...');
    }
  }
  return { tokens: {} };
}

/**
 * Save auth config to disk
 */
function saveAuthConfig(config: AuthConfig): void {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2));
}

/**
 * Prompt user for input
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Setup client credentials (one-time setup)
 */
async function setupCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  GOOGLE AUTHENTICATION SETUP                                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\nTo access your Gmail, you need to provide Google Cloud credentials.');
  console.log('We recommend creating a "Desktop" OAuth client ID in the Google Cloud Console.\n');
  console.log('1. Go to https://console.cloud.google.com/');
  console.log('2. Create a project (or use existing)');
  console.log('3. Enable "Gmail API"');
  console.log('4. Go to Credentials -> Create Credentials -> OAuth client ID');
  console.log('5. Application type: Desktop app');
  console.log('6. Copy Client ID and Client Secret\n');

  const clientId = await prompt('Enter Client ID: ');
  const clientSecret = await prompt('Enter Client Secret: ');

  if (!clientId || !clientSecret) {
    throw new Error('Client ID and Secret are required.');
  }

  const config = loadAuthConfig();
  config.credentials = { clientId, clientSecret };
  saveAuthConfig(config);
  
  return config.credentials;
}

/**
 * Get an authenticated OAuth2 client for a specific account.
 * If account is provided, tries to use cached tokens.
 * If not authenticated, triggers login flow.
 */
export async function getAuthClient(account: string): Promise<OAuth2Client> {
  const config = loadAuthConfig();
  
  // 1. Ensure we have client credentials
  let creds = config.credentials;
  if (!creds || !creds.clientId || !creds.clientSecret) {
    console.log(`\nAuthentication configuration missing for ${account}.`);
    creds = await setupCredentials();
  }

  const { clientId, clientSecret } = creds;

  // 2. Check for existing token for this account
  // Note: We might store tokens by email, but initially we might not know the email 
  // until we use the token. However, the caller usually requests a specific account.
  const savedToken = config.tokens[account];

  const client = new google.auth.OAuth2(clientId, clientSecret);

  if (savedToken) {
    client.setCredentials(savedToken);
    
    // Check if token needs refresh
    // google-auth-library handles auto-refresh if refresh_token is present
    // but we need to listen to 'tokens' event to save the new one?
    // Actually, `client.getAccessToken()` will refresh if needed.
    
    // We attach a listener to save refreshed tokens
    client.on('tokens', (tokens) => {
      const newTokens = { ...savedToken, ...tokens };
      config.tokens[account] = newTokens;
      saveAuthConfig(config);
    });
    
    return client;
  }

  // 3. No token found, start new auth flow
  console.log(`\nStarting authentication for ${account}...`);
  console.log('Your browser should open shortly to login to Google.');
  
  // Write temp credentials file for local-auth
  const tempCredsPath = path.join(getConfigDir(), 'temp_credentials.json');
  fs.writeFileSync(tempCredsPath, JSON.stringify({
    installed: {
      client_id: clientId,
      client_secret: clientSecret,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      redirect_uris: ["http://localhost"]
    }
  }));

  try {
    const localAuthClient = await authenticate({
      scopes: SCOPES,
      keyfilePath: tempCredsPath,
    });

    console.log('Got localAuthClient. Credentials present?', !!localAuthClient.credentials);
    
    let email: string | null = null;

    // Try to get email from ID token first
    if (localAuthClient.credentials.id_token) {
       const parts = localAuthClient.credentials.id_token.split('.');
       if (parts.length === 3) {
         try {
           const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
           if (payload.email) {
             email = payload.email;
             console.log('Got email from ID token:', email);
           }
         } catch (e) {
           console.error('Error parsing ID token:', e);
         }
       }
    }

    if (!email) {
      // Verify the email address matches via API
      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: localAuthClient as any });
        const userInfo = await oauth2.userinfo.get();
        email = userInfo.data.email || null;
      } catch (e) {
        console.error('Error fetching user info:', e);
        // Fallback: if we requested a specific account, assume it is that one if we can't verify
        if (account) {
          console.warn(`Could not verify email from API. Assuming it is ${account}.`);
          email = account;
        }
      }
    }

    if (!email) {
      throw new Error('Could not retrieve email address from Google.');
    }

    if (!email) {
      throw new Error('Could not retrieve email address from Google.');
    }

    if (account && email.toLowerCase() !== account.toLowerCase()) {
       console.warn(`\n⚠️  Warning: You logged in as ${email}, but requested ${account}.`);
       console.warn(`   Using ${email} for this session.`);
    }

    // Save the tokens
    const tokens = localAuthClient.credentials;
    config.tokens[email] = tokens;
    saveAuthConfig(config);
    
    // Create a fresh client with the tokens to return (avoids type mismatch issues)
    const newClient = new google.auth.OAuth2(clientId, clientSecret);
    newClient.setCredentials(tokens);
    
    newClient.on('tokens', (tokens) => {
      const current = config.tokens[email] || {};
      config.tokens[email] = { ...current, ...tokens };
      saveAuthConfig(config);
    });

    console.log(`\n✅ Successfully authenticated as ${email}\n`);
    
    return newClient;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempCredsPath)) {
      fs.unlinkSync(tempCredsPath);
    }
  }
}

/**
 * Check if we have valid credentials for an account (without prompting)
 */
export function hasValidToken(account: string): boolean {
  const config = loadAuthConfig();
  return !!config.tokens[account];
}

/**
 * List all authenticated accounts
 */
export function listAuthenticatedAccounts(): string[] {
  const config = loadAuthConfig();
  return Object.keys(config.tokens);
}
