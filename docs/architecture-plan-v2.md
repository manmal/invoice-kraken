# Kraxler v2 Architecture Plan

*Transition from flat, single-context configuration to temporal, multi-source system*

---

## 1. Code Structure Changes

### New Modules

| File | Purpose |
|------|---------|
| `src/lib/situations.ts` | Temporal context management. Retrieves active `Situation` for any given date. |
| `src/lib/allocation-engine.ts` | Core expense routing logic. Hierarchy: **Manual Override > Allocation Rule > AI Suggestion > Category Default > Heuristic** |
| `src/lib/jurisdictions/interface.ts` | Defines `TaxRules` interface (VAT recovery logic, allocation constraints like AT 10% rule) |
| `src/lib/jurisdictions/at.ts` | Austrian-specific rules (moved from `vendors.ts` and `config.ts`) |
| `src/lib/jurisdictions/registry.ts` | Entry point for pluggable country logic |

### Modified Modules

| File | Changes |
|------|---------|
| `src/types.ts` | Redefine `KraxlerConfig` to hold arrays of `Situation`, `IncomeSource`, `AllocationRule`. Update `Email` to include `situation_id`, `income_source_id`, `allocation_json` |
| `src/lib/config.ts` | Refactor for nested structures. Add `Migration` utility for legacy configs |
| `src/lib/ai.ts` | Update `buildClassificationPrompt` to inject specific `Situation` active on invoice date |
| `src/lib/vendors.ts` | Strip logic, keep only "Global Vendor Database". Logic moves to jurisdiction files |

### Deprecations

| Function | Replacement |
|----------|-------------|
| `getVehicleVatRecovery()` | Takes `Situation` as argument |
| `isKleinunternehmer()` | Takes `Situation` as argument |
| Global config lookups | Date-based situation lookups |

---

## 2. Database Schema Changes

### New Tables

