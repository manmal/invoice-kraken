# Plan: Situation-Aware Reclassification System

## Problem Statement

User runs `kraxler run` to classify invoices for a year. Later, they discover a setup error (e.g., forgot to set company car, wrong VAT status). Currently, invoices won't be reclassified because they're already marked as processed.

## Solution: Situation Hash + Smart Reclassification

### Core Concept

Store a **situation hash** with each invoice. When the situation changes, detect which invoices need reclassification.

```
Invoice Date: 2024-03-15
Situation Hash: sha256(situation_id + income_sources_json)
                = "a1b2c3..."
```

When situation for 2024 changes → hash changes → invoice needs reprocessing.

---

## Database Schema Changes

### emails table additions

```sql
ALTER TABLE emails ADD COLUMN situation_hash TEXT;
-- Hash of (situation_id + active_income_source_ids) at processing time
-- NULL = never processed with situation context

ALTER TABLE emails ADD COLUMN last_classified_at TEXT;
-- ISO timestamp of last classification run
```

### New: classification_history table (audit trail)

```sql
CREATE TABLE classification_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL,
  account TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  situation_hash TEXT NOT NULL,
  situation_id TEXT NOT NULL,
  
  -- Classification results at that time
  deductible TEXT,
  income_tax_percent INTEGER,
  vat_recoverable INTEGER,
  income_source_id TEXT,
  
  -- Reason for reclassification
  trigger TEXT NOT NULL, -- 'initial', 'situation_change', 'manual', 'from_stage'
  
  FOREIGN KEY (email_id, account) REFERENCES emails(id, account)
);
```

---

## Situation Hash Computation

```typescript
// src/lib/situations.ts

import { createHash } from 'crypto';

export interface SituationContext {
  situation: Situation;
  activeIncomeSources: IncomeSource[];
}

export function computeSituationHash(context: SituationContext): string {
  const data = {
    situationId: context.situation.id,
    // Include all fields that affect classification
    vatStatus: context.situation.vatStatus,
    hasCompanyCar: context.situation.hasCompanyCar,
    companyCarType: context.situation.companyCarType,
    carBusinessPercent: context.situation.carBusinessPercent,
    telecomBusinessPercent: context.situation.telecomBusinessPercent,
    homeOffice: context.situation.homeOffice,
    // Income sources affect allocation
    incomeSourceIds: context.activeIncomeSources.map(s => s.id).sort(),
  };
  
  return createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16); // 16 chars is enough for collision avoidance
}

export function getContextForDate(
  config: KraxlerConfig,
  date: Date
): SituationContext | null {
  const situation = getSituationForDate(config, date);
  if (!situation) return null;
  
  const activeIncomeSources = getActiveIncomeSourcesForDate(config, date);
  return { situation, activeIncomeSources };
}
```

---

## Detection: Which Invoices Need Reclassification?

```typescript
// src/lib/reclassification.ts

export interface ReclassificationNeeded {
  emailId: string;
  invoiceDate: string;
  currentHash: string | null;
  newHash: string;
  reason: string;
}

export function detectReclassificationNeeded(
  config: KraxlerConfig,
  account: string
): ReclassificationNeeded[] {
  const db = getDatabase(account);
  const emails = db.prepare(`
    SELECT id, invoice_date, situation_hash 
    FROM emails 
    WHERE status IN ('extracted', 'reviewed', 'filed')
      AND invoice_date IS NOT NULL
  `).all() as { id: string; invoice_date: string; situation_hash: string | null }[];
  
  const results: ReclassificationNeeded[] = [];
  
  for (const email of emails) {
    const date = new Date(email.invoice_date);
    const context = getContextForDate(config, date);
    
    if (!context) {
      // No situation covers this date - might need attention
      if (email.situation_hash) {
        results.push({
          emailId: email.id,
          invoiceDate: email.invoice_date,
          currentHash: email.situation_hash,
          newHash: '',
          reason: 'No situation covers this date',
        });
      }
      continue;
    }
    
    const newHash = computeSituationHash(context);
    
    if (email.situation_hash !== newHash) {
      results.push({
        emailId: email.id,
        invoiceDate: email.invoice_date,
        currentHash: email.situation_hash,
        newHash,
        reason: email.situation_hash 
          ? 'Situation changed' 
          : 'Never classified with situation context',
      });
    }
  }
  
  return results;
}
```

