# Invoice Kraken CLI Redesign Plan

## Overview

Consolidate the current 6 commands (`search`, `investigate`, `download`, `list`, `status`, `log`) into 2 streamlined commands:

1. **`run`** - Execute the full invoice extraction pipeline
2. **`report`** - Generate comprehensive markdown/HTML reports

---

## Shared Architecture

Both commands share a silent analysis phase via `gatherContext()`:

```
┌─────────────────────────────────────────────────────────────────┐
│                    src/lib/context.js                           │
│                                                                 │
│  gatherContext(account, year, options)                          │
│    → searchRanges, gaps, emailsByStatus, files, deductibility   │
└─────────────────────────────────────────────────────────────────┘
                    ▲                       ▲
                    │                       │
         ┌─────────┴─────────┐   ┌─────────┴─────────┐
         │   run command     │   │  report command   │
         │                   │   │                   │
         │ 1. gatherContext  │   │ 1. gatherContext  │
         │ 2. print state    │   │ 2. format as      │
         │ 3. execute stages │   │    markdown/html  │
         │ 4. print results  │   │ 3. write file     │
         └───────────────────┘   └───────────────────┘
```

### Context Object Structure

```javascript
{
  // Stage 1: Search
  search: {
    ranges: [{ start: '2025-01-01', end: '2025-10-31', count: 423 }, ...],
    gaps: [{ start: '2025-11-15', end: '2025-11-30' }],
    totalEmails: 536,
  },
  
  // Stage 2: Analysis
  analysis: {
    pending: 28,
    analyzed: 508,
    prefiltered: 39,
    prefilteredItems: [{ id, date, sender, subject, reason }, ...],
    byStatus: { downloaded: 195, no_invoice: 280, manual: 13, ... },
  },
  
  // Stage 3: Downloads
  downloads: {
    completed: 195,
    pendingDownload: 2,
    manual: 13,
    manualItems: [{ id, date, vendor, reason }, ...],
  },
  
  // Stage 4: Files
  files: {
    onDisk: 195,
    verified: 195,        // hash matches
    hashMismatch: [],     // file changed since download
    orphaned: [],         // files not in DB
    missing: [],          // DB says downloaded but file gone
  },
  
  // Summary
  deductibility: {
    full: { count: 89, cents: 452300 },
    partial: { count: 12, cents: 120000 },
    unclear: { count: 8, cents: 89000 },
    none: { count: 45, cents: 210000 },
  },
  
  // All issues in one place
  issues: [
    { type: 'search_gap', ranges: [...] },
    { type: 'pending_analysis', count: 28 },
    { type: 'manual_download', items: [...] },
    { type: 'needs_review', items: [...] },
    { type: 'missing_file', items: [...] },
    { type: 'hash_mismatch', items: [...] },
  ],
}
```

---

## Command: `run`

### Purpose
Single command to run the entire invoice extraction pipeline. Works silently, then prints a comprehensive summary.

