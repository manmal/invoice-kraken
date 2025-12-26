# 🦑 Invoice Kraken

Search Gmail for invoices using [gogcli](https://github.com/steipete/gogcli) and [pi](https://github.com/badlogic/pi-mono)'s AI capabilities. Automatically classifies invoices for Austrian Einzelunternehmer (sole proprietors) tax deductions.

> ⚠️ **DISCLAIMER**: This tool provides tax deductibility suggestions based on the **Austrian tax system** (Einkommensteuer & Umsatzsteuer). These are for informational purposes only and do NOT constitute tax advice. Always consult a qualified Steuerberater for your specific situation.

## Features

- 📧 Search Gmail for invoice-related emails (EN/DE search terms)
- 🤖 AI-powered invoice classification using Claude (via pi SDK)
- 📎 Automatic PDF attachment download
- 🌐 Browser-based invoice download for link-only emails
- 💼 Austrian tax deductibility classification (EST + VAT)
- 🚗 Company car expense handling (ICE vs Electric VAT rules)
- 🔍 Multi-layer duplicate detection
- 📊 Deductibility summary reports

## Prerequisites

- [Bun](https://bun.sh/) runtime (>= 1.0)
- [gogcli](https://github.com/steipete/gogcli) installed and configured with your Gmail account
- Anthropic API access (via OAuth or API key)

## Installation

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install and configure gogcli

```bash
# Install via Homebrew
brew install steipete/tap/gogcli

# Set up OAuth credentials (one-time setup)
# 1. Create a Google Cloud project: https://console.cloud.google.com/projectcreate
# 2. Enable Gmail API: https://console.cloud.google.com/apis/api/gmail.googleapis.com
# 3. Create OAuth credentials (Desktop app): https://console.cloud.google.com/auth/clients
# 4. Download the client JSON file

gog auth credentials ~/Downloads/client_secret_*.json
gog auth add your@gmail.com
```

### 3. Install invoice-kraken

```bash
git clone https://github.com/manmal/invoice-kraken
cd invoice-kraken
bun install
```

### 4. Authenticate with Anthropic

Invoice Kraken uses the pi SDK for AI capabilities. To authenticate:

```bash
# Option A: OAuth (recommended)
pi        # Start pi
/login    # Follow the OAuth flow in your browser

# Option B: API Key
export ANTHROPIC_API_KEY=sk-ant-...
```

## First Run Setup

On first run, you'll be prompted to configure your tax settings:

```bash
bun src/index.js search --account your@gmail.com --year 2024
```

The setup wizard will ask about:
- **Company car** - Do you have one? Is it electric (different VAT rules)?
- **Kleinunternehmer status** - Are you under €55k revenue (no VAT recovery)?
- **Business use percentages** - For phone/internet

You can reconfigure anytime:
```bash
bun src/index.js config --reset
```

## Usage

All commands require `--account` (or `-a`) to specify the Gmail account.

### 1. Search for invoices

```bash
bun src/index.js search --account your@gmail.com --year 2024

# Specific month range
bun src/index.js search --account your@gmail.com --year 2024 --from 6 --to 12
```

**Search terms used:** invoice, rechnung, beleg, billing, zahlung, quittung, receipt, buchungsbeleg, bestellbestätigung, zahlungsbestätigung

### 2. Investigate findings

```bash
bun src/index.js investigate --account your@gmail.com

# Options:
bun src/index.js investigate --account your@gmail.com --batch-size 20
bun src/index.js investigate --account your@gmail.com --auto-dedup
```

This will:
- Pre-filter obvious non-invoices (marketing, shipping notifications)
- Use AI to classify each email
- Extract invoice metadata (number, amount, date)
- Classify tax deductibility (EST + VAT)
- Download PDF attachments
- Detect duplicates

### 3. Download remaining invoices

For invoices that require browser navigation:

```bash
bun src/index.js download --account your@gmail.com
```

### 4. List remaining items

```bash
# Show items needing manual handling
bun src/index.js list --account your@gmail.com

# Show deductibility summary
bun src/index.js list --account your@gmail.com --summary

# Filter by type
bun src/index.js list --account your@gmail.com --deductible unclear
```

### 5. View status

```bash
bun src/index.js status --account your@gmail.com --year 2024
```

### 6. View/change configuration

```bash
# Show current config
bun src/index.js config --show

# Reset and reconfigure
bun src/index.js config --reset

# Set specific value
bun src/index.js config --set company_car_type=electric
bun src/index.js config --set telecom_business_percent=70
```

### 7. View AI models and auth status

```bash
bun src/index.js models
```

Shows configured models per task and authentication status.

## Output Structure

```
invoices/
├── 2024/
│   ├── 01/
│   │   ├── 15-jetbrains_ide.pdf
│   │   └── 22-hetzner_cloud-12345.pdf
│   ├── 02/
│   │   └── 03-github_copilot.pdf
│   └── ...
```

## Austrian Tax Deductibility

### Categories

| Category | Icon | Income Tax | VAT Recovery | Examples |
|----------|------|------------|--------------|----------|
| `full` | 💼 | 100% | ✅ Yes | Software, cloud, hardware, education |
| `vehicle` | 🚗 | 100% | ❌ No (ICE) / ✅ Yes (Electric) | Fuel, ÖAMTC, ASFINAG, repairs |
| `meals` | 🍽️ | 50% | ✅ Yes (100%!) | Business meals with clients |
| `telecom` | 📱 | ~50% | ✅ Yes (~50%) | Mobile, internet |
| `none` | 🚫 | 0% | ❌ No | Personal expenses |
| `unclear` | ❓ | ? | ? | Needs review |

### Key Austrian Rules

1. **PKW/Kombi (Cars)**: No Vorsteuerabzug (VAT recovery) for ICE/hybrid vehicles in Austria - this is a special rule!
2. **Electric Vehicles**: Full VAT recovery on vehicle expenses
3. **Business Meals**: Only 50% income tax deductible, but 100% VAT recoverable
4. **Kleinunternehmer** (< €55k revenue): No VAT recovery on ANY expenses

See [docs/austrian-tax-deductibility.md](docs/austrian-tax-deductibility.md) for full details.

## AI Models

Invoice Kraken uses Claude models via the pi SDK:

| Task | Model | Description |
|------|-------|-------------|
| Email classification | claude-3-5-haiku | Fast batch analysis |
| Deductibility analysis | claude-3-5-haiku | Categorization |
| Complex extraction | claude-sonnet-4-5 | Edge cases |
| Browser download | claude-sonnet-4-5 | Website navigation |

To customize models, edit `src/lib/models.js`.

## Configuration

### Config file: `.invoice-kraken/config.json`

```json
{
  "tax_jurisdiction": "AT",
  "has_company_car": true,
  "company_car_type": "ice",
  "is_kleinunternehmer": false,
  "telecom_business_percent": 50,
  "internet_business_percent": 50
}
```

### Company car types

- `ice` - Gasoline/Diesel (no VAT recovery)
- `electric` - Full electric (full VAT recovery)
- `hybrid_plugin` - Plug-in hybrid (partial, check with Steuerberater)
- `hybrid` - Regular hybrid (no VAT recovery)

## Database

Invoice data is stored in `invoice-kraken.db` (SQLite).

### Status flow

```
pending → prefiltered (auto-skip, stored with reason)
        → no_invoice (AI says not invoice)
        → pending_download (AI found invoice, needs download)
        → downloaded (PDF saved)
        → manual (download failed, needs human)
        → duplicate (matches existing invoice)
```

## Duplicate Detection

Multi-layer detection:
1. **Email ID** - Same email won't be processed twice
2. **Invoice Number** - Same invoice number from same sender
3. **Attachment Hash** - Identical PDF files
4. **Fuzzy Match** - Same sender + amount + date within 7 days

## Documentation

- [Austrian Tax Deductibility Guide](docs/austrian-tax-deductibility.md) - Comprehensive tax rules
- [CLI Redesign Plan](docs/redesign-plan.md) - Future `run`/`report` commands

## License

MIT

## Author

[Manuel Maly](https://github.com/manmal)
