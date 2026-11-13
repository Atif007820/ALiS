import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertApprovalSelection, assertMutationRetries, expandFlowTargets, flowAxes, SERIAL_FLOW_SPECS } from '../flowPlan.mjs';
import { loadApprovalTransaction, normalizeTransactionNumber, saveApplicationTransaction } from '../../utils/transactionStore.js';

const projects = ['chromium', 'firefox', 'Microsoft Edge'];
const chromium = { project: { name: 'chromium' }, repeatEachIndex: 0 };
const frameworkRoot = fileURLToPath(new URL('../../', import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'conveyance-handoff-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    CONVEYANCE_TRANSACTION_PATH: path.join(directory, 'transaction.json'),
    CONVEYANCE_TRANSACTION_SOURCE: 'current-run',
    CONVEYANCE_RUN_ID: 'fresh-flow',
    CONVEYANCE_FLOW_REPEAT: '0',
    CONVEYANCE_APP_TYPE: 'NCI', CONVEYANCE_PER_TYPE: 'Res',
    CONVEYANCE_RES_TYPE: '', CONVEYANCE_COMM_TYPE: '',
  };
}

test('default flow and all repeat/project units remain serial with distinct handoff identities', () => {
  assert.deepEqual(SERIAL_FLOW_SPECS.map(value => path.basename(value)), [
    '01_RegisterUser.spec.js', '02_LoginApply.spec.js', '03_ApproveApplication.spec.js',
  ]);
  const axes = flowAxes(['--project=chromium', '--project', 'Microsoft Edge', '--repeat-each=2', '--headed'], projects);
  assert.deepEqual(axes.remainingArgs, ['--headed']);
  const targets = expandFlowTargets([
    { slug: 'nci-res-random', appType: 'NCI', perType: 'Res', label: 'NCI / Res' },
    { slug: 'chi-cph-a10-4', appType: 'CHI', perType: 'CPH(A10.4)', label: 'CHI / CPH(A10.4)' },
  ], axes);
  assert.equal(targets.length, 8);
  assert.equal(new Set(targets.map(target => target.slug)).size, 8);
  assert.equal(new Set(targets.map(target => target.runId)).size, 8);
  assert.deepEqual(targets.slice(0, 4).map(({ project, repeatIndex }) => [project, repeatIndex]), [
    ['chromium', 0], ['chromium', 1], ['Microsoft Edge', 0], ['Microsoft Edge', 1],
  ]);
  assert.deepEqual(flowAxes(['--project=*'], projects).projects, projects);
  assert.throws(() => flowAxes(['--project=missing'], projects), /Unknown project/);
  assert.throws(() => flowAxes(['--project=chromium', '--repeat-each=0'], projects), /positive integer/);
});

test('standalone approval requires one target and cannot override a fresh apply result', () => {
  assert.throws(() => assertApprovalSelection([SERIAL_FLOW_SPECS[2]], [{}], null), /TransactionNumber/);
  assert.throws(() => assertApprovalSelection([SERIAL_FLOW_SPECS[2]], [{}, {}], '6331'), /one application\/permit/);
  assert.throws(() => assertApprovalSelection(SERIAL_FLOW_SPECS, [{}], '6331'), /freshly captured/);
  assert.doesNotThrow(() => assertApprovalSelection([SERIAL_FLOW_SPECS[2]], [{}], '6331'));
  assert.doesNotThrow(() => assertApprovalSelection(SERIAL_FLOW_SPECS, [{}, {}], null));
});

test('apply/approval cannot automatically retry uncertain server mutations', () => {
  for (const specs of [[SERIAL_FLOW_SPECS[1]], [SERIAL_FLOW_SPECS[2]], SERIAL_FLOW_SPECS]) {
    assert.throws(() => assertMutationRetries(specs, ['--retries=2']), /require --retries=0/);
    assert.throws(() => assertMutationRetries(specs, ['--retries', '1']), /require --retries=0/);
    assert.doesNotThrow(() => assertMutationRetries(specs, ['--retries=0']));
    assert.doesNotThrow(() => assertMutationRetries(specs, []));
  }
});

test('handoff retains exact transaction, safe context and rejects overwrite', t => {
  const env = fixture(t);
  saveApplicationTransaction({ transactionNumber: '006331', entityName: 'Fixture Entity', existingBuildingAnswer: 'N/A', password: 'must-not-save' }, chromium, { env });
  const record = loadApprovalTransaction(chromium, { env });
  assert.equal(record.transactionNumber, '006331');
  assert.equal(record.entityName, 'Fixture Entity');
  assert.equal(record.existingBuildingAnswer, 'N/A');
  assert.equal(record.source, 'current-run');
  assert.equal(readFileSync(env.CONVEYANCE_TRANSACTION_PATH, 'utf8').includes('must-not-save'), false);
  assert.throws(() => saveApplicationTransaction({ transactionNumber: '9999' }, chromium, { env }), { code: 'EEXIST' });
});

test('stale, cross-application, cross-permit, cross-project and cross-repeat handoffs are refused', t => {
  const env = fixture(t);
  saveApplicationTransaction({ transactionNumber: '6331' }, chromium, { env });
  for (const override of [
    { CONVEYANCE_RUN_ID: 'older-flow' },
    { CONVEYANCE_APP_TYPE: 'CHI', CONVEYANCE_PER_TYPE: 'CPH(A10.4)' },
    { CONVEYANCE_PER_TYPE: 'Comm' }, { CONVEYANCE_RES_TYPE: 'ORC' }, { CONVEYANCE_FLOW_REPEAT: '1' },
  ]) {
    assert.throws(() => loadApprovalTransaction(chromium, { env: { ...env, ...override } }), /does not match/);
  }
  assert.throws(() => loadApprovalTransaction({ project: { name: 'firefox' }, repeatEachIndex: 0 }, { env }), /does not match/);
  assert.throws(() => loadApprovalTransaction({ ...chromium, repeatEachIndex: 1 }, { env }), /does not match/);
});