### Usage
```bash
invoice-kraken run --account <email> [options]

Options:
  --account <email>    Gmail account (required)
  --year <year>        Target year (default: current year)
  --from <month>       Start month 1-12 (default: 1)
  --to <month>         End month 1-12 (default: current month)
  --batch-size <n>     AI analysis batch size (default: 10)
  --dry-run            Show what would be done without doing it
  --continue           Auto-resume from last state (no prompts)
  --verbose            Show detailed progress during execution
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0: Context Gathering (silent)                            │
├─────────────────────────────────────────────────────────────────┤
│  • Load SQLite database                                         │
│  • Cross-check files in invoices/ with database                 │
│  • Detect orphaned files (in filesystem but not DB)             │
│  • Detect missing files (in DB but not filesystem)              │
│  • Build date range coverage map                                │
│  • Identify gaps in each stage                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Print: Current State Overview                                  │
├─────────────────────────────────────────────────────────────────┤
│  == Stage 1: Email Search ==                                    │
│  • 2025-01-01 to 2025-10-31  ✓ (423 emails)                    │
│  • 2025-11-01 to 2025-11-14  ✓ (28 emails)                     │
│  • ❌ MISSING: 2025-11-15 to 2025-11-30                         │
│  • 2025-12-01 to 2025-12-26  ✓ (85 emails)                     │
│                                                                 │
│  == Stage 2: AI Analysis ==                                     │
│  • 2025-01-01 to 2025-10-31  ✓ (389 analyzed, 34 skipped)      │
│  • ❌ MISSING: 2025-11-01 to 2025-11-14 (28 pending)           │
│  • ❌ MISSING: 2025-11-15 to 2025-11-30 (not searched)         │
│  • 2025-12-01 to 2025-12-26  ✓ (85 analyzed)                   │
│                                                                 │
│  == Stage 3: Download ==                                        │
│  • 2025-01-01 to 2025-10-31  ✓ (156 downloaded)                │
│  • ❌ MISSING: 2025-11-01 to 2025-11-30 (not analyzed)         │
│  • 2025-12-01 to 2025-12-26  ⚠ (15 downloaded, 9 manual)       │
│                                                                 │
│  == Stage 4: File Verification ==                               │
│  • 171 PDF files in invoices/                                   │
│  • 0 orphaned (filesystem only)                                 │
│  • 2 missing (DB says downloaded, file not found)               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Print: Actions to Execute                                      │
├─────────────────────────────────────────────────────────────────┤
│  Executing pipeline for 2025...                                 │
│                                                                 │
│  Stage 1: Searching 2025-11-15 to 2025-11-30...                │
│    → Found 47 emails                                            │
│                                                                 │
│  Stage 2: Analyzing 75 pending emails...                        │
│    → Batch 1/8: 10 emails...                                    │
│    → Batch 2/8: 10 emails...                                    │
│    ...                                                          │
│    → 52 invoices, 18 not invoices, 5 skipped                   │
│                                                                 │
│  Stage 3: Downloading 52 invoices...                            │
│    → 48 downloaded, 4 failed (manual required)                  │
│                                                                 │
│  Stage 4: Verifying files...                                    │
│    → 2 missing files re-downloaded                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Print: Final Report                                            │
├─────────────────────────────────────────────────────────────────┤
│  ══════════════════════════════════════════════════════════════ │
│  📊 RUN COMPLETE - 2025                                         │
│  ══════════════════════════════════════════════════════════════ │
│                                                                 │
│  Stage 1: Email Search                                          │
│  ────────────────────                                           │
│  ✓ Searched: 2025-01-01 to 2025-12-26                          │
│  ✓ Total emails found: 470                                      │
│  ✓ New emails added: 47                                         │
│                                                                 │
│  Stage 2: AI Analysis                                           │
│  ────────────────────                                           │
│  ✓ Analyzed: 75 emails                                          │
│    • Invoices found: 52                                         │
│    • Not invoices: 18                                           │
│    • Pre-filtered (skipped): 5                                  │
│                                                                 │
│  Stage 3: Download                                              │
│  ────────────────────                                           │
│  ✓ Downloaded: 48 invoices                                      │
│  ⚠ Manual required: 4 invoices                                  │
│    • Apple (no PDF attachment): 3                               │
│    • Hetzner (extraction failed): 1                             │
│                                                                 │
│  Stage 4: File Verification                                     │
│  ────────────────────                                           │
│  ✓ Files verified: 219                                          │
│  ✓ Missing re-downloaded: 2                                     │
│                                                                 │
│  ══════════════════════════════════════════════════════════════ │
│  💰 DEDUCTIBILITY SUMMARY                                       │
│  ══════════════════════════════════════════════════════════════ │
│  💼 Fully Deductible:     €4,523.00  (89 invoices)              │
│  📊 Partially Deductible: €1,200.00  (12 invoices)              │
│  ❓ Needs Review:         €890.00    (8 invoices)               │
│  🚫 Not Deductible:       €2,100.00  (45 invoices)              │
│                                                                 │
│  💰 Estimated deductible: €5,123.00                             │
│                                                                 │
│  ══════════════════════════════════════════════════════════════ │
│  ⚠ ISSUES REQUIRING ATTENTION                                   │
│  ══════════════════════════════════════════════════════════════ │
│                                                                 │
│  Manual Downloads Required (4):                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Date       │ From              │ Issue                     │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 2025-12-08 │ apple.com         │ No PDF (link in email)   │ │
│  │ 2025-12-12 │ apple.com         │ No PDF (link in email)   │ │
│  │ 2025-12-13 │ apple.com         │ No PDF (link in email)   │ │
│  │ 2025-12-08 │ hetzner.com       │ Extraction failed        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Needs Deductibility Review (8):                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Date       │ Vendor            │ Amount    │ Notes         │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 2025-12-13 │ MediaMarkt        │ €599.00   │ Electronics   │ │
│  │ 2025-12-17 │ TS Trusted        │ €45.00    │ Unknown       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Run "invoice-kraken report" for full details.                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Command: `report`

### Purpose
Generate comprehensive markdown or HTML report of all invoice data.

### Usage
```bash
invoice-kraken report --account <email> [options]

