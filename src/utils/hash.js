/**
 * File hashing utilities
 */

import { createHash } from 'crypto';
import fs from 'fs';

/**
 * Compute SHA256 hash of a file
 */
export function hashFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Compute SHA256 hash of a buffer
 */
export function hashBuffer(buffer) {
  const hashSum = createHash('sha256');
  hashSum.update(buffer);
  return hashSum.digest('hex');
}

/**
 * Compute SHA256 hash of a string
 */
export function hashString(str) {
  const hashSum = createHash('sha256');
  hashSum.update(str);
  return hashSum.digest('hex');
}
