import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const adapterPath = process.argv[2];
assert.ok(adapterPath && fs.existsSync(adapterPath), 'Provide the installed Eclipse js-debug/src/dapDebugServer.js path.');
const root = fileURLToPath(new URL('../../', import.meta.url));
const workerCheck = process.argv.includes('--playwright-worker');
const runOnly = process.argv.includes('--run');
const viaLauncher = process.argv.includes('--via-launcher');
const savedLaunch = process.argv.find(arg => arg.startsWith('--saved-launch='))?.slice('--saved-launch='.length);
const savedScripts = {
  'HMB - E2E': 'hmb',
  'HMB - Apply': 'hmb:apply',
  'HMB - Register': 'hmb:register',
  'Conveyance - E2E': 'conv',
  'Conveyance - Apply': 'test:apply',
  'Conveyance - Register': 'test:register',
};
const specs = ['01_RegisterUser.spec.js', '02_LoginApply.spec.js', '03_ApproveApplication.spec.js'];
assert.ok(savedLaunch === undefined || Object.hasOwn(savedScripts, savedLaunch), 'Choose one of the six saved launch names.');
assert.ok(savedLaunch === undefined || (!workerCheck && !viaLauncher), '--saved-launch is separate from the local worker check.');
assert.ok(!viaLauncher || workerCheck, '--via-launcher requires --playwright-worker.');
const fixture = path.join(root, 'eclipse', 'debug', workerCheck ? 'workerCheck.spec.js' : 'breakpointCheck.mjs');
const expectedRoles = savedLaunch ? [] : workerCheck ? ['worker'] : ['child', 'parent'];
const temporaryOutput = workerCheck ? fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-debug-check-')) : null;
const temporaryPackage = viaLauncher ? fs.mkdtempSync(path.join(root, 'eclipse', 'debug', '.npm worker check-')) : null;
const launchPath = path.join(root, 'eclipse', 'launches', `${savedLaunch ?? 'HMB - E2E'}.launch`);
const xml = new DOMParser().parseFromString(fs.readFileSync(launchPath, 'utf8'), 'application/xml');
const attributes = Object.fromEntries(Array.from({ length: xml.getElementsByTagName('stringAttribute').length }, (_, i) => {
  const node = xml.getElementsByTagName('stringAttribute').item(i);
  return [node.getAttribute('key'), node.getAttribute('value')];
}));
const parameters = JSON.parse(attributes['org.eclipse.lsp4e.debug.model.ATTR_DSP_PARAM']);
const launcher = path.resolve(resolveVariables(attributes.program));
const cwd = path.resolve(resolveVariables(attributes['org.eclipse.debug.core.ATTR_WORKING_DIRECTORY']));
const playwrightCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const program = savedLaunch || viaLauncher ? launcher : workerCheck ? playwrightCli : fixture;
const expectEntry = !runOnly && (!workerCheck || viaLauncher);
if (expectEntry) assert.equal(parameters.stopOnEntry, true, `${launchPath} must enable Debug startup suspension.`);
const checkLine = fs.readFileSync(fixture, 'utf8').split('\n').findIndex(line => line.trim().endsWith('// Source breakpoint.')) + 1;
assert.ok(checkLine > 0, `Source breakpoint line missing from ${fixture}.`);
const sessions = new Set();
const roles = new Set();
let entryVerified = false;
let stepVerified = false;
let adapterOutput = '';
let applicationOutput = '';
let finished = false;
let doneResolve;
let doneReject;
const done = new Promise((resolve, reject) => { doneResolve = resolve; doneReject = reject; });
const fail = error => { if (!finished) { finished = true; doneReject(error); } };
const adapter = spawn(process.execPath, [path.resolve(adapterPath), '0', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DA_TEST_DISABLE_TELEMETRY: 'true' },
});
const timer = setTimeout(() => fail(new Error(`Debug adapter verification timed out.\n${applicationOutput.slice(-1500)}\n${adapterOutput.slice(-1500)}`)), 55000);
adapter.once('error', fail);