---

## CLI: `kraxler run --from <stage>`

### Stage Pipeline

```
scan → prefilter → classify → extract → review → file → report
```

### Implementation

```typescript
// src/commands/run.ts

const STAGES = ['scan', 'prefilter', 'classify', 'extract', 'review', 'file', 'report'] as const;
type Stage = typeof STAGES[number];

interface RunOptions {
  from?: Stage;
  dateRange?: { from: string; to: string };
  force?: boolean;  // Ignore situation hash, reprocess anyway
  account?: string;
}

export async function run(options: RunOptions = {}): Promise<void> {
  const config = loadConfig();
  const fromIndex = options.from ? STAGES.indexOf(options.from) : 0;
  
  if (fromIndex === -1) {
    console.error(`Unknown stage: ${options.from}`);
    console.log(`Valid stages: ${STAGES.join(', ')}`);
    process.exit(1);
  }
  
  // Check for reclassification needs before running
  if (!options.force && fromIndex <= STAGES.indexOf('classify')) {
    const reclassNeeded = detectReclassificationNeeded(config, options.account || 'default');
    
    if (reclassNeeded.length > 0) {
      console.log(`\n⚠️  ${reclassNeeded.length} invoice(s) may need reclassification due to situation changes.\n`);
      
      // Group by date range
      const dates = reclassNeeded.map(r => r.invoiceDate).sort();
      console.log(`   Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
      console.log(`   Reasons:`);
      
      const byReason = groupBy(reclassNeeded, r => r.reason);
      for (const [reason, items] of Object.entries(byReason)) {
        console.log(`     - ${reason}: ${items.length} invoice(s)`);
      }
      
      // Will proceed with --from classify automatically picking these up
    }
  }
  
  const stagesToRun = STAGES.slice(fromIndex);
  console.log(`Running stages: ${stagesToRun.join(' → ')}`);
  
  for (const stage of stagesToRun) {
    await runStage(stage, options);
  }
}

async function runStage(stage: Stage, options: RunOptions): Promise<void> {
  switch (stage) {
    case 'scan':
      // Fetch new emails from Gmail
      break;
    case 'prefilter':
      // Apply prefilter rules
      break;
    case 'classify':
      // Run AI classification
      // If options.from === 'classify', also pick up stale-hash invoices
      await runClassification({
        ...options,
        includeStaleHashes: options.from === 'classify',
      });
      break;
    // ... etc
  }
}
```

---

## Setup Command: Warn About Reclassification

When user modifies a situation via `kraxler setup`:

```typescript
// src/commands/setup.ts

