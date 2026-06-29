# Content Comparison Framework

Playwright-based framework that extracts text from a **template** (`.docx`) and a **letter/output** (`.pdf` or `.docx`) and compares them, reporting matched, mismatched, missing, and extra lines — plus table-border validation.

---

## Project Structure

```
content-comparison/
├── Documents/                  ← Put your files here
├── src/
│   ├── constants.js            ← All shared constants
│   ├── helpers/
│   │   ├── xmlHelpers.js       ← DOCX XML DOM utilities
│   │   ├── textHelpers.js      ← Sentence reassembly, word-wrap
│   │   └── pdfHelpers.js       ← PDF geometry / segment parsing
│   ├── extractor/
│   │   ├── docxExtractor.js    ← .docx → lines + table metadata
│   │   ├── pdfExtractor.js     ← .pdf  → lines + page geometry
│   │   └── index.js            ← extractDocument() dispatcher
│   ├── comparator/
│   │   ├── normalizer.js       ← Text normalisation & placeholder logic
│   │   ├── scorer.js           ← Similarity metrics, span matching
│   │   ├── compareDocuments.js ← 3-pass comparison + table borders
│   │   └── index.js            ← Public comparator API
│   └── reporter/
│       ├── buildReport.js      ← Plain-text report builder
│       ├── attachAnnotations.js← Playwright annotation attachment
│       └── index.js            ← Public reporter API
├── fileConfig.js               ← ✏️  Edit file names here
├── logger.js                   ← Centralised logger
├── playwright.config.js        ← Playwright configuration
├── package.json
├── CompareContent.spec.js      ← Main test
└── .gitignore
```

---

## Setup

```bash
npm install
npx playwright install chromium
```

---

## Usage

1. **Set file names** in `fileConfig.js`:
   ```js
   export const FILE_1 = 'MyTemplate.docx';   // template
   export const FILE_2 = 'MyLetter.PDF';       // file to validate
   ```

2. **Place files** in the `Documents/` folder.

3. **Run the test:**
   ```bash
   npm test                  # run all specs + open HTML report
   npm run test:content      # run only CompareContent.spec.js
   npm run test:ci           # CI mode — warn-level logging only
   ```

---

## Controlling Log Verbosity

Set the `LOG_LEVEL` environment variable before running:

| Value   | Output                          |
|---------|---------------------------------|
| `debug` | Everything                      |
| `info`  | Default — general progress      |
| `warn`  | CI-friendly — warnings + errors |
| `error` | Silent except errors            |

```bash
LOG_LEVEL=warn npm test
```

---

## Supported File Types

| Role     | Formats         |
|----------|-----------------|
| FILE_1   | `.docx`         |
| FILE_2   | `.pdf`, `.docx` |