class Client {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 1;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
    this.buffer = Buffer.alloc(0);
    this.stepPending = false;
    socket.on('data', data => this.consume(data));
    socket.on('error', fail);
  }
  send(message) {
    const json = JSON.stringify({ seq: this.sequence++, ...message });
    this.socket.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }
  request(command, args = {}) {
    const sequence = this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(sequence, { resolve, reject });
      this.send({ type: 'request', command, arguments: args });
    });
  }
  wait(event) {
    const index = this.events.findIndex(message => message.event === event);
    if (index !== -1) return Promise.resolve(this.events.splice(index, 1)[0]);
    return new Promise(resolve => this.waiters.push({ event, resolve }));
  }
  consume(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const divider = this.buffer.indexOf('\r\n\r\n');
      if (divider === -1) return;
      const length = Number(/Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0, divider).toString())?.[1]);
      if (!Number.isFinite(length)) return fail(new Error('Invalid DAP message header.'));
      if (this.buffer.length < divider + 4 + length) return;
      const message = JSON.parse(this.buffer.subarray(divider + 4, divider + 4 + length).toString());
      this.buffer = this.buffer.subarray(divider + 4 + length);
      this.handle(message);
    }
  }
  handle(message) {
    if (message.type === 'response') {
      const pending = this.pending.get(message.request_seq);
      this.pending.delete(message.request_seq);
      if (message.success) pending?.resolve(message.body);
      else pending?.reject(new Error(`${message.command}: ${message.message ?? JSON.stringify(message.body)}`));
    } else if (message.type === 'request') {
      if (message.command === 'startDebugging') {
        setupSession(message.arguments.request, message.arguments.configuration)
          .then(() => this.send({ type: 'response', request_seq: message.seq, command: message.command, success: true }))
          .catch(fail);
      } else {
        this.send({ type: 'response', request_seq: message.seq, command: message.command, success: false, message: 'Unsupported verification request.' });
      }
    } else if (message.type === 'event') {
      const waiter = this.waiters.findIndex(w => w.event === message.event);
      if (waiter !== -1) this.waiters.splice(waiter, 1)[0].resolve(message);
      else this.events.push(message);
      if (message.event === 'output') applicationOutput += message.body.output;
      if (message.event === 'stopped') {
        if (runOnly) fail(new Error('Run mode unexpectedly paused at a breakpoint.'));
        else inspectStop(this, message.body).catch(fail);
      }
      if (message.event === 'terminated' && !this.isRoot) {
        this.request('disconnect').catch(() => {}).finally(() => this.socket.destroy());
      }
      if (message.event === 'terminated' && this.isRoot && !finished) {
        try {
          verifyCompletion();
          finished = true;
          doneResolve();
        } catch (error) {
          fail(error);
        }
      }
    }
  }
}

let adapterPort;
async function setupSession(command, configuration) {
  const socket = net.createConnection({ host: '127.0.0.1', port: adapterPort });
  const client = new Client(socket);
  client.isRoot = sessions.size === 0;
  sessions.add(client);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  await client.request('initialize', {
    adapterID: 'pwa-node', clientID: 'eclipse-verification', pathFormat: 'path',
    linesStartAt1: true, columnsStartAt1: true,
    supportsStartDebuggingRequest: true, supportsVariableType: true,
  });
  const initialized = client.wait('initialized');
  const launching = client.request(command, configuration);
  launching.catch(fail);
  await initialized;
  if (!savedLaunch) {
    await client.request('setBreakpoints', { source: { path: fixture }, breakpoints: [{ line: checkLine }] });
  }
  await client.request('configurationDone');
  await launching;
  return client;
}

