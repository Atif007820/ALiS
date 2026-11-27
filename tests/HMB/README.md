# HMB Playwright Framework

Reusable framework for NJ Human Milk Bank registration, login/apply, and
application approval.

The serial end-to-end flow runs three separate tests in this order:

- `tests/01_RegisterUser.spec.js`
- `tests/02_LoginApply.spec.js`
- `tests/03_ApproveApplication.spec.js`

## Main Commands

Run setup and framework shortcuts from `tests/HMB`. The `npm run hmb` command
also works from the workspace root.

```bash
npm install
npm run browsers:install
```

| Command | What runs |
| --- | --- |
| `npm run hmb -- --user=new` | Register, apply, approve. This is also the default for `npm run hmb`. |
| `npm run hmb -- --user=existing` | Sign in with an existing applicant, apply, then approve the new transaction. |
| `npm run hmb -- --apply` | Sign in with an existing applicant and apply. No approval. |
| `npm run hmb -- --regapply` | Register and apply with the new account. No approval. |
| `npm run hmb -- --approve` | Approve the transaction set in `config/approvalTransacNumber.js`. |
| `npm run hmb -- --reg` | Register only. No application or approval. |

Append `--list` to preview the selected scripts without signing in, submitting
or approving. A preview does not verify whether credentials work in ALiS.

```powershell
npm run hmb -- --user=existing --list
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

## Applicant and Approver Inputs

Set both `loginName` and `password` in `config/LoginCredentials.js` for
`--user=existing` and `--apply`. To override them for one run, pass both flags:

```powershell
npm run hmb -- --user=existing --LoginName=ExampleUser --password='ExamplePassword' --list
npm run hmb -- --apply --LoginName=ExampleUser --password='ExamplePassword' --list
```

Remove `--list` to execute. Prefer the config file for real passwords, since
npm and your shell may echo or retain command arguments. Commands that
register always use the new account. To reuse a previously registered account,
copy both values from the project-specific user file into the config.

When the portal omits a legal or DBA name, the report uses the matching
registration data. Standalone Login/Apply matches by login name, and standalone
Approval matches the entity shown for the selected transaction.

Standalone approval for an already-submitted application:

1. Set `TransactionNumber` in `config/approvalTransacNumber.js`.
2. Approver credentials are configured in `config/approvalTransacNumber.js`.
3. Run `npm run hmb -- --approve`. Add `--headed` to show the browser.

Use `npm run hmb -- --approve --TransacNum=2733 --list` to preview a one-run
override without changing `approvalTransacNumber.js`. Remove `--list` to run
approval. The legacy `--transaction` and `--transaction-number` flags still work.
Flows that apply and approve together always use the transaction from that run.

Existing `hmb:*` shortcuts and `npm run test -- --spec=...` commands still work.
Use one mode at a time; do not combine a mode flag with `--spec`.

## Editable Files

- `config/urls.js` - login and fee detail URLs.
- `config/runSettings.json` - headless/headed defaults, timeouts, report behavior.
- Payment recovery controls: `paymentReadyTimeoutMs`, `paymentApiRetries`, `paymentRetryDelayMs`, `paymentRetryMaxDelayMs`, and `paymentRetryJitterMs` in `config/runSettings.json`. Transient API errors use bounded exponential backoff, add jitter to spread concurrent retries, and honor `Retry-After` when provided. The default is 8 retries (9 total attempts), with a hard cap of 10 retries.
- Navigation recovery controls: `navigationRetries`, `navigationRetryDelayMs`, and `navigationRetryMaxDelayMs` in `config/runSettings.json` retry transient browser network errors with capped exponential backoff.
- `config/LoginCredentials.js` - existing applicant credentials (`LOGIN_CREDENTIALS`).
- `config/approvalTransacNumber.js` - standalone approval transaction number and approver credential loader.
- `config/editableData.js` - hardcoded HMB form data.
- `fixtures/hmb.fixture.js` - Playwright fixtures for page objects.
- `utils/hmbDataFactory.js` - generated entity/login data.
- `Documents` - upload files used by the application flow. Each document upload randomly selects one supported file from this folder (`.doc`, `.docx`, `.pdf`, `.rtf`, `.txt`).