test('fresh handoff cannot fall back to an explicit or stale transaction when missing/corrupt', t => {
  const env = { ...fixture(t), CONVEYANCE_TRANSACTION_NUMBER: '9999' };
  assert.throws(() => loadApprovalTransaction(chromium, { env }), /No valid transaction captured/);
  writeFileSync(env.CONVEYANCE_TRANSACTION_PATH, '{invalid');
  assert.throws(() => loadApprovalTransaction(chromium, { env }), /No valid transaction captured/);
});

test('direct apply remains usable and standalone approval accepts explicit or configured input', () => {
  assert.equal(saveApplicationTransaction({ transactionNumber: '6331' }, chromium, { env: {} }), null);
  assert.throws(() => loadApprovalTransaction(chromium, { env: {} }), /digits only/);
  assert.equal(loadApprovalTransaction(chromium, { env: { CONVEYANCE_TRANSACTION_NUMBER: '006331' } }).transactionNumber, '006331');
  assert.equal(loadApprovalTransaction(chromium, { env: {}, standaloneTransactionNumber: '007221' }).transactionNumber, '007221');
  for (const value of ['', null, 'Not captured', '6331 OR 1=1', '6331,6332', '6.331']) {
    assert.throws(() => normalizeTransactionNumber(value), /digits only/);
  }
});

function listRunner(args, overrides = {}, expectedStatus = 0) {
  // --list is unconditional: this integration check cannot launch a browser/approval.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)));
  const result = spawnSync(process.execPath, ['scripts/run-conveyance.mjs', '--list', ...args], {
    cwd: frameworkRoot, encoding: 'utf8', timeout: 120000, windowsHide: true,
    env: { ...env, CONVEYANCE_TRANSACTION_NUMBER: '', ...overrides },
  });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /Cleaning previous results/);
  return expectedStatus === 0 ? result.stdout : result.stderr;
}

test('runner default lists 01 then02 then03 without credentials or external actions', () => {
  const output = listRunner(['--project=chromium']);
  assert.match(output, /Selected spec\(s\): testScripts\/01_RegisterUser\.spec\.js -> testScripts\/02_LoginApply\.spec\.js -> testScripts\/03_ApproveApplication\.spec\.js/);
  for (const spec of SERIAL_FLOW_SPECS) assert.match(output, new RegExp(`Running ${path.basename(spec).replaceAll('.', '\\.')}`));
});

test('the E2E entry point lists all three tests with the exact report titles', () => {
  const output = listRunner(['--e2e', '--project=chromium']);
  const titles = [...output.matchAll(/\.spec\.js:\d+:\d+\s+\u203a\s+([^\r\n]+)/gu)].map(match => match[1].trim());
  assert.deepEqual(titles, [
    'Conveyance - Register New User',
    'Conveyance - Login and Apply Permit',
    'Conveyance - Approve Application',
  ]);
});

test('E2E plans all three scripts for every selected application/permit pair', () => {
  const output = listRunner(['--e2e', '--AppType=ALL', '--PerType=ALL', '--ResType=', '--CommType=', '--project=chromium', '--parallel=4']);
  assert.match(output, /Combination\(s\): 4; parallel combination limit: 4/);
  for (const selection of ['NCI / Res / RANDOM', 'NCI / Comm / RANDOM', 'CHI / CPH(A10.4)', 'CHI / CMH(A10.5)']) {
    const steps = output.split(/\r?\n/).filter(line => line.startsWith('Running 0') && line.includes(' for ' + selection + ' /'));
    assert.deepEqual(steps.map(line => line.split(' ')[1]), SERIAL_FLOW_SPECS.map(value => path.basename(value)));
  }
});

test('the standalone entry point selects one script and rejects ambiguous selections', () => {
  for (const [index, alias] of ['register', 'apply', 'approve'].entries()) {
    const output = listRunner(['--standalone', `--spec=${alias}`, '--project=chromium']);
    assert.ok(output.split(/\r?\n/).includes(`Selected spec(s): ${SERIAL_FLOW_SPECS[index]}`));
    assert.equal([...output.matchAll(/^Running 0[123]_/gm)].length, 1);
  }

  assert.match(listRunner(['--standalone'], {}, 1), /requires exactly one spec/);
  assert.match(listRunner(['--standalone', '--spec=e2e'], {}, 1), /requires exactly one spec/);
  assert.match(listRunner(['--e2e', '--spec=apply'], {}, 1), /runs the full flow/);
  assert.match(listRunner(['--e2e', '--spec=typo'], {}, 1), /Unknown script selection/);
});

test('Windows npm configuration consumes standalone transaction values instead of forwarding them to Playwright', () => {
  const output = listRunner(['6331'], { npm_config_spec: 'approve', npm_config_transaction: 'true', npm_config_project: 'chromium' });
  assert.match(output, /Selected spec\(s\): testScripts\/03_ApproveApplication\.spec\.js/);
  assert.doesNotMatch(output, /Running 0[12]_/);
  const direct = listRunner(['--spec=approve', '--transaction=006331', '--project=chromium']);
  assert.match(direct, /Completed Conveyance run:/);
});
