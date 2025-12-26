# 🦑 Invoice Kraken

Search Gmail for invoices using [gogcli](https://github.com/steipete/gogcli) and [pi](https://github.com/badlogic/pi-mono)'s scout/browser skills. Automatically classifies invoices for Austrian freelance software developer tax deductions.

## Features

- 📧 Search Gmail for invoice-related emails (EN/DE search terms)
- 🤖 AI-powered invoice classification using pi's scout
- 📎 Automatic PDF attachment download
- 🌐 Browser-based invoice download for link-only emails
- 💼 Tax deductibility classification for Austrian freelancers
- 🔍 Multi-layer duplicate detection
- 📊 Deductibility summary reports

## Prerequisites

- [Bun](https://bun.sh/) runtime (>= 1.0)
- [gogcli](https://github.com/steipete/gogcli) installed and configured with your Gmail account
- [pi](https://github.com/badlogic/pi-mono) CLI for AI-powered invoice analysis

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

### 3. Install pi

```bash
# Install pi globally
npm install -g @mariozechner/pi-coding-agent

# Verify it works
pi --help
```

For browser-based invoice downloads (the `download` command), you'll need the browser skill. See the [pi-mono browser skill documentation](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/custom-tools/browser) for setup instructions.

### 4. Install invoice-kraken

```bash
bun install
```

## Setup

First, ensure your Gmail account is authorized with gogcli:

```bash
gog auth list  # Check if your account is listed
gog auth add your@gmail.com  # If not, add it
```

## Usage

All commands require `--account` (or `-a`) to specify the Gmail account.

### 1. Search for invoices

Search Gmail for invoice-related emails for a given year:

```bash
npm run search -- --account your@gmail.com --year 2024
```

**Search terms used:**
- invoice, rechnung, beleg, billing, zahlung
- quittung, receipt, buchungsbeleg
- bestellbestätigung (with attachments), zahlungsbestätigung

### 2. Investigate findings

Analyze the found emails, filter non-invoices, and extract/download invoices:

```bash
npm run investigate -- --account your@gmail.com

# Options:
npm run investigate -- --account your@gmail.com --batch-size 20
npm run investigate -- --account your@gmail.com --auto-dedup  # Auto-mark duplicates
npm run investigate -- --account your@gmail.com --auto-dedup --strict
```

This will:
- Use AI to classify each email (invoice/not invoice)
- Extract invoice metadata (number, amount, date)
- Classify tax deductibility
- Download PDF attachments
- Generate PDFs from text-based invoices
- Detect duplicates

### 3. Download remaining invoices

Use pi's scout and browser skills to download invoices that require navigation:

```bash
npm run download -- --account your@gmail.com
```

### 4. List remaining items

Display remaining invoices that need manual handling:

```bash
npm run list -- --account your@gmail.com

# Show deductibility summary
npm run list -- --account your@gmail.com --summary
npm run list -- --account your@gmail.com --summary --year 2024

# Filter by deductibility
npm run list -- --account your@gmail.com --deductible unclear

# Different output formats
npm run list -- --account your@gmail.com --format json
npm run list -- --account your@gmail.com --format markdown

# Include duplicates
npm run list -- --account your@gmail.com --include-duplicates
```

## Output Structure

Downloaded invoices are organized in the `invoices/` directory:

```
invoices/
├── 2026/
│   ├── 01/
│   │   ├── 15-jetbrains-inv-2026-001.pdf
│   │   └── 22-hetzner-12345.pdf
│   ├── 02/
│   │   └── 03-github.pdf
│   └── ...
└── 2025/
    └── ...
```

## Tax Deductibility Categories

For Austrian freelance software developers (with company car):

| Category | Icon | Description |
|----------|------|-------------|
| `full` | 💼 | 100% deductible: Software, cloud, dev tools, hardware, company car expenses |
| `partial` | 📊 | Partially deductible: Telecom (~50%), internet (~60%) |
| `none` | 🚫 | Not deductible: Personal entertainment, groceries |
| `unclear` | ❓ | Needs review: Amazon, general electronics |

### Fully Deductible Examples
- Software: JetBrains, GitHub, GitLab, Adobe, Figma
- Cloud: AWS, GCP, Azure, Hetzner, Vercel, DigitalOcean
- Dev Tools: Docker, Sentry, npm
- Company Car: Fuel (Shell, OMV, BP), ÖAMTC, ASFINAG, car service, parking

### Partially Deductible
- A1, Drei, Magenta (mobile) - ~50%
- Internet providers - ~60%

## Database

Invoice tracking data is stored in `invoice-kraken.db` (SQLite).

### Status Values
- `pending` - Not yet analyzed
- `downloaded` - Invoice successfully downloaded
- `pending_download` - Has link, waiting for browser download
- `manual` - Needs manual handling
- `duplicate` - Identified as duplicate
- `no_invoice` - Not an invoice

## Duplicate Detection

Multi-layer detection:
1. **Email ID** - Same email won't be processed twice
2. **Invoice Number** - Same invoice number from same sender
3. **Attachment Hash** - Identical PDF files
4. **Fuzzy Match** - Same sender + amount + date within 7 days

## License

MIT
