<p align="center">
  <img src="assets/logo.png" alt="Kraxler Logo" width="200">
</p>

<h1 align="center">🇦🇹 Kraxler - Extract Invoices from Your Inbox</h1>

Kraxler crawls your Gmail, finds invoices, downloads PDFs, and automatically classifies them for 🇦🇹 Austrian tax deductions. Stop manually hunting through emails at tax time—let AI do the heavy lifting.

> ⚠️ **DISCLAIMER**: This tool provides tax deductibility suggestions based on the **Austrian tax system** (Einkommensteuer & Umsatzsteuer). These are for informational purposes only and do NOT constitute tax advice. Always consult a qualified Steuerberater for your specific situation.

## Features

- 📧 Search Gmail for invoice-related emails (EN/DE search terms)
- 🤖 AI-powered invoice classification (via [pi SDK](https://github.com/badlogic/pi-mono) - supports Claude, GPT, Gemini, local models)
- 📎 Automatic PDF attachment download
- 🌐 Browser-based invoice download for link-only emails
- 💼 Austrian tax deductibility classification (EST + VAT)
- 🚗 Company car expense handling (ICE vs Electric VAT rules)
- 🔍 Multi-layer duplicate detection
- 📊 Deductibility summary reports

## Prerequisites

- [Bun](https://bun.sh/) runtime (>= 1.0)
- [gogcli](https://github.com/steipete/gogcli) installed and configured with your Gmail account
- pi model provider configured, e.g. Claude Pro or Max subscription (OAuth) or API key.

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

### 3. Install kraxler

```bash
git clone https://github.com/manmal/kraxler
cd kraxler
bun install
```

### 4. Authenticate with Anthropic

Kraxler uses the pi SDK for AI capabilities. To authenticate:

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

| Category  | Icon | Income Tax | VAT Recovery                    | Examples                             |
| --------- | ---- | ---------- | ------------------------------- | ------------------------------------ |
| `full`    | 💼   | 100%       | ✅ Yes                          | Software, cloud, hardware, education |
| `vehicle` | 🚗   | 100%       | ❌ No (ICE) / ✅ Yes (Electric) | Fuel, ÖAMTC, ASFINAG, repairs        |
| `meals`   | 🍽️   | 50%        | ✅ Yes (100%!)                  | Business meals with clients          |
| `telecom` | 📱   | ~50%       | ✅ Yes (~50%)                   | Mobile, internet                     |
| `none`    | 🚫   | 0%         | ❌ No                           | Personal expenses                    |
| `unclear` | ❓   | ?          | ?                               | Needs review                         |

### Key Austrian Rules

1. **PKW/Kombi (Cars)**: No Vorsteuerabzug (VAT recovery) for ICE/hybrid vehicles in Austria - this is a special rule!
2. **Electric Vehicles**: Full VAT recovery on vehicle expenses
3. **Business Meals**: Only 50% income tax deductible, but 100% VAT recoverable
4. **Kleinunternehmer** (< €55k revenue): No VAT recovery on ANY expenses

See [docs/austrian-tax-deductibility.md](docs/austrian-tax-deductibility.md) for full details.

## AI Models

Kraxler supports any model available via [pi](https://github.com/badlogic/pi-mono) - Claude, GPT, Gemini, local models via Ollama, and more.

### Default Models

| Task                   | Model             | Tier     | Description                    |
| ---------------------- | ----------------- | -------- | ------------------------------ |
| emailClassification    | claude-3-5-haiku  | fast     | Classify emails as invoices    |
| deductibilityAnalysis  | claude-3-5-haiku  | fast     | Tax deductibility categorization |
| complexExtraction      | claude-sonnet-4-5 | balanced | Extract from complex formats   |
| browserDownload        | claude-sonnet-4-5 | balanced | Navigate websites for downloads |
| duplicateDetection     | claude-3-5-haiku  | fast     | Fuzzy duplicate matching       |
| reportGeneration       | claude-3-5-haiku  | fast     | Generate summary reports       |

### Configuration Priority

Model selection follows this priority order (highest to lowest):

1. **CLI flags** (`--model`, `--provider`) - applies to current command only
2. **Environment variables** (`KRAXLER_MODEL`, `KRAXLER_PROVIDER`)  
3. **Per-task config** in config file → `models` object
4. **Preset** in config file → `model_preset`
5. **Hardcoded defaults** (table above)

### Presets

Quick configuration for common use cases:

| Preset     | Description                                           |
| ---------- | ----------------------------------------------------- |
| `cheap`    | Fast & cheap models for all tasks (haiku/flash/4o-mini) |
| `balanced` | **Default** - fast for simple tasks, smart for complex |
| `quality`  | Best models for all tasks (sonnet/pro/4o)             |
| `local`    | Local models via Ollama (free, private, requires setup) |

```bash
npx kraxler config --set model_preset=cheap
npx kraxler config --set model_preset=balanced
npx kraxler config --set model_preset=quality
npx kraxler config --set model_preset=local
```

### Customizing Models

**Interactive setup** (recommended for first-time configuration):
```bash
npx kraxler config --models
```

**CLI override** (applies to current command only):
```bash
npx kraxler investigate -a x@gmail.com --model gemini-2.5-flash --provider google
npx kraxler investigate -a x@gmail.com --model gpt-4o --provider openai
npx kraxler download -a x@gmail.com --model claude-opus-4 --provider anthropic
```

**Environment variables** (useful for CI/scripts):
```bash
KRAXLER_MODEL=gpt-4o KRAXLER_PROVIDER=openai npx kraxler investigate -a x@gmail.com
```

**Config file** for persistent per-task overrides:

Location: `~/.config/kraxler/config.json` (Linux) or `~/Library/Preferences/kraxler/config.json` (macOS)

```json
{
  "model_preset": "balanced",
  "models": {
    "browserDownload": { "provider": "anthropic", "modelId": "claude-opus-4" },
    "emailClassification": { "provider": "google", "modelId": "gemini-2.0-flash" }
  }
}
```

Note: Per-task `models` overrides take precedence over `model_preset`.

### View Configuration

```bash
# Show current model configuration with sources
npx kraxler models

# Show all available models from configured providers
npx kraxler models --available

# Show preset descriptions
npx kraxler models --presets
```

Example output:
```
📋 Model Configuration

Active preset: balanced

Task                    Provider    Model                   Source
──────────────────────────────────────────────────────────────────────────────
emailClassification     anthropic   claude-3-5-haiku-lates  preset: balanced
deductibilityAnalysis   anthropic   claude-3-5-haiku-lates  preset: balanced
complexExtraction       anthropic   claude-sonnet-4-5       preset: balanced
browserDownload         anthropic   claude-sonnet-4-5       preset: balanced
duplicateDetection      anthropic   claude-3-5-haiku-lates  preset: balanced
reportGeneration        anthropic   claude-3-5-haiku-lates  preset: balanced
```

### Token Usage Tracking

Each command reports token usage at completion:

```
══════════════════════════════════════════════════
📊 TOKEN USAGE
══════════════════════════════════════════════════

Phase                   Model                    Calls   Input    Output   Cost
──────────────────────────────────────────────────────────────────────────────────────────
emailClassification     claude-3-5-haiku-latest      6      12k     8.7k  $0.044
──────────────────────────────────────────────────────────────────────────────────────────
TOTAL                                                6      12k     8.7k  $0.044
```

Usage is tracked per phase (emailClassification, browserDownload, etc.) with input/output tokens and cost estimates.

## Configuration

### Config file: `.kraxler/config.json`

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

Invoice data is stored in `kraxler.db` (SQLite).

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
