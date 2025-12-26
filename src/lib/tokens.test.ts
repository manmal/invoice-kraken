/**
 * Tests for token usage utilities
 */

import { describe, it, expect } from 'vitest';
import {
  emptyUsage,
  addUsage,
  aggregateUsage,
  formatTokens,
  formatCost,
  type Usage,
} from './tokens.js';

describe('emptyUsage', () => {
  it('returns correct structure with all zeros', () => {
    const usage = emptyUsage();

    expect(usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    });
  });

  it('returns a new object each time', () => {
    const usage1 = emptyUsage();
    const usage2 = emptyUsage();

    expect(usage1).not.toBe(usage2);
    expect(usage1.cost).not.toBe(usage2.cost);
  });
});

describe('addUsage', () => {
  it('accumulates tokens correctly', () => {
    const acc = emptyUsage();
    const usage: Partial<Usage> = {
      input: 100,
      output: 50,
      cacheRead: 25,
      cacheWrite: 10,
      totalTokens: 185,
      cost: {
        input: 0.001,
        output: 0.002,
        cacheRead: 0.0005,
        cacheWrite: 0.0003,
        total: 0.0038,
      },
    };

    addUsage(acc, usage);

    expect(acc.input).toBe(100);
    expect(acc.output).toBe(50);
    expect(acc.cacheRead).toBe(25);
    expect(acc.cacheWrite).toBe(10);
    expect(acc.totalTokens).toBe(185);
    expect(acc.cost.input).toBe(0.001);
    expect(acc.cost.output).toBe(0.002);
    expect(acc.cost.cacheRead).toBe(0.0005);
    expect(acc.cost.cacheWrite).toBe(0.0003);
    expect(acc.cost.total).toBe(0.0038);
  });

  it('accumulates multiple usages correctly', () => {
    const acc = emptyUsage();
    const usage1: Partial<Usage> = {
      input: 100,
      output: 50,
      totalTokens: 150,
      cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
    };
    const usage2: Partial<Usage> = {
      input: 200,
      output: 100,
      totalTokens: 300,
      cost: { input: 0.002, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.006 },
    };

    addUsage(acc, usage1);
    addUsage(acc, usage2);

    expect(acc.input).toBe(300);
    expect(acc.output).toBe(150);
    expect(acc.totalTokens).toBe(450);
    expect(acc.cost.total).toBeCloseTo(0.009);
  });

  it('handles null usage', () => {
    const acc = emptyUsage();
    acc.input = 100;

    const result = addUsage(acc, null);

    expect(result).toBe(acc);
    expect(acc.input).toBe(100);
  });

  it('handles undefined usage', () => {
    const acc = emptyUsage();
    acc.output = 50;

    const result = addUsage(acc, undefined);

    expect(result).toBe(acc);
    expect(acc.output).toBe(50);
  });

  it('handles partial usage without cost', () => {
    const acc = emptyUsage();
    const usage: Partial<Usage> = {
      input: 100,
      output: 50,
    };

    addUsage(acc, usage);

    expect(acc.input).toBe(100);
    expect(acc.output).toBe(50);
    expect(acc.cost.total).toBe(0);
  });

  it('handles usage with missing fields', () => {
    const acc = emptyUsage();
    const usage: Partial<Usage> = {
      input: 100,
      // output, cacheRead, cacheWrite, totalTokens missing
    };

    addUsage(acc, usage);

    expect(acc.input).toBe(100);
    expect(acc.output).toBe(0);
    expect(acc.cacheRead).toBe(0);
    expect(acc.cacheWrite).toBe(0);
    expect(acc.totalTokens).toBe(0);
  });

  it('mutates and returns the accumulator', () => {
    const acc = emptyUsage();
    const usage: Partial<Usage> = { input: 100 };

    const result = addUsage(acc, usage);

    expect(result).toBe(acc);
    expect(result.input).toBe(100);
  });
});

