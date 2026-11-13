import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { createLaunchPlan, createReportPlan, reportEnvironment } from '../runtime/launchPlan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const launchDir = path.join(root, 'eclipse', 'launches');
const launcher = path.join(root, 'eclipse', 'runtime', 'runFramework.mjs');
const savedScripts = {
  'HMB - E2E.launch': 'hmb',
  'HMB - Apply.launch': 'hmb:apply',
  'HMB - Register.launch': 'hmb:register',
  'Conveyance - E2E.launch': 'conv',
  'Conveyance - Apply.launch': 'test:apply',
  'Conveyance - Register.launch': 'test:register',
};
const configurations = fs.readdirSync(launchDir)
  .filter(name => name.endsWith('.launch'))
  .map(name => {
    const errors = [];
    const document = new DOMParser({ errorHandler: { warning() {}, error: e => errors.push(e), fatalError: e => errors.push(e) } })
      .parseFromString(fs.readFileSync(path.join(launchDir, name), 'utf8'), 'application/xml');
    assert.deepEqual(errors, [], name);
    const attributes = Object.fromEntries([...Array(document.getElementsByTagName('stringAttribute').length).keys()]
      .map(i => document.getElementsByTagName('stringAttribute').item(i))
      .map(node => [node.getAttribute('key'), node.getAttribute('value')]));
    return { name, document, attributes, parameters: JSON.parse(attributes['org.eclipse.lsp4e.debug.model.ATTR_DSP_PARAM']) };
  });

function resolve(value) {
  return value.replace(/\$\{workspace_loc:\/Playwright([^}]*)\}/g, (_, suffix) => path.join(root, suffix))
    .replace(/\$\{env_var:([^}]+)\}/g, (_, key) => {
      const actualKey = Object.keys(process.env).find(k => k.toLowerCase() === key.toLowerCase());
      assert.ok(actualKey, `Missing environment variable ${key}`);
      return process.env[actualKey];
    })
    .replace(/\$\{string_prompt:[^}]+\}/g, 'LNI/Inspection Search.jmx;LNI_Test.jmx');
}

test('saved launchers use the shared entry point in both Eclipse modes', () => {
  for (const name of Object.keys(savedScripts)) {
    assert.ok(configurations.some(config => config.name === name), name);
  }
  for (const { name, document, attributes, parameters } of configurations) {
    assert.equal(document.documentElement.getAttribute('type'), 'org.eclipse.wildwebdeveloper.launchConfiguration.nodeDebug', name);
    assert.equal(parameters.noDebug, undefined, name);
    assert.equal(path.resolve(resolve(attributes.program)), launcher, name);
    assert.equal(path.resolve(resolve(attributes['org.eclipse.debug.core.ATTR_WORKING_DIRECTORY'])), path.resolve(root), name);
    assert.ok(fs.statSync(resolve(parameters.runtimeExecutable)).isFile(), name);
    assert.equal(parameters.autoAttachChildProcesses, true, name);
    assert.equal(parameters.stopOnEntry, true, name);
    assert.equal(parameters.sourceMaps, true, name);
    assert.ok(parameters.skipFiles.includes('**/node_modules/**'), name);
    assert.ok(Array.isArray(parameters.args), name);
    assert.ok(!parameters.args.some(arg => /^--(?:validate|eclipse-mode)=/.test(arg)), name);
  }
});

test('saved flows invoke the current npm script without Eclipse spec paths', () => {
  for (const { name, parameters } of configurations.filter(config => Object.hasOwn(savedScripts, config.name))) {
    const selection = Object.fromEntries(parameters.args.map(arg => arg.slice(2).split('=')));
    for (const mode of ['run', 'debug']) {
      const plan = createLaunchPlan(selection, { ALIS_ECLIPSE_MODE: mode });
      const manifest = JSON.parse(fs.readFileSync(path.join(plan.cwd, 'package.json'), 'utf8'));
      assert.ok(manifest.scripts[savedScripts[name]], name);
      assert.equal(path.basename(plan.program), 'npm-cli.js', name);
      assert.deepEqual(plan.args.slice(0, 3), ['run', savedScripts[name], '--'], name);
      assert.ok(plan.args.includes('--project=chromium'), name);
      assert.ok(!plan.args.some(arg => arg.endsWith('.spec.js')), name);
      assert.ok(!plan.args.includes('--workers=1'), name);
      if (name.startsWith('Conveyance - ')) assert.ok(plan.args.includes('--parallel=1'), name);
    }
  }
});

