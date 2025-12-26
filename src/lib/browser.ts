/**
 * Browser automation for downloading invoices from web portals
 * 
 * Uses puppeteer-core to control Chrome via DevTools protocol.
 * Based on the browser skill from pi-mono.
 */

import puppeteer, { Browser, Page, CDPSession } from 'puppeteer-core';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DownloadResult } from '../types.js';

interface StartBrowserOptions {
  port?: number;
  profileDir?: string;
  headless?: boolean;
  copyProfile?: boolean;
}

interface NavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

interface WaitForDownloadOptions {
  timeout?: number;
  expectedExtension?: string;
}

interface DownloadInvoiceOptions {
  timeout?: number;
}

interface InteractiveDownloadOptions {
  timeout?: number;
}

const DEFAULT_PORT = 9222;
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.cache', 'kraxler-browser');
const DEFAULT_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  '/usr/bin/google-chrome', // Linux
  '/usr/bin/chromium-browser', // Linux alt
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows x86
];

let browserInstance: Browser | null = null;
let chromeProcess: child_process.ChildProcess | null = null;

/**
 * Find Chrome binary path
 */
function findChrome(): string {
  for (const chromePath of DEFAULT_CHROME_PATHS) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  throw new Error('Chrome not found. Please install Google Chrome.');
}

/**
 * Start Chrome with remote debugging enabled
 */
export async function startBrowser(options: StartBrowserOptions = {}): Promise<Browser> {
  const {
    port = DEFAULT_PORT,
    profileDir = DEFAULT_PROFILE_DIR,
    headless = false,
    copyProfile = false,
  } = options;

  // Check if already running
  if (browserInstance) {
    return browserInstance;
  }

  // Try to connect to existing Chrome
  try {
    browserInstance = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
      defaultViewport: null,
    });
    console.log(`  Connected to existing Chrome on port ${port}`);
    return browserInstance;
  } catch {
    // Need to start Chrome
  }

  const chromePath = findChrome();
  
  // Ensure profile directory exists
  fs.mkdirSync(profileDir, { recursive: true });

  // Copy default profile if requested
  if (copyProfile && process.platform === 'darwin') {
    const source = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    if (fs.existsSync(source)) {
      try {
        child_process.execSync(`rsync -a --delete "${source}/" "${profileDir}/"`, { stdio: 'ignore' });
      } catch {
        // Ignore rsync errors
      }
    }
  }

  // Start Chrome
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--disable-popup-blocking',
    '--disable-default-apps',
  ];

  if (headless) {
    args.push('--headless=new');
  }

  chromeProcess = child_process.spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
  });
  chromeProcess.unref();

  // Wait for Chrome to start
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      browserInstance = await puppeteer.connect({
        browserURL: `http://localhost:${port}`,
        defaultViewport: null,
      });
      console.log(`  Chrome started on port ${port}`);
      return browserInstance;
    } catch {
      await new Promise<void>(r => setTimeout(r, 500));
    }
  }

  throw new Error('Failed to start Chrome');
}

/**
 * Get the active page or create a new one
 */
export async function getPage(browser: Browser): Promise<Page> {
  const pages = await browser.pages();
  if (pages.length > 0) {
    return pages[pages.length - 1];
  }
  return browser.newPage();
}

/**
 * Navigate to URL and wait for load
 */
export async function navigateTo(page: Page, url: string, options: NavigateOptions = {}): Promise<void> {
  const { waitUntil = 'domcontentloaded', timeout = 30000 } = options;
  await page.goto(url, { waitUntil, timeout });
}

/**
 * Set up download handling
 */
export async function setupDownloads(page: Page, downloadPath: string): Promise<CDPSession> {
  fs.mkdirSync(downloadPath, { recursive: true });
  
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });
  
  return client;
}

/**
 * Wait for a file to appear in the download directory
 */
export async function waitForDownload(downloadPath: string, options: WaitForDownloadOptions = {}): Promise<string> {
  const { timeout = 30000, expectedExtension = '.pdf' } = options;
  const startTime = Date.now();
  const existingFiles = new Set(fs.readdirSync(downloadPath));

  while (Date.now() - startTime < timeout) {
    const currentFiles = fs.readdirSync(downloadPath);
    
    for (const file of currentFiles) {
      if (!existingFiles.has(file) && !file.endsWith('.crdownload')) {
        if (!expectedExtension || file.endsWith(expectedExtension)) {
          return path.join(downloadPath, file);
        }
      }
    }
    
    await new Promise<void>(r => setTimeout(r, 500));
  }
  
  throw new Error(`Download timeout after ${timeout}ms`);
}

