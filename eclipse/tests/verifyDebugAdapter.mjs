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
const fixture = path.join(root, 'eclipse', 'debug', workerCheck ? 'workerCheck.spec.js' : 'breakpointCheck.mjs');
const expectedRoles = workerCheck ? ['worker'] : ['child', 'parent'];
const temporaryOutput = workerCheck ? fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-debug-check-')) : null;
const xml = new DOMParser().parseFromString(fs.readFileSync(path.join(root, 'eclipse', 'launches', 'HMB - E2E.launch'), 'utf8'), 'application/xml');
const parameterNode = Array.from({ length: xml.getElementsByTagName('stringAttribute').length }, (_, i) => xml.getElementsByTagName('stringAttribute').item(i))
  .find(node => node.getAttribute('key') === 'org.eclipse.lsp4e.debug.model.ATTR_DSP_PARAM');
const parameters = JSON.parse(parameterNode.getAttribute('value'));
const checkLine = fs.readFileSync(fixture, 'utf8').split('\n').findIndex(line => line.trim() === 'debugger;') + 1;
const sessions = new Set();
const roles = new Set();
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
const timer = setTimeout(() => fail(new Error(`Debug adapter verification timed out. ${adapterOutput.slice(-1500)}`)), 45000);
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
      if (message.event === 'terminated' && runOnly && this.isRoot && !finished) {
        const marker = workerCheck ? '1 passed' : 'Breakpoint check complete.';
        if (!applicationOutput.includes(marker)) fail(new Error(`Run mode did not complete its local fixture: ${applicationOutput}`));
        else { finished = true; doneResolve(); }
      }
      if (message.event === 'terminated' && roles.size === expectedRoles.length && stepVerified && !finished) {
        finished = true;
        doneResolve();
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
  await client.request('setBreakpoints', { source: { path: fixture }, breakpoints: [{ line: checkLine }] });
  await client.request('configurationDone');
  await launching;
  return client;
}

async function inspectStop(client, stopped) {
  const stack = await client.request('stackTrace', { threadId: stopped.threadId, levels: 1 });
  const frame = stack.stackFrames[0];
  console.log(`Stopped: ${stopped.reason}, ${frame.name}:${frame.line}, source=${frame.source?.path}`);
  if (client.stepPending) {
    client.stepPending = false;
    stepVerified = true;
    console.log('Verified step-over in the paused application code.');
  } else if (frame.source?.path && sameSource(frame.source.path, fixture) && frame.line >= checkLine) {
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

try {
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
  const run = setupSession('launch', {
    ...parameters, runtimeExecutable: process.execPath, env: {},
    args: workerCheck ? ['test', '--config', path.join(root, 'eclipse', 'debug', 'playwright.config.js'), '--output', temporaryOutput] : [],
    stopOnEntry: false,
    type: 'pwa-node', request: 'launch', name: 'Eclipse breakpoint verification',
    program: workerCheck ? path.join(root, 'node_modules', '@playwright', 'test', 'cli.js') : fixture,
    cwd: root, outputCapture: 'std', noDebug: runOnly,
  });
  run.catch(fail);
  await done;
  if (runOnly) {
    assert.equal(roles.size, 0);
    console.log('PASS: Run mode completes normally without pausing at configured breakpoints or debugger statements.');
  } else {
    assert.deepEqual([...roles].sort(), expectedRoles);
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
}