Options:
  --account <email>    Gmail account (required)
  --year <year>        Target year (default: current year)
  --format <fmt>       Output format: markdown|html (default: markdown)
  --output <path>      Output file path (default: report-{year}.md)
  --include-skipped    Include all skipped/filtered emails
  --include-personal   Include non-deductible personal purchases
```

### Report Structure

```markdown
# Invoice Report 2025

Generated: 2025-12-26 12:45:00
Account: manuel.maly@gmail.com

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Emails Searched | 470 |
| Invoices Found | 208 |
| Invoices Downloaded | 195 |
| Manual Review Required | 13 |
| Estimated Deductible | €5,123.00 |

## Coverage

### Search Coverage
- ✓ January 1 - December 26: Complete
- ❌ December 27-31: Not yet searched

### Analysis Coverage  
- ✓ 100% of found emails analyzed
- 39 auto-skipped by prefilter (marketing, notifications)

### Download Coverage
- ✓ 195 of 208 invoices downloaded
- ⚠ 13 require manual download

## Invoices by Month

### January 2025

| Date | Vendor | Invoice # | Amount | Deductible | File |
|------|--------|-----------|--------|------------|------|
| 2025-01-05 | Anthropic | INV-001 | €99.00 | 💼 Full | 05-anthropic_api.pdf |
| 2025-01-15 | 1Password | INV-002 | €71.82 | 💼 Full | 15-1password_family.pdf |
| ... | ... | ... | ... | ... | ... |

**Monthly Total:** €450.00 (💼 €380.00 deductible)

### February 2025
...

## Issues

### Manual Downloads Required

| Date | Vendor | Subject | Issue |
|------|--------|---------|-------|
| 2025-12-08 | Apple | Deine Rechnung von Apple | No PDF attachment - invoice via link |
| 2025-12-08 | Hetzner | Invoice 089000630143 | PDF extraction failed |

### Deductibility Review Needed

| Date | Vendor | Amount | Notes |
|------|--------|--------|-------|
| 2025-12-13 | MediaMarkt | €599.00 | Electronics - could be business |
| 2025-12-17 | TS Trusted | €45.00 | Unknown vendor |

## Skipped Emails

<details>
<summary>39 emails auto-skipped by prefilter (click to expand)</summary>

| Date | From | Subject | Reason |
|------|------|---------|--------|
| 2025-12-01 | amazon.com | Your order has shipped | Order notification |
| 2025-12-02 | newsletter@... | Weekly digest | Marketing |
| ... | ... | ... | ... |

</details>

## Files

### Downloaded Files
- Total: 195 files
- Total size: 48.2 MB
- Location: invoices/2025/

### File Integrity
- ✓ All 195 files verified present
- ✓ No orphaned files

## Appendix

### Search Terms Used
invoice, rechnung, beleg, billing, zahlung, quittung, receipt, 
buchungsbeleg, bestellbestätigung, zahlungsbestätigung

### Prefilter Rules
- Skip: Amazon order/shipping, marketing, newsletters, ...
- Keep: Subject contains Rechnung/Invoice/Receipt/Beleg
```

---

## Implementation Plan

### Phase 1: Core Refactoring

#### 1.1 Database Schema Changes

**New table for day-level search tracking:**
```sql
CREATE TABLE IF NOT EXISTS search_ranges (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  year INTEGER NOT NULL,
  start_date TEXT NOT NULL,  -- YYYY-MM-DD
  end_date TEXT NOT NULL,    -- YYYY-MM-DD
  emails_found INTEGER,
  searched_at TEXT,
  UNIQUE(account, start_date, end_date)
);
```

**New columns on emails table:**
```sql
-- File verification with hash
ALTER TABLE emails ADD COLUMN file_verified_at TEXT;
ALTER TABLE emails ADD COLUMN file_hash TEXT;

-- Prefilter tracking (reason why skipped)
ALTER TABLE emails ADD COLUMN prefilter_reason TEXT;
```

**New status value:**
- Add `'prefiltered'` as valid status (stored in DB, not silently skipped)

**Updated status flow:**
```
pending → prefiltered (auto-skip, stored with reason)
        → no_invoice (AI says not invoice)
        → pending_download (AI found invoice, needs download)
        → downloaded (PDF saved, hash computed)
        → manual (download failed, needs human)
        → duplicate (matches existing invoice)
```

#### 1.2 New Library: Context Gatherer
`src/lib/context.js`

```javascript
/**
 * Gather current state across all stages (silent analysis)
 * Used by both `run` and `report` commands
 */
