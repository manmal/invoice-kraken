import { describe, it, expect } from 'vitest';
import {
  parseDateRange,
  formatDate,
  getYearMonth,
  iterateMonths,
  isInRange,
} from './dates.js';

describe('parseDateRange', () => {
  describe('--year option', () => {
    it('parses a valid year', () => {
      const result = parseDateRange({ year: '2025' });

      expect(result.from).toEqual(new Date(2025, 0, 1));
      expect(result.to.getFullYear()).toBe(2025);
      expect(result.to.getMonth()).toBe(11);
      expect(result.to.getDate()).toBe(31);
      expect(result.to.getHours()).toBe(23);
      expect(result.to.getMinutes()).toBe(59);
      expect(result.display).toBe('2025');
    });

    it('parses year 2000', () => {
      const result = parseDateRange({ year: '2000' });

      expect(result.from).toEqual(new Date(2000, 0, 1));
      expect(result.display).toBe('2000');
    });

    it('parses year 2100', () => {
      const result = parseDateRange({ year: '2100' });

      expect(result.from).toEqual(new Date(2100, 0, 1));
      expect(result.display).toBe('2100');
    });

    it('throws for year before 2000', () => {
      expect(() => parseDateRange({ year: '1999' })).toThrow(
        'Invalid year. Use a 4-digit year (e.g., 2025).'
      );
    });

    it('throws for year after 2100', () => {
      expect(() => parseDateRange({ year: '2101' })).toThrow(
        'Invalid year. Use a 4-digit year (e.g., 2025).'
      );
    });

    it('throws for non-numeric year', () => {
      expect(() => parseDateRange({ year: 'abc' })).toThrow(
        'Invalid year. Use a 4-digit year (e.g., 2025).'
      );
    });
  });

  describe('--month option', () => {
    it('parses a valid month with two digits', () => {
      const result = parseDateRange({ month: '2025-12' });

      expect(result.from).toEqual(new Date(2025, 11, 1));
      expect(result.to.getFullYear()).toBe(2025);
      expect(result.to.getMonth()).toBe(11);
      expect(result.to.getDate()).toBe(31);
      expect(result.to.getHours()).toBe(23);
      expect(result.display).toBe('December 2025');
    });

    it('parses a valid month with single digit', () => {
      const result = parseDateRange({ month: '2025-1' });

      expect(result.from).toEqual(new Date(2025, 0, 1));
      expect(result.to.getMonth()).toBe(0);
      expect(result.to.getDate()).toBe(31);
      expect(result.display).toBe('January 2025');
    });

    it('handles February in a leap year', () => {
      const result = parseDateRange({ month: '2024-02' });

      expect(result.from).toEqual(new Date(2024, 1, 1));
      expect(result.to.getDate()).toBe(29); // Leap year
      expect(result.display).toBe('February 2024');
    });

    it('handles February in a non-leap year', () => {
      const result = parseDateRange({ month: '2025-02' });

      expect(result.from).toEqual(new Date(2025, 1, 1));
      expect(result.to.getDate()).toBe(28);
      expect(result.display).toBe('February 2025');
    });

    it('throws for invalid month format', () => {
      expect(() => parseDateRange({ month: '2025/12' })).toThrow(
        'Invalid month format. Use YYYY-MM (e.g., 2025-12).'
      );
    });

    it('throws for month 0', () => {
      expect(() => parseDateRange({ month: '2025-0' })).toThrow(
        'Month must be between 1 and 12.'
      );
    });

    it('throws for month 13', () => {
      expect(() => parseDateRange({ month: '2025-13' })).toThrow(
        'Month must be between 1 and 12.'
      );
    });

    it('throws for invalid month string', () => {
      expect(() => parseDateRange({ month: 'December' })).toThrow(
        'Invalid month format. Use YYYY-MM (e.g., 2025-12).'
      );
    });
  });

  describe('--quarter option', () => {
    it('parses Q1', () => {
      const result = parseDateRange({ quarter: '2025-Q1' });

      expect(result.from).toEqual(new Date(2025, 0, 1));
      expect(result.to.getMonth()).toBe(2); // March
      expect(result.to.getDate()).toBe(31);
      expect(result.display).toBe('Q1 2025');
    });

    it('parses Q2', () => {
      const result = parseDateRange({ quarter: '2025-Q2' });

      expect(result.from).toEqual(new Date(2025, 3, 1));
      expect(result.to.getMonth()).toBe(5); // June
      expect(result.to.getDate()).toBe(30);
      expect(result.display).toBe('Q2 2025');
    });

    it('parses Q3', () => {
      const result = parseDateRange({ quarter: '2025-Q3' });

      expect(result.from).toEqual(new Date(2025, 6, 1));
      expect(result.to.getMonth()).toBe(8); // September
      expect(result.to.getDate()).toBe(30);
      expect(result.display).toBe('Q3 2025');
    });

    it('parses Q4', () => {
      const result = parseDateRange({ quarter: '2025-Q4' });

      expect(result.from).toEqual(new Date(2025, 9, 1));
      expect(result.to.getMonth()).toBe(11); // December
      expect(result.to.getDate()).toBe(31);
      expect(result.display).toBe('Q4 2025');
    });

    it('parses lowercase q', () => {
      const result = parseDateRange({ quarter: '2025-q3' });

      expect(result.from).toEqual(new Date(2025, 6, 1));
      expect(result.display).toBe('Q3 2025');
    });

    it('throws for invalid quarter format', () => {
      expect(() => parseDateRange({ quarter: '2025Q1' })).toThrow(
        'Invalid quarter format. Use YYYY-Q# (e.g., 2025-Q4).'
      );
    });

    it('throws for Q0', () => {
      expect(() => parseDateRange({ quarter: '2025-Q0' })).toThrow(
        'Invalid quarter format. Use YYYY-Q# (e.g., 2025-Q4).'
      );
    });

    it('throws for Q5', () => {
      expect(() => parseDateRange({ quarter: '2025-Q5' })).toThrow(
        'Invalid quarter format. Use YYYY-Q# (e.g., 2025-Q4).'
      );
    });
  });

  describe('--from/--to options', () => {
    it('parses a valid date range', () => {
      const result = parseDateRange({ from: '2025-01-01', to: '2025-12-31' });

      expect(result.from).toEqual(new Date(2025, 0, 1));
      expect(result.to.getFullYear()).toBe(2025);
      expect(result.to.getMonth()).toBe(11);
      expect(result.to.getDate()).toBe(31);
      expect(result.to.getHours()).toBe(23);
      expect(result.display).toBe('2025-01-01 to 2025-12-31');
    });

    it('parses same day range', () => {
      const result = parseDateRange({ from: '2025-06-15', to: '2025-06-15' });

      expect(result.from).toEqual(new Date(2025, 5, 15));
      expect(result.to.getDate()).toBe(15);
      expect(result.display).toBe('2025-06-15 to 2025-06-15');
    });

    it('throws when from is after to', () => {
      expect(() =>
        parseDateRange({ from: '2025-12-31', to: '2025-01-01' })
      ).toThrow('--from date must be before --to date.');
    });

    it('throws for invalid from date format', () => {
      expect(() =>
        parseDateRange({ from: '01-01-2025', to: '2025-12-31' })
      ).toThrow('Invalid date format. Use YYYY-MM-DD.');
    });

    it('throws for invalid to date format', () => {
      expect(() =>
        parseDateRange({ from: '2025-01-01', to: 'Dec 31, 2025' })
      ).toThrow('Invalid date format. Use YYYY-MM-DD.');
    });

    it('throws for invalid date (Feb 30)', () => {
      expect(() =>
        parseDateRange({ from: '2025-02-30', to: '2025-12-31' })
      ).toThrow('Invalid date format. Use YYYY-MM-DD.');
    });

    it('throws for invalid date (month 13)', () => {
      expect(() =>
        parseDateRange({ from: '2025-13-01', to: '2025-12-31' })
      ).toThrow('Invalid date format. Use YYYY-MM-DD.');
    });
  });

  describe('error cases', () => {
    it('throws when no options provided', () => {
      expect(() => parseDateRange({})).toThrow(
        'Please specify a date range: --year, --month, --quarter, or --from/--to'
      );
    });

    it('throws when only from is provided', () => {
      expect(() => parseDateRange({ from: '2025-01-01' })).toThrow(
        'Please specify a date range: --year, --month, --quarter, or --from/--to'
      );
    });

    it('throws when only to is provided', () => {
      expect(() => parseDateRange({ to: '2025-12-31' })).toThrow(
        'Please specify a date range: --year, --month, --quarter, or --from/--to'
      );
    });
  });
});

