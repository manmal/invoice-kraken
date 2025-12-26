/**
 * Token usage utilities for Kraxler
 *
 * Helper functions for formatting and aggregating token usage.
 */


/**
 * Cost breakdown for token usage
 */
export interface UsageCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/**
 * Full usage object with token counts and costs
 */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: UsageCost;
}

/**
 * Phase usage data for reporting
 */
export interface PhaseUsageReport {
  phase: string;
  model: string | null;
  provider: string | null;
  calls: number;
  usage: Usage;
}

/**
 * Create an empty usage object
 */
export function emptyUsage(): Usage {
  return {
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
  };
}

/**
 * Add usage to an accumulator (mutates acc)
 */
export function addUsage(acc: Usage, usage: Partial<Usage> | null | undefined): Usage {
  if (!usage) return acc;

  acc.input += usage.input || 0;
  acc.output += usage.output || 0;
  acc.cacheRead += usage.cacheRead || 0;
  acc.cacheWrite += usage.cacheWrite || 0;
  acc.totalTokens += usage.totalTokens || 0;

  if (usage.cost) {
    acc.cost.input += usage.cost.input || 0;
    acc.cost.output += usage.cost.output || 0;
    acc.cost.cacheRead += usage.cost.cacheRead || 0;
    acc.cost.cacheWrite += usage.cost.cacheWrite || 0;
    acc.cost.total += usage.cost.total || 0;
  }

  return acc;
}

/**
 * Aggregate multiple usage objects
 */
export function aggregateUsage(usages: Array<Partial<Usage> | null | undefined>): Usage {
  const total = emptyUsage();
  for (const usage of usages) {
    addUsage(total, usage);
  }
  return total;
}

/**
 * Format token count (e.g., 1234 -> "1.2k", 12345 -> "12k")
 */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return (count / 1000).toFixed(1) + 'k';
  if (count < 1000000) return Math.round(count / 1000) + 'k';
  return (count / 1000000).toFixed(1) + 'M';
}

/**
 * Format cost (e.g., 0.0001234 -> "$0.0001")
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) return '$0.00';
  if (cost < 0.01) return '$' + cost.toFixed(4);
  if (cost < 1) return '$' + cost.toFixed(3);
  return '$' + cost.toFixed(2);
}

/**
 * Format a usage report from phase data
 */
export function formatUsageReport(phases: PhaseUsageReport[] | null | undefined): string {
  if (!phases || phases.length === 0) {
    return 'No token usage recorded.';
  }

  let report = '\n══════════════════════════════════════════════════\n';
  report += '📊 TOKEN USAGE\n';
  report += '══════════════════════════════════════════════════\n\n';

  // Header
  report += 'Phase                   Model                    Calls   Input    Output   Cost\n';
  report += '─'.repeat(90) + '\n';

  let totalCalls = 0;
  const totalUsage = emptyUsage();

  for (const phase of phases) {
    const phaseName = phase.phase.padEnd(23);
    const modelName = (phase.model || 'unknown').substring(0, 24).padEnd(24);
    const calls = String(phase.calls).padStart(5);
    const input = formatTokens(phase.usage.input).padStart(8);
    const output = formatTokens(phase.usage.output).padStart(8);
    const cost = formatCost(phase.usage.cost.total).padStart(7);

    report += `${phaseName} ${modelName} ${calls} ${input} ${output} ${cost}\n`;

    totalCalls += phase.calls;
    addUsage(totalUsage, phase.usage);
  }

  // Total
  report += '─'.repeat(90) + '\n';
  report +=
    `${'TOTAL'.padEnd(23)} ${' '.repeat(24)} ${String(totalCalls).padStart(5)} ` +
    `${formatTokens(totalUsage.input).padStart(8)} ${formatTokens(totalUsage.output).padStart(8)} ` +
    `${formatCost(totalUsage.cost.total).padStart(7)}\n`;

  // Cache stats if any
  if (totalUsage.cacheRead > 0 || totalUsage.cacheWrite > 0) {
    report += `\nCache: ${formatTokens(totalUsage.cacheRead)} read, ${formatTokens(totalUsage.cacheWrite)} written\n`;
  }

  return report;
}
