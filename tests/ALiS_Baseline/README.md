# ALiS Baseline

Reusable Playwright framework for comparing live ALiS UI text against Excel baseline sheets.

## Supported Coverage

- `TC01` compares tab names from `TC01_Tabs`.
- `TC02` compares section headers from `TC02_SectionHeaders`.
- `TC03` compares field labels and required asterisk status from `TC03_FieldLabels`.
- `TC04` compares table column headers from `TC04_TableColumnHeaders`.
- `TC05` compares informative text by parent tab and section from `TC05_InformativeText` for RPM, RM, MAMMO, HMB, ESF, CLab, BB, HLS, CL, CONV_CC, CONV_BO, CONV_PM, HF, ML, EHS, and KPS.
- Flow 1 `New Entity - Modify` creates a fresh entity/facility, opens it from Modify, then compares.
- Flow 2 `Existing Entity - Modify` opens an existing entity/facility from Modify, then compares.
- Flow 3 `New Entity - View` creates a fresh entity/facility, opens it from View, then compares.
- Flow 4 `Existing Entity - View` opens an existing entity/facility from View, then compares.

## Business Units And URLs

```text
HLS -> LNI
CL  -> LNI
RPM -> NVRCP
RM  -> NVRCP
MAMMO -> NVRCP
HF -> DPBH
ML -> DPBH
EHS -> DPBH
CCP -> DPBH
KPS -> DPBH
```

Run commands can use one explicit URL profile, or `--url=all` to let each BU use its configured URL.

When `--bu=all` is used with one selected URL, only BUs configured for that URL are selected:

```text
--bu=all --url=LNI   -> HLS, CL
--bu=all --url=NVRCP -> RPM, RM, MAMMO
--bu=all --url=DPBH  -> HF, ML, EHS, CCP, KPS
--bu=all --url=all   -> all configured BUs, each using its own URL key
```

```bash
npm run baseline -- --flow=1 --bu=CL,HLS --url=LNI --tc=all --headed
npm run baseline -- --flow=1 --bu=RPM --url=NVRCP --tc=all --headed
npm run baseline -- --flow=1 --bu=RM --url=NVRCP --tc=all --headed
npm run baseline -- --flow=1 --bu=MAMMO --url=NVRCP --tc=all --headed
npm run baseline -- --flow=all --bu=HF --url=DPBH --tc=all --headed
npm run baseline -- --flow=all --bu=ML --url=DPBH --tc=all --headed
npm run baseline -- --flow=all --bu=EHS --url=DPBH --tc=all --headed
npm run baseline -- --flow=all --bu=CCP --url=DPBH --tc=all --headed
npm run baseline -- --flow=all --bu=KPS --url=DPBH --tc=all --headed
npm run baseline -- --flow=all --bu=KPS --url=DPBH --tc=TC05 --headed
npm run baseline -- --flow=2 --bu=all --url=LNI --tc=all --project=chromium --headed
npm run baseline -- --flow=2 --bu=all --url=NVRCP --tc=all --project=chromium --headed
npm run baseline -- --flow=2 --bu=all --url=all --tc=all --project=chromium --headed
npm run baseline -- --flow=4 --bu=HLS --url=LNI --entity="YOUR_FACILITY_NAME" --tc=all --headed
npm run baseline -- --flow=2 --bu=RPM --url=NVRCP --entity="YOUR_FACILITY_NAME" --tc=all --headed
npm run baseline -- --flow=2 --bu=RM --url=NVRCP --entity="YOUR_FACILITY_NAME" --tc=all --headed
npm run baseline -- --flow=2 --bu=MAMMO --url=NVRCP --entity="YOUR_FACILITY_NAME" --tc=all --headed
```

Use `--login-url="http://..."` only when you need to override the configured profile URL directly.

## Folder Map

```text
tests/ALiS_Baseline/
  baselines/              Excel baseline files for each BU
  config/                 URLs, run settings, business units, editable data, selectors
  core/                   Excel reading, capture, compare, reporting
  data/                   BU-specific Flow 1 create form data
  flows/                  Login, Create Entity, Business Entity search/open flows
  test-cases/             TC01 through TC05, and registry
  test-results/           Latest Excel/JSON/HTML results
  scripts/run.js          Main executable
  scripts/validate.js     Local framework validation
  utils/                  Random data, logger, console annotations
  Commands.txt            Maintained command reference
```

## Baseline Workbooks

Current baseline files:

```text
baselines/Modify/<URL_KEY>/<BU>.xlsx
baselines/View/<URL_KEY>/<BU>.xlsx
```

Each workbook must contain:

```text
TC01_Tabs
TC02_SectionHeaders
TC03_FieldLabels
TC04_TableColumnHeaders
TC05_InformativeText
```

## NVRCP Notes

RPM, RM, and MAMMO use the NVRCP URL profile. New Entity flows store the generated Facility Name and reuse it in the Business Entity search field.

For `Activity Log(s)` and `Payment(s)`, the framework checks whether the expected table headers are already visible. If not, it runs the configured Add steps before capturing table headers. NVRCP `Payment(s)` opens Search Receipt, searches receipts, and picks a random receipt date from the result grid before saving.

## DPBH Notes

HF, ML, EHS, CCP, and KPS use the DPBH URL profile. For `Activity Log(s)` and `Payment(s)`, the framework first checks whether the expected table headers are visible. It creates the minimum required row only when those headers are absent. ML uses Action Code `IPNT`; EHS and CCP use `IRQ`; KPS uses `CIC`.

`Owner(s)` and `Additional Information` remain visible in TC01, but are temporarily skipped for detailed DPBH capture and comparison. This means EHS does not click `Owner(s)`. Edit `detailTabSettingsByUrl.DPBH.skippedDetailTabs` in `config/BusinessUnit.js` to enable them later.

## Configuration

- URL profiles: `config/urls.js`
- Business units: `config/BusinessUnit.js`
- Credentials and BU defaults: `config/editableData.js`
- Existing Entity - Modify names: `config/flow2EntityNames.js`
- Existing Entity - View names: `config/flow4EntityNames.js`
- Shared random/test values: `config/testData.js`
- BU-specific Flow 1 form/dropdown data: `data/CreateEntityData.js`
- Defaults such as flow, URL, test cases, headed/headless, and report opening: `config/runSettings.json`

## Future URLs And BUs

New URL profiles go in `config/urls.js`; Modify baseline workbooks go under `baselines/Modify/<URL_KEY>/`, and View baseline workbooks go under `baselines/View/<URL_KEY>/`.

Core framework behavior applies to every current and future BU:
- New Entity flows capture the post-save Entity ID when available, then search retries by generated name, timestamp variants, and Entity ID fallback.
- Near-key differences caused by casing, spacing, punctuation, or small acronym/character variants are reported as `Mismatch` with a Details reason instead of separate `Missing` and `Extra` rows.

New BUs use this structure:
- `config/BusinessUnit.js`: BU id, name, baseline workbook, and URL key
- `config/editableData.js`: BU defaults, entity prefix, Flow 2 entity name, and selectors
- `data/CreateEntityData.js`: Flow 1 create-data builder for the BU
- `baselines/<URL_KEY>/<BU>.xlsx`: baseline workbook

## Validation

```bash
npm run validate
npm run list
```

Every run overwrites `test-results/latest-run` and saves each BU/flow combination in its own folder.
