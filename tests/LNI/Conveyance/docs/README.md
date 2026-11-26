# Conveyance Playwright Framework

This framework tests conveyance installation, variance, and alteration workflows against one ALiS TEST URL. It uses three Playwright scripts: Register, Login Apply, and Approve. Full variance and alteration flows run Login Apply and Approve a second time for the follow-up application.

## Setup

From `tests/LNI/Conveyance`, run `npm ci` and `npm run setup` to install dependencies and browsers. Set the TEST URL in `config/URL.js`. Approval uses `CONVEYANCE_APPROVER_LOGIN_NAME` and `CONVEYANCE_APPROVER_PASSWORD` in the local `.env` file or environment. These are separate from the applicant credentials.

## Choose a flow

| Command | What runs |
| --- | --- |
| `npm run conv initial -- --user=new` | Registers a new applicant, submits a new installation, and approves it. |
| `npm run conv var -- --user=new` | Registers a new applicant, submits and approves a new installation, then applies for and approves its variance. |
| `npm run conv alt -- --user=new` | Registers a new applicant, submits and approves a new installation, then applies for and approves its alteration. |
| `npm run conv -- --register` | Registers a new applicant only. `--regsiter` is accepted as an alias. |
| `npm run conv initial -- --apply` | Submits an installation only with the standalone applicant. No registration or approval. |
| `npm run conv var -- --apply` | Uses the configured applicant to submit and approve a new installation, then submit its variance. Stops before variance approval. |
| `npm run conv alt -- --apply` | Uses the configured applicant to submit and approve a new installation, then submit its alteration. Stops before alteration approval. |
| `npm run conv var -- --apply --ExistingConveyance` | Submits a variance using the number in `runInputs/ConveyanceVarianceDetails.js`. |
| `npm run conv alt -- --apply --ExistingConveyance` | Submits an alteration using the number in `runInputs/ConveyanceAlterationDetails.js`. |
| `npm run conv alt -- --apply --ConvNum=202866` | Submits an alteration for conveyance 202866. |
| `npm run conv -- --regapply` | Registers a new applicant and submits an installation. Same as `initial --regapply`. |
| `npm run conv initial -- --regapply` | Registers a new applicant and submits an installation without approval. |
| `npm run conv var -- --regapply` | Registers a new applicant, submits and approves a new installation, then submits its variance. Stops before variance approval. |
| `npm run conv alt -- --regapply` | Registers a new applicant, submits and approves a new installation, then submits its alteration. Stops before alteration approval. |
| `npm run conv var -- --regapply --ExistingConveyance` | Registers a new applicant and submits a variance for the number saved in `runInputs/ConveyanceVarianceDetails.js`. |
| `npm run conv alt -- --regapply --ExistingConveyance` | Registers a new applicant and submits an alteration for the number saved in `runInputs/ConveyanceAlterationDetails.js`. |
| `npm run conv var -- --regapply --ConvNum=202866` | Registers a new applicant and submits a variance for conveyance 202866. |
| `npm run conv alt -- --regapply --ConvNum=202866` | Registers a new applicant and submits an alteration for conveyance 202866. |
| `npm run conv initial -- --user=existing` | Applies for and approves a new installation with the configured applicant. |
| `npm run conv var -- --user=existing` | Creates and approves a new installation, then applies for and approves its variance with the configured applicant. |
| `npm run conv alt -- --user=existing` | Creates and approves a new installation, then applies for and approves its alteration with the configured applicant. |
| `npm run conv var -- --user=existing --ExistingConveyance` | Uses the configured applicant to submit and approve a variance for the conveyance saved in `runInputs/ConveyanceVarianceDetails.js`. |
| `npm run conv alt -- --user=existing --ConvNum=202866` | Uses the configured applicant to submit and approve an alteration for conveyance 202866. |
| `npm run conv -- --approve` | Runs standalone approval using the saved lookup. The default is permit 101216. |
| `npm run conv -- --approve --PerNum=101216` | Searches for the specified permit and approves its first visible Work Queue result. |
| `npm run conv -- --approve --TransacNum=4324` | Searches for and approves the exact transaction. |

