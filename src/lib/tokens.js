/**
 * Token usage utilities for Kraxler
 * 
 * Helper functions for formatting and aggregating token usage.
 */

/**
 * @typedef {Object} Usage
 * @property {number} input - Input tokens
 * @property {number} output - Output tokens
 * @property {number} cacheRead - Cache read tokens
 * @property {number} cacheWrite - Cache write tokens
 * @property {number} totalTokens - Total tokens
 * @property {Object} cost - Cost breakdown
 * @property {number} cost.input - Input cost
 * @property {number} cost.output - Output cost
 * @property {number} cost.cacheRead - Cache read cost
 * @property {number} cost.cacheWrite - Cache write cost
 * @property {number} cost.total - Total cost
 */

/**
 * @typedef {Object} PhaseUsage
 * @property {string} phase - Phase name
 * @property {string} model - Model ID
 * @property {string} provider - Provider name
 * @property {number} calls - Number of API calls
 * @property {Usage} usage - Aggregated usage
 */

/**
 * Create an empty usage object
 * @returns {Usage}
 */
export function emptyUsage() {
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
 * @param {Usage} acc - Accumulator
 * @param {Usage} usage - Usage to add
 * @returns {Usage} - The mutated accumulator
 */
export function addUsage(acc, usage) {
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
 * @param {Usage[]} usages - Array of usage objects
 * @returns {Usage}
 */
export function aggregateUsage(usages) {
  const total = emptyUsage();
  for (const usage of usages) {
    addUsage(total, usage);
  }
  return total;
}

/**
 * Format token count (e.g., 1234 -> "1.2k", 12345 -> "12k")
 * @param {number} count
 * @returns {string}
 */
export function formatTokens(count) {
  if (count < 1000) return String(count);
  if (count < 10000) return (count / 1000).toFixed(1) + 'k';
  if (count < 1000000) return Math.round(count / 1000) + 'k';
  return (count / 1000000).toFixed(1) + 'M';
}

/**
 * Format cost (e.g., 0.0001234 -> "$0.0001")
 * @param {number} cost
 * @returns {string}
 */
export function formatCost(cost) {
  if (cost < 0.0001) return '$0.00';
  if (cost < 0.01) return '$' + cost.toFixed(4);
  if (cost < 1) return '$' + cost.toFixed(3);
  return '$' + cost.toFixed(2);
}

/**
 * Format a usage report from phase data
 * @param {PhaseUsage[]} phases - Array of phase usage data
 * @returns {string}
 */
export function formatUsageReport(phases) {
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
  report += `${'TOTAL'.padEnd(23)} ${' '.repeat(24)} ${String(totalCalls).padStart(5)} ${formatTokens(totalUsage.input).padStart(8)} ${formatTokens(totalUsage.output).padStart(8)} ${formatCost(totalUsage.cost.total).padStart(7)}\n`;

  // Cache stats if any
  if (totalUsage.cacheRead > 0 || totalUsage.cacheWrite > 0) {
    report += `\nCache: ${formatTokens(totalUsage.cacheRead)} read, ${formatTokens(totalUsage.cacheWrite)} written\n`;
  }

  return report;
}
