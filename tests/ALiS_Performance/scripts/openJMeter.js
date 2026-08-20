#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import {
  jmeterPropertyOverrides,
  parseArgs,
  profileOverrides,
  resolveParallelWorkers,
  scriptSelections
} from '../src/utils/argumentParser.js';
import { listJmxScripts, resolveJmxScript } from '../src/utils/jmxDiscovery.js';
import { generateJMeterHtmlDashboard, openJMeterGUI } from '../src/runners/jmeterRunner.js';
import { createReportFromJtl } from '../src/runners/performanceRunner.js';
import { buildJMeterProperties, resolveLoadSettings } from '../src/utils/loadProfileResolver.js';
import { createRunDirectory, timestampForFolder, writeJson } from '../src/utils/fileUtils.js';
import { createGuiRuntimeJmx } from '../src/utils/guiRuntimeJmx.js';
import { runWithConcurrency } from '../src/utils/parallelRunner.js';
import { paths } from '../config/paths.js';
import { runConfig } from '../config/runConfig.js';

const GUI_LAUNCH_STAGGER_MS = 1000;

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
  const waitForLaunchSlot = createGuiLaunchGate(parallel ? GUI_LAUNCH_STAGGER_MS : 0);

  console.log(`Scripts: ${scripts.length}`);
  console.log(`Execution: ${parallel ? `parallel GUI (${workers} workers)` : 'sequential GUI'}`);

  const results = await runWithConcurrency(scripts, workers, async (scriptName, index) => {
    await waitForLaunchSlot();
    const script = resolveJmxScript(scriptName);
    const outputDir = outputDirectoryFor({
      requestedOutput: args.output,
      script,
      scriptCount: scripts.length,
      batchTimestamp
    });

    console.log(`[${index + 1}/${scripts.length}] Opening GUI: ${script.relativePath}`);
    try {
      const result = await runGuiScenario({
        args,
        script,
        outputDir,
        batchTimestamp,
        index,
        workers
      });
      const status = result ? 'PASSED' : 'LAUNCHED';
      console.log(`[${index + 1}/${scripts.length}] ${status}: ${script.relativePath}`);
      return { script: script.relativePath, status, result };
    } catch (error) {
      console.error(`[${index + 1}/${scripts.length}] Failed: ${script.relativePath}`);
      console.error(error.message);
      return { script: script.relativePath, status: 'FAILED', error };
    }
  });

  printBatchSummary(results);
  if (results.some((entry) => entry.status === 'FAILED')) process.exitCode = 1;
}

async function runGuiScenario({ args, script, outputDir, batchTimestamp, index, workers }) {
  const { profileName, profile, profileApplied } = resolveLoadSettings({
    profile: args.profile,
    ...profileOverrides(args)
  });
  const runDir = outputDir || createRunDirectory({
    resultsRoot: paths.resultsRoot,
    scriptRelativePath: script.relativePath,
    timestamp: batchTimestamp
  });
  const jtlPath = path.join(runDir, 'results.jtl');
  const logPath = path.join(runDir, 'jmeter.log');
  const htmlReportDir = path.join(runDir, 'html-report');
  const baseName = path.basename(script.absolutePath, path.extname(script.absolutePath));
  const runtimeScriptPath = path.join(
    runDir,
    `${baseName}.framework-${batchTimestamp}-${index + 1}.runtime.jmx`
  );
  const properties = {
    'jmeter.laf': runConfig.jmeterLookAndFeel,
    ...buildJMeterProperties({
      profile,
      extraProperties: jmeterPropertyOverrides(args)
    })
  };
  const autoStart = booleanOption(args, 'auto-start', runConfig.guiAutoStart);
  const autoStartDelayMs = Number(args['auto-start-delay-ms'] || runConfig.guiAutoStartDelayMs);
  const autoClose = booleanOption(args, 'auto-close', runConfig.guiAutoClose);
  const waitForExit = booleanOption(args, 'wait-for-exit', runConfig.guiWaitForExit);
  const metadata = {
    generatedAt: new Date().toISOString(),
    framework: 'ALiS Performance Framework',
    executionMode: 'GUI',
    parallelWorkers: workers,
    scriptRelativePath: script.relativePath,
    scriptPath: script.absolutePath,
    profileName,
    profile,
    profileApplied,
    runDir,
    jtlPath,
    htmlReportDir
  };

  writeJson(path.join(runDir, 'run-metadata.json'), metadata);
  await createGuiRuntimeJmx({
    sourcePath: script.absolutePath,
    outputPath: runtimeScriptPath,
    profile: profileApplied ? profile : null,
    jtlPath
  });

  console.log(`Load settings [${script.relativePath}]: ${profileApplied ? `${profileName || 'command overrides'} ${JSON.stringify(profile)}` : 'JMX script settings'}`);
  console.log(`Results folder [${script.relativePath}]: ${runDir}`);
  try {
    await openJMeterGUI({
      jmeterHome: paths.jmeterHome,
      scriptPath: runtimeScriptPath,
      logPath,
      properties,
      autoStart,
      autoStartDelayMs,
      autoClose,
      waitForExit
    });
  } finally {
    await fs.rm(runtimeScriptPath, { force: true });
  }

  if (!waitForExit) {
    console.log(`GUI launched without waiting; reports will not be generated for ${script.relativePath}.`);
    return null;
  }

  if (runConfig.generateJMeterHtmlReport) {
    await generateJMeterHtmlDashboard({
      jmeterHome: paths.jmeterHome,
      jtlPath,
      htmlReportDir,
      logPath: path.join(runDir, 'jmeter-html-report.log')
    });
  }

  return createReportFromJtl({
    jtlPath,
    script,
    outputDir: runDir,
    profile: profileName,
    metadata
  });
}

function booleanOption(args, name, fallback) {
  return args[name] !== undefined ? String(args[name]).toLowerCase() !== 'false' : fallback;
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

function createGuiLaunchGate(staggerMs) {
  let nextLaunchAt = 0;
  return async () => {
    if (!staggerMs) return;
    const launchAt = Math.max(Date.now(), nextLaunchAt);
    nextLaunchAt = launchAt + staggerMs;
    const waitMs = launchAt - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  };
}

function printBatchSummary(results) {
  console.log('');
  console.log('GUI performance batch complete');
  console.log('==============================');

  for (const entry of results) {
    if (entry.status === 'FAILED') {
      console.log(`FAILED | ${entry.script} | ${entry.error.message}`);
      continue;
    }
    if (!entry.result) {
      console.log(`${entry.status} | ${entry.script}`);
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
