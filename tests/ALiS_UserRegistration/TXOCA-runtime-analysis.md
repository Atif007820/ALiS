# TXOCA registration runtime analysis — September 11, 2026

## Outcome

The last saved full run contains **80 tests: 75 passed, 5 failed, 0 timed out**.
All five failures are TXOCA TEST person registrations. Their registration forms,
identity fields, and Register action resolved. The application rejected the
identity after submission; the framework then obscured that rejection behind a
random-profile retry-limit error. A locator timeout was not the observed cause.

Framework safeguards have been implemented, but the application rejection is
not claimed fixed. No comparison assertions, baselines, server validation,
first-time-applicant intent, or environment URLs have been changed.

## Original-run evidence

Sources retained unchanged:

- `test-results/latest-registration-report.json`: generated September 11, 2026,
  11:14:01 AM; full-run totals above.
- `playwright-report/index.html`: embedded Playwright result JSON, error stacks,
  stdout/stderr, and attachments. Five actual workers; approximately 8m32s.
- Each failed test's `test-results/register-AllUserRegistrati-*/error-context.md`,
  screenshot, and video: expected registration heading, populated person fields,
  DOB, and Register action targeting `ctl00$ContentPlaceHolder1$btnSaveNext`.

| Product | TEST original result | PROD-labelled original result | Expected first-time form |
| --- | --- | --- | --- |
| GRD | Failed, 53.859s | Passed | Guardianship Registration |
| CR | Failed, 49.924s | Passed | Court Reporter Certification |
| PS | Failed, 51.403s | Passed | Process Server Certification |
| CI | Failed, 49.926s | Passed | Licensed Court Interpreter |
| PROFESSIONAL_CG | Failed, 57.300s | Passed | Guardians |
| CF, CRF, GP | All passed | All passed | Entity/program registrations |

All five original failures ended with `Registration profile retry limit reached
(2)`. Each had an initial rejected submission plus two retries with different
random identities. The underlying application message was:

> Information provided by you does not match with our record, review your personal information and if you believe the information is correct. Please contact the program at Texas Office of Court Administration to update your information

TEST points to `ALiSTXOCA2TESTING11.4.41.03`; the framework's PROD label points to
the older `ALiSTXOCA2TESTING11.3.25.02` on the same internal server. These are
different builds, not evidence that both environments have identical backend
rules or data. The pattern is consistent with a TEST application/configuration/
data difference, but does not identify the specific backend defect.

## Live investigation

All five intended first-time registration links reached the expected headings.
Existing-user activation links lead to a different `Registration.aspx` workflow
requiring certification/activation information; switching to them would change
what these tests are supposed to exercise.

CR was reproduced both through framework filling and through an ordinary native
link click with native field fills. The native reproduction used a coherent
Austin/Texas ZIP address, completed address postbacks before identity entry, and
did not use the framework's hard-fill event dispatch for identity. Both final
registration POSTs contained exactly the intended first name, last name, and DOB.
Both returned the same application rejection. The CR initial-registration link
had no `onclick` handler that the existing direct postback could have skipped.

This rules out missing/wrong identity values and incorrect registration-link
selection in those reproductions. It does **not** prove that seeded existing
identities are required, nor rule out every other server-side input dependency.
Application source, validation logs, and the intended first-time registration
contract are needed to determine the exact rejection rule.

## Runtime changes

- Resolve configured row text against visible, enabled links, not the first
  hidden duplicate in another tab. Reject multiple visible matches and IDs that
  now point at a different row. Confirm person-registration destination headings.
- Retain semantic resolution across generated ID changes. For example,
  PROFESSIONAL_CG currently resolves `LinkButton15` despite its older ID fallback.
- Fill identity after address postbacks; require an editable, unambiguous DOB
  field and exact value readback. Do not report DOB success from the generic
  popup fallback (TXOCA uses an inline calendar).
- Verify identity again after account entry and before submitting. Track the
  actual registration POST and wait for its response before reading validation.
  Detect HTTP failures and submitted-value drift separately.
- Fail deterministically with `TXOCA_PROFILE_MISMATCH` on this server rejection,
  without random identity retries. Keep genuine duplicate-login/profile retries.
- Attach sanitized `txoca-registration-diagnostics`: environment/product, link
  and route, HTTP status, and identity equality booleans. No passwords, actual
  identity values, session/viewstate data, or URL query tokens are included.
- Do not accept generic welcome/dashboard text as success while the registration
  form remains open. An unknown destination or unexplained open form fails with
  `TXOCA_UNCONFIRMED_OUTCOME` instead of saving unverified credentials or changing
  random profile data.

Changes are TXOCA-scoped. Shared field helpers and unrelated frameworks are not
modified. Existing generated-user data and the original reports are preserved.

## Verification

- `npm run validate`: **23/23 passed**. These isolated checks cover all five
  mismatch paths; hidden, changed, ambiguous, and wrong-row links; missing,
  readonly, duplicate, and drifting DOB fields; sanitized diagnostics; delayed
  responses; HTTP 500; incorrect POST identity; a real loopback HTTP 302 redirect;
  duplicate retries; and unconfirmed outcomes. No live registrations are used.
- Live navigation/fill-only audit: **8/8 TXOCA TEST products passed**. All five
  person forms retained the exact identity values after account entry. CF, CRF,
  and GP entity/program forms also opened and filled successfully.
- Targeted live submission recheck: **all five original failures reproduced the
  application rejection**, now reported as `TXOCA_PROFILE_MISMATCH` after one
  submission per product. Each captured HTTP 200, the expected Register target,
  and exact First Name/Last Name/DOB equality both in the DOM and the final POST.
  CR was checked separately; GRD/PS/CI/PROFESSIONAL_CG were checked with at most
  two concurrent sessions. No successful-registration credentials were saved.
- Syntax checks and `git diff --check` passed. The original full-run reports and
  existing user-data files were not overwritten by these checks. The complete
  80-test suite was not rerun; the five application failures remain unresolved.

To repeat the non-submitting live audit from the workspace root (requires
internal network access):

```powershell
npm --prefix .\tests\ALiS_UserRegistration run validate
node .\tests\ALiS_UserRegistration\tools\check-txoca.js
```

The live audit opens and fills the five person forms but never clicks Register
or saves credentials. Select other products with `--product=CF,CRF,GP`, or select
the older environment with `--env=PROD`. A passing fill audit is not proof that
the server will accept registration.

## Needed to finish the application failure

Provide the TEST application's first-time-registration validation code or server
logs for the rejected `InitialUserRegistration.aspx` submissions, and confirmation
from the application owner of the intended identity-validation rule. Compare that
rule/configuration with build 11.3.25.02. Only if the owner confirms a fixture
requirement should approved, unused test identities be introduced. Do not bypass
the rejection, switch to activation, or manufacture a passing test.
