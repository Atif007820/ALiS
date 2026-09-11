# AllUserRegistration Framework

Environment-aware Playwright framework for DPBH, TXOCA, NVRCP, NJ, LNI Conveyance, and LNI Cranes registration flows.

URLs are resolved from `environment + site`. Product behavior remains independent from URLs, so URL version changes only require an edit in `config/urls.js`.

## Main Commands

Short commands from the repo root:

```powershell
npm run register
npm run register -- --env TEST --site NJ
npm run register -- --env PROD --site NJ --product CL
npm run register -- --env TEST,PROD --site NJ --product CL,BB
npm run register -- --target TEST:NJ,PROD:NVRCP --product ALL
npm run register:headed -- --env TEST --site DPBH --product HF
npm run register:chromium -- --site NJ --product CL
npm run register:firefox -- --site NJ --product CL
npm run register:edge -- --site NJ --product CL
npm run register -- --site NJ --product CL --project=firefox
npm run register -- --site NJ --product CL --project=msedge
npm run register:parallel -- --site CONV --project=chromium
npm run register -- --site CONV --parallel 3 --project=chromium
npm run register:list
```

Environment shortcuts:

```powershell
npm run register:test -- --site NJ --product ALL
npm run register:prod -- --site NVRCP --product RPM
```

`--env TEST,PROD --site NJ,NVRCP` runs the cross-product of both environments and both sites.

`--target TEST:NJ,PROD:NVRCP` runs only those exact environment/site pairs.

Run every site/product combination:

```powershell
npx playwright test -c .\ALiS_UserRegistration\playwright.config.js
```

Run one full site:

```powershell
npx playwright test -c .\ALiS_UserRegistration\playwright.config.js -g "@NJ"
npx playwright test -c .\ALiS_UserRegistration\playwright.config.js -g "@DPBH"
```

Run one combination:

```powershell
npx playwright test -c .\ALiS_UserRegistration\playwright.config.js -g "(?=.*@NJ)(?=.*@CL)"
npx playwright test -c .\ALiS_UserRegistration\playwright.config.js -g "(?=.*@DPBH)(?=.*@HF)"
```

Run headed:

```powershell
$env:HEADLESS='false'; npx playwright test -c .\ALiS_UserRegistration\playwright.config.js -g "@NJ"
```

Install browser drivers:

```powershell
npm --prefix .\ALiS_UserRegistration run browsers:install
```

Filter by env instead of grep:

```powershell
$env:REGISTER_SITES='NJ'; $env:REGISTER_PRODUCTS='CL,BB'; npx playwright test -c .\ALiS_UserRegistration\playwright.config.js
```

## Where To Edit

- `config/urls.js`: environment registry and all environment-specific site URLs.
- `config/runSettings.json`: default environment, site/product filters, headless, parallel, and retry settings.
- `config/runSettings.json`: default environment, site/product filters, headless, parallel, retry settings, and report auto-open flags.
- `config/editableData.js`: emails, password, name pools, login number policy, state/city pools, role defaults.
- `config/sites.js`: product combinations, login prefixes, selectors, and strategy mapping.

To add a new environment, add one entry in `config/urls.js`. To update a URL from `.05` to `.06`, edit only that environment/site URL. Sites missing from an environment are automatically excluded.

## Structure

```text
ALiS_UserRegistration/
  config/
  fixtures/
  pages/
  registry/
  reporters/
  strategies/
  tests/
  tools/
  utils/
  package.json
  playwright.config.js
```

## Reports

- Playwright HTML report: `playwright-report/index.html`
- Registration Excel report: `test-results/latest-registration-report.xlsx`
- Common run-level Excel link inside Playwright report: `playwright-report/latest-registration-report.xlsx`
- Auto-open is controlled from `config/runSettings.json`:
  - `"openPlaywrightReport": true`
  - `"openExcelReport": true`

## TXOCA runtime safeguards

First-time registration links are resolved by their visible row text, with an
ID fallback that cannot silently select a different workflow. Person registration
headings and required First Name, Last Name, and DOB values are verified. Identity
is filled after address postbacks and checked again before submission.

Submission waits for the actual registration POST response. Identity mismatch
validation fails once with `TXOCA_PROFILE_MISMATCH`; it is not treated as a locator
timeout or retried with random identities. Genuine duplicate-login/profile retries
remain supported. Failures attach `txoca-registration-diagnostics` containing
link/route, HTTP status, and identity-match booleans, never raw identity values or
credentials. No comparison assertions or expected business outcomes are relaxed.

Run isolated regression tests (local synthetic pages; no ALiS accounts created):

```powershell
npm --prefix .\tests\ALiS_UserRegistration run validate
```

For live navigation and fill-only checks without submitting registration:

```powershell
node .\tests\ALiS_UserRegistration\tools\check-txoca.js
```

See `TXOCA-runtime-analysis.md` for the September 11 failure analysis. The observed
server response does not prove that existing/seeded identities are required. If
the server rejects correctly posted first-time applicant data, obtain application
logs and the intended registration validation rule before changing the workflow.
