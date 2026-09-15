# HMB runtime analysis — September 14, 2026

## Last-run result

The saved serial multi-browser run started at 1:24 PM local time and contained
six executions: Register and Login/Apply on Chromium, Firefox, and Edge.

| Flow | Chromium | Firefox | Edge |
| --- | --- | --- | --- |
| Register | Passed | Failed before launch | Passed |
| Login/Apply | Failed at dashboard entry | Failed before launch | Failed at dashboard entry |

The two successful registrations completed normally. No result was a comparison
or asserted business-value failure.

## Root causes

1. **Firefox runtime missing.** The framework's Playwright 1.61.0 project looked
   for `firefox-1532/firefox.exe`, which was not installed. This is a local
   Playwright browser dependency issue, not a test or application failure.
2. **Dashboard menu contract changed in ALiS 11.4.41.04.** After login, the
   application asynchronously renders `Apply for RA-HMB` as a clickable Angular
   `<li>` menu action. The framework queried immediately for an ARIA link, so it
   could fail before the menu was available and could not resolve the current
   list-item representation when it was available.

Evidence retained in the original report shows a successful login and the
dashboard action text. The post-login error was:

`Could not find Apply for RA-HMB or pending application link after login.`

The failed screenshot also shows the asynchronous loading overlay. This is a
runtime locator/readiness issue; no expected values or application outcomes were
modified.

## Fix

`pages/HmbLoginApplyPage.js` now:

- waits up to the configured navigation timeout for the dashboard application
  action to appear;
- resolves semantic links/buttons when the legacy markup is present;
- resolves the owning list item when the current Angular menu is present, so the
  registered menu handler receives the click;
- uses the same resilient lookup for pending and continue-application actions.

The latest live login-only verification resolved `Apply for RA-HMB` as `LI` on
the current dashboard. It did not click the action or create an application.

The follow-up isolated full run confirmed that all three registrations pass and
that the dashboard fix works in Chromium, Firefox, and Edge. Each Login/Apply
flow then reached the current wizard review shell, which exposes named section
links. Address and Owner navigation now opens those named sections before
interacting with their controls, rather than assuming a page-wide `Next` index
will select the intended wizard content.

Firefox revision 1532 was installed with the framework-local Playwright CLI and
a launch-only smoke check passed.

## Verification

- `npm run validate`: two local browser regression tests passed. They cover a
  delayed Angular list item and the legacy semantic-link form; no HMB account or
  application is created.
- Live login-only selector check: passed against the current HMB dashboard.
- Firefox launch-only check: passed.
- `git diff --check`: passed.

The full Login/Apply flow was deliberately not rerun because configured settings
allow it to create an application and submit payment. Run it in an approved test
window after reviewing the generated entity and payment effects:

```bash
npm run hmb:e2e -- --project=chromium --headed
```

Before an all-browser run—or after changing the Playwright package version—run:

```bash
npm run browsers:install
```

The original report and the existing user/URL configuration changes were
preserved.
# Follow-up validation — 14 September 2026

- `npm run validate` covers the modern Angular dashboard menu, named application sections, and the Angular-grid pending-application resume path.
- The isolated Chromium rerun (`validation-runs/hmb-apply-after-resume-fix-20260914-145500`) confirmed that the framework now resumes the incomplete HMB application instead of failing at the dashboard.
- The remaining Owner step is not a locator issue: ALiS 11.4.41.04 activates **Owner, Director and Personnel** but returns an empty form area with only Back, Next, and Reset. No Owner Add control or input exists in the DOM or screenshot. The framework now reports that portal-state condition directly rather than timing out while searching for a control the portal did not render.
