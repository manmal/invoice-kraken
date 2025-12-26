/**
 * Cross-platform path management using XDG-compliant directories
 * 
 * This module provides consistent paths for:
 * - Data (SQLite database)
 * - Config (user preferences) 
 * - Cache (email content cache)
 * - Logs (future use)
 * 
 * Paths are stored in OS-standard locations:
 * - macOS: ~/Library/Application Support/kraxler, ~/Library/Preferences/kraxler, etc.
 * - Linux: ~/.local/share/kraxler, ~/.config/kraxler, ~/.cache/kraxler
 * - Windows: %LOCALAPPDATA%\kraxler\Data, etc.
 */

import envPaths from 'env-paths';
import * as path from 'path';
import * as fs from 'fs';

// Get XDG-compliant paths for 'kraxler'
// suffix: '' disables the default '-nodejs' suffix
const paths = envPaths('kraxler', { suffix: '' });

export interface AllPaths {
  data: string;
  config: string;
  cache: string;
  log: string;
  temp: string;
  database: string;
  configFile: string;
  invoices: string;
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Get the data directory path
 * Used for: SQLite database, persistent data
 */
export function getDataDir(): string {
  return ensureDir(paths.data);
}

/**
 * Get the config directory path
 * Used for: User preferences, settings
 */
export function getConfigDir(): string {
  return ensureDir(paths.config);
}

/**
 * Get the cache directory path
 * Used for: Email body cache, temporary data
 */
export function getCacheDir(): string {
  return ensureDir(paths.cache);
}

/**
 * Get the log directory path
 * Used for: Log files (future)
 */
export function getLogDir(): string {
  return ensureDir(paths.log);
}

/**
 * Get path to the main database file
 */
export function getDatabasePath(): string {
  return path.join(getDataDir(), 'kraxler.db');
}

/**
 * Get path to the config file
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Get the invoices output directory
 * This is special - it stays in cwd since users want invoices in their project
 */
export function getInvoicesDir(customPath?: string): string {
  const dir = customPath || path.join(process.cwd(), 'invoices');
  return ensureDir(dir);
}

/**
 * Get all paths for debugging/info display
 */
export function getAllPaths(): AllPaths {
  return {
    data: paths.data,
    config: paths.config,
    cache: paths.cache,
    log: paths.log,
    temp: paths.temp,
    database: getDatabasePath(),
    configFile: getConfigPath(),
    invoices: path.join(process.cwd(), 'invoices'),
  };
}

/**
 * Print all paths (for debugging)
 */
export function printPaths(): void {
  const allPaths = getAllPaths();
  console.log('\n📁 Kraxler storage locations:\n');
  console.log(`  Database:  ${allPaths.database}`);
  console.log(`  Config:    ${allPaths.configFile}`);
  console.log(`  Cache:     ${allPaths.cache}`);
  console.log(`  Invoices:  ${allPaths.invoices} (current directory)\n`);
}
