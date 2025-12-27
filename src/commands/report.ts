/**
 * Report command - Generate JSONL export of all extracted invoices
 */

import * as fs from 'fs';
import { getDb } from '../lib/db.js';
import { parseDateRange, getYearMonth } from '../lib/dates.js';
import {
  startAction,
  completeAction,
  failAction,
} from '../lib/action-log.js';
import type { Email, DeductibleCategory } from '../types.js';

export interface ReportOptions {
  account?: string;
  accounts?: string[];
  year?: string;
  month?: string;
  quarter?: string;
  from?: string;
  to?: string;
  output?: string;
  format?: 'jsonl' | 'json' | 'csv';
  status?: string;
}

export interface InvoiceRecord {
  id: string;
  account: string;
  date: string | null;
  sender: string | null;
  sender_domain: string | null;
  subject: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: string | null;
  invoice_amount_cents: number | null;
  invoice_path: string | null;
  deductible: DeductibleCategory | null;
  deductible_reason: string | null;
  deductible_percent: number | null;
  income_tax_percent: number | null;
  vat_recoverable: boolean | null;
  status: string;
  year: number;
  month: number;
}

export async function reportCommand(options: ReportOptions): Promise<string | null> {
  // Support both single account and multiple accounts
  const accounts: string[] = options.accounts || (options.account ? [options.account] : []);
  const { output, format = 'jsonl', status } = options;
  
  if (accounts.length === 0) {
    console.error('Error: No account specified');
    return null;
  }
  
  // Parse date range if provided
  let dateFilter: { year?: number; fromMonth?: number; toMonth?: number } = {};
  
  if (options.year || options.month || options.quarter || options.from) {
    try {
      const dateRange = parseDateRange(options);
      const fromYM = getYearMonth(dateRange.from);
      const toYM = getYearMonth(dateRange.to);
      dateFilter = {
        year: fromYM.year,
        fromMonth: fromYM.month,
        toMonth: toYM.month,
      };
      console.log(`Generating report for ${dateRange.display}...\n`);
    } catch {
      // No date filter, export all
      console.log('Generating report for all invoices...\n');
    }
  } else {
    console.log('Generating report for all invoices...\n');
  }
  
  if (accounts.length > 1) {
    console.log(`Accounts: ${accounts.join(', ')}\n`);
  }
  
  // Start action log (use first account for logging, note all accounts in notes)
  const actionId = startAction({
    action: 'report',
    account: accounts[0],
    year: dateFilter.year,
  });
  
  const db = getDb();
  
  try {
    // Build query - support multiple accounts
    const accountPlaceholders = accounts.map((_, i) => `@account${i}`).join(', ');
    let query = `
      SELECT * FROM emails 
      WHERE account IN (${accountPlaceholders})
    `;
    const params: Record<string, unknown> = {};
    accounts.forEach((acc, i) => {
      params[`account${i}`] = acc;
    });
    
    // Filter by status (default: downloaded invoices only)
    const statusFilter = status || 'downloaded';
    if (statusFilter !== 'all') {
      query += ` AND status = @status`;
      params.status = statusFilter;
    }
    
    // Filter by date range
    if (dateFilter.year) {
      query += ` AND year = @year`;
      params.year = dateFilter.year;
      
      if (dateFilter.fromMonth && dateFilter.toMonth) {
        query += ` AND month >= @fromMonth AND month <= @toMonth`;
        params.fromMonth = dateFilter.fromMonth;
        params.toMonth = dateFilter.toMonth;
      }
    }
    
    query += ` ORDER BY date ASC`;
    
    const emails = db.prepare(query).all(params) as Email[];
  
    if (emails.length === 0) {
      console.log('No invoices found matching criteria.');
      completeAction(actionId, { emailsFound: 0 });
      return null;
    }
    
    // Transform to invoice records
    const records: InvoiceRecord[] = emails.map(email => ({
      id: email.id,
      account: email.account,
      date: email.date,
      sender: email.sender,
      sender_domain: email.sender_domain,
      subject: email.subject,
      invoice_number: email.invoice_number,
      invoice_date: email.invoice_date,
      invoice_amount: email.invoice_amount,
      invoice_amount_cents: email.invoice_amount_cents,
      invoice_path: email.invoice_path,
      deductible: email.deductible,
      deductible_reason: email.deductible_reason,
      deductible_percent: email.deductible_percent,
      income_tax_percent: email.income_tax_percent,
      vat_recoverable: email.vat_recoverable === 1 ? true : email.vat_recoverable === 0 ? false : null,
      status: email.status,
      year: email.year,
      month: email.month,
    }));
    
    // Generate output
    let content: string;
    let extension: string;
    
    switch (format) {
      case 'json':
        content = JSON.stringify(records, null, 2);
        extension = 'json';
        break;
      case 'csv':
        content = generateCsv(records);
        extension = 'csv';
        break;
      case 'jsonl':
      default:
        content = records.map(r => JSON.stringify(r)).join('\n');
        extension = 'jsonl';
        break;
    }
    
    // Determine output path - use first account or 'multi' for multiple accounts
    const accountLabel = accounts.length === 1 
      ? accounts[0].replace('@', '_at_') 
      : 'multi-account';
    const outputPath = output || `invoices-${accountLabel}-${new Date().toISOString().split('T')[0]}.${extension}`;
    
    // Write to file
    fs.writeFileSync(outputPath, content);
    
    // Complete action log
    completeAction(actionId, {
      emailsFound: emails.length,
      emailsProcessed: emails.length,
      notes: accounts.length > 1 ? { accounts } : undefined,
    });
    
    // Print summary
    console.log(`✅ Report generated: ${outputPath}`);
    console.log(`   Invoices: ${records.length}`);
    
    // Summary by account if multiple
    if (accounts.length > 1) {
      const byAccount = records.reduce((acc, r) => {
        acc[r.account] = (acc[r.account] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('\n   By account:');
      for (const [acc, count] of Object.entries(byAccount)) {
        console.log(`     📧 ${acc}: ${count}`);
      }
    }
    
    // Summary by deductibility
    const byDeductible = records.reduce((acc, r) => {
      const key = r.deductible || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n   By deductibility:');
    for (const [category, count] of Object.entries(byDeductible)) {
      const icon = getDeductibleIcon(category as DeductibleCategory);
      console.log(`     ${icon} ${category}: ${count}`);
    }
    
    // Total amounts
    const totalCents = records.reduce((sum, r) => sum + (r.invoice_amount_cents || 0), 0);
    if (totalCents > 0) {
      console.log(`\n   Total amount: €${(totalCents / 100).toFixed(2)}`);
    }
    
    return outputPath;
  } catch (error) {
    failAction(actionId, error as Error);
    throw error;
  }
}

function getDeductibleIcon(category: DeductibleCategory | string): string {
  const icons: Record<string, string> = {
    full: '💼',
    vehicle: '🚗',
    meals: '🍽️',
    telecom: '📱',
    partial: '📊',
    none: '🚫',
    unclear: '❓',
    unknown: '❓',
  };
  return icons[category] || '❓';
}

function generateCsv(records: InvoiceRecord[]): string {
  const headers = [
    'id',
    'account',
    'date',
    'sender',
    'sender_domain',
    'subject',
    'invoice_number',
    'invoice_date',
    'invoice_amount',
    'invoice_amount_cents',
    'invoice_path',
    'deductible',
    'deductible_reason',
    'deductible_percent',
    'income_tax_percent',
    'vat_recoverable',
    'status',
    'year',
    'month',
  ];
  
  const escapeCsv = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  
  const rows = records.map(record => 
    headers.map(h => escapeCsv(record[h as keyof InvoiceRecord])).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}
