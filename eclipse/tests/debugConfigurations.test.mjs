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

test('only HMB and Conveyance have saved launchers and Run/Debug mode remains controlled by Eclipse', () => {
  const required = ['HMB', 'Conveyance'];
  for (const framework of required) assert.ok(configurations.some(c => c.name.includes(framework)), framework);
  assert.deepEqual(configurations.map(c => c.name).sort(), [
    'Conveyance - Apply.launch', 'Conveyance - E2E.launch', 'HMB - Apply.launch', 'HMB - E2E.launch',
  ]);
  for (const { name, document, attributes, parameters } of configurations) {
    assert.equal(document.documentElement.getAttribute('type'), 'org.eclipse.wildwebdeveloper.launchConfiguration.nodeDebug', name);
    assert.ok(!name.startsWith('Debug - '), name);
    assert.equal(parameters.noDebug, undefined, name);
    assert.ok(fs.statSync(resolve(attributes.program)).isFile(), name);
    assert.ok(fs.statSync(resolve(attributes['org.eclipse.debug.core.ATTR_WORKING_DIRECTORY'])).isDirectory(), name);
    assert.ok(fs.statSync(resolve(parameters.runtimeExecutable)).isFile(), name);
    assert.equal(parameters.autoAttachChildProcesses, true, name);
    assert.equal(parameters.stopOnEntry, false, name);
    assert.equal(parameters.sourceMaps, true, name);
    assert.ok(parameters.skipFiles.includes('**/node_modules/**'), name);
    assert.ok(Array.isArray(parameters.args), name);
    assert.equal(parameters.args.length, 2, `${name}: temporary validation flags must not remain`);
  }
});

test('Run mode resolves to normal npm commands without debugging overrides', () => {
  const scripts = {
    'HMB - E2E.launch': 'hmb',
    'HMB - Apply.launch': 'hmb:apply',
    'Conveyance - E2E.launch': 'test',
    'Conveyance - Apply.launch': 'test:apply',
  };
  for (const { name, attributes, parameters } of configurations) {
    const cwd = resolve(attributes['org.eclipse.debug.core.ATTR_WORKING_DIRECTORY']);
    const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const script = manifest.scripts[scripts[name]];
    assert.ok(script, name);
    const selection = Object.fromEntries(parameters.args.map(arg => arg.slice(2).split('=')));
    const plan = createLaunchPlan(selection.framework, selection.flow, { ALIS_ECLIPSE_MODE: 'run' });
    const command = plan.program.endsWith(path.join('@playwright', 'test', 'cli.js'))
      ? 'playwright'
      : `node ${path.relative(cwd, plan.program).replaceAll(path.sep, '/')}`;
    const actual = [command, ...plan.args].join(' ');
    const normalizedScript = script.replace(/^node \.\//, 'node ');
    assert.ok(actual.startsWith(normalizedScript.split(' -- ')[0]), name);
    assert.ok(actual.includes('--project=chromium'), name);
    assert.ok(actual.includes('--workers=1'), name);
    if (name.startsWith('Conveyance - ')) assert.ok(actual.includes('--parallel=1'), name);
    if (name.endsWith('Apply.launch')) assert.ok(actual.includes('02_LoginApply.spec.js'), name);
    assert.deepEqual(Object.keys(parameters.env), ['Path'], name);
  }
});

test('all four flows are available in both Run and Debug favorites', () => {
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

test('standalone flows target their own specs rather than the complete end-to-end flow', () => {
  const expected = {
    'HMB - Apply.launch': 'tests/02_LoginApply.spec.js',
    'Conveyance - Apply.launch': 'testScripts/02_LoginApply.spec.js',
  };
  for (const [name, spec] of Object.entries(expected)) {
    const configuration = configurations.find(c => c.name === name);
    const selection = Object.fromEntries(configuration.parameters.args.map(arg => arg.slice(2).split('=')));
    assert.ok(createLaunchPlan(selection.framework, selection.flow, {}).args.includes(spec), name);
  }
});

test('Debug mode is headed, serial and opens a managed report without changing Run defaults', () => {
  for (const framework of ['HMB', 'Conveyance']) {
    for (const flow of ['E2E', 'Apply']) {
      const environment = { ALIS_ECLIPSE_MODE: 'debug', HEADLESS: 'true' };
      const debug = createLaunchPlan(framework, flow, environment);
      assert.ok(debug.args.includes('--headed'));
      assert.ok(debug.args.includes('--workers=1'));
      assert.ok(debug.args.includes('--project=chromium'));
      assert.ok(debug.args.includes('--timeout=0'));
      assert.equal(debug.env.HEADLESS, 'false');
      assert.equal(debug.env.PLAYWRIGHT_HTML_OPEN, 'never');
      assert.equal(debug.env.ALIS_ECLIPSE_MANAGED_REPORT, '1');
      assert.equal(environment.HEADLESS, 'true');
      assert.equal(createLaunchPlan(framework, flow, {}).debug, false);
    }
  }
});

test('every Eclipse Run and Debug launch is restricted to one Chrome worker', () => {
  for (const framework of ['HMB', 'Conveyance']) {
    for (const flow of ['E2E', 'Apply']) {
      for (const mode of ['run', 'debug']) {
        const plan = createLaunchPlan(framework, flow, { ALIS_ECLIPSE_MODE: mode });
        assert.equal(plan.args.filter(arg => arg.startsWith('--project=')).length, 1, `${framework} ${flow} ${mode}`);
        assert.equal(plan.args.filter(arg => arg.startsWith('--workers=')).length, 1, `${framework} ${flow} ${mode}`);
        assert.ok(plan.args.includes('--project=chromium'), `${framework} ${flow} ${mode}`);
        assert.ok(plan.args.includes('--workers=1'), `${framework} ${flow} ${mode}`);
        if (framework === 'Conveyance') assert.ok(plan.args.includes('--parallel=1'), `${framework} ${flow} ${mode}`);
      }
    }
  }
});

test('Eclipse mode argument controls headed behavior explicitly for Conveyance', () => {
  const launcher = path.join(root, 'eclipse', 'runtime', 'runFramework.mjs');
  for (const mode of ['run', 'debug']) {
    const result = spawnSync(process.execPath, [launcher, '--framework=Conveyance', '--flow=E2E',
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
    assert.equal(plan.args.includes('--headed'), mode === 'debug');
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

test('completed debug reports open separately; normal, cancelled and stale runs do not open', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alis-report-check-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const index = path.join(directory, 'index.html');
  fs.writeFileSync(index, '<html><body>Local report verification</body></html>');
  const plan = { ...createLaunchPlan('HMB', 'E2E', { ALIS_ECLIPSE_MODE: 'debug' }), reportDir: directory };
  const report = createReportPlan(plan, 0);
  assert.ok(report.args.includes('show-report'));
  assert.equal(report.options.detached, true);
  assert.equal(report.options.env.PLAYWRIGHT_HTML_OPEN, 'always');
  assert.equal(report.options.env.NODE_OPTIONS, undefined);
  assert.equal(createReportPlan({ ...plan, debug: false }, 0), null);
  assert.equal(createReportPlan(plan, 0, 'SIGTERM'), null);
  assert.equal(createReportPlan(plan, Date.now() + 10000), null);
  fs.unlinkSync(index);
  assert.equal(createReportPlan(plan, 0), null);
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
