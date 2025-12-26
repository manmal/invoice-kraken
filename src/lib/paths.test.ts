import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const tempBase = path.join(tmpdir(), 'kraxler-test-mock');

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock env-paths to use temp directories
vi.mock('env-paths', () => {
  const tempBase = require('path').join(
    require('os').tmpdir(),
    'kraxler-test-mock'
  );
  return {
    default: () => ({
      data: require('path').join(tempBase, 'data'),
      config: require('path').join(tempBase, 'config'),
      cache: require('path').join(tempBase, 'cache'),
      log: require('path').join(tempBase, 'log'),
      temp: require('path').join(tempBase, 'temp'),
    }),
  };
});

// Import after mocks are set up
import {
  ensureDir,
  getDataDir,
  getConfigDir,
  getDatabasePath,
  getConfigPath,
  getInvoicesDir,
  getAllPaths,
} from './paths.js';

describe('paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureDir', () => {
    it('creates directory when it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = ensureDir('/some/test/path');

      expect(fs.existsSync).toHaveBeenCalledWith('/some/test/path');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/some/test/path', {
        recursive: true,
      });
      expect(result).toBe('/some/test/path');
    });

    it('does not create directory when it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = ensureDir('/existing/path');

      expect(fs.existsSync).toHaveBeenCalledWith('/existing/path');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(result).toBe('/existing/path');
    });
  });

  describe('getDataDir', () => {
    it('returns correct path and ensures directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getDataDir();

      expect(result).toBe(path.join(tempBase, 'data'));
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('getConfigDir', () => {
    it('returns correct path and ensures directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getConfigDir();

      expect(result).toBe(path.join(tempBase, 'config'));
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('getDatabasePath', () => {
    it('returns correct path with kraxler.db filename', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getDatabasePath();

      expect(result).toBe(path.join(tempBase, 'data', 'kraxler.db'));
    });
  });

  describe('getConfigPath', () => {
    it('returns correct path with config.json filename', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getConfigPath();

      expect(result).toBe(path.join(tempBase, 'config', 'config.json'));
    });
  });

  describe('getInvoicesDir', () => {
    it('uses cwd by default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const expectedPath = path.join(process.cwd(), 'invoices');

      const result = getInvoicesDir();

      expect(result).toBe(expectedPath);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    });

    it('uses custom path when provided', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const customPath = '/custom/invoice/path';

      const result = getInvoicesDir(customPath);

      expect(result).toBe(customPath);
      expect(fs.existsSync).toHaveBeenCalledWith(customPath);
    });
  });

  describe('getAllPaths', () => {
    it('returns all expected keys', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getAllPaths();

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('cache');
      expect(result).toHaveProperty('log');
      expect(result).toHaveProperty('temp');
      expect(result).toHaveProperty('database');
      expect(result).toHaveProperty('configFile');
      expect(result).toHaveProperty('invoices');
    });

    it('returns correct path values', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getAllPaths();

      expect(result.data).toBe(path.join(tempBase, 'data'));
      expect(result.config).toBe(path.join(tempBase, 'config'));
      expect(result.cache).toBe(path.join(tempBase, 'cache'));
      expect(result.log).toBe(path.join(tempBase, 'log'));
      expect(result.temp).toBe(path.join(tempBase, 'temp'));
      expect(result.database).toBe(path.join(tempBase, 'data', 'kraxler.db'));
      expect(result.configFile).toBe(
        path.join(tempBase, 'config', 'config.json')
      );
      expect(result.invoices).toBe(path.join(process.cwd(), 'invoices'));
    });
  });
});
