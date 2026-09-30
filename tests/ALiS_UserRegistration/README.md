# AllUserRegistration Framework

Environment-aware Playwright framework for DPBH, TXOCA, NVRCP, NJ, LNI Conveyance, and LNI Cranes registration flows.

URLs are resolved from `environment + site`. Product behavior remains independent from URLs, so URL version changes only require an edit in `config/urls.js`.

The configured environments are TEST, PROD, and UAT. UAT includes NVRCP, NJ, and TXOCA, using the shared registration strategies and product definitions.

## Main Commands

Short commands from the repo root:

```powershell
npm run register
npm run register -- --env TEST --site NJ
npm run register -- --env PROD --site NJ --product CL
npm run register -- --env UAT --site NJ,NVRCP --product ALL
npm run register -- --env UAT --site TXOCA --product ALL --parallel 3
npm run register -- --env UAT --site TXOCA --product MEDIATOR
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
npm run register:uat -- --site ALL --product ALL --parallel 3
```

`--env TEST,PROD --site NJ,NVRCP` runs the cross-product of both environments and both sites.

`--target TEST:NJ,PROD:NVRCP` runs only those exact environment/site pairs.

`--env UAT --site ALL --product ALL` selects all configured UAT products: 13 for NVRCP, 4 for NJ, and 8 for TXOCA. `--env TEST,UAT` selects both environments; `--env ALL` includes every configured environment. Use `npm run register:list -- --env UAT --site ALL --product ALL` to preview the selection.

UAT TXOCA names product `CR` Mediator; `--product MEDIATOR` is a UAT alias for that flow. The `CRF` firm registration also uses the Mediator tab. Product-level `environmentOverrides.UAT` entries hold these differences, including the startup program, tab text, and exact registration title. Corporate Fiduciary uses its visible registration row in every environment because its generated link ID differs between versions. Ambiguous links and IDs pointing to another registration type fail clearly. The shared strategy selects a visible text match so a hidden dropdown option cannot intercept the tab click.

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

To use UAT by default, set `"defaultEnvironment": "UAT"` in `config/runSettings.json`. For a future UAT site, add its URL under `environments.UAT.urls`. Existing site strategies and products are reused automatically. Add products in that site's `config/sites.js` entry; a new site with a different registration flow also needs a strategy registered in `registry/siteRegistry.js`.

For product differences between environments, add `environmentOverrides.<ENV>` to that product in `config/sites.js`. Only that environment receives the overridden properties; other environments keep the common definition.

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
