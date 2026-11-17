# Conveyance Playwright Framework

This framework tests conveyance installation and variance workflows against the single ALiS TEST URL. It uses three Playwright scripts: Register, Login Apply, and Approve. A new variance runs Login Apply and Approve a second time.

## Setup

From `tests/LNI/Conveyance`, run `npm ci` and `npm run setup` to install dependencies and browsers. Set the TEST URL in `config/URL.js`. Approval uses `CONVEYANCE_APPROVER_LOGIN_NAME` and `CONVEYANCE_APPROVER_PASSWORD` in the local `.env` file or environment. These are separate from the applicant credentials.

## Choose a flow

| Command | What runs |
| --- | --- |
| `npm run conv initial` | Registers a new applicant, submits a new installation, and approves it. |
| `npm run conv var` | Registers a new applicant, submits and approves a new installation, then applies for and approves its variance. |
| `npm run conv -- --register` | Registers a new applicant only. `--regsiter` is accepted as an alias. |
| `npm run conv initial -- --apply` | Submits an installation only with the standalone applicant. No registration or approval. |
| `npm run conv var -- --apply` | Submits a variance only using the conveyance number in config. No installation, registration or approval. |
| `npm run conv var -- --apply --ConvNum=4749 --list` | Previews the number override without submitting. 4749 is a reference only; use an approved TEST conveyance number for a live run. |
| `npm run conv initial -- --ExistingUser` | Skips registration. Applies for and approves a new installation with the configured applicant. |
| `npm run conv var -- --ExistingUser` | Skips registration. Creates and approves a new installation, then applies for and approves its variance with the same applicant. |
| `npm run conv var -- --ExistingConveyance` | Skips registration and installation. Applies for and approves a variance on the conveyance saved in the config file. |
| `npm run conv var -- --ExistingConveyance --ConvNum=9790` | Same as above, but uses Conveyance # 9790. |
| `npm run conv -- --approve` | Approves the transaction saved in the config file. Does not register or apply. |
| `npm run conv -- --approve --TransacNum=4324` | Same as above, but uses Transaction # 4324. |

Combined flows pass the new transaction number from Apply to Approve. An approval-only run finds the exact Work Queue row, reads its application type, and uses the matching review checklist.

## Choose Overrides

Use `--AppType` and `--PerType` only when you are creating an installation. For example, `npm run conv var -- --ExistingUser --AppType=NCI --PerType=Comm --CommType=FC` creates a commercial freight cable installation and then its variance. `--CommType` applies only to commercial NCI and `--ResType` only to residential NCI. In an `ALL` selection with no matching permit, the runner warns and skips the unused endorsement; incompatible overrides in specific selections are rejected. The runner honors CLI selections first, then compatible values in `runSettings.json`, and makes a compatible random choice for blank selections.

`initial --apply` accepts the same installation selectors as `initial`. For example, `npm run conv initial -- --apply --AppType=NCI --PerType=Comm --CommType=FC` submits only a freight cable installation. In apply-only commands, a selector written without a value is treated as omitted. Use `--Key=` to clear its configured value.

`--ConvNum` belongs only with `var --apply` or `var --ExistingConveyance`. Both use the CLI number first and the saved conveyance number second. `--TransacNum` belongs only with `--approve` and overrides its saved transaction number. These paths do not take installation selectors.

Add `--list` after `--` to preview any command without signing in or replacing the last report. For example, `npm run conv var -- --list` previews all five stages.

## What to edit

| File | What it controls |
| --- | --- |
| `config/runSettings.json` | Default type, permit, endorsement, browser, workers and timeouts. CLI selections take priority; blank choices allow a compatible random selection. |
| `config/LoginCredentials.js` | The existing applicant login name and password. Both are needed to reuse an account. |
| `config/ConveyanceVarianceDetails.js` | Default `conveyanceNumber` for `var --apply` and `var --ExistingConveyance`. |
| `config/approvalTransacNumber.js` | Default `TransactionNumber` for `--approve` and separate approver login setup. |
| `config/editableData.js` | Form inputs, variance answers and upload filenames. Put upload files in `UploadFiles/`. |

`--apply`, `--ExistingUser`, and `--ExistingConveyance` use the standalone applicant. Explicit `--LoginName` and `--LoginPassword` take priority over environment variables and config. Do not combine `--apply` with `--ExistingUser`; choose the latter when you also want approval. A variance on an existing conveyance requires an applicant with access to it. Only one browser project and one repeat are allowed for an existing conveyance or a specific approval transaction.

## Applications, parallel runs and reports

- `NCI` is New Conveyance Installation, with Residential (`Res`) or Commercial (`Comm`) permits. `CHI` is Construction Hoist Installation, with `CPH(A10.4)` or `CMH(A10.5)` permits.
- `CV` is Conveyance Variance. A full variance starts with an NCI or CHI installation, then uses the same applicant and the conveyance number captured at approval. Use `npm run conv var -- --AppType=CHI --PerType=ALL --parallel=2` to cover both hoist permits. With `--AppType=ALL`, a specific permit filters out incompatible application types.
- `--parallel 2`, `--parallel 3`, and `--parallel 4` cap the number of concurrent full flows; `--parallel=N` also works. Each flow keeps its own stages and transaction numbers in order. For example, `npm run conv initial -- --AppType=ALL, PerType=ALL, CommType=FC --parallel 3` runs all four NCI and CHI permits, up to three flows at once. The same selections work with `var`; each installation is then followed by its own variance.
- Results are in `test-results/`. The latest Playwright HTML report opens after the run. Run `npm run report` from this framework folder to reopen it.
- `npm run validate:flows` runs local regression checks without submitting to TEST. See [Commands.txt](Commands.txt) for the full command and option reference, and the [smoke checklist](Conveyance_Command_Smoke_Checklist.xlsx) for manual previews and rejection checks.
