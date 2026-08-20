# ALiS Performance Framework

Playwright JavaScript orchestration framework for existing Apache JMeter `.jmx` load test scripts.

The framework keeps JMeter as the load engine. Playwright is used for orchestration, assertions, artifact handling, and CI-friendly execution.

## Location

- Framework: `C:\Users\mohd.jamal\Downloads\Playwright\tests\ALiS_Performance`
- JMeter scripts source: `C:\Users\mohd.jamal\Downloads\apache-jmeter-5.6.3\TestScripts`

## Main Commands

Run these from `C:\Users\mohd.jamal\Downloads\Playwright\tests\ALiS_Performance`.

Detailed command reference:

```text
Commands.txt
```

```powershell
npm run perf:list
```

GUI mode:

```powershell
npm run jmeter:gui -- --script=LNI_PREPROD.jmx
```

GUI mode with a load profile:

```powershell
npm run perf:gui -- --script=LNI_PREPROD.jmx --profile=smoke
```

Parallel GUI mode:

```powershell
npm run perf:gui -- --script="LNI/Inspection_Search.jmx;LNI_Test.jmx" --profile=peak --parallel=2
```

Non-GUI mode using script settings:

```powershell
npm run perf -- --script=LNI_PREPROD.jmx
```

Non-GUI mode using optional load profile:

```powershell
npm run perf -- --script=LNI_PREPROD.jmx --profile=smoke
```

Parallel non-GUI mode:

```powershell
npm run perf:non-gui -- --script="LNI/Inspection_Search.jmx;LNI_Test.jmx" --profile=peak --parallel=2
```

```powershell
npm run perf:report -- --jtl=results/LNI_PREPROD/<timestamp>/results.jtl --script=LNI_PREPROD.jmx
```

```powershell
$env:RUN_JMETER="true"; $env:PERF_SCRIPT="LNI_PREPROD.jmx"; npx playwright test tests/performance/performance.spec.js
```

## Root Commands

From `C:\Users\mohd.jamal\Downloads\Playwright`, these shortcuts are available after the root package scripts are added:

```powershell
npm run perf:list
npm run perf -- --script=LNI_PREPROD.jmx
npm run perf:non-gui -- --script=LNI_PREPROD.jmx
npm run perf:parallel -- --script="LNI/Inspection_Search.jmx;LNI_Test.jmx" --parallel=2
npm run perf -- --script=LNI_PREPROD.jmx --profile=smoke
npm run perf:gui -- --script=LNI_PREPROD.jmx
npm run perf:gui -- --script="LNI/Inspection_Search.jmx;LNI_Test.jmx" --parallel=2
npm run perf:report -- --jtl=tests/ALiS_Performance/results/LNI_PREPROD/<timestamp>/results.jtl --script=LNI_PREPROD.jmx
npm run jmeter:gui -- --script=LNI_PREPROD.jmx
```

## Configuration

Edit these files:

- `config/paths.js`: JMeter home, script root, and result output path.
- `config/runConfig.js`: report auto-open, Playwright report behavior, GUI auto-start.
- `config/loadProfiles.js`: smoke, normal, peak, stress load shapes.
- `config/reportConfig.js`: Excel report defaults.

You can also copy `.env.example` to `.env` and override common values without changing source files.

## Runtime Outputs

Each run creates a timestamped folder under:

```text
results/<script-name>/<timestamp>/
```

Artifacts include:

- `results.jtl`
- `jmeter.log`
- `html-report/`
- `run-metadata.json`
- `performance-summary.json`
- `performance-summary.csv`
- `Load_Test_Report.xlsx`
- `playwright-report/index.html`

## Design Notes

- Existing `.jmx` scripts are discovered recursively and are not modified.
- With only `--script`, JMeter runs exactly with the settings saved inside the `.jmx`.
- If `--profile` is supplied, the selected profile is passed as JMeter `-J` properties.
- Profiles are also applied to a temporary runtime JMX copy, so hardcoded standard Thread Groups use the selected values without modifying the source script.
- GUI and non-GUI commands share the same profile resolver and command-line overrides.
- Multiple GUI and non-GUI scripts can run concurrently using semicolon-separated `--script` values.
- `--parallel=N` overrides `parallelWorkers`; without it, `parallelExecution` and `parallelWorkers` control concurrency.
- Every parallel script writes to its own timestamped result folder and produces independent reports.
- Use `--J.propertyName=value` to send custom JMeter properties.
- The Excel report is generated universally from JTL data; no template workbook is required.
- Excel report auto-open is enabled by default in `config/runConfig.js`.
- The Node runner generates and opens a Playwright-style report in Chrome with a link to download the Excel report.
- JMeter GUI auto-start is enabled by default in `config/runConfig.js`.
- JMeter GUI auto-close dismisses the Save dialog with **No** after execution.
- GUI mode captures `results.jtl` and generates the same Excel and Playwright reports after JMeter closes.
- The Playwright performance test is guarded by `RUN_JMETER=true` and `PERF_SCRIPT` to avoid accidental load execution.
