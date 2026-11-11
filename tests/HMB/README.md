# HMB Playwright Framework

Reusable framework for NJ Human Milk Bank registration, login/apply, and
application approval.

The serial end-to-end flow runs three separate tests in this order:

- `tests/01_RegisterUser.spec.js`
- `tests/02_LoginApply.spec.js`
- `tests/03_ApproveApplication.spec.js`

## Main Commands

Run commands from the `tests/HMB` framework folder.

```bash
npm install
npm run hmb
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

The E2E command runs registration, login/apply, then approval serially for each
selected browser. Script 02 uses the account created by Script 01. Script 03
uses the transaction number that Script 02 captures and prints. Both handoffs
are scoped to the current run, browser, and repeat. A missing or mismatched
handoff stops the flow. When `submitPayment` is enabled, a missing payment action
or transaction confirmation fails Script 02.

For a headless run with the current `headless: true` setting, omit `--headed`.
HMB uses the TEST application only. Use `--project=chromium` to select a browser.
The runner enforces one worker per script to prevent overlapping submissions or
approvals.

The Login/apply report contains named steps with timings for each application
section. Form helpers check loading overlays together and use Playwright's
built-in field readiness checks. ASP.NET postbacks and page transitions are
still awaited, with no fixed pause after each action.

Register only:

```bash
npm run test -- --spec=register --headed
npm run test -- --spec=01_RegisterUser.spec.js
```

Standalone Login/Apply:

```bash
npm run test -- --spec=apply --headed
npm run test -- --spec=02_LoginApply.spec.js --project=chromium
```

For standalone Login/Apply, enter both `loginName` and `password` in
`config/standaloneLoginCredentials.js`. To use an account from a standalone
registration, copy both values from the registration's project-specific user
file into that config.

When the portal omits a legal or DBA name, the report uses the matching
registration data. Standalone Login/Apply matches by login name, and standalone
Approval matches the entity shown for the selected transaction.

Standalone approval for an already-submitted application:

1. Set `TransactionNumber` in `config/approvalTransacNumber.js`.
2. Approver credentials are configured in `config/approvalTransacNumber.js`.
3. Run `npm run test -- --spec=approve --headed` or
   `npm run test -- --spec=03_ApproveApplication.spec.js --project=chromium`.

The standalone approval command accepts `--transaction=<digits>` as an optional
one-run override when you do not want to edit the config file. It never reuses a
transaction from an older E2E run.

## Editable Files

- `config/urls.js` - login and fee detail URLs.
- `config/runSettings.json` - headless/headed defaults, timeouts, report behavior.
- Payment recovery controls: `paymentReadyTimeoutMs`, `paymentApiRetries`, `paymentRetryDelayMs`, `paymentRetryMaxDelayMs`, and `paymentRetryJitterMs` in `config/runSettings.json`. Transient API errors use bounded exponential backoff, add jitter to spread concurrent retries, and honor `Retry-After` when provided. The default is 8 retries (9 total attempts), with a hard cap of 10 retries.
- Navigation recovery controls: `navigationRetries`, `navigationRetryDelayMs`, and `navigationRetryMaxDelayMs` in `config/runSettings.json` retry transient browser network errors with capped exponential backoff.
- `config/standaloneLoginCredentials.js` - required credentials for standalone Login/Apply.
- `config/approvalTransacNumber.js` - standalone approval transaction number and approver credential loader.
- `config/editableData.js` - hardcoded HMB form data.
- `fixtures/hmb.fixture.js` - Playwright fixtures for page objects.
- `utils/hmbDataFactory.js` - generated entity/login data.
- `Documents` - upload files used by the application flow. Each document upload randomly selects one supported file from this folder (`.doc`, `.docx`, `.pdf`, `.rtf`, `.txt`).
