<p align="center">
  <img src="assets/logo.png" alt="Kraxler" width="200">
</p>

# 🇦🇹 Kraxler

Extract invoices from Gmail with AI-powered classification for 🇦🇹 Austrian tax deductions.

> 🌍 **Contributions welcome!** PRs for other countries or alternative invoice classification schemes are very welcome!

> ⚠️ **DISCLAIMER**: Tax suggestions are for informational purposes only. Always consult a qualified Steuerberater.

## Quick Start

```bash
# Install
npm install -g kraxler

# Run full pipeline for 2025
npx kraxler run -a your@gmail.com --year 2025
```

## The 5-Stage Pipeline

```
1. kraxler scan -a your@gmail.com --year 2025
   └── Scans Gmail for invoice-related emails
   └── Stores email metadata in SQLite

2. kraxler extract -a your@gmail.com
   └── Pre-filters obvious non-invoices
   └── Uses AI to classify remaining emails
   └── Downloads PDFs from attachments
   └── Marks link-based invoices for crawling

3. kraxler crawl -a your@gmail.com
   └── Uses browser automation to download link-based invoices
   └── Detects login-required pages

4. kraxler review -a your@gmail.com
   └── Shows items needing manual handling
   └── Displays tax deductibility summary

5. kraxler report -a your@gmail.com --year 2025
   └── Generates JSONL/JSON/CSV export of all invoices
   └── Includes deductibility classification
```

Or run all stages at once:

```bash
npx kraxler run -a your@gmail.com --year 2025
```

## Date Range Options

All date options work with `scan`, `report`, and `run` commands:

```bash
# Full year
npx kraxler scan -a your@gmail.com --year 2025

# Single month
npx kraxler scan -a your@gmail.com --month 2025-12

# Quarter
npx kraxler scan -a your@gmail.com --quarter 2025-Q4

# Custom range
npx kraxler scan -a your@gmail.com --from 2025-01-01 --to 2025-06-30
```

## Prerequisites

1. **Node.js** >= 18
2. **[gogcli](https://github.com/steipete/gogcli)** for Gmail access
3. **[pi](https://github.com/badlogic/pi-mono)** authentication (Claude, GPT, Gemini, etc.)

### Setup gogcli

```bash
brew install steipete/tap/gogcli
gog auth add your@gmail.com
```

### Setup AI Authentication

```bash
# Option A: OAuth (Claude Pro/Max)
pi
/login

# Option B: API Key
export ANTHROPIC_API_KEY=sk-ant-...
```

## Output

Invoices are saved to `./invoices/YYYY/MM/`:

```
invoices/
├── 2025/
│   ├── 01/
│   │   ├── 15-jetbrains-ide.pdf
│   │   └── 22-hetzner-12345.pdf
│   └── 12/
│       └── 03-github-copilot.pdf
```

Report exports (JSONL by default):

```bash
npx kraxler report -a your@gmail.com --year 2025 -f jsonl  # Default
npx kraxler report -a your@gmail.com --year 2025 -f json   # Pretty JSON
npx kraxler report -a your@gmail.com --year 2025 -f csv    # Spreadsheet
```

## Tax Classification

| Category  | Icon | Income Tax | VAT Recovery | Examples                     |
|-----------|------|------------|--------------|------------------------------|
| `full`    | 💼   | 100%       | ✅ Yes       | Software, cloud, hardware    |
| `vehicle` | 🚗   | 100%       | ❌/✅*       | Fuel, repairs, ASFINAG       |
| `meals`   | 🍽️   | 50%        | ✅ Yes       | Business meals               |
| `telecom` | 📱   | ~50%       | ✅ ~50%      | Mobile, internet             |
| `none`    | 🚫   | 0%         | ❌ No        | Personal expenses            |
| `unclear` | ❓   | ?          | ?            | Needs review                 |

\* Vehicle VAT: No recovery for ICE/hybrid, full recovery for electric vehicles (Austrian rule)

See [docs/austrian-tax-deductibility.md](docs/austrian-tax-deductibility.md) for details.

## Configuration

First run prompts for tax settings. Reconfigure anytime:

```bash
npx kraxler config --show      # View current config
npx kraxler config --reset     # Re-run setup wizard
npx kraxler config --models    # Configure AI models
```

### AI Models

```bash
# Use preset
npx kraxler config --set model_preset=cheap     # Fast & cheap
npx kraxler config --set model_preset=balanced  # Default
npx kraxler config --set model_preset=quality   # Best models

# Override per command
npx kraxler extract -a x@gmail.com --model gemini-2.5-flash --provider google
```

## All Commands

```bash
# Pipeline
npx kraxler run      # Full pipeline (all 5 stages)
npx kraxler scan     # Stage 1: Find emails
npx kraxler extract  # Stage 2: Download attachments, classify
npx kraxler crawl    # Stage 3: Browser download for links
npx kraxler review   # Stage 4: Show manual items
npx kraxler report   # Stage 5: Generate invoice export

# Utility
npx kraxler status   # Completion status by month
npx kraxler log      # Action history
npx kraxler config   # View/update settings
npx kraxler models   # AI model configuration
npx kraxler paths    # Show storage locations
```

## Storage Locations

```bash
npx kraxler paths

# Database: ~/Library/Application Support/kraxler/kraxler.db (macOS)
# Config:   ~/Library/Preferences/kraxler/config.json (macOS)
# Invoices: ./invoices/ (current directory)
```

## License

MIT - [Manuel Maly](https://github.com/manmal)