Combined flows pass the new transaction number from Apply to Approve. Standalone approval reads the selected Work Queue row's application type and uses the matching review checklist. Permit searches select the first visible result and track it by transaction number through approval. Transaction searches select the exact transaction number.

Every approval selects **Conveyance** in the Work Queue Business Unit filter before waiting for the lookup input. Work Queue searches wait for results to finish loading. The result wait defaults to 150 seconds and can be adjusted with `workQueueSearchTimeoutMs` in `config/timeoutSettings.json`.

Plain `var --apply` and `alt --apply` need applicant credentials for both submissions and approver credentials for the installation approval. The follow-up uses the conveyance number captured from the new installation.

`--regapply` passes the login created by `01_RegisterUser.spec.js` to `02_LoginApply.spec.js`. Plain `var --regapply` and `alt --regapply` also run `03_ApproveApplication.spec.js` to approve the installation, then run Login Apply again to submit the follow-up. Those runs need approver credentials for the installation. For a direct follow-up on an existing conveyance, the new applicant needs access to the target conveyance.

## Choose Overrides

Use `--AppType` and `--PerType` only when you are creating an installation. For example, `npm run conv var -- --user=existing --AppType=NCI --PerType=Comm --CommType=FC` creates a commercial freight cable installation and then its variance. `--CommType` applies only to commercial NCI and `--ResType` only to residential NCI. In an `ALL` selection with no matching permit, the runner warns and skips the unused endorsement; incompatible overrides in specific selections are rejected. The runner honors CLI selections first, then compatible values in `runSettings.json`, and makes a compatible random choice for blank selections.

`--apply` and `--regapply` accept installation selectors when the command starts a new installation. For example, `npm run conv var -- --regapply --AppType=NCI --PerType=Comm --CommType=FC` registers an applicant, submits and approves a freight cable installation, then submits its variance. In `--apply` commands, a selector written without a value is treated as omitted. Use `--Key=` to clear its configured value.

With `var` or `alt`, choose `--ExistingConveyance` for the number in the corresponding details file or `--ConvNum=<number>` for a number you supply. The runner rejects using both selectors together. With either selector, `--apply` submits the follow-up with the configured applicant and `--regapply` registers an applicant before submitting. Existing conveyance paths do not take installation selectors.

### Choose a standalone approval lookup

Set `defaultApprovalLookup` in `config/runSettings.json` to `"permit"` to use `PermitNumber` in `runInputs/approvalPermitNumber.js`, or to `"transaction"` to use `TransactionNumber` in `runInputs/approvalTransacNumber.js`. Use `--PerNum` or `--TransacNum` with `--approve` to override the lookup for one run. The runner rejects using both.

Use these previews to verify the lookup type and number before a live run.

```powershell
npm run conv -- --approve --list
npm run conv -- --approve --PerNum=101216 --list
npm run conv -- --approve --TransacNum=4324 --list
```

### Skip randomized edits to conveyance information

Use `--NoConveyanceChanges` on alteration (`alt`) commands to skip randomized edits to eligible **Conveyance Information** fields. The alteration still fills the random **Conveyance Contract Value** and configured **Restriction** from `config/editableData.js`, uploads documents, and submits the application.

The flag works with `--user=new`, `--user=existing`, `--apply`, and `--regapply`. It also works with either existing conveyance selector. The runner rejects it for `initial` and `var`.

The following commands execute live alteration workflows.

```powershell
npm run conv alt -- --user=new --NoConveyanceChanges
npm run conv alt -- --user=existing --NoConveyanceChanges
npm run conv alt -- --user=existing --ConvNum=202866 --NoConveyanceChanges
npm run conv alt -- --apply --ConvNum=202866 --NoConveyanceChanges
```

Add `--list` to preview a command.