#### `situations`
```sql
CREATE TABLE situations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_date TEXT NOT NULL,           -- YYYY-MM-DD
  to_date TEXT,                      -- NULL = ongoing
  
  jurisdiction TEXT NOT NULL,        -- 'AT', 'DE', 'CH'
  vat_status TEXT NOT NULL,          -- 'kleinunternehmer', 'regelbesteuert'
  
  has_company_car INTEGER NOT NULL,  -- 0 or 1
  company_car_type TEXT,             -- 'ice', 'electric', etc.
  company_car_name TEXT,
  car_business_percent INTEGER,
  
  telecom_business_percent INTEGER NOT NULL,
  internet_business_percent INTEGER NOT NULL,
  home_office_type TEXT NOT NULL,    -- 'pauschale_gross', 'pauschale_klein', 'actual', 'none'
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `income_sources`
```sql
CREATE TABLE income_sources (
  id TEXT PRIMARY KEY,               -- 'freelance_dev', 'rental_apt_1'
  name TEXT NOT NULL,
  category TEXT NOT NULL,            -- IncomeCategory
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  
  telecom_percent_override INTEGER,
  internet_percent_override INTEGER,
  vehicle_percent_override INTEGER,
  
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `allocation_rules`
```sql
CREATE TABLE allocation_rules (
  id TEXT PRIMARY KEY,
  
  vendor_domain TEXT,
  vendor_pattern TEXT,
  deductible_category TEXT,
  min_amount_cents INTEGER,
  
  strategy TEXT NOT NULL,            -- 'exclusive', 'split_fixed', 'manual'
  allocations_json TEXT NOT NULL,    -- [{"source_id": "x", "percent": 60}, ...]
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Modified `emails` Table

```sql
ALTER TABLE emails ADD COLUMN situation_id INTEGER;
ALTER TABLE emails ADD COLUMN income_source_id TEXT;
ALTER TABLE emails ADD COLUMN allocation_json TEXT;
ALTER TABLE emails ADD COLUMN assignment_status TEXT;  -- 'rule_match', 'ai_suggested', 'manual_review', 'confirmed'
```

### Migration Strategy

1. Create new tables
2. **Bootstrap**: Convert existing flat config into `Situation #1` (valid from 1970-01-01) and `IncomeSource #1` ("Default Business")
3. **Backfill**: Update all `emails` records where `status = 'downloaded'` to link to these default IDs

---

## 3. AI Prompt Changes

### Context Injection

The prompt becomes dynamic based on `invoice_date`:

```
For this invoice (Date: 2025-03-01), the user's tax situation:
- VAT Status: REGELBESTEUERT (can recover VAT)
- Company Car: Tesla Model 3 (ELECTRIC) - 80% business use
- Active income sources:
  1. "Freelance Software Dev" (selbständige Arbeit)
  2. "Apartment Linz" (Vermietung)
```

### Output Format Changes

Add to AI response schema:
```typescript
{
  // ... existing fields ...
  suggested_income_source_id: string | null;
  is_split_candidate: boolean;
  split_reason?: string;
}
```

---

## 4. Pipeline Stage Changes

### `extract` Stage (Primary Changes)

1. **Date Extraction**: AI first extracts `invoice_date`
2. **Context Lookup**: Fetch `Situation` and active `IncomeSources` for that date
3. **Rules Pre-match**: Check `AllocationRules` before AI. If match exists, inform AI: "This vendor is already assigned 100% to Freelance"
4. **Post-AI Assignment**: If no rule, use AI suggestion. If AI says "unclear", mark `assignment_status = 'manual_review'`

### `review` Stage

- Display assigned `IncomeSource` in UI
- Add "Split" action to review menu
- Option to save split as new `AllocationRule`

---

## 5. Configuration Changes

### New `kraxler.json` Structure (Version 2)

```json
{
  "version": 2,
  "jurisdiction": "AT",
  "situations": [
    {
      "id": 1,
      "from": "2024-01-01",
      "to": "2024-12-31",
      "vatStatus": "kleinunternehmer",
      "hasCompanyCar": true,
      "companyCarType": "ice",
      "carBusinessPercent": 60,
      "telecomBusinessPercent": 50,
      "internetBusinessPercent": 70,
      "homeOffice": "pauschale_gross"
    }
  ],
  "income_sources": [
    {
      "id": "src_dev",
      "name": "Freelance Dev",
      "category": "selbstaendige_arbeit",
      "valid_from": "2020-01-01",
      "valid_to": null
    }
  ],
  "allocation_rules": [],
  "accounts": ["user@gmail.com"],
  "setup_completed": true
}
```

### Interactive Setup

- `kraxler setup` - Full interactive wizard for first-time setup
- Sub-commands: `sources`, `situations`, `rules`

---

## 6. Jurisdiction Abstraction

### `TaxRules` Interface

```typescript
interface TaxRules {
  jurisdiction: string;
  
  // Validation
  validateAllocation(allocations: Allocation[]): ValidationError[];
  validateSituation(situation: Situation): ValidationError[];
  
  // Calculations
  calculateVatRecovery(category: DeductibleCategory, situation: Situation): VatRecoveryResult;
  calculateIncomeTaxPercent(category: DeductibleCategory, situation: Situation): number;
  
  // Defaults
  getDefaultSourceCategory(vendor: KnownVendor): IncomeCategory | null;
  getFixedPercentages(): Record<string, number>;  // e.g., meals: 50%
}
```

### Country-Specific Files

```
src/lib/jurisdictions/
├── interface.ts      # TaxRules interface
├── registry.ts       # Jurisdiction loader
├── at.ts             # Austrian rules
├── de.ts             # German rules (future)
└── ch.ts             # Swiss rules (future)
```

---

## 7. Testing Strategy

### Unit Tests

| Module | Test Cases |
|--------|------------|
| `situations.ts` | Overlapping dates, open-ended ranges, dates before any situation |
| `allocation-engine.ts` | 10% rule validation, split calculations, rule matching |
| `jurisdictions/at.ts` | Vehicle VAT by type, Kleinunternehmer logic, home office constraints |
| `config.ts` | Legacy migration, version detection |

### Integration Scenarios

1. **Mid-Year VAT Change**: User switches Kleinunternehmer → Regelbesteuert on July 1st. Verify June invoices get 0% VAT recovery, July invoices get 20%.

2. **Overlapping Sources**: Invoice for "Amazon" with both "Rental" and "Freelance" active → must trigger `manual_review`.

3. **Car Type Change**: User switches ICE → Electric mid-year. Vehicle expenses before switch = no VAT, after = full VAT.

4. **Rule Override**: User creates rule "Amazon → Freelance 100%". Subsequent Amazon invoices auto-assign without review.

### Mock Strategies

- Mock `SituationManager` for controlled date scenarios
- Mock `AllocationRule` database for rule matching tests
- Mock AI responses for classification tests

---

## 8. Constraints & README Updates

Document in README:
- All situations must be in **one jurisdiction** (users cannot mix AT + DE)
- Home office Pauschale applies **once per person**, not per source
- Kleinunternehmer threshold counts **all business income sources combined**
- 10% rule: allocations must be 0% or ≥10%

---

## 9. Detailed Design Decisions

### 9.1 Allocation Engine Priority System

#### Priority Tiers (Waterfall)

| Priority | Type | Description | Modifiable? |
|----------|------|-------------|-------------|
| 1 | **Manual Override** | User edited this specific invoice record | Per-invoice |
| 2 | **Allocation Rule** | Global rule in config (proactive, applies to all matches) | In config |
| 3 | **AI Suggestion** | LLM classification based on context | Automatic |
| 4 | **Category Default** | Fallback mapping in config | In config |
| 5 | **Heuristics** | Hardcoded logic (single-source fallback, vendor history) | Code |

**Key Distinction:**
- **Rules** are proactive — apply to all future matching items
- **Overrides** are reactive — apply to one specific invoice

#### Category Defaults
Config-based mapping from deductibility category to income source:
```json
{
  "category_defaults": {
    "full": "src_dev",           // Software → main business
    "vehicle": "src_dev",        // Car → main business
    "telecom": "src_dev",        // Phone → main business
    "meals": "src_dev"           // Business meals → main business
  }
}
```

#### Heuristics (Hardcoded)
1. **Single-Source Fallback**: If only one `IncomeSource` active on invoice date → assign 100%
2. **Vendor History**: If 100% of last N invoices from vendor went to source X → assume X
3. **Category Affinity**: Building insurance → rental, IDE license → software business

#### Audit Trail
Store `assignment_metadata` JSON in `emails` table:
```json
{
  "source": "rule",
  "rule_id": "rule_amazon_dev",
  "confidence": 1.0,
  "timestamp": "2025-12-27T10:00:00Z",
  "alternatives_considered": ["src_rental"],
  "logic_version": "2.0.1"
}
```

---

### 9.2 Situation/IncomeSource Temporal Relationship

#### Key Principle: Decoupled Timelines

- **Situations** = WHO you are (tax status, car, home office)
- **IncomeSources** = WHAT you do (freelance, rental, employment)

They have **independent** date ranges.

#### Example: Mid-Year VAT Change

```
Timeline:
├── IncomeSource: "Freelance Dev" ──────────────────────────────►
│   (2020-01-01 → ongoing)
│
├── Situation 1: Kleinunternehmer ────────┐
│   (2024-01-01 → 2024-06-30)             │
│                                          │
└── Situation 2: Regelbesteuert ──────────┴───────────────────────►
    (2024-07-01 → ongoing)

Invoice on 2024-05-10:
  → Uses Situation 1 (0% VAT recovery)
  → Assigned to IncomeSource "Freelance Dev"
```

#### Percentage Layering

1. **Situation** defines total business % (e.g., "Telecom 50% business")
2. **AllocationRule** or AI defines split among sources (e.g., "of that 50%, 80% to Dev, 20% to Rental")

#### Gap Handling

- **Validation**: `extract` fails with "Temporal Gap" error if invoice date has no situation
- **Warning**: `kraxler status` shows ⚠️ for date ranges without situations
- **Suggestion**: Prompt user to add "no business activity" situation for gaps

#### Storage Strategy

- `kraxler.json` = **System of Record** (human-editable, version-controlled)
- SQLite tables = **Query Cache** (synced from JSON on each command run)

---

### 9.3 Migration Strategy

#### Phase 1: Bootstrap
1. Read existing `config.json` 
2. Create `Situation #1` with `from = '1970-01-01'`
3. Create `IncomeSource #1` ("Default Business") with same range

#### Phase 2: Backfill
1. Mark all existing invoices with `migration_source: 'v1'`
2. Link to `Situation #1` and `IncomeSource #1`
3. Preserve existing `deductible`, `income_tax_percent`, `vat_recoverable`

#### Phase 3: Audit (Optional)
- `kraxler audit --since 2024-01-01` compares old vs new classification
- Flags records where new logic differs
- User reviews flagged items

#### Manual Reviews Migration
- Convert `manual_reviews` entries to `AllocationRules` with `strategy: 'exclusive'`

---

### 9.4 AI Prompt Engineering

#### Preventing Hallucination: Dynamic Enum Injection

The AI receives only valid source IDs for the invoice date:

```
ACTIVE INCOME SOURCES for invoice date 2025-03-15:
- ID: "src_dev", Name: "Software Consulting", Category: selbständige Arbeit
- ID: "src_rent", Name: "Apartment Graz", Category: Vermietung

Your 'suggested_income_source_id' MUST be one of: ["src_dev", "src_rent"]
If uncertain, return null and set is_split_candidate: true
```

#### Split Candidate Heuristics

AI flags `is_split_candidate: true` when:
1. Vendor is a "General Store" (Amazon, MediaMarkt, etc.)
2. Invoice contains distinct line items for different purposes
3. Amount significantly exceeds vendor's typical average
4. Subject/body mentions multiple projects or properties

#### Context Sent to AI

Minimal but sufficient:
```json
{
  "invoice_date": "2025-03-15",
  "situation": {
    "vatStatus": "regelbesteuert",
    "companyCarType": "electric",
    "carBusinessPercent": 80
  },
  "active_sources": [
    {"id": "src_dev", "name": "Software Consulting", "category": "selbstaendige_arbeit"},
    {"id": "src_rent", "name": "Apartment Graz", "category": "vermietung"}
  ]
}
```

---

### 9.5 Interactive Setup UX Flow

#### First-Time Setup: `kraxler setup`

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  🇦🇹 KRAXLER SETUP                                                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

Step 1/4: Jurisdiction
  Where do you pay taxes?
  [1] 🇦🇹 Austria
  [2] 🇩🇪 Germany (coming soon)
  [3] 🇨🇭 Switzerland (coming soon)
  > 1

Step 2/4: Your Tax Situation
  When did your current tax situation begin? (YYYY-MM-DD)
  > 2024-01-01
  
  Are you a Kleinunternehmer (< €55k revenue)? (y/n)
  > n
  
  Do you have a company car? (y/n)
  > y
  
  Car type:
  [1] Gasoline/Diesel (ICE) — no VAT recovery
  [2] Electric — full VAT recovery
  > 2
  
  Car name (optional): Tesla Model 3
  Business use % (10-100): 80
  
  Telecom business use % (10-100): 50
  Internet business use % (10-100): 70
  
  Home office:
  [1] Pauschale €1,200/year (no other workplace)
  [2] Pauschale €300/year (have other workplace)
  [3] Actual costs (separate room)
  [4] None
  > 1

Step 3/4: Income Sources
  Name your primary income source: Freelance Software Dev
  
  Category:
  [1] Selbständige Arbeit (Freelance/Consulting)
  [2] Gewerbebetrieb (Trade/Business)
  [3] Nichtselbständige Arbeit (Employment)
  [4] Vermietung (Rental)
  > 1
  
  Add another income source? (y/n): n

Step 4/4: Confirmation
  ✅ Situation created: 2024-01-01 → ongoing
     🇦🇹 Austria · Regelbesteuert
     🚗 Tesla Model 3 (EV), 80% business
     📱 Telecom 50% · 🌐 Internet 70% · 🏠 Pauschale €1,200
  
  ✅ Income Source created: "Freelance Software Dev" (selbständige Arbeit)
  
  Setup complete! Run 'kraxler scan -a your@email.com --year 2024' to start.
```

#### Adding Mid-Year Change: `kraxler setup`

```
Current situations:
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. 2024-01-01 → ongoing                                                      │
│    🇦🇹 Austria · Kleinunternehmer                                            │
│    🚗 VW Golf (ICE), 60% business                                            │
│    📱 Telecom 50% · 🌐 Internet 70% · 🏠 Pauschale €1,200                     │
└──────────────────────────────────────────────────────────────────────────────┘

[A] Add new situation (something changed)
[E] Edit existing situation
[S] Manage income sources
[Q] Quit

> a

When did the change occur? (YYYY-MM-DD): 2024-07-01

Situation #1 will end on 2024-06-30.

What changed?
[1] VAT status (Kleinunternehmer ↔ Regelbesteuert)
[2] Company car
[3] Home office
[4] Business percentages
[5] Multiple changes
> 1

New VAT status:
[1] Kleinunternehmer
[2] Regelbesteuert
> 2

✅ Created Situation #2: 2024-07-01 → ongoing (Regelbesteuert)
   (Inherited other settings from Situation #1)
```

#### Validation Rules

1. **No Overlap**: Situations cannot cover same date
2. **Continuity**: Gap warning shown, user prompted to fill
3. **Source Coverage**: Each situation must have ≥1 income source active
4. **10% Rule**: All percentages validated (0 or 10-100)

---

## 10. Implementation Checklist

### Phase 1: Foundation (Types & Schema)

- [ ] Update `src/types.ts` with new interfaces:
  - [ ] `Situation`
  - [ ] `IncomeSource`
  - [ ] `IncomeCategory`
  - [ ] `AllocationRule`
  - [ ] `AllocationStrategy`
  - [ ] Updated `KraxlerConfig` (version 2)
  - [ ] Updated `Email` (new columns)

- [ ] Create database migration in `src/lib/db.ts`:
  - [ ] `situations` table
  - [ ] `income_sources` table
  - [ ] `allocation_rules` table
  - [ ] Add columns to `emails` table
  - [ ] Migration logic for existing data

### Phase 2: Jurisdiction Abstraction

- [ ] Create `src/lib/jurisdictions/` directory
- [ ] `interface.ts` - `TaxRules` interface
- [ ] `registry.ts` - Jurisdiction loader
- [ ] `at.ts` - Austrian rules (extract from `vendors.ts` and `config.ts`)

### Phase 3: Core Engine

- [ ] Create `src/lib/situations.ts`:
  - [ ] `getSituationForDate(date: Date): Situation | null`
  - [ ] `getActiveIncomeSources(date: Date): IncomeSource[]`
  - [ ] `validateSituations(): ValidationError[]`
  - [ ] `syncToDatabase(): void`

- [ ] Create `src/lib/allocation-engine.ts`:
  - [ ] `assignExpense(invoice, situation, sources): AllocationResult`
  - [ ] Rule matching logic
  - [ ] Heuristics implementation
  - [ ] 10% rule validation

### Phase 4: Config & Migration

- [ ] Update `src/lib/config.ts`:
  - [ ] New config structure (version 2)
  - [ ] `migrateV1ToV2(): KraxlerConfig`
  - [ ] Version detection
  - [ ] Validation

- [ ] Create `src/lib/migration.ts`:
  - [ ] Bootstrap default situation/source
  - [ ] Backfill existing emails
  - [ ] Convert manual_reviews to allocation_rules

### Phase 5: AI Integration

- [ ] Update `src/lib/ai.ts`:
  - [ ] `buildClassificationPrompt()` - inject situation context
  - [ ] Add `suggested_income_source_id` to output schema
  - [ ] Add `is_split_candidate` to output schema
  - [ ] Dynamic enum injection for source IDs

### Phase 6: Pipeline Updates

- [ ] Update `src/commands/extract.ts`:
  - [ ] Fetch situation for invoice date
  - [ ] Pre-match allocation rules
  - [ ] Post-AI assignment logic
  - [ ] Store assignment metadata

- [ ] Update `src/lib/interactive-review.ts`:
  - [ ] Display income source in review UI
  - [ ] Add "Split" action
  - [ ] Option to create allocation rule from decision

- [ ] Update `src/commands/report.ts`:
  - [ ] Include income_source_id in exports
  - [ ] Include allocation splits

### Phase 7: Setup Command

- [ ] Create/update `src/commands/setup.ts`:
  - [ ] First-time setup wizard
  - [ ] Situation management (add/edit/delete)
  - [ ] Income source management
  - [ ] Allocation rule management
  - [ ] Validation feedback

### Phase 8: Testing

- [ ] Unit tests for `situations.ts`
- [ ] Unit tests for `allocation-engine.ts`
- [ ] Unit tests for `jurisdictions/at.ts`
- [ ] Unit tests for migration logic
- [ ] Integration tests for mid-year changes
- [ ] Integration tests for multi-source scenarios

### Phase 9: Documentation

- [ ] Update README.md with:
  - [ ] New setup flow
  - [ ] Situation/source concepts
  - [ ] Constraints (single jurisdiction, home office, etc.)
- [ ] Update `docs/austrian-tax-deductibility.md` if needed

---

## 11. File Change Summary

### New Files
```
src/lib/
├── situations.ts              # Temporal context management
├── allocation-engine.ts       # Expense routing logic
├── migration.ts               # V1 → V2 migration
└── jurisdictions/
    ├── interface.ts           # TaxRules interface
    ├── registry.ts            # Jurisdiction loader
    └── at.ts                  # Austrian rules

src/commands/
└── setup.ts                   # Interactive setup (new or heavily modified)
```

### Modified Files
```
src/types.ts                   # New interfaces, updated Email
src/lib/config.ts              # V2 structure, migration
src/lib/db.ts                  # New tables, schema migration
src/lib/ai.ts                  # Context injection, new output fields
src/lib/vendors.ts             # Strip logic (keep vendor DB only)
src/lib/interactive-review.ts  # Income source display, split action
src/commands/extract.ts        # Situation lookup, allocation
src/commands/report.ts         # Include source/allocation in export
README.md                      # Document new concepts
```

### Deprecated/Removed
```
src/lib/config.ts:
  - getVehicleVatRecovery()    # Replaced by situation-aware version
  - isKleinunternehmer()       # Replaced by situation-aware version
  - getTelecomBusinessPercent() # Replaced by situation-aware version
```
