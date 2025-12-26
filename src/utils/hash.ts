/**
 * File hashing utilities
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Compute SHA256 hash of a file
 */
export function hashFile(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Compute SHA256 hash of a buffer
 */
export function hashBuffer(buffer: Buffer): string {
  const hashSum = crypto.createHash('sha256');
  hashSum.update(buffer);
  return hashSum.digest('hex');
}

/**
 * Compute SHA256 hash of a string
 */
export function hashString(str: string): string {
  const hashSum = crypto.createHash('sha256');
  hashSum.update(str);
  return hashSum.digest('hex');
}
