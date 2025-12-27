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

// Mock env-paths to use temp directories (for XDG paths)
vi.mock('env-paths', () => {
  return {
    default: () => ({
      config: `${tmpdir()}/kraxler-test-mock/xdg-config`,
      cache: `${tmpdir()}/kraxler-test-mock/xdg-cache`,
    }),
  };
});

// Import after mocks are set up
import {
  ensureDir,
  getConfigDir,
  getCacheDir,
  getAuthPath,
  getDatabasePath,
  getConfigPath,
  getInvoicesDir,
  getReportsDir,
  getWorkDir,
  setWorkDir,
  getAllPaths,
} from './paths.js';

describe('paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset workdir by setting it to undefined (hacky but works for tests)
    // In real code, workdir persists for the session
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

  describe('XDG paths (system-wide)', () => {
    it('getConfigDir returns XDG config path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getConfigDir();

      expect(result).toBe(path.join(tempBase, 'xdg-config'));
    });

    it('getCacheDir returns XDG cache path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getCacheDir();

      expect(result).toBe(path.join(tempBase, 'xdg-cache'));
    });

    it('getAuthPath returns auth.json in XDG config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getAuthPath();

      expect(result).toBe(path.join(tempBase, 'xdg-config', 'auth.json'));
    });
  });

  describe('Working directory paths', () => {
    it('getWorkDir defaults to cwd', () => {
      const result = getWorkDir();
      expect(result).toBe(process.cwd());
    });

    it('getDatabasePath returns kraxler.db in workdir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getDatabasePath();

      expect(result).toBe(path.join(process.cwd(), 'kraxler.db'));
    });

    it('getConfigPath returns kraxler.json in workdir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getConfigPath();

      expect(result).toBe(path.join(process.cwd(), 'kraxler.json'));
    });

    it('getInvoicesDir returns invoices/ in workdir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getInvoicesDir();

      expect(result).toBe(path.join(process.cwd(), 'invoices'));
    });

    it('getReportsDir returns reports/ in workdir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getReportsDir();

      expect(result).toBe(path.join(process.cwd(), 'reports'));
    });
  });

  describe('setWorkDir', () => {
    it('changes workdir for subsequent calls', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const customDir = '/custom/work/dir';
      setWorkDir(customDir);

      expect(getWorkDir()).toBe(customDir);
      expect(getDatabasePath()).toBe(path.join(customDir, 'kraxler.db'));
      expect(getConfigPath()).toBe(path.join(customDir, 'kraxler.json'));
    });
  });

  describe('getAllPaths', () => {
    it('returns all expected keys', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = getAllPaths();

      expect(result).toHaveProperty('workDir');
      expect(result).toHaveProperty('database');
      expect(result).toHaveProperty('configFile');
      expect(result).toHaveProperty('invoices');
      expect(result).toHaveProperty('reports');
      expect(result).toHaveProperty('authFile');
      expect(result).toHaveProperty('cache');
    });
  });
});
