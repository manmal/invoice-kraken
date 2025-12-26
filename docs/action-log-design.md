# Action Log Design for Invoice Kraken

## Problem Statement

Invoice Kraken processes Gmail invoices through a multi-stage pipeline:

1. **Search** - Find invoice-related emails in Gmail for a date range
2. **Investigate** - Analyze emails with AI, classify invoices, download attachments
3. **Download** - Use browser automation for link-based invoices
4. **List** - Display items needing manual handling

Currently, there's no way to know:
- Which date ranges have been searched
- Which date ranges have been fully investigated
- Whether a search/investigate was interrupted mid-way
- If we re-run a search, did we miss any months?
- What the overall completion status is for a given year

### Current State

The `emails` table tracks individual email status:
```
pending → investigated → downloaded/manual/duplicate/no_invoice
```

But we don't track:
- "I searched January-June 2024 on Dec 15"
- "I investigated March 2024 on Dec 16, processed 45 emails"
- "Search for July 2024 failed after finding 12 emails"

## Requirements

### 1. Track Work Performed
For each command execution, record:
- **What**: Command type (search, investigate, download)
- **When**: Timestamp of execution
- **Scope**: Account, year, month range
- **Result**: Success/failure, counts (found, processed, errors)
- **Duration**: How long it took

### 2. Query Completion Status
Answer questions like:
- "Which months of 2024 have been searched?"
- "Which months still need investigation?"
- "Show me all work done for account X"
- "What failed and needs retry?"

### 3. Identify Gaps
Automatically detect:
- Months never searched
- Months searched but not investigated
- Partial runs (interrupted mid-execution)

### 4. Support Resumability
Enable:
- "Continue where I left off"
- "Re-run failed operations"
- "Fill in missing months"

## Proposed Schema

### Table: `action_log`

```sql
CREATE TABLE action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- What was done
  action TEXT NOT NULL,           -- 'search', 'investigate', 'download', 'list'
  account TEXT NOT NULL,
  
  -- Scope of the action
  year INTEGER,                   -- NULL for actions not scoped to year
  month_from INTEGER,             -- 1-12, NULL if not month-scoped
  month_to INTEGER,               -- 1-12, NULL if not month-scoped
  
  -- Execution details
  started_at TEXT NOT NULL,       -- ISO timestamp
  finished_at TEXT,               -- NULL if still running or crashed
  status TEXT NOT NULL,           -- 'running', 'completed', 'failed', 'interrupted'
  
  -- Results
  emails_found INTEGER DEFAULT 0,
  emails_processed INTEGER DEFAULT 0,
  emails_new INTEGER DEFAULT 0,
  emails_skipped INTEGER DEFAULT 0,
  emails_failed INTEGER DEFAULT 0,
  
  -- Error info
  error_message TEXT,
  
  -- Metadata
  duration_seconds REAL,
  notes TEXT                      -- JSON for additional context
);

CREATE INDEX idx_action_log_account ON action_log(account);
CREATE INDEX idx_action_log_action ON action_log(action);
CREATE INDEX idx_action_log_year_month ON action_log(year, month_from, month_to);
CREATE INDEX idx_action_log_status ON action_log(status);
```

### Table: `month_status` (Derived/Cached View)

For quick queries about month completion:

```sql
CREATE TABLE month_status (
  account TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  
  -- Search status
  search_completed_at TEXT,
  search_email_count INTEGER DEFAULT 0,
  
  -- Investigate status  
  investigate_completed_at TEXT,
  investigate_pending INTEGER DEFAULT 0,
  investigate_done INTEGER DEFAULT 0,
  
  -- Download status
  download_completed_at TEXT,
  download_pending INTEGER DEFAULT 0,
  download_done INTEGER DEFAULT 0,
  
  PRIMARY KEY (account, year, month)
);
```

## API Design

### Recording Actions

```javascript
// Start an action (returns action ID)
const actionId = actionLog.start({
  action: 'search',
  account: 'user@gmail.com',
  year: 2024,
  monthFrom: 12,
  monthTo: 12,
});

// Update progress during execution
actionLog.progress(actionId, {
  emailsFound: 45,
  emailsNew: 40,
});

// Complete the action
actionLog.complete(actionId, {
  emailsProcessed: 45,
  emailsNew: 40,
  emailsSkipped: 5,
});

// Or mark as failed
actionLog.fail(actionId, {
  errorMessage: 'Gmail API rate limit exceeded',
  emailsProcessed: 12,
});
```

### Querying Status

```javascript
// Get completion status for a year
const status = actionLog.getYearStatus('user@gmail.com', 2024);
// Returns:
// {
//   searched: [1, 2, 3, 4, 5, 6],      // months searched
//   notSearched: [7, 8, 9, 10, 11, 12], // months not searched
//   investigated: [1, 2, 3],            // months fully investigated
//   partiallyInvestigated: [4, 5],      // some emails still pending
//   notInvestigated: [6],               // searched but not investigated
// }

// Get recent actions
const recent = actionLog.getRecent('user@gmail.com', { limit: 10 });

// Find failed actions
const failed = actionLog.getFailed('user@gmail.com');

// Check if a specific month was searched
const wasSearched = actionLog.wasSearched('user@gmail.com', 2024, 12);
```