export async function gatherContext(account, year) {
  // Stage 1: Search coverage (day-level precision)
  const searchRanges = getSearchedDateRanges(account, year);
  const searchGaps = findSearchGaps(account, year, searchRanges);
  
  // Stage 2: Analysis status
  const emailsByStatus = getEmailStatusCounts(account, year);
  const pendingEmails = getPendingEmails(account, year);
  const prefilteredEmails = getPrefilteredEmails(account, year);
  
  // Stage 3: Download status
  const downloadedEmails = getDownloadedEmails(account, year);
  const manualItems = getManualItems(account, year);
  
  // Stage 4: File verification (with hash check)
  const fileVerification = await verifyFiles(account, year, downloadedEmails);
  
  // Deductibility summary
  const deductibility = getDeductibilitySummary(account, year);
  
  // Collect all issues
  const issues = collectIssues({
    searchGaps,
    pendingEmails,
    manualItems,
    fileVerification,
    emailsByStatus,
  });
  
  return {
    search: {
      ranges: mergeContiguousRanges(searchRanges),
      gaps: searchGaps,
      totalEmails: emailsByStatus.total,
    },
    analysis: {
      pending: pendingEmails.length,
      analyzed: emailsByStatus.total - pendingEmails.length,
      prefiltered: prefilteredEmails.length,
      prefilteredItems: prefilteredEmails,
      byStatus: emailsByStatus,
    },
    downloads: {
      completed: downloadedEmails.length,
      manual: manualItems.length,
      manualItems,
    },
    files: {
      onDisk: fileVerification.found,
      verified: fileVerification.hashMatch,
      hashMismatch: fileVerification.hashMismatch,
      orphaned: fileVerification.orphaned,
      missing: fileVerification.missing,
    },
    deductibility,
    issues,
  };
}

/**
 * Verify downloaded files exist and hashes match
 */
async function verifyFiles(account, year, downloadedEmails) {
  const invoicesDir = `invoices/${year}`;
  const filesOnDisk = await scanDirectory(invoicesDir);
  
  const result = {
    found: 0,
    hashMatch: 0,
    hashMismatch: [],
    missing: [],
    orphaned: [],
  };
  
  // Check each downloaded email
  for (const email of downloadedEmails) {
    if (!email.invoice_path) continue;
    
    const filePath = email.invoice_path;
    const fileExists = filesOnDisk.has(filePath);
    
    if (!fileExists) {
      result.missing.push(email);
      continue;
    }
    
    result.found++;
    filesOnDisk.delete(filePath);  // Mark as accounted for
    
    // Verify hash if stored
    if (email.file_hash) {
      const currentHash = await computeFileHash(filePath);
      if (currentHash === email.file_hash) {
        result.hashMatch++;
      } else {
        result.hashMismatch.push({ email, expectedHash: email.file_hash, actualHash: currentHash });
      }
    }
  }
  
  // Remaining files on disk are orphaned
  result.orphaned = Array.from(filesOnDisk);
  
  return result;
}
```

#### 1.3 New Library: Pipeline Runner
`src/lib/pipeline.js`

```javascript
export async function runPipeline(account, options) {
  const { year, fromMonth, toMonth, batchSize, dryRun, verbose } = options;
  
  // Phase 0: Context
  const context = await gatherContext(account, year);
  printStateOverview(context);
  
  if (dryRun) {
    printWouldDo(context);
    return;
  }
  
  // Phase 1: Search
  const searchResult = await runSearchStage(account, year, context.searchGaps, verbose);
  
  // Phase 2: Analyze
  const analyzeResult = await runAnalyzeStage(account, batchSize, verbose);
  
  // Phase 3: Download
  const downloadResult = await runDownloadStage(account, verbose);
  
  // Phase 4: Verify
  const verifyResult = await runVerifyStage(account, year, verbose);
  
  // Print final report
  printFinalReport({
    context,
    search: searchResult,
    analyze: analyzeResult,
    download: downloadResult,
    verify: verifyResult,
  });
  
  return {
    success: true,
    issues: collectAllIssues(searchResult, analyzeResult, downloadResult, verifyResult),
  };
}
```

### Phase 2: Command Implementation

#### 2.1 `src/commands/run.js`
Main run command implementation.

#### 2.2 `src/commands/report.js`
Report generation command.

### Phase 3: Formatters

#### 3.1 `src/lib/formatters/console.js`
Console output formatting for `run` command.

#### 3.2 `src/lib/formatters/markdown.js`
Markdown report generation.

#### 3.3 `src/lib/formatters/html.js`
HTML report generation (wraps markdown with styles).

### Phase 4: Migration & Cleanup

#### 4.1 Deprecate Old Commands
- Keep old commands working but show deprecation notice
- Update README with new usage

#### 4.2 Migration Script
Script to migrate existing data to new schema if needed.

---

## Date Range Merging Algorithm

For displaying contiguous date ranges:

```javascript
function mergeContiguousRanges(ranges) {
  // Sort by start date
  const sorted = ranges.sort((a, b) => a.start - b.start);
  
  const merged = [];
  let current = null;
  
  for (const range of sorted) {
    if (!current) {
      current = { ...range };
    } else if (isContiguous(current.end, range.start)) {
      // Extend current range
      current.end = range.end;
      current.count += range.count;
    } else {
      // Gap found - push current and start new
      merged.push(current);
      
      // Add gap marker
      merged.push({
        type: 'gap',
        start: addDay(current.end),
        end: subtractDay(range.start),
      });
      
      current = { ...range };
    }
  }
  
  if (current) merged.push(current);
  return merged;
}

