# Framework Architecture

## Flow

1. Discover a `.jmx` file from the configured script root.
2. Resolve optional load profile.
3. Execute JMeter CLI. If no profile is supplied, no load properties are injected.
4. Parse the JTL result file.
5. Calculate overall, label-level, and thread-group-level statistics.
6. Generate JSON, CSV, JMeter HTML, and Excel report artifacts.
7. Open generated reports based on `config/runsettings.json`.
8. Attach artifacts when run through Playwright.

## Folders

```text
config/                 Runtime configuration
scripts/                CLI entry points
src/runners/            JMeter and orchestration runners
src/parsers/            JTL parsing and metrics
src/validators/         Workbook validation
src/reports/            JSON, CSV, Excel report generation
tests/performance/      Playwright orchestration spec
tests/framework/        Fast framework unit checks
templates/              Excel workbook template
results/                Runtime output
```

## Why Playwright Here

Playwright is not replacing JMeter. It provides one consistent automation entry point with assertions, traceable test results, and artifact collection. JMeter continues to produce real load, JTL files, logs, and the HTML dashboard.
