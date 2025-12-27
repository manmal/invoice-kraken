# Income Source Assignment Strategy
*Design document for associating expenses with specific income sources (Einkunftsarten) in Kraxler.*

## 1. Core Concepts

In the Austrian tax system (EStG), expenses must be attributed to a specific source of income.
A user can have multiple sources active simultaneously:
1.  **Employment** (Unselbständige Arbeit) - *Werbungskosten* (e.g., laptop, training)
2.  **Freelance/Self-Employment** (Selbständige Arbeit/Gewerbe) - *Betriebsausgaben*
3.  **Rental** (Vermietung & Verpachtung) - *Werbungskosten*

### The Challenge
We need to map an incoming invoice (Vendor + Deductibility Category) to one or more `IncomeSource`s.

## 2. Data Model

We need to extend `src/types.ts` and the configuration.

### 2.1 Income Source Definition
Stored in user config (`kraxler.json`):

```typescript
export type IncomeCategory = 
  | 'selbstaendige_arbeit'    // Self-employed (Freiberufler, e.g. Software Dev)
  | 'gewerbebetrieb'          // Trade/Business (e.g. Shop)
  | 'nichtselbstaendige'      // Employment (Employee expenses)
  | 'vermietung'              // Rental income
  | 'land_forstwirtschaft';   // Agriculture

export interface IncomeSource {
  id: string;                 // Unique ID (e.g., "freelance_dev", "rental_apt_1")
  name: string;               // Display name: "Freelance Software Dev", "Apt Vienna"
  category: IncomeCategory;
  
  // Validity period (critical for correct assignment)
  valid_from: string;         // YYYY-MM-DD
  valid_to: string | null;    // null = active
  
  // Default allocations for shared costs
  defaults?: {
    telecom_percent?: number; // Overrides global setting
    vehicle_percent?: number;
  };
}
```

### 2.2 Assignment Logic (The "Link")
How we connect a vendor/invoice to a source.

```typescript
export type AllocationStrategy = 
  | 'exclusive'   // 100% to this source
  | 'split_fixed' // Fixed percentage (e.g. 60/40)
  | 'shared_usage'; // Based on usage logs (complex, maybe v2)

export interface AllocationRule {
  // Matching Criteria
  vendor_domain?: string;     // e.g. "jetbrains.com"
  vendor_pattern?: string;    // Regex pattern
  deductible_category?: DeductibleCategory; // e.g. "telecom"
  
  // Allocation
  strategy: AllocationStrategy;
  
  // Targets
  allocations: {
    source_id: string;
    percent: number; // Sum should be <= 100 (remainder is private/non-deductible)
  }[];
}
```

### 2.3 Database Extension
The `emails` table needs new columns to store the result:

```sql
ALTER TABLE emails ADD COLUMN income_source_id TEXT;     -- Main source ID
ALTER TABLE emails ADD COLUMN allocation_json TEXT;      -- For splits: { "source_a": 60, "source_b": 40 }
ALTER TABLE emails ADD COLUMN allocation_status TEXT;    -- 'auto', 'manual', 'review_needed'
```

## 3. Assignment Algorithm

When an invoice is processed:

1.  **Filter Sources by Date**:
    Exclude any `IncomeSource` not active on `invoice_date`.

2.  **Check Explicit Rules**:
    Look for a user-defined `AllocationRule` matching the vendor/domain.
    *   *Match found?* Apply defined allocation. -> **Done.**

3.  **Check Category Defaults**:
    *   Is it **Software/Dev Tools**? -> Assign to `selbstaendige_arbeit` (if only 1 exists).
    *   Is it **Building Insurance**? -> Assign to `vermietung` (if only 1 exists).
    
4.  **Heuristic / Fallback**:
    *   If user has **ONLY ONE** active source (e.g., just Freelance) -> Assign 100% to it.
    *   If user has **Employment + Freelance**:
        *   Default to Freelance (most common for this tool).
        *   Flag "Employment" related items (unions, training) for review if unsure.
    *   If user has **Multiple Businesses** (e.g. IT Freelance + Crypto Trading):
        *   **AMBIGUOUS**. Mark as `review_needed`.

## 4. Shared Expenses Strategy

### Scenario: Laptop (Shared)
User is employed (40%) and freelance (60%). Buys a laptop.

*   **Approach**: User creates a Rule for "Hardware > €800" or manually reviews high-value items.
*   **Result**: Split record.
    *   Source A (Freelance): 60% of base amount.
    *   Source B (Employment): 40% of base amount.
    *   *Note*: VAT recovery only applies to the Entrepreneurial part (Freelance)!

### Scenario: Internet (Telecom)
*   Global Config: 50% Business.
*   Which business?
    *   Usually the one requiring home office (Freelance).
    *   Assignment: 100% of the *deductible portion* goes to Freelance.

## 5. Practical UX Workflow

1.  **Onboarding**:
    *   "Tell us about your income."
    *   User adds: "Freelance Dev" (Since 2020) and "Rental Apt" (Since 2022).

2.  **Review Queue**:
    *   Kraxler auto-assigns clear items (JetBrains -> Freelance).
    *   Ambiguous items (e.g., "Amazon: Hard Drive") appear in "Needs Review".
    *   User sees: "Which income source?" [Freelance] [Rental] [Split].
    *   *One-click assignment* creates a future rule: "Always assign 'Amazon' to Freelance?" (Y/N).

## 6. Metadata to Collect

To make this work, we need to collect:

1.  **Income Source List** (ID, Name, Type, Start/End Date).
2.  **Vendor->Source Overrides** (User preferences).
3.  **Project Tags** (Optional): If a freelancer wants to bill expenses to a client project (Refactoring `IncomeSource` to allow sub-projects/cost-centers in v2).

## 7. Implementation Steps

1.  **Update Config**: Add `income_sources` array to `KraxlerConfig`.
2.  **Create Rules Engine**: `src/lib/allocation.ts` implementing the logic above.
3.  **Update Database**: Add columns for source tracking.
4.  **CLI Command**: `kraxler sources add` / `kraxler sources list`.
5.  **Review UI**: Update `kraxler review` to prompt for Source if ambiguous.
