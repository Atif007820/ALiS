# HMB Playwright Framework

Reusable framework for NJ Human Milk Bank registration and login/apply flow.

The framework has only two test files:

- `tests/01_Register.spec.js`
- `tests/02_LoginApply.spec.js`

## Main Commands

```bash
npm install
npm run hmb:e2e -- --project=chromium --headed
```

The E2E command runs Register first, then Login/apply using the saved user.

Register only:

```bash
npm run hmb:register -- --project=chromium --headed
```

Login/apply using the last registered user:

```bash
npm run hmb:apply -- --project=chromium --headed
```

## Editable Files

- `config/urls.js` - login and fee detail URLs.
- `config/runSettings.json` - headless/headed defaults, timeouts, report behavior.
- `config/editableData.js` - hardcoded HMB form data.
- `fixtures/hmb.fixture.js` - Playwright fixtures for page objects.
- `utils/hmbDataFactory.js` - generated entity/login data.
- `Documents` - upload files used by the application flow. Each document upload randomly selects one supported file from this folder (`.doc`, `.docx`, `.pdf`, `.rtf`, `.txt`).
