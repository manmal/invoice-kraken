# Austrian Tax Deductibility Guide for Einzelunternehmer (Sole Proprietors)

*Reference documentation for Kraxler's deductibility classification system*

Last updated: December 2025

---

## Overview

As an Austrian **Einzelunternehmer** (sole proprietor / freelancer), there are two distinct tax considerations for business expenses:

1. **Income Tax (Einkommensteuer)** - Whether the expense reduces taxable profit
2. **VAT / Input Tax (Umsatzsteuer / Vorsteuer)** - Whether you can reclaim the VAT paid

These are **independent** - an expense can be fully deductible for income tax but have no VAT recovery, or vice versa.

---

## 1. Kleinunternehmerregelung (Small Business Exemption)

### 2025 Rules

| Criterion | Value |
|-----------|-------|
| **Revenue threshold** | €55,000 gross (was €35,000 net until 2024) |
| **Tolerance** | 10% overage allowed (up to €60,500) |
| **VAT charging** | Not required |
| **Input VAT deduction** | **NOT allowed** |

**Key implications:**
- If you're a Kleinunternehmer, you **cannot** deduct Vorsteuer (input VAT)
- All expenses are recorded at gross (brutto) amounts
- The VAT you pay on purchases is simply a cost

**If you exceed the threshold:**
- You become regelbesteuert (regularly taxed)
- Must charge 20% VAT on invoices
- **Can** deduct input VAT (Vorsteuerabzug)

---

## 2. Vorsteuerabzug (Input VAT Deduction)

### General Rule

If you are **not** a Kleinunternehmer, you can deduct VAT paid on business expenses through your periodic VAT returns (Umsatzsteuervoranmeldung - monthly or quarterly).

### Requirements for VAT Deduction

1. **Proper invoice** (ordnungsgemäße Rechnung) with:
   - Supplier name and address
   - Your name and address
   - Invoice date
   - Sequential invoice number
   - Description of goods/services
   - Net amount, VAT rate, VAT amount, gross amount
   - Supplier's UID number (for invoices >€400)

2. **Business purpose** - Expense must be for the business

3. **Austrian nexus** - Delivery/service performed in Austria for your business

---

## 3. Expenses by Category

### 💼 Fully Deductible (100% Income Tax + VAT)

| Category | Examples | Notes |
|----------|----------|-------|
| **Software & Cloud** | GitHub, Anthropic, AWS, Azure, JetBrains IDEs, 1Password | Core business tools |
| **Hardware** | MacBook, monitors, keyboards, webcam | If primarily business use |
| **Office supplies** | Paper, pens, printer ink | |
| **Professional services** | Steuerberater, lawyer, accountant | |
| **Insurance** | Professional liability (Berufshaftpflicht) | |
| **Training & education** | Courses, books, conferences related to profession | |
| **Domain & hosting** | Web hosting, domain registration | |
| **Advertising** | Google Ads, website costs | |
| **Bank fees** | Business account fees | |

### 📊 Partially Deductible

#### Phone & Internet (Telefon & Internet)
| Deductibility | Rule |
|---------------|------|
| **Income tax** | Business portion only (typically 50-80%) |
| **VAT** | Same ratio as income tax |
| **Proof** | Keep usage logs or use reasonable estimate |
| **Pauschale option** | 20% of costs, max €20/month (€240/year) |

#### Business Meals (Bewirtungskosten)
| Deductibility | Rule |
|---------------|------|
| **Income tax** | **50%** if advertising purpose with minor representation component |
| **VAT** | **100%** deductible (even though only 50% for income tax!) |
| **Requirements** | Document purpose, attendees, business reason on receipt |
| **Tip (Trinkgeld)** | Also 50% deductible if documented |

#### Home Office (Arbeitszimmer)

**Option A: Arbeitsplatzpauschale (2025)**
| Condition | Deduction |
|-----------|-----------|
| No other workplace available | €1,200/year |
| Other workplace available | €300/year |
| No separate room required | ✓ |

**Option B: Actual Costs**
| Requirement | Deduction |
|-------------|-----------|
| Separate room, exclusively business use | Proportional rent/utilities |
| Central to income generation | Required |
| Vorsteuerabzug | Extended rules for entrepreneurs |

*Cannot combine both options!*

### 🚗 Vehicles (PKW / Firmenwagen)

**IMPORTANT: Special Austrian rules - PKW/Kombi have NO Vorsteuerabzug!**