async function modifySituation(config: KraxlerConfig, situationId: string): Promise<void> {
  const originalSituation = config.situations.find(s => s.id === situationId);
  
  // ... user makes changes ...
  
  const modifiedSituation = { ...originalSituation, ...userChanges };
  
  // Check if changes affect classification
  const affectsClassification = (
    originalSituation.vatStatus !== modifiedSituation.vatStatus ||
    originalSituation.hasCompanyCar !== modifiedSituation.hasCompanyCar ||
    originalSituation.companyCarType !== modifiedSituation.companyCarType ||
    originalSituation.carBusinessPercent !== modifiedSituation.carBusinessPercent ||
    originalSituation.telecomBusinessPercent !== modifiedSituation.telecomBusinessPercent
  );
  
  if (affectsClassification) {
    // Count affected invoices
    const affected = countAffectedInvoices(config, modifiedSituation);
    
    if (affected > 0) {
      console.log(`\n⚠️  This change affects ${affected} existing invoice(s) in the date range`);
      console.log(`   ${modifiedSituation.from} to ${modifiedSituation.to || 'ongoing'}\n`);
      console.log(`These invoices will need reclassification.`);
      console.log(`Their tax calculations (VAT recovery, income tax %) may change.\n`);
      
      const answer = await prompt('Run reclassification now? [Y/n]: ');
      
      if (answer.toLowerCase() !== 'n') {
        // Save config first
        saveConfig(config);
        
        // Run from classify stage for the affected date range
        await run({
          from: 'classify',
          dateRange: {
            from: modifiedSituation.from,
            to: modifiedSituation.to || new Date().toISOString().split('T')[0],
          },
        });
      } else {
        console.log(`\nRun 'kraxler run --from classify' later to reclassify.`);
      }
    }
  }
  
  // Save config
  saveConfig(config);
}
```

---

## Which Stages Need Re-running?

| Change Type | Stages to Re-run |
|-------------|------------------|
| VAT status (Kleinunternehmer ↔ Regelbesteuert) | classify → extract → review → file |
| Company car (added/removed/type changed) | classify → extract → review → file |
| Car business % changed | extract → review → file |
| Telecom/internet % changed | extract → review → file |
| Home office type changed | report only (affects summary) |
| Income source added/removed | extract → review → file (allocation) |
| Allocation rule added/changed | extract → review → file |

### Logic

```typescript
function determineStartStage(changeType: string): Stage {
  switch (changeType) {
    case 'vat_status':
    case 'company_car':
      return 'classify'; // AI prompt changes
    case 'car_percent':
    case 'telecom_percent':
    case 'income_source':
    case 'allocation_rule':
      return 'extract'; // Just recalculate, don't re-query AI
    case 'home_office':
      return 'report'; // Only affects totals
    default:
      return 'classify';
  }
}
```

---

## CLI Usage Examples

```bash
# Normal full run
kraxler run

# Re-run from classification (after situation change)
kraxler run --from classify

# Re-run only extraction onwards (recalc percentages)
kraxler run --from extract

# Force reprocess everything, ignore hashes
kraxler run --from classify --force

# Limit to date range
kraxler run --from classify --date-range 2024-01-01:2024-12-31
```

---

## UX Flow: Setup Change Detection

```
$ kraxler setup

Current situations:
  [1] 2024-01-01 → ongoing: Regelbesteuert, Electric Car (80%)

What would you like to do?
  [1] Add situation
  [2] Edit situation
  [3] Manage income sources
  [4] Done

> 2

Select situation to edit: 1

Editing: 2024-01-01 → ongoing

What to change?
  [1] VAT status (currently: Regelbesteuert)
  [2] Company car (currently: Electric, 80%)
  [3] Telecom % (currently: 50%)
  [4] Home office (currently: None)
  [5] Date range

> 1

VAT Status:
  [1] Regelbesteuert (regular VAT)
  [2] Kleinunternehmer (small business, no VAT)

> 2

⚠️  Changing to Kleinunternehmer affects 47 invoices from 2024.

These changes will occur:
  • VAT recovery will be disabled for all business expenses
  • Vehicle expenses: VAT recovery → No VAT recovery
  • Software/tools: VAT recovery → No VAT recovery

Run reclassification now? [Y/n]: y

Running classification for 47 invoices...
  ████████████████████ 100%

✓ Reclassification complete.
  • 47 invoices updated
  • VAT recovery removed: €2,341.50
```

---

## Implementation Order

1. **Add situation_hash to emails table** (migration)
2. **Implement computeSituationHash()**
3. **Update extract command** to store hash when classifying
4. **Implement detectReclassificationNeeded()**
5. **Add --from flag to run command**
6. **Add warnings to setup command**
7. **Add classification_history table** (audit trail)

---

## Edge Cases

### Invoice date outside all situations
- Warn user: "Invoice from 2023-05-15 has no matching situation"
- Use fallback defaults or prompt for situation creation

### Multiple situations in one day
- Not allowed by validation (situations can't overlap)

### Reclassification changes category
- Old: "full" (100% VAT), New: "full" (0% VAT, Kleinunternehmer)
- Log the change in classification_history
- Update all calculated fields

### User declines reclassification
- Config is saved with new situation
- Invoices retain old hash
- Next `kraxler run` will detect mismatch and prompt again
