# Conveyance Playwright Framework

This framework tests conveyance installation, variance, and alteration workflows against one ALiS TEST URL. It uses three Playwright scripts: Register, Login Apply, and Approve. Full variance and alteration flows run Login Apply and Approve a second time for the follow-up application.

## Setup

From `tests/LNI/Conveyance`, run `npm ci` and `npm run setup` to install dependencies and browsers. Set the TEST URL in `config/URL.js`. Approval uses `CONVEYANCE_APPROVER_LOGIN_NAME` and `CONVEYANCE_APPROVER_PASSWORD` in the local `.env` file or environment. These are separate from the applicant credentials.

## Choose a flow

| Command | What runs |
| --- | --- |
| `npm run conv initial` | Registers a new applicant, submits a new installation, and approves it. |
| `npm run conv var` | Registers a new applicant, submits and approves a new installation, then applies for and approves its variance. |
| `npm run conv alt` | Registers a new applicant, submits and approves a new installation, then applies for and approves its alteration. |
| `npm run conv -- --register` | Registers a new applicant only. `--regsiter` is accepted as an alias. |
| `npm run conv initial -- --apply` | Submits an installation only with the standalone applicant. No registration or approval. |
| `npm run conv var -- --apply` | Submits a variance only using the conveyance number in config. No installation, registration or approval. |
| `npm run conv alt -- --apply` | Submits an alteration only using the alteration number in config. No installation, registration or approval. |
| `npm run conv initial -- --ExistingUser` | Skips registration. Applies for and approves a new installation with the configured applicant. |
| `npm run conv var -- --ExistingUser` | Skips registration. Creates and approves a new installation, then applies for and approves its variance with the same applicant. |
| `npm run conv alt -- --ExistingUser` | Skips registration. Creates and approves a new installation, then applies for and approves its alteration with the same applicant. |
| `npm run conv var -- --ExistingConveyance` | Skips registration and installation. Applies for and approves a variance on the conveyance saved in the config file. |
| `npm run conv alt -- --ExistingConveyance` | Applies for and approves an alteration on the saved conveyance. No registration or new installation. |
| `npm run conv -- --approve` | Approves the transaction saved in the config file. Does not register or apply. |

Combined flows pass the new transaction number from Apply to Approve. An approval-only run finds the exact Work Queue row, reads its application type, and uses the matching review checklist.

## Choose Overrides

Use `--AppType` and `--PerType` only when you are creating an installation. For example, `npm run conv var -- --ExistingUser --AppType=NCI --PerType=Comm --CommType=FC` creates a commercial freight cable installation and then its variance. `--CommType` applies only to commercial NCI and `--ResType` only to residential NCI. In an `ALL` selection with no matching permit, the runner warns and skips the unused endorsement; incompatible overrides in specific selections are rejected. The runner honors CLI selections first, then compatible values in `runSettings.json`, and makes a compatible random choice for blank selections.

`initial --apply` accepts the same installation selectors as `initial`. For example, `npm run conv initial -- --apply --AppType=NCI --PerType=Comm --CommType=FC` submits only a freight cable installation. In apply-only commands, a selector written without a value is treated as omitted. Use `--Key=` to clear its configured value.

`--ConvNum` belongs with `var` or `alt` in `--apply` or `--ExistingConveyance` mode. The CLI number takes priority over the respective config file. For example, `npm run conv alt -- --apply --ConvNum=4749 --list` previews an override; 4749 is a reference only. `--TransacNum` overrides the saved transaction for `--approve`. These paths do not take installation selectors.

Alteration always fills a random contract value from the range in `config/editableData.js`. It can change zero or more eligible Conveyance Information controls. Add `--NoConveyanceChanges` to leave that section untouched, without disabling contract value randomization:

```powershell
npm run conv alt -- --apply --NoConveyanceChanges --list
```

Add `--list` after `--` to preview a workflow without signing in or replacing the last report. For example, `npm run conv var -- --list` previews all five stages. Preview catches invalid CLI options, planning errors and test discovery failures, not errors that occur while interacting with ALiS.

## What to edit

| File | What it controls |
| --- | --- |
| `config/runSettings.json` | Default type, permit, endorsement, browser, workers and timeouts. CLI selections take priority; blank choices allow a compatible random selection. |
| `config/LoginCredentials.js` | The existing applicant login name and password. Both are needed to reuse an account. |
| `config/ConveyanceVarianceDetails.js` | Default `conveyanceNumber` for `var --apply` and `var --ExistingConveyance`. |
| `config/ConveyanceAlterationDetails.js` | Default `conveyanceNumber` for `alt --apply` and `alt --ExistingConveyance`. Verify that the configured applicant can access it before a live run. |
| `config/approvalTransacNumber.js` | Default `TransactionNumber` for `--approve` and separate approver login setup. |
| `config/editableData.js` | Form inputs, variance answers, alteration values and upload comments. Upload steps randomly choose from the files in `UploadFiles/`. |

`--apply`, `--ExistingUser`, and `--ExistingConveyance` use the standalone applicant. Explicit `--LoginName` and `--LoginPassword` take priority over environment variables and config. Do not combine `--apply` with `--ExistingUser`; choose the latter when you also want approval. A follow-up on an existing conveyance requires an applicant with access to it. Only one browser project and one repeat are allowed for an existing conveyance or a specific approval transaction.

## Applications, parallel runs and reports

- `NCI` is New Conveyance Installation, with Residential (`Res`) or Commercial (`Comm`) permits. `CHI` is Construction Hoist Installation. Use `--PerType=CPH-A10.4` for Construction Personnel Hoist or `--PerType=CMH-A10.5` for Construction Material Hoist. These shortcuts need no quotes in PowerShell; the original parenthesized codes still work.
- `CV` is Conveyance Variance; `CA` is Conveyance Alteration. Full workflows start with NCI or CHI, then use the same applicant and the conveyance number captured at approval. With `--AppType=ALL`, a specific permit filters out incompatible application types.
- `--parallel N` (or `--parallel=N`) caps concurrent combinations. Each keeps its own stages and transaction numbers in order. For example, `npm run conv alt -- --AppType=ALL --PerType=ALL --parallel=3 --list` previews all four installation permits with Alteration follow-ups.
- For every application type, recognized approval checklist rows randomly use Complete or Waived Off when both are enabled. Pending is never selected; unresolved items still block the save.
- Results are in `test-results/`. The latest Playwright HTML report opens after the run. Run `npm run report` from this framework folder to reopen it.
- `npm run validate:flows` runs local regression checks without submitting to TEST. See [Commands.txt](Commands.txt) for the full command and option reference, and the [smoke checklist](Conveyance_Command_Smoke_Checklist.xlsx) for manual previews and rejection checks.
