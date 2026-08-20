#!/usr/bin/env node
import path from 'path';
import {
  jmeterPropertyOverrides,
  parseArgs,
  profileOverrides,
  resolveParallelWorkers,
  scriptSelections
} from '../src/utils/argumentParser.js';
import { listJmxScripts, resolveJmxScript } from '../src/utils/jmxDiscovery.js';
import { createRunDirectory, timestampForFolder } from '../src/utils/fileUtils.js';
import { runWithConcurrency } from '../src/utils/parallelRunner.js';
import { runPerformanceScenario } from '../src/runners/performanceRunner.js';
import { runConfig } from '../config/runConfig.js';

async function main() {
  const args = parseArgs();
  const requestedScripts = scriptSelections(args);
  const scripts = resolveBatchScripts(requestedScripts);
  const workers = resolveParallelWorkers(args, {
    parallelExecution: runConfig.parallelExecution,
    parallelWorkers: runConfig.parallelWorkers,
    scriptCount: scripts.length
  });
  const parallel = workers > 1;
  const batchTimestamp = timestampForFolder();
  const commonProperties = jmeterPropertyOverrides(args);
  const overrides = profileOverrides(args);

  console.log(`Scripts: ${scripts.length}`);
  console.log(`Execution: ${parallel ? `parallel (${Math.min(workers, scripts.length)} workers)` : 'sequential'}`);

  const results = await runWithConcurrency(scripts, workers, async (scriptName, index) => {
    const script = resolveJmxScript(scriptName);
    const outputDir = outputDirectoryFor({
      requestedOutput: args.output,
      script,
      scriptCount: scripts.length,
      batchTimestamp
    });
    const properties = {
      ...commonProperties,
      ...(parallel ? {
        'jmeterengine.nongui.port': 1000,
        'jmeterengine.nongui.maxport': 1000
      } : {})
    };

    console.log(`[${index + 1}/${scripts.length}] Starting: ${script.relativePath}`);
    try {
      const result = await runPerformanceScenario({
        script: script.relativePath,
        profile: args.profile,
        outputDir,
        properties,
        ...overrides
      });
      console.log(`[${index + 1}/${scripts.length}] Completed: ${script.relativePath}`);
      return { script: script.relativePath, status: 'PASSED', result };
    } catch (error) {
      console.error(`[${index + 1}/${scripts.length}] Failed: ${script.relativePath}`);
      console.error(error.message);
      return { script: script.relativePath, status: 'FAILED', error };
    }
  });

  printBatchSummary(results);
  if (results.some((entry) => entry.status === 'FAILED')) process.exitCode = 1;
}

function resolveBatchScripts(requestedScripts) {
  const allRequested = requestedScripts.some((script) => script.toUpperCase() === 'ALL');
  if (allRequested && requestedScripts.length > 1) {
    throw new Error('Use --script=ALL by itself, without additional script names.');
  }
  return allRequested ? listJmxScripts() : requestedScripts;
}

function outputDirectoryFor({ requestedOutput, script, scriptCount, batchTimestamp }) {
  if (!requestedOutput) return undefined;
  if (scriptCount === 1) return path.resolve(requestedOutput);

  return createRunDirectory({
    resultsRoot: path.resolve(requestedOutput),
    scriptRelativePath: script.relativePath,
    timestamp: batchTimestamp
  });
}

function printBatchSummary(results) {
  console.log('');
  console.log('Performance batch complete');
  console.log('==========================');

  for (const entry of results) {
    if (entry.status === 'FAILED') {
      console.log(`FAILED | ${entry.script} | ${entry.error.message}`);
      continue;
    }

    const { summary, artifacts } = entry.result;
    console.log(`${entry.status} | ${entry.script} | Samples: ${summary.overall.total} | Failed: ${summary.overall.failed} | P95: ${Math.round(summary.overall.p95)} ms`);
    console.log(`  Excel: ${artifacts.excelPath}`);
    console.log(`  Playwright: ${artifacts.playwrightReportPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