function isContiguous(date1, date2) {
  // date2 is the day after date1
  return addDay(date1).getTime() === date2.getTime();
}
```

---

## File Structure After Redesign

```
src/
├── index.js                    # CLI entry point (2 commands: run, report)
├── commands/
│   ├── run.js                  # Main pipeline command
│   └── report.js               # Report generation
├── lib/
│   ├── db.js                   # Database helpers (updated schema)
│   ├── gog.js                  # Gmail API wrapper
│   ├── pi.js                   # AI analysis
│   ├── prefilter.js            # Prefilter logic (now saves to DB)
│   ├── context.js              # Shared state gathering (NEW)
│   ├── pipeline.js             # Pipeline stage runner (NEW)
│   ├── files.js                # File ops + hashing (NEW)
│   ├── action-log.js           # Action tracking
│   ├── vendors.js              # Known vendors
│   └── extract.js              # Invoice extraction
├── formatters/
│   ├── console.js              # Terminal output (NEW)
│   ├── markdown.js             # MD report (NEW)
│   └── html.js                 # HTML report (NEW)
└── utils/
    ├── paths.js                # File path helpers
    └── dates.js                # Date range utilities (NEW)
```

### Removed (old commands moved to git history)
- `src/commands/search.js`
- `src/commands/investigate.js`
- `src/commands/download.js`
- `src/commands/list.js`
- `src/commands/status.js`
- `src/commands/log.js`

---

## Timeline

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Core refactoring (context, pipeline) | 2-3 hours |
| 2 | Run command implementation | 2 hours |
| 3 | Report command + formatters | 2 hours |
| 4 | Testing & polish | 1 hour |
| **Total** | | **7-8 hours** |

---

## Example Output

### `run` Command
```
$ invoice-kraken run --account manuel.maly@gmail.com --year 2025

════════════════════════════════════════════════════════════════════
📊 CURRENT STATE - 2025
════════════════════════════════════════════════════════════════════

== Stage 1: Email Search ==
• 2025-01-01 to 2025-10-31  ✓ 423 emails
• 2025-11-01 to 2025-11-14  ✓ 28 emails
• ❌ MISSING: 2025-11-15 to 2025-11-30
• 2025-12-01 to 2025-12-26  ✓ 85 emails

== Stage 2: AI Analysis ==
• 2025-01-01 to 2025-10-31  ✓ 389 analyzed
• ❌ PENDING: 28 emails (2025-11-01 to 2025-11-14)
• 2025-12-01 to 2025-12-26  ✓ 85 analyzed

== Stage 3: Downloads ==
• 171 invoices downloaded
• 9 require manual handling

== Stage 4: Files ==
• 171 files verified
• 0 orphaned, 0 missing

════════════════════════════════════════════════════════════════════
🚀 EXECUTING PIPELINE
════════════════════════════════════════════════════════════════════

Stage 1: Searching 2025-11-15 to 2025-11-30...
  → Found 42 new emails

Stage 2: Analyzing 70 pending emails...
  → Batch 1/7... done
  → Batch 2/7... done
  ...
  → 48 invoices, 17 not invoices, 5 prefiltered

Stage 3: Downloading 48 invoices...
  → 45 downloaded, 3 manual required

Stage 4: Verifying files...
  → All 216 files verified

════════════════════════════════════════════════════════════════════
✅ COMPLETE
════════════════════════════════════════════════════════════════════

Invoices:      216 downloaded, 12 manual
Deductible:    💼 €4,523 full + 📊 €600 partial = €5,123 estimated
Issues:        12 items need attention

Run "invoice-kraken report" for full details.
```
