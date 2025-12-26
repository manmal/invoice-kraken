/**
 * Date range utilities for flexible date filtering
 * 
 * Supports:
 * - --from YYYY-MM-DD --to YYYY-MM-DD (explicit range)
 * - --year 2025 (full year)
 * - --month 2025-12 (single month)
 * - --quarter 2025-Q4 (quarter)
 */

/**
 * Parse a date range from command options
 * 
 * @param {Object} options - Command options
 * @returns {{from: Date, to: Date, display: string}}
 */
export function parseDateRange(options) {
  const { from, to, year, month, quarter } = options;
  
  // Explicit date range
  if (from && to) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    
    if (!fromDate || !toDate) {
      throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }
    
    if (fromDate > toDate) {
      throw new Error('--from date must be before --to date.');
    }
    
    return {
      from: fromDate,
      to: endOfDay(toDate),
      display: `${formatDate(fromDate)} to ${formatDate(toDate)}`,
    };
  }
  
  // Single month: --month 2025-12
  if (month) {
    const match = month.match(/^(\d{4})-(\d{1,2})$/);
    if (!match) {
      throw new Error('Invalid month format. Use YYYY-MM (e.g., 2025-12).');
    }
    
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    
    if (m < 1 || m > 12) {
      throw new Error('Month must be between 1 and 12.');
    }
    
    const fromDate = new Date(y, m - 1, 1);
    const toDate = new Date(y, m, 0); // Last day of month
    
    return {
      from: fromDate,
      to: endOfDay(toDate),
      display: `${getMonthName(m)} ${y}`,
    };
  }
  
  // Quarter: --quarter 2025-Q4
  if (quarter) {
    const match = quarter.match(/^(\d{4})-Q([1-4])$/i);
    if (!match) {
      throw new Error('Invalid quarter format. Use YYYY-Q# (e.g., 2025-Q4).');
    }
    
    const y = parseInt(match[1], 10);
    const q = parseInt(match[2], 10);
    
    const startMonth = (q - 1) * 3; // 0, 3, 6, 9
    const fromDate = new Date(y, startMonth, 1);
    const toDate = new Date(y, startMonth + 3, 0); // Last day of quarter
    
    return {
      from: fromDate,
      to: endOfDay(toDate),
      display: `Q${q} ${y}`,
    };
  }
  
  // Year: --year 2025
  if (year) {
    const y = parseInt(year, 10);
    
    if (isNaN(y) || y < 2000 || y > 2100) {
      throw new Error('Invalid year. Use a 4-digit year (e.g., 2025).');
    }
    
    const fromDate = new Date(y, 0, 1);
    const toDate = new Date(y, 11, 31);
    
    return {
      from: fromDate,
      to: endOfDay(toDate),
      display: `${y}`,
    };
  }
  
  throw new Error('Please specify a date range: --year, --month, --quarter, or --from/--to');
}

/**
 * Parse a date string (YYYY-MM-DD)
 */
function parseDate(str) {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  
  const date = new Date(y, m - 1, d);
  
  // Validate the date is real
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  
  return date;
}

/**
 * Set time to end of day (23:59:59.999)
 */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get month name
 */
function getMonthName(month) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return names[month - 1];
}

/**
 * Get year and month from date
 */
export function getYearMonth(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

/**
 * Iterate through months in a date range
 * 
 * @param {Date} from 
 * @param {Date} to 
 * @yields {{year: number, month: number}}
 */
export function* iterateMonths(from, to) {
  const current = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  
  while (current <= end) {
    yield {
      year: current.getFullYear(),
      month: current.getMonth() + 1,
    };
    current.setMonth(current.getMonth() + 1);
  }
}

/**
 * Check if a date is within a range
 */
export function isInRange(date, from, to) {
  const d = new Date(date);
  return d >= from && d <= to;
}