async function inspectStop(client, stopped) {
  const stack = await client.request('stackTrace', { threadId: stopped.threadId, levels: 1 });
  const frame = stack.stackFrames[0];
  console.log(`Stopped: ${stopped.reason}, ${frame.name}:${frame.line}, source=${frame.source?.path}`);
  if (stopped.reason === 'entry' && frame.source?.path && sameSource(frame.source.path, program)) {
    // js-debug can report the program entry stop in a separate target session.
    // The parent/child fixture runs the same source in both processes.
    const child = program === fixture && (await client.request('evaluate', {
      expression: 'process.argv.includes("--child")', frameId: frame.id,
    })).result === 'true';
    if (!child) {
      assert.ok(expectEntry, 'The debugger suspended at an unexpected startup stop.');
      assert.equal(entryVerified, false, 'The root launch paused at entry more than once.');
      entryVerified = true;
      console.log('Verified root startup pause and resuming the launch.');
    }
  } else if (client.stepPending) {
    assert.equal(stopped.reason, 'step');
    assert.ok(frame.source?.path && sameSource(frame.source.path, fixture) && frame.line > checkLine);
    client.stepPending = false;
    stepVerified = true;
    console.log('Verified step-over in the paused application code.');
  } else if (!savedLaunch && frame.source?.path && sameSource(frame.source.path, fixture) && frame.line === checkLine) {
    assert.equal(stopped.reason, 'breakpoint');
    const role = await client.request('evaluate', { expression: 'inspection.role', frameId: frame.id, context: 'watch' });
    const answer = await client.request('evaluate', { expression: 'inspection.answer', frameId: frame.id, context: 'watch' });
    assert.equal(answer.result, '42');
    const value = role.result.replace(/^['"]|['"]$/g, '');
    assert.ok(expectedRoles.includes(value), role.result);
    const scopes = await client.request('scopes', { frameId: frame.id });
    const locals = await client.request('variables', { variablesReference: scopes.scopes[0].variablesReference });
    assert.ok(locals.variables.some(variable => variable.name === 'inspection'));
    roles.add(value);
    console.log(`Verified ${value} breakpoint, local variables and expression evaluation.`);
    if (['parent', 'worker'].includes(value) && !stepVerified) {
      client.stepPending = true;
      await client.request('next', { threadId: stopped.threadId });
      return;
    }
  }
  await client.request('continue', { threadId: stopped.threadId });
}

function sameSource(source, target) {
  const normalize = value => {
    const resolved = path.resolve(value.startsWith('file:') ? fileURLToPath(value) : value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(source) === normalize(target);
}

function resolveVariables(value) {
  return value.replaceAll('${workspace_loc:/Playwright}', root).replace(/\$\{env_var:([^}]+)\}/g, (_, name) => {
    const key = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase());
    assert.ok(key, `Missing launch environment variable ${name}.`);
    return process.env[key];
  });
}

function verifyCompletion() {
  assert.equal(entryVerified, expectEntry, 'The launch did not suspend at its entry point.');
  if (savedLaunch) {
    const expectedScript = savedScripts[savedLaunch];
    const expectedMode = runOnly ? 'Run' : 'Debug';
    assert.ok(applicationOutput.includes(`Eclipse ${expectedMode}: ${savedLaunch} (npm run ${expectedScript})`), applicationOutput);
    const listed = new Set([...applicationOutput.matchAll(/^\s*\[chromium\]\s+›\s+([^\r\n]+?\.spec\.js):\d+:\d+\s+›/gm)]
      .map(match => path.basename(match[1])));
    const expected = savedLaunch.endsWith(' - Register') ? [specs[0]]
      : savedLaunch.endsWith(' - Apply') ? [specs[1]] : specs;
    assert.deepEqual([...listed].sort(), [...expected].sort(), applicationOutput);
    return;
  }

  const marker = workerCheck ? '1 passed' : 'Breakpoint check complete.';
  assert.ok(applicationOutput.includes(marker), `The local fixture did not complete:\n${applicationOutput}`);
  assert.deepEqual([...roles].sort(), runOnly ? [] : expectedRoles);
  assert.equal(stepVerified, !runOnly, 'The debugger did not step over the source breakpoint.');
}

try {
  if (temporaryPackage) {
    fs.writeFileSync(path.join(temporaryPackage, 'package.json'), JSON.stringify({
      private: true,
      scripts: { check: 'playwright test' },
    }));
  }
  const ready = new Promise((resolve, reject) => {
    adapter.once('exit', code => { if (!adapterPort) reject(new Error(`Adapter exited ${code}: ${adapterOutput}`)); });
    adapter.stdout.on('data', data => {
      adapterOutput += data.toString();
      const match = /Debug (?:server|adapter) listening at .*:(\d+)/.exec(adapterOutput);
      if (match && !adapterPort) { adapterPort = Number(match[1]); resolve(); }
    });
    adapter.stderr.on('data', data => { adapterOutput += data.toString(); });
  });
  await Promise.race([ready, done]);
  const playwrightConfig = path.join(root, 'eclipse', 'debug', 'playwright.config.js');
  const modeArgument = `--eclipse-mode=${runOnly ? 'run' : 'debug'}`;
  const args = savedLaunch ? [...parameters.args, '--arg=--list', modeArgument] : viaLauncher ? [
    `--package=${path.relative(root, temporaryPackage)}`, '--script=check',
    `--arg=--config=${playwrightConfig}`, `--arg=--output=${temporaryOutput}`,
    modeArgument,
  ] : workerCheck ? ['test', '--config', playwrightConfig, '--output', temporaryOutput] : [];
  const run = setupSession('launch', {
    ...parameters, runtimeExecutable: resolveVariables(parameters.runtimeExecutable),
    env: Object.fromEntries(Object.entries(parameters.env).map(([key, value]) => [key, resolveVariables(value)])),
    args,
    stopOnEntry: expectEntry,
    type: 'pwa-node', request: 'launch', name: 'Eclipse breakpoint verification',
    program,
    cwd, outputCapture: 'std', noDebug: runOnly,
  });
  run.catch(fail);
  await done;
  if (savedLaunch) {
    console.log(`PASS: ${savedLaunch} ${runOnly ? 'Run' : 'Debug'} discovered the expected specs in list mode.`);
  } else if (runOnly) {
    console.log('PASS: Run mode completed without pausing at configured source breakpoints.');
  } else {
    console.log(`PASS: the installed Eclipse debug adapter supports ${workerCheck ? 'Playwright worker' : 'parent/child'} breakpoints, local variables and stepping.`);
  }
} finally {
  clearTimeout(timer);
  for (const client of sessions) {
    await Promise.race([
      client.request('disconnect', { terminateDebuggee: true }).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
    client.socket.destroy();
  }
  adapter.kill();
  if (temporaryOutput) fs.rmSync(temporaryOutput, { recursive: true, force: true });
  if (temporaryPackage) {
    fs.rmSync(path.join(temporaryPackage, 'package.json'), { force: true });
    fs.rmdirSync(temporaryPackage);
  }
}