test('all six flow launchers are available in both Run and Debug favorites', () => {
  for (const { name, document } of configurations) {
    const entries = Array.from({ length: document.getElementsByTagName('listEntry').length }, (_, index) =>
      document.getElementsByTagName('listEntry').item(index).getAttribute('value'));
    assert.ok(entries.includes('org.eclipse.debug.ui.launchGroup.run'), name);
    assert.ok(entries.includes('org.eclipse.debug.ui.launchGroup.debug'), name);
  }
});

test('configurations are project-relative and contain no credentials', () => {
  for (const { name, attributes, parameters } of configurations) {
    assert.ok(attributes.program.startsWith('${workspace_loc:/Playwright}/'), name);
    assert.ok(!/\$\{workspace_loc:[^}]*node_modules/.test(attributes.program), name);
    assert.ok(!Object.keys(parameters.env).some(key => /password|username|token|secret/i.test(key)), name);
  }
});

test('only real framework Node.js configurations remain in the shared launch folder', () => {
  const files = fs.readdirSync(launchDir).filter(name => name.endsWith('.launch'));
  assert.deepEqual(files.sort(), configurations.map(c => c.name).sort());
  assert.ok(files.every(name => !/Installation|Self Check/.test(name)));
});

test('a new package-script launch can supply its own arguments without adding a launcher mapping', () => {
  const selection = {
    packageDir: 'tests/HMB',
    script: 'hmb:approve',
    scriptArgs: ['--list', '--project=chromium'],
    debugArgs: ['--headed'],
  };
  const run = createLaunchPlan(selection, {});
  const debug = createLaunchPlan(selection, { ALIS_ECLIPSE_MODE: 'debug' });
  assert.deepEqual(run.args, ['run', 'hmb:approve', '--', '--list', '--project=chromium']);
  assert.deepEqual(debug.args, [...run.args, '--headed']);
  assert.equal(debug.env.HEADLESS, 'false');
  assert.equal(run.openReportAfterCompletion, false);
  assert.equal(run.env.ALIS_ECLIPSE_MANAGED_REPORT, undefined);
  assert.throws(() => createLaunchPlan({ ...selection, script: 'missing' }), /npm script "missing" is missing/);
});

test('Run and Debug use one managed report opener while Debug keeps headed settings', () => {
  for (const framework of ['HMB', 'Conveyance']) {
    for (const flow of ['E2E', 'Apply', 'Register']) {
      const run = createLaunchPlan({ framework, flow }, { ALIS_ECLIPSE_MODE: 'run', HEADLESS: 'true' });
      assert.equal(run.openReportAfterCompletion, true);
      assert.equal(run.env.HEADLESS, 'true');
      assert.equal(run.env.PLAYWRIGHT_HTML_OPEN, 'never');
      assert.equal(run.env.ALIS_ECLIPSE_MANAGED_REPORT, '1');

      const environment = { ALIS_ECLIPSE_MODE: 'debug', HEADLESS: 'true' };
      const debug = createLaunchPlan({ framework, flow }, environment);
      assert.equal(debug.openReportAfterCompletion, true);
      assert.ok(debug.args.includes('--headed'));
      assert.ok(debug.args.includes('--project=chromium'));
      assert.ok(debug.args.includes('--timeout=0'));
      assert.equal(debug.env.HEADLESS, 'false');
      assert.equal(debug.env.PLAYWRIGHT_HTML_OPEN, 'never');
      assert.equal(debug.env.ALIS_ECLIPSE_MANAGED_REPORT, '1');
      assert.equal(environment.HEADLESS, 'true');
      assert.equal(createLaunchPlan({ framework, flow }, {}).debug, false);
    }
  }
});



test('Eclipse mode argument controls headed behavior explicitly for all saved launchers', () => {

  for (const configuration of configurations.filter(config => Object.hasOwn(savedScripts, config.name))) {
    for (const mode of ['run', 'debug']) {
      const result = spawnSync(process.execPath, [launcher, ...configuration.parameters.args,
        `--eclipse-mode=${mode}`, '--validate=true'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, HEADLESS: 'true' },
        timeout: 10000,
        windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr);
      const outputStart = result.stdout.lastIndexOf('\n{');
      const plan = JSON.parse(result.stdout.slice(outputStart + 1));
      assert.equal(plan.mode, mode);
      assert.equal(plan.headed, mode === 'debug');
      assert.equal(plan.openCompletedReport, true);
      assert.equal(plan.args.includes('--headed'), mode === 'debug');
    }
  }
});