| Vehicle Type | Vorsteuerabzug | Income Tax |
|--------------|----------------|------------|
| **PKW / Kombi** | ❌ NONE | ✓ Proportional to business use |
| **Klein-LKW (Fiskal-LKW)** | ✓ 100% | ✓ Proportional |
| **Motorcycles** | ❌ NONE | ✓ Proportional |
| **E-Vehicles (0g CO₂)** | ✓ 100% (special rule) | ✓ 100% |

**For PKW (regular car):**
- Record purchase at **gross** price (no VAT deduction)
- All running costs (fuel, repairs, insurance, ÖAMTC, ASFINAG tolls) at **gross**
- Depreciation over 8 years (extended useful life)
- Private use portion = Sachbezug (benefit in kind) or reduce deduction

**Fiskal-LKW List:**
The BMF publishes an official list of vehicles that qualify for Vorsteuerabzug. Check: https://www.bmf.gv.at/themen/steuern/kraftfahrzeuge/vorsteuerabzugsberechtigte-fahrzeuge.html

### 🚫 Not Deductible

| Category | Examples | Reason |
|----------|----------|--------|
| **Personal living expenses** | Groceries, clothing, personal care | §20 EStG |
| **Fines & penalties** | Traffic fines, tax penalties | Not business expense |
| **Representation (full)** | Luxury gifts, pure entertainment | Repräsentationsaufwendungen |
| **Donations** | Charity donations | Unless to qualifying organizations |
| **Personal insurance** | Health, life insurance | Personal expense |
| **Income tax itself** | Einkommensteuer | Non-deductible by definition |
| **VAT on non-deductible items** | VAT on private expenses | §12 UStG |

---

## 4. Deductibility Decision Tree

```
Is it for the business?
├── No → 🚫 Not deductible
└── Yes → Is it a vehicle (PKW/Kombi)?
    ├── Yes → Vorsteuer: ❌ NO (unless E-vehicle or Fiskal-LKW)
    │         Income tax: ✓ business portion only
    └── No → Is it entertainment/meals?
        ├── Yes → Vorsteuer: ✓ 100%
        │         Income tax: ✓ 50% only
        └── No → Is it phone/internet?
            ├── Yes → Vorsteuer: ✓ business %
            │         Income tax: ✓ business % (or 20% pauschale)
            └── No → Is it a regular business expense?
                └── Yes → Vorsteuer: ✓ 100%
                          Income tax: ✓ 100%
```

---

## 5. Software Developer Specific Expenses

### Fully Deductible (typical)
- IDE licenses (JetBrains, VS Code extensions)
- Cloud services (AWS, GCP, Azure, Vercel, Netlify)
- AI tools (GitHub Copilot, ChatGPT Plus, Claude, Anthropic API)
- Development tools (Docker, Postman, databases)
- Code hosting (GitHub, GitLab)
- Password managers (1Password, Bitwarden)
- VPN services (for business use)
- Design tools (Figma, Sketch)
- Project management (Jira, Linear, Notion)
- Communication (Slack, Zoom - business portion)
- Hardware (laptops, monitors, keyboards, headsets)
- Books & courses (technical learning)
- Conference tickets & travel (business purpose)
- Professional memberships (ACM, IEEE)

### Partially Deductible
- Home internet (business %)
- Mobile phone (business %)
- Home office (Pauschale or actual %)
- Meals with clients (50% income tax, 100% VAT)

### Typically Not Deductible
- Gaming subscriptions
- Personal streaming services
- Personal fitness/wellness apps
- Cosmetics, personal care
- Non-work clothing

---

## 6. Invoice Requirements for VAT Deduction

For valid Vorsteuerabzug, invoices must contain:

### Standard Invoice (>€400)
- [ ] Supplier name & address
- [ ] Recipient name & address  
- [ ] Invoice date
- [ ] Delivery/service date
- [ ] Sequential invoice number
- [ ] UID number of supplier
- [ ] Description of goods/services
- [ ] Quantity & unit price
- [ ] Net amount
- [ ] VAT rate (20%, 13%, 10%, or 0%)
- [ ] VAT amount
- [ ] Gross amount

### Kleinbetragsrechnung (≤€400)
Simplified requirements:
- [ ] Supplier name & address
- [ ] Invoice date
- [ ] Description of goods/services
- [ ] Gross amount
- [ ] VAT rate

---

## 7. Practical Examples

### Example 1: Anthropic API Invoice (€99)
- **Income tax:** 💼 100% deductible (software/cloud service)
- **Vorsteuer:** ✓ €16.50 recoverable (if not Kleinunternehmer)