## CLI Integration

### Show Status

```bash
# Show completion status for a year
bun run status -- --account user@gmail.com --year 2024

# Output:
# 📊 Status for user@gmail.com - 2024
# 
# Search:
#   ✓ Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
#   
# Investigate:
#   ✓ Jan Feb Mar Apr May Jun
#   ⏳ Jul (45 pending)
#   ✗ Aug Sep Oct Nov Dec (not started)
#
# Download:
#   ✓ Jan Feb Mar
#   ⏳ Apr May Jun (12 pending)
#   ✗ Jul-Dec (not started)
#
# Last action: search Dec 2024 - 2 hours ago
```

### Show Action Log

```bash
# Show recent actions
bun run log -- --account user@gmail.com

# Output:
# Recent actions for user@gmail.com:
# 
# 2024-12-26 10:30:00  search      2024/12     ✓ completed  45 found, 40 new
# 2024-12-26 10:25:00  investigate 2024/11     ✓ completed  89 processed
# 2024-12-26 10:15:00  search      2024/11     ✓ completed  92 found, 92 new
# 2024-12-25 15:00:00  search      2024/01-06  ✓ completed  523 found
```

### Auto-Continue

```bash
# Automatically search missing months
bun run search -- --account user@gmail.com --year 2024 --continue

# Automatically investigate pending emails
bun run investigate -- --account user@gmail.com --continue
```

## Implementation Notes

### Detecting Interruptions

When the process starts:
1. Check for any actions with `status = 'running'`
2. Mark them as `status = 'interrupted'`
3. Log warning to user

```javascript
// On startup
const interrupted = actionLog.markInterrupted();
if (interrupted.length > 0) {
  console.warn(`Found ${interrupted.length} interrupted actions from previous run`);
}
```

### Atomic Updates

Use transactions to ensure consistency:

```javascript
db.transaction(() => {
  // Insert emails
  for (const email of emails) {
    insertEmail(email);
  }
  // Update action log
  actionLog.progress(actionId, { emailsNew: emails.length });
})();
```

### Month Status Calculation

The `month_status` table can be:
1. **Materialized** - Updated after each action (faster reads)
2. **Computed** - Derived from `emails` + `action_log` on demand (always accurate)

Recommendation: Compute on demand but cache for display:

```javascript
function getMonthStatus(account, year, month) {
  // Check action_log for search completion
  const searchAction = db.prepare(`
    SELECT * FROM action_log 
    WHERE account = ? AND year = ? AND month_from <= ? AND month_to >= ?
    AND action = 'search' AND status = 'completed'
    ORDER BY finished_at DESC LIMIT 1
  `).get(account, year, month, month);
  
  // Count emails by status for this month
  const emailCounts = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM emails 
    WHERE account = ? AND year = ? AND month = ?
    GROUP BY status
  `).all(account, year, month);
  
  return {
    searched: !!searchAction,
    searchedAt: searchAction?.finished_at,
    emails: Object.fromEntries(emailCounts.map(r => [r.status, r.count])),
  };
}
```

## Example Workflows

### Fresh Start for 2024

```bash
# Search all of 2024
bun run search -- -a user@gmail.com -y 2024

# Investigate everything
bun run investigate -- -a user@gmail.com

# Download remaining
bun run download -- -a user@gmail.com

# Check status
bun run status -- -a user@gmail.com -y 2024
```

### Monthly Maintenance

```bash
# It's January 2025, search December 2024
bun run search -- -a user@gmail.com -y 2024 --from 12 --to 12

# Investigate new emails
bun run investigate -- -a user@gmail.com

# Check what's left
bun run list -- -a user@gmail.com
```

### Recovery After Crash

```bash
# Check what happened
bun run log -- -a user@gmail.com

# See: "search 2024/06 - interrupted"

# Re-run the search
bun run search -- -a user@gmail.com -y 2024 --from 6 --to 6

# Or use auto-continue
bun run search -- -a user@gmail.com -y 2024 --continue
```

## Open Questions

1. **Granularity**: Should we track per-email actions or just per-batch?
   - Per-email: More detailed, but more DB writes
   - Per-batch: Simpler, sufficient for most use cases
   
2. **Retention**: How long to keep action log entries?
   - Forever (audit trail)
   - Rolling window (last 90 days)
   - Configurable

3. **Multiple Accounts**: How to handle searches across multiple accounts?
   - Current: One account per command
   - Future: Batch operations?

4. **Parallel Execution**: What if user runs two searches simultaneously?
   - Detect and warn?
   - Allow with isolation?
   - Lock mechanism?

## Next Steps

1. Add `action_log` table to schema
2. Create `src/lib/action-log.js` with API
3. Integrate into each command
4. Add `status` command
5. Add `log` command
6. Add `--continue` flag support