test('Eclipse Run and Debug discover HMB Register, Apply and Approve in the intended flows', () => {
  const expected = {
    'HMB - Register.launch': ['HMB - Register New User'],
    'HMB - Apply.launch': ['HMB - Login and Apply Permit'],
    'HMB - E2E.launch': ['HMB - Register New User', 'HMB - Login and Apply Permit', 'HMB - Approve Application'],
  };
  for (const { name, parameters } of configurations.filter(config => Object.hasOwn(expected, config.name))) {
    for (const mode of ['run', 'debug']) {
      const result = spawnSync(process.execPath, [launcher, ...parameters.args, '--eclipse-mode=' + mode, '--arg=--list'], {
        cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true,
      });
      const message = name + ' (' + mode + ')\n' + result.stderr + '\n' + result.stdout;
      assert.equal(result.status, 0, message);
      const discovered = result.stdout.split(/\r?\n/)
        .filter(line => /\.spec\.js:\d+:\d+\s+›\s+HMB - /.test(line))
        .map(line => line.split(' › ').at(-1).trim());
      assert.deepEqual(discovered, expected[name], message);
    }
  }
});

test('detached report server does not inherit debugger attachment', () => {
  const input = { NODE_OPTIONS: '--require debug-bootloader.js', VSCODE_INSPECTOR_OPTIONS: '{}',
    ALIS_ECLIPSE_MODE: 'debug', ALIS_ECLIPSE_MANAGED_REPORT: '1', Path: process.env.Path };
  const report = reportEnvironment(input);
  assert.equal(report.NODE_OPTIONS, undefined);
  assert.equal(report.VSCODE_INSPECTOR_OPTIONS, undefined);
  assert.equal(report.ALIS_ECLIPSE_MODE, undefined);
  assert.equal(report.PLAYWRIGHT_HTML_OPEN, 'always');
  assert.equal(report.Path, input.Path);
  assert.ok(input.NODE_OPTIONS);
});

test('removed demo flag is rejected before any application test can start', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'eclipse/runtime/runFramework.mjs'),
    '--framework=HMB', '--flow=Apply', '--demo=true'], {
    cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported launcher option: --demo/);
  assert.ok(!result.stdout.includes('Eclipse Run:'));
});

test('all configurations explicitly use the mode-aware Eclipse delegate', () => {
  for (const { name, document } of configurations) {
    const entries = Array.from({ length: document.getElementsByTagName('mapEntry').length }, (_, index) =>
      document.getElementsByTagName('mapEntry').item(index));
    for (const mode of ['[run]', '[debug]']) {
      assert.ok(entries.some(entry => entry.getAttribute('key') === mode &&
        entry.getAttribute('value') === 'com.alis.eclipse.frameworkDelegate'), name);
    }
  }
});

test('completed Run and Debug reports open separately; cancelled and stale reports do not', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alis-report-check-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const index = path.join(directory, 'index.html');
  fs.writeFileSync(index, '<html><body>Local report verification</body></html>');
  for (const mode of ['run', 'debug']) {
    const plan = { ...createLaunchPlan({ framework: 'HMB', flow: 'E2E' }, { ALIS_ECLIPSE_MODE: mode }), reportDir: directory };
    const report = createReportPlan(plan, 0);
    assert.deepEqual(report.args, [plan.program, 'run', 'report'], mode);
    assert.equal(report.options.detached, true, mode);
    assert.equal(report.options.env.PLAYWRIGHT_HTML_OPEN, 'always', mode);
    assert.equal(report.options.env.NODE_OPTIONS, undefined, mode);
    assert.equal(createReportPlan(plan, 0, 'SIGTERM'), null, mode);
    assert.equal(createReportPlan(plan, Date.now() + 10000), null, mode);
  }
  const disabledPlan = { ...createLaunchPlan({ framework: 'HMB', flow: 'E2E' }, { ALIS_ECLIPSE_MODE: 'run' }),
    openReportAfterCompletion: false, reportDir: directory };
  assert.equal(createReportPlan(disabledPlan, 0), null);
  fs.unlinkSync(index);
  const missingReportPlan = { ...createLaunchPlan({ framework: 'HMB', flow: 'E2E' }, { ALIS_ECLIPSE_MODE: 'run' }), reportDir: directory };
  assert.equal(createReportPlan(missingReportPlan, 0), null);
});

test('documented terminal commands resolve to existing framework npm scripts', () => {
  const guide = fs.readFileSync(path.join(root, 'eclipse', 'Commands.txt'), 'utf8');
  const commands = guide.split(/\r?\n/).filter(line => line.startsWith('npm.cmd --prefix '));
  const frameworks = new Set();
  for (const command of commands) {
    const match = /^npm\.cmd --prefix (\S+) (?:run (\S+)|(test))(?:\s|$)/.exec(command);
    assert.ok(match, command);
    const [, directory, script, defaultScript] = match;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
    assert.ok(manifest.scripts[script ?? defaultScript], command);
    frameworks.add(directory);
  }
  assert.equal(frameworks.size, 8);
});