### Example 2: Business Lunch (€80)
- **Income tax:** 📊 50% = €40 deductible
- **Vorsteuer:** ✓ 100% = €13.33 recoverable

### Example 3: iPhone (€1,200) - 70% business use
- **Income tax:** 📊 70% = €840 deductible (depreciated over 3-5 years)
- **Vorsteuer:** ✓ 70% = €140 recoverable

### Example 4: Tank / Fuel for PKW (€80)
- **Income tax:** 📊 Business % deductible
- **Vorsteuer:** ❌ NONE (PKW = no VAT recovery in Austria!)

### Example 5: ÖAMTC Membership (€150) for company car
- **Income tax:** 💼 100% deductible (car is business asset)
- **Vorsteuer:** ❌ NONE (related to PKW)

### Example 6: 1Password Family (€72)
- **Income tax:** 💼 100% deductible (security software)
- **Vorsteuer:** ✓ €12 recoverable

---

## 8. Record Keeping Requirements

| Document Type | Retention Period |
|---------------|------------------|
| Invoices (incoming & outgoing) | 7 years |
| Bank statements | 7 years |
| Contracts | 7 years after end |
| Tax returns | 7 years |
| Fahrtenbuch (if used) | 7 years |

---

## Sources

- BMF Austria - Vorsteuerabzug: https://www.bmf.gv.at/en/topics/taxation/vat-assessment-refund-n/supplying-in-austria/input-vat.html
- USP.gv.at - Vorsteuerabzug: https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/vorsteuerabzug.html
- USP.gv.at - Ausnahmen: https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/ausnahmen-vom-vorsteuerabzug.html
- WKO - Vorsteuerabzug bei PKW: https://www.wko.at/steuern/vorsteuerabzug-bei-pkw-und-kombi
- WKO - Kleinunternehmerregelung 2025: https://www.wko.at/steuern/kleinunternehmerregelung-umsatzsteuer
- WKO - Arbeitsplatzpauschale: https://www.wko.at/steuern/arbeitsplatzpauschale
- WKO - Arbeitszimmer: https://www.wko.at/steuern/arbeitszimmer-wohnungsverband
- LBG - Bewirtungskosten: https://www.lbg.at/servicecenter/lbg_steuertipps_praxis/in_welcher_h%C3%B6he_sind_bewirtungskosten_steuerlich_abzugsf%C3%A4hig_/
- USP.gv.at - Nichtabzugsfähige Ausgaben: https://www.usp.gv.at/themen/steuern-finanzen/steuerliche-gewinnermittlung/weitere-informationen-zur-steuerlichen-gewinnermittlung/betriebseinnahmen-und-ausgaben/nichtabzugsfaehige-ausgaben.html

---

## Implementation Notes for Kraxler

### Deductibility Categories

```javascript
const DEDUCTIBILITY = {
  full: {
    income_tax: 100,
    vat_recovery: true,
    icon: '💼',
    label: 'Fully Deductible'
  },
  partial: {
    income_tax: 50, // or custom %
    vat_recovery: true, // may vary
    icon: '📊', 
    label: 'Partially Deductible'
  },
  vehicle: {
    income_tax: 100, // business portion
    vat_recovery: false, // PKW = no VAT!
    icon: '🚗',
    label: 'Vehicle (no VAT recovery)'
  },
  none: {
    income_tax: 0,
    vat_recovery: false,
    icon: '🚫',
    label: 'Not Deductible'
  },
  unclear: {
    income_tax: null,
    vat_recovery: null,
    icon: '❓',
    label: 'Needs Review'
  }
};
```

### Vendor Categories (for AI classification)

```javascript
const VENDOR_CATEGORIES = {
  software_cloud: { deductible: 'full', examples: ['Anthropic', 'GitHub', 'AWS', 'JetBrains'] },
  hardware: { deductible: 'full', examples: ['Apple', 'Dell', 'Logitech'] },
  telecom: { deductible: 'partial', percent: 50, examples: ['A1', 'Magenta', 'spusu'] },
  vehicle_fuel: { deductible: 'vehicle', examples: ['OMV', 'BP', 'Shell'] },
  vehicle_service: { deductible: 'vehicle', examples: ['ÖAMTC', 'ASFINAG'] },
  meals: { deductible: 'partial', percent: 50, vat_full: true, examples: ['Restaurant'] },
  personal: { deductible: 'none', examples: ['Zuckerlwerkstatt', 'Flaconi', 'Fashion'] },
};
```