/**
 * Take a screenshot for debugging
 */
export async function screenshot(page: Page, outputPath?: string): Promise<string> {
  const screenshotPath = outputPath || path.join(os.tmpdir(), `kraxler-screenshot-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}

/**
 * Close the browser
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    browserInstance = null;
  }
}

/**
 * Kill Chrome processes on the debugging port
 */
export function killChrome(port: number = DEFAULT_PORT): void {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      child_process.execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Download an invoice from a URL
 */
export async function downloadInvoice(url: string, outputPath: string, options: DownloadInvoiceOptions = {}): Promise<DownloadResult> {
  const { timeout = 60000 } = options;
  
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    browser = await startBrowser({ headless: false }); // Non-headless to handle login if needed
    page = await getPage(browser);
    
    const downloadDir = path.dirname(outputPath);
    await setupDownloads(page, downloadDir);
    
    console.log(`  Navigating to: ${url}`);
    await navigateTo(page, url, { timeout });
    
    // Wait a bit for any redirects
    await new Promise<void>(r => setTimeout(r, 2000));
    
    // Check if we hit a login page
    const currentUrl = page.url();
    const pageContent = await page.content();
    
    const loginIndicators = [
      'login', 'signin', 'sign-in', 'anmelden', 'einloggen',
      'password', 'passwort', 'username', 'benutzername',
    ];
    
    const isLoginPage = loginIndicators.some(indicator => 
      currentUrl.toLowerCase().includes(indicator) ||
      pageContent.toLowerCase().includes(`type="password"`)
    );
    
    if (isLoginPage) {
      return {
        success: false,
        needsLogin: true,
        loginUrl: currentUrl,
        error: 'Login required',
      };
    }
    
    // Check if it's a direct PDF download
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentType = await page.evaluate('document.contentType') as string | undefined;
    if (contentType === 'application/pdf') {
      // Save the PDF directly
      const pdfBuffer = await page.pdf();
      fs.writeFileSync(outputPath, pdfBuffer);
      return { success: true, path: outputPath };
    }
    
    // Look for download links/buttons
    const downloadSelectors = [
      'a[href*=".pdf"]',
      'a[href*="download"]',
      'button[class*="download"]',
      'a[class*="download"]',
      '[data-action="download"]',
      'a:has-text("Download")',
      'button:has-text("Download")',
      'a:has-text("PDF")',
    ];
    
    for (const selector of downloadSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`  Found download element: ${selector}`);
          await element.click();
          
          // Wait for download
          const downloadedFile = await waitForDownload(downloadDir, { timeout: 30000 });
          
          // Rename to target path
          if (downloadedFile !== outputPath) {
            fs.renameSync(downloadedFile, outputPath);
          }
          
          return { success: true, path: outputPath };
        }
      } catch {
        // Try next selector
      }
    }
    
    // If no download button found, try to print page as PDF
    console.log('  No download button found, saving page as PDF...');
    await page.pdf({ path: outputPath, format: 'A4' });
    return { success: true, path: outputPath, note: 'Saved as page PDF' };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Interactive download with user assistance
 * Opens browser and waits for user to complete any login/captcha
 */
export async function interactiveDownload(url: string, outputPath: string, options: InteractiveDownloadOptions = {}): Promise<DownloadResult> {
  const { timeout = 300000 } = options; // 5 minute timeout for user interaction
  
  let browser: Browser | null = null;
  
  try {
    browser = await startBrowser({ headless: false, copyProfile: true });
    const page = await getPage(browser);
    
    const downloadDir = path.dirname(outputPath);
    await setupDownloads(page, downloadDir);
    
    console.log(`\n  🌐 Browser opened. Navigate to download the invoice.`);
    console.log(`  URL: ${url}`);
    console.log(`  The browser will detect when a PDF is downloaded.\n`);
    
    await navigateTo(page, url);
    
    // Wait for download
    try {
      const downloadedFile = await waitForDownload(downloadDir, { timeout });
      
      if (downloadedFile !== outputPath) {
        fs.renameSync(downloadedFile, outputPath);
      }
      
      return { success: true, path: outputPath };
    } catch {
      return {
        success: false,
        error: 'Download timeout - no PDF detected',
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
