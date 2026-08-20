#!/usr/bin/env node
import path from 'path';
import { parseArgs } from '../src/utils/argumentParser.js';
import { paths } from '../config/paths.js';
import { createRunDirectory } from '../src/utils/fileUtils.js';
import { createReportFromJtl } from '../src/runners/performanceRunner.js';

async function main() {
  const args = parseArgs();
  if (!args.jtl) {
    throw new Error('Missing required --jtl value.');
  }

  const script = args.script || 'external-results.jmx';
  const outputDir = args.output || createRunDirectory({
    resultsRoot: path.join(paths.resultsRoot, 'report-regeneration'),
    scriptRelativePath: script
  });

  const result = await createReportFromJtl({
    jtlPath: path.resolve(args.jtl),
    script,
    outputDir,
    profile: args.profile || null
  });

  console.log('Report generated');
  console.log('================');
  console.log(`Samples: ${result.summary.overall.total}`);
  console.log(`Excel Report: ${result.artifacts.excelPath}`);
  console.log(`Playwright Report: ${result.artifacts.playwrightReportPath}`);
  console.log(`JSON Summary: ${result.artifacts.jsonPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
