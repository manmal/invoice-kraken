# Gap Analysis: German Freelancer Support (2025)

## 1. Executive Summary

The current Kraxler metamodel and rules system (v2) is **largely compatible** with the requirements for German Sole Proprietors (Einzelunternehmer). The separation of **Income Tax Deductibility** (EStG) and **VAT Recovery** (UStG) in the `TaxRules` interface allows for the specific "asymmetric" treatment common in German tax law (e.g., Business Meals: 70% income tax deductible vs. 100% VAT recoverable).

However, specific gaps exist regarding **complex status thresholds** (Kleinunternehmer), **vehicle taxation nuances** (1% rule vs. asset allocation), and **Home Office calculation methods** (Tagespauschale).

## 2. Metamodel Fit Analysis

### 2.1 Core Concepts

| Concept | Current Model (`src/types.ts`) | German Requirement (2025) | Fit |
| :--- | :--- | :--- | :--- |
| **Jurisdiction** | `jurisdiction: string` | 'DE' | ✅ Perfect |
| **VAT Status** | `VatStatus` ('kleinunternehmer' \| 'regelbesteuert') | Same distinction exists. | ✅ Perfect |
| **Income Categories** | `IncomeCategory` ('selbstaendige_arbeit' etc.) | Matches DE distinction (*Freiberufler* vs *Gewerbetreibende*). | ✅ Perfect |
| **Deductibility** | `DeductibleCategory` (full, meals, etc.) | Covers main DE categories (Bewirtung, GWG, etc.). | ✅ Good |
| **Separation of Tax/VAT** | `IncomeTaxResult` vs `VatRecoveryResult` | Critical for DE (e.g. Meals 70%/100%, Gifts >35€ 0%/0%). | ✅ Perfect |

### 2.2 Critical Gaps in `TaxRules` Interface

#### A. Kleinunternehmer Thresholds
*   **Current:** `getKleinunternehmerThreshold(): number` returns a single static number (used for AT: €35k/€55k).
*   **German Rule:** Two-tier check:
    1.  Previous year revenue ≤ €25,000.
    2.  Current year revenue ≤ €100,000 (hard cap).
*   **Gap:** The interface assumes a single threshold.
*   **Recommendation:** Update interface to accept `year` and `revenue_history` or abstract the status check into a `validateVatStatus(revenue: number, previousRevenue: number): boolean` method.

#### B. Home Office Types
*   **Current:** `HomeOfficeType` = `'pauschale_gross' | 'pauschale_klein' | 'actual' | 'none'`.
*   **German Rule:**
    1.  **Tagespauschale:** €6/day (max €1,260/year). Does not fit "gross/klein" fixed logic directly.
    2.  **Actual:** Requires "center of activity" or "no other workplace".
*   **Gap:** `'pauschale_gross'` and `'pauschale_klein'` are Austrian artifacts. DE needs a `daily_flat_rate` concept or a remapping.
*   **Recommendation:** Add `'daily_flat_rate'` to `HomeOfficeType` or generalize the enum to `flat_rate_A`, `flat_rate_B` and let jurisdiction define them.

#### C. Vehicle Taxation (The "1% Rule")
*   **Current:** `Situation` has `carBusinessPercent`. `calculateIncomeTaxPercent` returns this %.
*   **German Rule:**
    *   **>50% Business Use:** "Necessary Business Asset". All costs 100% booked, then *private use added back* as income (1% method or Logbook).
    *   **10-50% Business Use:** Option to treat as business asset or private.
    *   **<10%:** Private asset. Only €0.30/km deductible.
*   **Gap:** The current engine calculates a *deductible percentage* of an expense. It does not handle "Book 100% and generate a phantom income transaction".
*   **Workaround:** For the MVP, `calculateIncomeTaxPercent` can return the business % (e.g. 60%) to approximate the net effect, or return 100% and rely on a separate "End of Year" adjustment feature (AOB).

## 3. Detailed Rules Mapping (DE)

### 3.1 Deductibility Rules (`src/lib/jurisdictions/de.ts`)