```powershell
npm run conv alt -- --apply --NoConveyanceChanges --list
npm run conv alt -- --apply --ExistingConveyance --NoConveyanceChanges --list
npm run conv alt -- --regapply --ConvNum=202866 --NoConveyanceChanges --list
```

The preview prints `Conveyance Information: unchanged` to indicate that randomized edits are disabled. The workflow still controls whether approval runs.

### Preview a command

Place Conveyance options after npm's `--` separator. Add `--list` to preview a workflow without signing in or replacing the last report. For example, `npm run conv var -- --user=new --list` previews all five stages. Preview checks options, planned stages and test discovery.

## What to edit

| File | What it controls |
| --- | --- |
| `config/runSettings.json` | Default type, permit, endorsement, browser, workers, and standalone approval lookup. CLI selections take priority; blank installation choices allow a compatible random selection. |
| `config/timeoutSettings.json` | Time limits in milliseconds for Playwright and Work Queue searches. |
| `config/LoginCredentials.js` | The existing applicant login name and password. Both are needed to reuse an account. |
| `runInputs/ConveyanceVarianceDetails.js` | Saved variance `conveyanceNumber` used with `--ExistingConveyance`. |
| `runInputs/ConveyanceAlterationDetails.js` | Saved alteration `conveyanceNumber` used with `--ExistingConveyance`. |
| `runInputs/approvalPermitNumber.js` | Saved `PermitNumber` for standalone approval when the lookup is `"permit"`. |
| `runInputs/approvalTransacNumber.js` | Saved `TransactionNumber` for standalone approval when the lookup is `"transaction"`. |
| `config/editableData.js` | Form inputs, variance answers, alteration values and upload comments. Upload steps randomly choose from the files in `UploadFiles/`. |

`--apply` and `--user=existing` use the configured applicant. An existing conveyance flow also uses the configured applicant unless you choose `--regapply`. Explicit `--LoginName` and `--LoginPassword` take priority over environment variables and config when using an existing applicant. Choose `--user=existing` for a full flow that also approves the final application. Use one browser project and one repeat for an existing conveyance or standalone approval.

## Applications, parallel runs and reports

- `NCI` is New Conveyance Installation, with Residential (`Res`) or Commercial (`Comm`) permits. `CHI` is Construction Hoist Installation. Use `--PerType=CPH-A10.4` for Construction Personnel Hoist or `--PerType=CMH-A10.5` for Construction Material Hoist. These shortcuts need no quotes in PowerShell; the original parenthesized codes still work.
- `CV` is Conveyance Variance; `CA` is Conveyance Alteration. Full workflows start with NCI or CHI, then use the same applicant and the conveyance number captured at approval. With `--AppType=ALL`, a specific permit filters out incompatible application types.
- `--parallel N` (or `--parallel=N`) caps concurrent combinations. Each keeps its own stages and transaction numbers in order. For example, `npm run conv alt -- --user=new --AppType=ALL --PerType=ALL --parallel=3 --list` previews all four installation permits with Alteration follow-ups.
- For every application type, recognized approval checklist rows randomly use Complete or Waived Off when both are enabled. Pending is never selected; unresolved items still block the save.
- Results are in `test-results/`. The latest Playwright HTML report opens after the run. Run `npm run report` from this framework folder to reopen it.
- `npm run validate:flows` runs local regression checks without submitting to TEST.

## Validate command combinations

Add `--list` to check the command, target selection, and order of scripts for each browser and repeat. The [smoke checklist](Conveyance_Command_Smoke_Checklist.xlsx) records the observed plan for valid examples and the configuration error for expected rejections. A preview stops at test discovery and leaves the current report in place.

On November 20, 2026, all 114 command previews passed, including the checklist’s 28 valid plans and 23 expected rejections. Coverage included both conveyance selectors, installation overrides, browser and repeat options, and the workspace and framework command aliases.

For a workflow that creates an installation, an extra browser or repeat produces its own plan with a separate transaction handoff. A workflow targeting an existing conveyance or an approval transaction allows one project and one repeat. For the runnable examples and the full options reference, see [Commands.txt](Commands.txt).
