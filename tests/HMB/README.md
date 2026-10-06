# HMB Playwright Framework

Reusable framework for NJ Human Milk Bank registration and login/apply flow.

The framework provides a complete end-to-end test and separate registration/apply tests:

- `tests/01_Register.spec.js`
- `tests/02_LoginApply.spec.js`
- `tests/03_E2E.spec.js`

## Main Commands

```bash
npm install
npm run hmb:e2e -- --project chromium msedge
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

The E2E command runs registration, login/apply, uploads, submission, and payment
inside one test per browser. Chromium and Edge run concurrently by default, and
each browser stores its registered account in a separate project-specific file.
When `submitPayment` is enabled, a missing payment action or missing transaction
confirmation fails the test instead of producing a false pass.

For a headless run with the current `headless: true` setting, omit `--headed`.
Use `--project=chromium` to run one browser. `--project chromium msedge` runs
Chromium and Edge concurrently. Omitting `--project` runs all three configured
browsers. The default worker count is configured in `config/runSettings.json`
and can be overridden with `HMB_WORKERS`. Keep `slowMo: 0` for normal-speed
execution.

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

For standalone Login/Apply with an existing account, enter both `loginName` and
`password` in `config/standaloneLoginCredentials.js`. When both are provided,
the test does not need a saved registration file. If either value is blank, it
loads the project-specific saved account and overrides only the configured
field. `LOGIN_NAME` and `LOGIN_PASSWORD` environment variables take precedence
over the config file.

## Editable Files

- `config/urls.js` - login and fee detail URLs.
- `config/runSettings.json` - headless/headed defaults, timeouts, report behavior.
- Payment recovery controls: `paymentReadyTimeoutMs`, `paymentApiRetries`, and `paymentRetryDelayMs` in `config/runSettings.json`.
- `config/standaloneLoginCredentials.js` - optional credentials for standalone Login/Apply.
- `config/editableData.js` - hardcoded HMB form data.
- `fixtures/hmb.fixture.js` - Playwright fixtures for page objects.
- `utils/hmbDataFactory.js` - generated entity/login data.
- `Documents` - upload files used by the application flow. Each document upload randomly selects one supported file from this folder (`.doc`, `.docx`, `.pdf`, `.rtf`, `.txt`).