Based on the Guide, here is the proposed logic for a new `de.ts`:

| Category | Income Tax Logic (`calculateIncomeTaxPercent`) | VAT Logic (`calculateVatRecovery`) | Notes |
| :--- | :--- | :--- | :--- |
| **Full** | 100% | 100% | Standard business expenses. |
| **Meals** (`Bewirtung`) | **70%** (Fixed) | **100%** | **Key Diff:** AT is 50%/100%. DE is 70%/100%. |
| **Vehicle** | Returns `situation.carBusinessPercent` (e.g. Logbook %) | **100%** (if asset) or `situation.carBusinessPercent` | DE often claims 100% VAT and pays Output VAT on private use. |
| **Telecom** | `situation.telecomBusinessPercent` (e.g. 50%) | `situation.telecomBusinessPercent` | "20% / max €240" rule exists as simplification. |
| **Gifts** | 100% if < €35, else **0%** | 100% if < €35, else **0%** | Hard cliff in DE. Need to check amount? Interface `calculate...` doesn't currently take *amount*, only `category`. **Gap**. |
| **Home Office** | 0% (handled via flat rate globally) or % of actual | 0% (usually no VAT on rent) | Complex. |

**Gap Identified:** `calculateIncomeTaxPercent` receives `(category, situation)`. It *does not* receive the **Invoice Amount**.
*   **Issue:** Cannot implement the "Gift < €35" rule dynamically without the amount.
*   **Fix:** Extend `TaxRules` methods to accept `amountCents?: number`.

### 3.2 Assets (GWG & Computers)
*   **GWG Limit:** €800 net (DE 2025).
*   **Computers:** 1-year depreciation (immediate deduction) allowed since 2021.
*   **Impact:** The `Expense` model might need an `is_asset` flag or `depreciation_years` field if we want to be precise. For a simple cash-basis (EÜR) tool, treating GWG and Computers as "Immediate Expenses" is acceptable.

## 4. Implementation Plan

### Step 1: Interface Refactoring
1.  **Update `TaxRules`:** Modify `calculateIncomeTaxPercent` and `calculateVatRecovery` to accept an optional `context` object containing `amountCents` (needed for DE Gifts threshold).
2.  **Generalize `HomeOfficeType`:** Rename/Alias `pauschale_gross`/`klein` to be more generic or add `daily_flat_rate`.

### Step 2: Create `src/lib/jurisdictions/de.ts`
Implement `TaxRules` for Germany:
```typescript
export const germanTaxRules: TaxRules = {
  jurisdiction: 'DE',
  // ...
  calculateIncomeTaxPercent(category, situation, context) {
    if (category === 'meals') return { percent: 70, ... };
    if (category === 'gifts' && context?.amountCents > 3500) return { percent: 0, ... }; 
    // ...
  }
}
```

### Step 3: Vehicle "Private Use" Handling
Decide on a strategy:
*   **Simple (Current):** Just deduct the business % of every car invoice. (E.g. Gas bill €100 -> deduct €60).
    *   *Pros:* Fits current model.
    *   *Cons:* Not technically how "1% rule" works (which books €100 expense and €X phantom income).
    *   *Verdict:* Acceptable for "Estimated Tax" purposes, but strictly inaccurate for bookkeeping.

## 5. Summary of Required Changes

1.  **Modify `src/lib/jurisdictions/interface.ts`**: Add `amountCents` to calculation signatures.
2.  **Modify `src/types.ts`**: Add `'daily_rate'` to `HomeOfficeType`.
3.  **Create `src/lib/jurisdictions/de.ts`**: Implement logic from the Guide.
4.  **Update `src/lib/jurisdictions/registry.ts`**: Register 'DE'.

## 6. Any Other Business (AOB)

*   **E-Invoices:** The Guide mentions DE is moving to E-Invoices in 2025 (receiving). The system parses emails/PDFs. If E-Invoices (XML/XRechnung) become common attachments, a new parser (XML) will be needed.
*   **Archives:** DE shortened retention to 8 years (from 10) in 2025. This affects `purge` logic if it exists.