describe('formatDate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(formatDate(new Date(2025, 0, 1))).toBe('2025-01-01');
  });

  it('pads single-digit month', () => {
    expect(formatDate(new Date(2025, 5, 15))).toBe('2025-06-15');
  });

  it('pads single-digit day', () => {
    expect(formatDate(new Date(2025, 11, 5))).toBe('2025-12-05');
  });

  it('handles December 31', () => {
    expect(formatDate(new Date(2025, 11, 31))).toBe('2025-12-31');
  });
});

describe('getYearMonth', () => {
  it('extracts year and month from a date', () => {
    const result = getYearMonth(new Date(2025, 11, 15));

    expect(result).toEqual({ year: 2025, month: 12 });
  });

  it('handles January', () => {
    const result = getYearMonth(new Date(2025, 0, 1));

    expect(result).toEqual({ year: 2025, month: 1 });
  });

  it('handles any day of month', () => {
    const result = getYearMonth(new Date(2025, 5, 30));

    expect(result).toEqual({ year: 2025, month: 6 });
  });
});

describe('iterateMonths', () => {
  it('iterates over a single month', () => {
    const from = new Date(2025, 5, 15);
    const to = new Date(2025, 5, 20);

    const months = [...iterateMonths(from, to)];

    expect(months).toEqual([{ year: 2025, month: 6 }]);
  });

  it('iterates over multiple months in same year', () => {
    const from = new Date(2025, 0, 1);
    const to = new Date(2025, 2, 31);

    const months = [...iterateMonths(from, to)];

    expect(months).toEqual([
      { year: 2025, month: 1 },
      { year: 2025, month: 2 },
      { year: 2025, month: 3 },
    ]);
  });

  it('iterates across year boundary', () => {
    const from = new Date(2024, 10, 1);
    const to = new Date(2025, 1, 28);

    const months = [...iterateMonths(from, to)];

    expect(months).toEqual([
      { year: 2024, month: 11 },
      { year: 2024, month: 12 },
      { year: 2025, month: 1 },
      { year: 2025, month: 2 },
    ]);
  });

  it('iterates over a full year', () => {
    const from = new Date(2025, 0, 1);
    const to = new Date(2025, 11, 31);

    const months = [...iterateMonths(from, to)];

    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2025, month: 1 });
    expect(months[11]).toEqual({ year: 2025, month: 12 });
  });

  it('handles same start and end date', () => {
    const date = new Date(2025, 6, 15);

    const months = [...iterateMonths(date, date)];

    expect(months).toEqual([{ year: 2025, month: 7 }]);
  });

  it('handles dates anywhere in the month', () => {
    const from = new Date(2025, 3, 28);
    const to = new Date(2025, 5, 3);

    const months = [...iterateMonths(from, to)];

    expect(months).toEqual([
      { year: 2025, month: 4 },
      { year: 2025, month: 5 },
      { year: 2025, month: 6 },
    ]);
  });
});

