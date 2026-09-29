import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frameworkRoot = fileURLToPath(new URL('../', import.meta.url));

export const comparisonReportDir = path.join(frameworkRoot, 'comparison-report');
export const playwrightReportDir = path.resolve(
  process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT
    || path.join(frameworkRoot, 'playwright-report'),
);
