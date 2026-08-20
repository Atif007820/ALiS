import path from 'path';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import { paths } from '../../config/paths.js';
import { loadProfiles } from '../../config/loadProfiles.js';
import { reportConfig } from '../../config/reportConfig.js';
import { runConfig } from '../../config/runConfig.js';
import { resolveJmxScript } from '../utils/jmxDiscovery.js';
import { createRunDirectory, writeJson } from '../utils/fileUtils.js';
import { parseJtl } from '../parsers/jtlParser.js';
import { calculatePerformanceSummary } from '../parsers/statisticsCalculator.js';
import { runJMeterCLI } from './jmeterRunner.js';
import { writePerformanceSummary } from '../reports/summaryReportGenerator.js';
import { generateExcelReport } from '../reports/excelReportGenerator.js';
import { generatePlaywrightReport } from '../reports/playwrightReportGenerator.js';
import { openGeneratedReports } from '../utils/openArtifacts.js';
import { buildJMeterProperties, resolveLoadSettings } from '../utils/loadProfileResolver.js';
import { createRuntimeJmx } from '../utils/guiRuntimeJmx.js';

function metadataForRun({ script, profileName, profile, profileApplied, runDir, jtlPath, htmlReportDir }) {
  return {
    generatedAt: new Date().toISOString(),
    framework: 'ALiS Performance Framework',
    scriptRelativePath: script.relativePath,
    scriptPath: script.absolutePath,
    profileName,
    profile,
    profileApplied,
    runDir,
    jtlPath,
    htmlReportDir
  };
}

function firstRecordUrl(records) {
  return records.find((record) => record.url)?.url || reportConfig.applicationUrl;
}

export async function createReportFromJtl({
  jtlPath,
  script = 'external-results.jmx',
  outputDir,
  profile = null,
  metadata = {}
}) {
  if (!existsSync(jtlPath)) {
    throw new Error(`JTL file does not exist: ${jtlPath}`);
  }

  const activeProfile = profile ? loadProfiles[profile] || null : null;
  const records = parseJtl(jtlPath);
  if (runConfig.failOnEmptyResults && records.length === 0) {
    throw new Error(`JTL file has no result rows: ${jtlPath}`);
  }

  const summary = calculatePerformanceSummary(records);
  const scriptRelativePath = typeof script === 'string' ? script : script.relativePath;
  const finalMetadata = {
    generatedAt: new Date().toISOString(),
    scriptRelativePath,
    profileName: profile,
    profile: activeProfile,
    profileApplied: Boolean(profile),
    applicationUrl: firstRecordUrl(records),
    jtlPath,
    ...metadata
  };

  const artifacts = writePerformanceSummary(outputDir, {
    metadata: finalMetadata,
    summary,
    records
  });
  const excel = await generateExcelReport({
    records,
    summary,
    metadata: finalMetadata,
    outputDir
  });

  const jmeterHtmlCandidate = metadata.htmlReportDir ? path.join(metadata.htmlReportDir, 'index.html') : '';
  const jmeterHtmlPath = jmeterHtmlCandidate && existsSync(jmeterHtmlCandidate) ? jmeterHtmlCandidate : '';
  const playwrightReport = await generatePlaywrightReport({
    records,
    summary,
    metadata: finalMetadata,
    outputDir,
    artifacts: {
      ...artifacts,
      excelPath: excel.outputPath,
      jmeterHtmlPath
    }
  });
  await openGeneratedReports({
    excelPath: excel.outputPath,
    playwrightReportPath: playwrightReport.outputPath
  });

  return {
    records,
    summary,
    artifacts: {
      ...artifacts,
      excelPath: excel.outputPath,
      jmeterHtmlPath,
      playwrightReportPath: playwrightReport.outputPath
    },
    excelValidation: excel.validation,
    metadata: finalMetadata
  };
}

export async function runPerformanceScenario(options = {}) {
  const script = resolveJmxScript(options.script);
  const { profileName, profile, profileApplied } = resolveLoadSettings(options);
  const runDir = options.outputDir || createRunDirectory({
    resultsRoot: paths.resultsRoot,
    scriptRelativePath: script.relativePath
  });
  const jtlPath = path.join(runDir, 'results.jtl');
  const logPath = path.join(runDir, 'jmeter.log');
  const htmlReportDir = path.join(runDir, 'html-report');
  const metadata = metadataForRun({
    script,
    profileName,
    profile,
    profileApplied,
    runDir,
    jtlPath,
    htmlReportDir
  });

  writeJson(path.join(runDir, 'run-metadata.json'), metadata);

  if (!options.skipJMeter) {
    const runtimeScriptPath = profileApplied
      ? path.join(runDir, `${path.basename(script.absolutePath, path.extname(script.absolutePath))}.runtime.jmx`)
      : '';

    if (runtimeScriptPath) {
      await createRuntimeJmx({
        sourcePath: script.absolutePath,
        outputPath: runtimeScriptPath,
        profile
      });
    }

    try {
      await runJMeterCLI({
        jmeterHome: paths.jmeterHome,
        scriptPath: runtimeScriptPath || script.absolutePath,
        jtlPath,
        logPath,
        htmlReportDir,
        generateHtmlReport: runConfig.generateJMeterHtmlReport,
        properties: buildJMeterProperties({
          profile,
          extraProperties: options.properties || {}
        })
      });
    } finally {
      if (runtimeScriptPath) await fs.rm(runtimeScriptPath, { force: true });
    }
  }

  const result = await createReportFromJtl({
    jtlPath,
    script,
    outputDir: runDir,
    profile: profileName,
    metadata
  });

  return result;
}
