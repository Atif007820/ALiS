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

Before a multi-browser run, install the browser revisions required by this
framework's installed Playwright version:

```bash
npm run browsers:install
```

Run the local HMB runtime regression checks (no application account is created):

```bash
npm run validate
```

To preserve the default report and saved user while running an isolated
verification, set `HMB_TEST_RESULTS_DIR`, `HMB_REPORT_DIR`, and
`HMB_USER_DATA_FILE` to paths under `validation-runs`.

The E2E command runs Register first, then Login/apply using the saved user.

For a headless run with the current `headless: true` setting, omit `--headed`.
Keep `--project=chromium` to run one browser; omitting `--project` runs all three
configured browsers. Keep `slowMo: 0` for normal-speed execution and one worker
because Login/apply consumes the account created by Register.

The Login/apply report contains named steps with timings for each application
section. Form helpers check loading overlays together and use Playwright's
built-in field readiness checks. ASP.NET postbacks and page transitions are
still awaited, with no fixed pause after each action.

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