describe('aggregateUsage', () => {
  it('combines multiple usages', () => {
    const usages: Array<Partial<Usage>> = [
      {
        input: 100,
        output: 50,
        totalTokens: 150,
        cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
      },
      {
        input: 200,
        output: 100,
        totalTokens: 300,
        cost: { input: 0.002, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.006 },
      },
      {
        input: 50,
        output: 25,
        cacheRead: 1000,
        totalTokens: 1075,
        cost: {
          input: 0.0005,
          output: 0.001,
          cacheRead: 0.0001,
          cacheWrite: 0,
          total: 0.0016,
        },
      },
    ];

    const result = aggregateUsage(usages);

    expect(result.input).toBe(350);
    expect(result.output).toBe(175);
    expect(result.cacheRead).toBe(1000);
    expect(result.totalTokens).toBe(1525);
    expect(result.cost.total).toBeCloseTo(0.0106);
  });

  it('handles empty array', () => {
    const result = aggregateUsage([]);

    expect(result).toEqual(emptyUsage());
  });

  it('handles array with null and undefined values', () => {
    const usages: Array<Partial<Usage> | null | undefined> = [
      { input: 100, output: 50 },
      null,
      undefined,
      { input: 200, output: 100 },
    ];

    const result = aggregateUsage(usages);

    expect(result.input).toBe(300);
    expect(result.output).toBe(150);
  });

  it('returns a new usage object', () => {
    const usages = [{ input: 100 }];
    const result = aggregateUsage(usages);

    expect(result).not.toBe(usages[0]);
  });
});

describe('formatTokens', () => {
  it('formats numbers under 1000 as-is', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(1)).toBe('1');
    expect(formatTokens(999)).toBe('999');
  });

  it('formats 1000-9999 with one decimal place and k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1234)).toBe('1.2k');
    expect(formatTokens(1256)).toBe('1.3k');
    expect(formatTokens(5500)).toBe('5.5k');
    expect(formatTokens(9999)).toBe('10.0k');
  });

  it('formats 10000-999999 with rounded k suffix', () => {
    expect(formatTokens(10000)).toBe('10k');
    expect(formatTokens(12345)).toBe('12k');
    expect(formatTokens(99999)).toBe('100k');
    expect(formatTokens(500000)).toBe('500k');
    expect(formatTokens(999999)).toBe('1000k');
  });

  it('formats 1000000+ with one decimal place and M suffix', () => {
    expect(formatTokens(1000000)).toBe('1.0M');
    expect(formatTokens(1500000)).toBe('1.5M');
    expect(formatTokens(10000000)).toBe('10.0M');
    expect(formatTokens(123456789)).toBe('123.5M');
  });
});

describe('formatCost', () => {
  it('formats very small costs as $0.00', () => {
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(0.00001)).toBe('$0.00');
    expect(formatCost(0.00009)).toBe('$0.00');
    expect(formatCost(0.000099)).toBe('$0.00');
  });

  it('formats costs between $0.0001 and $0.01 with 4 decimal places', () => {
    expect(formatCost(0.0001)).toBe('$0.0001');
    expect(formatCost(0.0005)).toBe('$0.0005');
    expect(formatCost(0.001)).toBe('$0.0010');
    expect(formatCost(0.00999)).toBe('$0.0100');
  });

  it('formats costs between $0.01 and $1 with 3 decimal places', () => {
    expect(formatCost(0.01)).toBe('$0.010');
    expect(formatCost(0.05)).toBe('$0.050');
    expect(formatCost(0.123)).toBe('$0.123');
    expect(formatCost(0.999)).toBe('$0.999');
  });

  it('formats costs $1 and above with 2 decimal places', () => {
    expect(formatCost(1)).toBe('$1.00');
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(10.99)).toBe('$10.99');
    expect(formatCost(100.123)).toBe('$100.12');
    expect(formatCost(1000)).toBe('$1000.00');
  });
});
