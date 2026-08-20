#!/usr/bin/env node
import path from 'path';
import {
  jmeterPropertyOverrides,
  parseArgs,
  profileOverrides,
  profileSelections,
  resolveParallelWorkers,
  scriptSelections
} from '../src/utils/argumentParser.js';
import { listJmxScripts, resolveJmxScript } from '../src/utils/jmxDiscovery.js';
import { createRunDirectory, timestampForFolder } from '../src/utils/fileUtils.js';
import { createExecutionJobs, executionJobLabel } from '../src/utils/executionMatrix.js';
import { resolveLoadSettings } from '../src/utils/loadProfileResolver.js';
import { runWithConcurrency } from '../src/utils/parallelRunner.js';
import { runPerformanceScenario } from '../src/runners/performanceRunner.js';
import { paths } from '../config/paths.js';
import { runConfig } from '../config/runConfig.js';

async function main() {
  const args = parseArgs();
  const requestedScripts = scriptSelections(args);
  const scripts = resolveBatchScripts(requestedScripts);
  const profiles = profileSelections(args);
  validateProfiles(profiles);
  const jobs = createExecutionJobs(scripts, profiles);
  const workers = resolveParallelWorkers(args, {
    parallelExecution: runConfig.parallelExecution,
    parallelWorkers: runConfig.parallelWorkers,
    scriptCount: jobs.length
  });
  const parallel = workers > 1;
  const isolateProfiles = profiles.length > 1;
  const batchTimestamp = timestampForFolder();
  const commonProperties = jmeterPropertyOverrides(args);
  const overrides = profileOverrides(args);

  console.log(`Scripts: ${scripts.length}`);
  console.log(`Profiles: ${profiles[0] ? profiles.join(', ') : 'JMX script settings'}`);
  console.log(`Combinations: ${jobs.length}`);
  console.log(`Execution: ${parallel ? `parallel (${workers} workers)` : 'sequential'}`);

  const results = await runWithConcurrency(jobs, workers, async (job, index) => {
    const script = resolveJmxScript(job.scriptName);
    const label = executionJobLabel({
      scriptName: script.relativePath,
      profileName: job.profileName
    });
    const outputDir = outputDirectoryFor({
      requestedOutput: args.output,
      script,
      jobCount: jobs.length,
      batchTimestamp,
      profileName: job.profileName,
      isolateProfiles
    });
    const properties = {
      ...commonProperties,
      ...(parallel ? {
        'jmeterengine.nongui.port': 1000,
        'jmeterengine.nongui.maxport': 1000
      } : {})
    };

    console.log(`[${index + 1}/${jobs.length}] Starting: ${label}`);
    try {
      const result = await runPerformanceScenario({
        script: script.relativePath,
        profile: job.profileName,
        outputDir,
        properties,
        ...overrides
      });
      console.log(`[${index + 1}/${jobs.length}] Completed: ${label}`);
      return {
        script: script.relativePath,
        profileName: job.profileName,
        status: 'PASSED',
        result
      };
    } catch (error) {
      console.error(`[${index + 1}/${jobs.length}] Failed: ${label}`);
      console.error(error.message);
      return {
        script: script.relativePath,
        profileName: job.profileName,
        status: 'FAILED',
        error
      };
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

function validateProfiles(profiles) {
  for (const profileName of profiles) {
    if (profileName) resolveLoadSettings({ profile: profileName });
  }
}

function outputDirectoryFor({
  requestedOutput,
  script,
  jobCount,
  batchTimestamp,
  profileName,
  isolateProfiles
}) {
  if (!requestedOutput && !isolateProfiles) return undefined;
  if (requestedOutput && jobCount === 1) return path.resolve(requestedOutput);

  return createRunDirectory({
    resultsRoot: requestedOutput ? path.resolve(requestedOutput) : paths.resultsRoot,
    scriptRelativePath: script.relativePath,
    profileName: isolateProfiles ? profileName : '',
    timestamp: batchTimestamp
  });
}

function printBatchSummary(results) {
  console.log('');
  console.log('Performance batch complete');
  console.log('==========================');

  for (const entry of results) {
    const label = executionJobLabel({
      scriptName: entry.script,
      profileName: entry.profileName
    });
    if (entry.status === 'FAILED') {
      console.log(`FAILED | ${label} | ${entry.error.message}`);
      continue;
    }

    const { summary, artifacts } = entry.result;
    console.log(`${entry.status} | ${label} | Samples: ${summary.overall.total} | Failed: ${summary.overall.failed} | P95: ${Math.round(summary.overall.p95)} ms`);
    console.log(`  Excel: ${artifacts.excelPath}`);
    console.log(`  Playwright: ${artifacts.playwrightReportPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
