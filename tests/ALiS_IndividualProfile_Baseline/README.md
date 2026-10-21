# ALiS Individual Profile Baseline

Reusable Playwright baseline framework for comparing ALiS individual profile UI elements against Excel baseline workbooks.

Currently configured:

- URL: `NVRCP`
- BU: `MAMMO`
- Baseline workbook: `Mammo.xlsx`
- Flows: New/Existing Profile for Modify and View
- Test cases: `TC01` to `TC05`

Run:

```powershell
npm run baseline -- --flow=all --bu=MAMMO --url=NVRCP --tc=all --project=chromium
```

Four-worker execution:

```powershell
npm run baseline -- --flow=all --bu=MAMMO --url=NVRCP --tc=all --project=chromium --parallel=4
```

`--parallel 4` and `--workers=4` are also supported. Bare `--parallel` uses
`parallelWorkers` in `config/runSettings.json`, now 4. `--serial` selects one
worker. Independent jobs fill available slots; jobs using the same existing
profile on the same portal wait for each other. New-profile jobs sharing a
portal and account are serialized to protect ALiS credential session state.
Blocked jobs do not occupy worker slots. Each browser job receives fresh profile
data, with names reserved uniquely within this runner. Separate runner processes
are not coordinated.
API and credential numbers use reserved random 12-digit values, not millisecond
timestamps. `API` plus 12 digits fits the live API field's 15-character limit and
is verified before Save, preventing parallel values from colliding after truncation.

Credential popup radio selections and other configured values are verified after
ASP.NET refreshes before OK. Popup close and its parent callback must complete;
both partial callbacks and full parent postbacks are supported. Persistent popup
validation is reported directly, with bounded waits and recovery attempts.
After Save is attempted, a browser-close retry searches the same profile instead
of creating another one. Unknown Save persistence is not blindly resubmitted.
Failed runtime attempts retain a Playwright trace and their own report directory.

Use `--output-dir=test-results/<new-folder>` to preserve existing run artifacts
during verification. The folder must be empty and inside this framework.
`openPlaywrightReport` controls automatic report opening, or use
`--open-playwright-report=false` for a single run.

Runtime completion and UI baseline comparison results are reported separately.
Live wording changes remain comparison failures; baselines are not rewritten.

Validate:

```powershell
npm run validate
npm run test:runtime
```

Existing-profile names are editable in:

- `config/flow2EntityNames.js`
- `config/flow4EntityNames.js`

Generated profile naming:

- Last Name: `MAMMO_<number>`
- First Name: `IND_<number>`
