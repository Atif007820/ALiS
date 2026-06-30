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

Validate:

```powershell
npm run validate
```

Existing-profile names are editable in:

- `config/flow2EntityNames.js`
- `config/flow4EntityNames.js`

Generated profile naming:

- Last Name: `MAMMO_<number>`
- First Name: `IND_<number>`
