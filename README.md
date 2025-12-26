# 🦑 Invoice Kraken

Search Gmail for invoices using [gogcli](https://github.com/steipete/gogcli) and [pi](https://github.com/badlogic/pi-mono)'s scout/browser skills.

## Prerequisites

- Node.js >= 20 (or [Bun](https://bun.sh/) runtime)
- [gogcli](https://github.com/steipete/gogcli) installed and configured with your Gmail account
- [pi](https://github.com/badlogic/pi-mono) CLI with scout and browser skills

## Installation

```bash
npm install
```

## Setup

First, ensure your Gmail account is authorized with gogcli:

```bash
gog auth list  # Check if your account is listed
gog auth add your@gmail.com  # If not, add it
```

## Usage

All commands require `--account` to specify the Gmail account:

### 1. Search for invoices

Search Gmail for invoice-related emails for a given year:

```bash
npm run search -- --account your@gmail.com --year 2024
```

This searches for emails containing invoice-related terms and stores them in a SQLite database.

**Search terms:** invoice, rechnung, beleg, billing, zahlung, quittung, receipt, buchungsbeleg, bestellbestätigung (with attachments), zahlungsbestätigung

### 2. Investigate findings

Analyze the found emails, filter non-invoices, and extract text-based invoices to PDF:

```bash
npm run investigate -- --account your@gmail.com
```

### 3. Download remaining invoices

Use pi's scout and browser skills to download invoices that require navigation:

```bash
npm run download -- --account your@gmail.com
```

### 4. List remaining items

Display remaining invoices that couldn't be automatically downloaded:

```bash
npm run list -- --account your@gmail.com
```

## Output

Downloaded invoices are organized in the `invoices/` directory:

```
invoices/
├── 2024/
│   ├── 01/
│   │   ├── 15-company-invoice.pdf
│   │   └── 22-another-invoice.pdf
│   ├── 02/
│   ...
```

## Database

Invoice tracking data is stored in `invoice-kraken.db` (SQLite).

## License

MIT