describe('isInRange', () => {
  const from = new Date(2025, 0, 1);
  const to = new Date(2025, 11, 31, 23, 59, 59, 999);

  describe('with Date objects', () => {
    it('returns true for date within range', () => {
      expect(isInRange(new Date(2025, 5, 15), from, to)).toBe(true);
    });

    it('returns true for date at start of range', () => {
      expect(isInRange(new Date(2025, 0, 1), from, to)).toBe(true);
    });

    it('returns true for date at end of range', () => {
      expect(isInRange(new Date(2025, 11, 31, 23, 59, 59, 999), from, to)).toBe(
        true
      );
    });

    it('returns false for date before range', () => {
      expect(isInRange(new Date(2024, 11, 31), from, to)).toBe(false);
    });

    it('returns false for date after range', () => {
      expect(isInRange(new Date(2026, 0, 1), from, to)).toBe(false);
    });
  });

  describe('with date strings', () => {
    it('returns true for ISO string within range', () => {
      expect(isInRange('2025-06-15', from, to)).toBe(true);
    });

    it('returns true for ISO datetime string within range', () => {
      expect(isInRange('2025-06-15T12:00:00Z', from, to)).toBe(true);
    });

    it('returns false for date string before range', () => {
      expect(isInRange('2024-12-31', from, to)).toBe(false);
    });

    it('returns false for date string after range', () => {
      expect(isInRange('2026-01-01', from, to)).toBe(false);
    });
  });
});
