/**
 * Path Management
 * 
 * Two types of paths:
 * 1. Auth/Config: XDG-compliant system paths (per-user, not project-specific)
 * 2. Working directory: Project-specific data (db, invoices, reports)
 * 
 * The working directory can be set via:
 * - `--workdir` flag on any command
 * - `KRAXLER_WORKDIR` environment variable
 * - Defaults to current working directory
 */

import envPaths from 'env-paths';
import * as path from 'path';
import * as fs from 'fs';

// XDG paths for auth/credentials only
const xdgPaths = envPaths('kraxler', { suffix: '' });

// Runtime working directory (set via flag or env var)
let _workDir: string | null = null;

// ============================================================================
// Working Directory Management
// ============================================================================

/**
 * Set the working directory for this session.
 * Called early in CLI parsing when --workdir is provided.
 */
export function setWorkDir(dir: string): void {
  _workDir = path.resolve(dir);
  ensureDir(_workDir);
}

/**
 * Get the current working directory.
 * Priority: --workdir flag > KRAXLER_WORKDIR env > process.cwd()
 */
export function getWorkDir(): string {
  if (_workDir) {
    return _workDir;
  }
  if (process.env.KRAXLER_WORKDIR) {
    return ensureDir(path.resolve(process.env.KRAXLER_WORKDIR));
  }
  return process.cwd();
}

// ============================================================================
// Directory Helpers
// ============================================================================

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// ============================================================================
// Auth/Config Paths (XDG - system-wide per user)
// ============================================================================

/**
 * Get the config directory path (XDG)
 * Used for: Auth tokens, credentials, user preferences
 */
export function getConfigDir(): string {
  return ensureDir(xdgPaths.config);
}

/**
 * Get the cache directory path (XDG)
 * Used for: Email body cache, temporary data
 */
export function getCacheDir(): string {
  return ensureDir(xdgPaths.cache);
}

/**
 * Get path to the auth file (Google OAuth tokens)
 */
export function getAuthPath(): string {
  return path.join(getConfigDir(), 'auth.json');
}

// ============================================================================
// Working Directory Paths (project-specific)
// ============================================================================

/**
 * Get path to the database file (in working dir)
 */
export function getDatabasePath(): string {
  return path.join(getWorkDir(), 'kraxler.db');
}

/**
 * Get path to the config file (in working dir)
 * Note: This is project config (situations, sources), not auth
 */
export function getConfigPath(): string {
  return path.join(getWorkDir(), 'kraxler.json');
}

/**
 * Get the invoices output directory (in working dir)
 */
export function getInvoicesDir(): string {
  return ensureDir(path.join(getWorkDir(), 'invoices'));
}

/**
 * Get the reports output directory (in working dir)
 */
export function getReportsDir(): string {
  return ensureDir(path.join(getWorkDir(), 'reports'));
}

// ============================================================================
// Path Info
// ============================================================================

export interface AllPaths {
  // Working directory paths
  workDir: string;
  database: string;
  configFile: string;
  invoices: string;
  reports: string;
  
  // System paths (XDG)
  authFile: string;
  cache: string;
}

/**
 * Get all paths for debugging/info display
 */
export function getAllPaths(): AllPaths {
  return {
    workDir: getWorkDir(),
    database: getDatabasePath(),
    configFile: getConfigPath(),
    invoices: getInvoicesDir(),
    reports: getReportsDir(),
    authFile: getAuthPath(),
    cache: getCacheDir(),
  };
}

/**
 * Print all paths (for debugging)
 */
export function printPaths(): void {
  const p = getAllPaths();
  const isCustomWorkDir = _workDir !== null || !!process.env.KRAXLER_WORKDIR;
  
  console.log('\n📁 Kraxler storage locations:\n');
  console.log('  Working directory:');
  console.log(`    ${p.workDir}${isCustomWorkDir ? '' : ' (current dir)'}`);
  console.log(`    ├── kraxler.db      (database)`);
  console.log(`    ├── kraxler.json    (config)`);
  console.log(`    ├── invoices/       (downloaded PDFs)`);
  console.log(`    └── reports/        (generated reports)`);
  console.log();
  console.log('  System (per-user):');
  console.log(`    ${p.authFile}  (Google OAuth)`);
  console.log(`    ${p.cache}  (email cache)`);
  console.log();
  
  if (!isCustomWorkDir) {
    console.log('  💡 Tip: Use --workdir <path> or KRAXLER_WORKDIR to change working directory\n');
  }
}
