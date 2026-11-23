import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertApprovalSelection, assertMutationRetries, expandFlowTargets, flowAxes, SERIAL_FLOW_SPECS } from '../flowPlan.mjs';
import { loadApprovalTransaction, loadFollowUpConveyance, normalizeTransactionNumber, saveApplicationTransaction, saveApprovedInstallation } from '../../utils/transactionStore.js';
import { CONVEYANCE_ALTERATION_DETAILS } from '../../config/ConveyanceAlterationDetails.js';
import { CONVEYANCE_VARIANCE_DETAILS } from '../../config/ConveyanceVarianceDetails.js';
import { TransactionNumber } from '../../config/approvalTransacNumber.js';

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

test('approval requires apply in the same run', () => {
  assert.throws(() => assertApprovalSelection([SERIAL_FLOW_SPECS[2]]), /Standalone approval is no longer supported/);
  assert.doesNotThrow(() => assertApprovalSelection(SERIAL_FLOW_SPECS.slice(1)));
  assert.doesNotThrow(() => assertApprovalSelection(SERIAL_FLOW_SPECS));
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

for (const [appType, phase] of [['CV', 'variance'], ['CA', 'alteration']]) {
test(`${appType} takes an exact approved installation number and stores its own transaction separately`, t => {
  const installEnv = { ...fixture(t), CONVEYANCE_FOLLOW_UP_APP_TYPE: appType };
  installEnv.CONVEYANCE_APPROVED_INSTALLATION_PATH = path.join(path.dirname(installEnv.CONVEYANCE_TRANSACTION_PATH), 'approved-installation.json');
  const env = { ...installEnv, CONVEYANCE_APP_TYPE: appType, CONVEYANCE_PER_TYPE: '',
    CONVEYANCE_TRANSACTION_PATH: path.join(path.dirname(installEnv.CONVEYANCE_TRANSACTION_PATH), `${phase}-transaction.json`) };
  assert.throws(() => loadFollowUpConveyance(chromium, { env }), /No approved installation handoff/);
  saveApplicationTransaction({ transactionNumber: '00100' }, chromium, { env: installEnv });
  const install = loadApprovalTransaction(chromium, { env: installEnv });
  saveApprovedInstallation(install, '00912', chromium, { env: installEnv });
  const followUp = loadFollowUpConveyance(chromium, { env });
  assert.deepEqual(followUp, { conveyanceNumber: '00912', installationTransactionNumber: '00100' });
  assert.throws(() => loadFollowUpConveyance(chromium, { env: { ...env, CONVEYANCE_RUN_ID: 'another-run' } }), /does not belong/);
  const otherType = appType === 'CV' ? 'CA' : 'CV';
  assert.throws(() => loadFollowUpConveyance(chromium, {
    env: { ...env, CONVEYANCE_APP_TYPE: otherType, CONVEYANCE_FOLLOW_UP_APP_TYPE: otherType },
  }), /does not belong/);
  saveApplicationTransaction({ ...followUp, transactionNumber: '00101' }, chromium, { env });
  assert.equal(loadApprovalTransaction(chromium, { env }).transactionNumber, '00101');
  assert.equal(loadApprovalTransaction(chromium, { env }).conveyanceNumber, '00912');
  assert.equal(loadApprovalTransaction(chromium, { env: installEnv }).transactionNumber, '00100');
  assert.deepEqual(loadFollowUpConveyance(chromium, { env: { ...env, CONVEYANCE_VARIANCE_CONVEYANCE_NUMBER: '00123' } }), followUp);
});
}

for (const perType of ['CPH(A10.4)', 'CMH(A10.5)']) {
  test(`CV uses the approved conveyance number from the planned ${perType} run`, t => {
    const install = { ...fixture(t), CONVEYANCE_APP_TYPE: 'CHI', CONVEYANCE_PER_TYPE: perType,
      CONVEYANCE_FOLLOW_UP_INSTALLATION_APP_TYPE: 'CHI', CONVEYANCE_FOLLOW_UP_APP_TYPE: 'CV' };
    install.CONVEYANCE_APPROVED_INSTALLATION_PATH = path.join(path.dirname(install.CONVEYANCE_TRANSACTION_PATH), 'approved-installation.json');
    saveApplicationTransaction({ appType: 'CHI', perType, transactionNumber: '00110' }, chromium, { env: install });
    saveApprovedInstallation(loadApprovalTransaction(chromium, { env: install }), '00932', chromium, { env: install });
    const variance = { ...install, CONVEYANCE_APP_TYPE: 'CV', CONVEYANCE_PER_TYPE: '' };
    assert.deepEqual(loadFollowUpConveyance(chromium, { env: variance }), {
      conveyanceNumber: '00932', installationTransactionNumber: '00110',
    });
    assert.throws(() => loadFollowUpConveyance(chromium, {
      env: { ...variance, CONVEYANCE_FOLLOW_UP_INSTALLATION_APP_TYPE: 'NCI' },
    }), /does not belong/);
  });
}

test('direct apply remains usable, but approval cannot fall back to a manual number', () => {
  assert.equal(saveApplicationTransaction({ transactionNumber: '6331' }, chromium, { env: {} }), null);
  assert.throws(() => loadApprovalTransaction(chromium, { env: { CONVEYANCE_TRANSACTION_NUMBER: '006331' } }), /requires an absolute transaction handoff path/);
  for (const value of ['', null, 'Not captured', '6331 OR 1=1', '6331,6332', '6.331']) {
    assert.throws(() => normalizeTransactionNumber(value), /digits only/);
  }
});

for (const appType of ['CV', 'CA']) {
  test(`direct ${appType} uses only the validated conveyance selected by its own runner`, () => {
    const env = {
      CONVEYANCE_APP_TYPE: appType, CONVEYANCE_FOLLOW_UP_APP_TYPE: appType, CONVEYANCE_RUN_ID: 'current-follow-up',
      CONVEYANCE_LOGIN_SOURCE: 'existing-applicant', CONVEYANCE_EXISTING_CONVEYANCE_NUMBER: '009790',
    };
    assert.deepEqual(loadFollowUpConveyance(chromium, { env }), { conveyanceNumber: '009790' });
    const registeredEnv = {
      ...env, CONVEYANCE_LOGIN_SOURCE: 'registered', CONVEYANCE_FOLLOW_UP_PHASE: appType === 'CV' ? 'variance' : 'alteration',
    };
    assert.deepEqual(loadFollowUpConveyance(chromium, { env: registeredEnv }), { conveyanceNumber: '009790' });
    assert.throws(() => loadFollowUpConveyance(chromium, {
      env: { ...registeredEnv, CONVEYANCE_FOLLOW_UP_PHASE: 'installation' },
    }), /requires a variance or alteration run/);
    assert.throws(() => loadFollowUpConveyance(chromium, {
      env: { ...env, CONVEYANCE_APP_TYPE: 'NCI', CONVEYANCE_PER_TYPE: 'Res', CONVEYANCE_RES_TYPE: '' },
    }), /requires a variance or alteration run/);
    assert.throws(() => loadFollowUpConveyance(chromium, { env: { ...env, CONVEYANCE_RUN_ID: '' } }), /requires a variance or alteration run/);
  });
}

function listRunner(args, overrides = {}, expectedStatus = 0) {
  // --list is unconditional: this integration check cannot launch a browser/approval.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)));
  const result = spawnSync(process.execPath, ['scripts/run-conveyance.mjs', ...args, '--list'], {
    cwd: frameworkRoot, encoding: 'utf8', timeout: 120000, windowsHide: true,
    env: { ...env, CONVEYANCE_TRANSACTION_NUMBER: '', CONVEYANCE_VARIANCE_CONVEYANCE_NUMBER: '', LOGIN_NAME: '', LOGIN_PASSWORD: '', ...overrides },
  });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /Cleaning previous results/);
  return expectedStatus === 0 ? result.stdout + result.stderr : result.stderr;
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
  assert.match(output, /Combination\(s\): 6; parallel combination limit: 4/);
  assert.match(output, /Application \/ permit: .*CV, CA/);
  for (const selection of ['NCI / Res / RANDOM', 'NCI / Comm / RANDOM', 'CHI / CPH(A10.4)', 'CHI / CMH(A10.5)']) {
    const steps = output.split(/\r?\n/).filter(line => line.startsWith('Running 0') && line.includes(' for ' + selection + ' /'));
    assert.deepEqual(steps.map(line => line.split(' ')[1]), SERIAL_FLOW_SPECS.map(value => path.basename(value)));
  }
});

test('legacy CV shorthand still runs all five stages', () => {
  const pattern = /Running (0[123])_[^\n]+\[(installation|variance)\]/g;
  const args = ['--e2e', '--AppType=CV', '--project=chromium'];
  const newPlan = listRunner(args);
  assert.deepEqual([...newPlan.matchAll(pattern)].map(([, spec, phase]) => `${spec}:${phase}`),
    ['01:installation', '02:installation', '03:installation', '02:variance', '03:variance']);
});

test('initial and var subcommands keep each run in the selected workflow', () => {
  const initialArgs = ['--e2e', 'initial', '--project=chromium'];
  const varArgs = ['--e2e', 'var', '--project=chromium'];
  const initial = listRunner([...initialArgs, '--AppType=NCI', '--PerType=Res', '--ResType=ORC']);
  assert.match(initial, /Application \/ permit: NCI \/ Res \/ ORC/);
  assert.equal([...initial.matchAll(/^Running 0[123]_/gm)].length, 3);
  assert.doesNotMatch(initial, /\[variance\]/);

  const variance = listRunner([...varArgs, '--AppType=NCI', '--PerType=Comm', '--CommType=FC']);
  assert.match(variance, /Application \/ permit: CV \/ NCI \/ Comm \/ FC/);
  assert.equal([...variance.matchAll(/^Running [^\r\n]*\[installation\]$/gm)].length, 3);
  assert.equal([...variance.matchAll(/^Running [^\r\n]*\[variance\]$/gm)].length, 2);

  assert.match(listRunner([...initialArgs, '--AppType=CV'], {}, 1), /Unsupported installation AppType/);
});

test('var plans both CHI permits and filters ALL by compatible permits', () => {
  const args = ['--e2e', 'var', '--project=chromium'];
  const mixed = listRunner([...args, '--AppType=ALL', '--PerType=ALL', '--ResType=', '--CommType=', '--parallel', '4']);
  assert.match(mixed, /Combination\(s\): 4; parallel combination limit: 4/);
  for (const label of ['NCI / Res / RANDOM', 'NCI / Comm / RANDOM', 'CHI / CPH(A10.4)', 'CHI / CMH(A10.5)']) {
    const stages = mixed.split(/\r?\n/).filter(line => line.startsWith('Running 0') && line.includes(' for CV / ' + label + ' /'));
    assert.deepEqual(stages.map(line => line.match(/Running (0[123])_.*\[(installation|variance)\]$/).slice(1)),
      [['01', 'installation'], ['02', 'installation'], ['03', 'installation'], ['02', 'variance'], ['03', 'variance']]);
  }
  const commercial = listRunner([...args, '--AppType=ALL', '--PerType=Comm', '--CommType=FC', '--parallel=2']);
  assert.match(commercial, /Application \/ permit: CV \/ NCI \/ Comm \/ FC/);
  assert.match(commercial, /Combination\(s\): 1; parallel combination limit: 1/);
});

test('full flows accept grouped selection assignments and scope endorsements to the right permit', () => {
  const all = listRunner([
    '--e2e', 'initial', '--AppType=ALL,PerType=ALL,CommType=FC', '--ResType=', '--parallel', '3',
  ]);
  assert.match(all, /Application \/ permit: NCI \/ Res \/ RANDOM, NCI \/ Comm \/ FC, CHI \/ CPH\(A10\.4\), CHI \/ CMH\(A10\.5\)/);
  assert.match(all, /Combination\(s\): 4; parallel combination limit: 3/);
  const started = [...all.matchAll(/^Starting Conveyance run: ([^\r\n]+)/gm)];
  const finished = all.indexOf('Completed Conveyance run:');
  assert.equal(all.slice(0, finished).match(/^Starting Conveyance run:/gm).length, 3);
  assert.equal(started.length, 4);

  const residential = listRunner([
    '--e2e', 'var', '--AppType=ALL,', 'PerType=Res,', 'CommType=FC', '--ResType=', '--parallel', '3',
  ]);
  assert.match(residential, /Application \/ permit: CV \/ NCI \/ Res \/ RANDOM/);
  assert.match(residential, /Ignoring --CommType: no NCI Comm target in this run/);
  assert.match(residential, /Combination\(s\): 1; parallel combination limit: 1/);
  assert.doesNotMatch(residential, /Starting Conveyance run: .*CHI/);

  const mixed = listRunner([
    '--e2e', 'var', '--AppType=NCI,CHI,PerType=Comm,CMH(A10.5),CommType=FC', '--parallel=2',
  ]);
  assert.match(mixed, /Application \/ permit: CV \/ NCI \/ Comm \/ FC, CV \/ CHI \/ CMH\(A10\.5\)/);
  assert.match(mixed, /Combination\(s\): 2; parallel combination limit: 2/);
});

test('initial retains explicit reuse of a complete applicant login', () => {
  const initialArgs = ['--e2e', 'initial', '--project=chromium'];
  const existing = listRunner([...initialArgs, '--LoginName=fixture-name', '--LoginPassword=FixtureSecret'], {
    CONVEYANCE_TRANSACTION_NUMBER: '06442',
  });
  assert.match(existing, /Flow: initial \(existing applicant\)/);
  assert.doesNotMatch(existing, /FixtureSecret|^Running 01_/m);
  const reused = listRunner([...initialArgs, '--user=existing'], { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' });
  assert.match(reused, /Flow: initial \(existing applicant\)/);
  assert.deepEqual([...reused.matchAll(/^Running (0[123])_/gm)].map(([, stage]) => stage), ['02', '03']);
  assert.match(listRunner([...initialArgs, '--LoginName=fixture-name'], {}, 1), /Provide both applicant/);
});

test('existing variance skips registration but keeps both apply and approval pairs and selection overrides', () => {
  const args = ['--e2e', 'var', '--user=existing', '--AppType=NCI', '--PerType=Comm', '--CommType=FC'];
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  const output = listRunner(args, login);
  assert.match(output, /Flow: var \(existing applicant\)/);
  assert.match(output, /Application \/ permit: CV \/ NCI \/ Comm \/ FC/);
  const stages = [...output.matchAll(/^Running (0[123])_[^\r\n]+\[(installation|variance)\]$/gm)];
  assert.deepEqual(stages.map(([, spec, phase]) => `${spec}:${phase}`),
    ['02:installation', '03:installation', '02:variance', '03:variance']);
  assert.doesNotMatch(output, /FixtureSecret/);
  assert.match(listRunner(args, {}, 1), /requires an applicant login and password/);
  const npmFlag = listRunner(['--e2e', 'initial', '--AppType=NCI', '--PerType=Res'], { ...login, npm_config_existinguser: 'true' });
  assert.match(npmFlag, /Flow: initial \(existing applicant\)/);
  assert.doesNotMatch(npmFlag, /^Running 01_/m);
});

test('plain initial and var plan full flows even with saved records and applicant credentials', () => {
  const savedInputs = {
    CONVEYANCE_TRANSACTION_NUMBER: '00123', CONVEYANCE_VARIANCE_CONVEYANCE_NUMBER: '00456',
    LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret',
  };
  const initial = listRunner(['--e2e', 'initial', '--user=new'], savedInputs);
  assert.match(initial, /Flow: initial \(full flow\)/);
  assert.equal([...initial.matchAll(/^Running 0[123]_/gm)].length, 3);
  const variance = listRunner(['--e2e', 'var', '--user=new'], savedInputs);
  assert.match(variance, /Flow: var \(full flow\)/);
  assert.equal([...variance.matchAll(/^Running 0[123]_/gm)].length, 5);
});

test('the standalone entry point selects one script and rejects ambiguous selections', () => {
  for (const [index, alias] of ['register', 'apply'].entries()) {
    const output = listRunner(['--standalone', `--spec=${alias}`, '--project=chromium']);
    assert.ok(output.split(/\r?\n/).includes(`Selected spec(s): ${SERIAL_FLOW_SPECS[index]}`));
    assert.equal([...output.matchAll(/^Running 0[123]_/gm)].length, 1);
  }

  assert.match(listRunner(['--standalone'], {}, 1), /requires exactly one spec/);
  assert.match(listRunner(['--standalone', '--spec=e2e'], {}, 1), /requires exactly one spec/);
  assert.match(listRunner(['--standalone', '--spec=approve'], { CONVEYANCE_TRANSACTION_NUMBER: '6331' }, 1), /Standalone approval is no longer supported/);
  assert.match(listRunner(['--e2e', '--spec=apply'], {}, 1), /runs the full flow/);
  assert.match(listRunner(['--e2e', '--spec=typo'], {}, 1), /Unknown script selection/);
});

test('register and its spelling alias select only the registration script', () => {
  for (const flag of ['--register', '--regsiter']) {
    const output = listRunner(['--e2e', flag]);
    assert.match(output, /Flow: registration only/);
    assert.deepEqual([...output.matchAll(/^Running (0[123])_/gm)].map(([, stage]) => stage), ['01']);
  }
  assert.match(listRunner(['--e2e', '--register', '--approve'], {}, 1), /--register runs by itself/);
});

test('initial apply only uses the configured applicant and accepts installation overrides', () => {
  const args = ['--e2e', 'initial', '--apply'];
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  const output = listRunner([...args, '--AppType=NCI', '--PerType=Comm,CommType', '--CommType=FC'], login);
  assert.match(output, /Flow: initial \(apply only\)/);
  assert.match(output, /Application \/ permit: NCI \/ Comm \/ FC/);
  assert.deepEqual([...output.matchAll(/^Running (0[123])_/gm)].map(([, stage]) => stage), ['02']);
  assert.doesNotMatch(output, /FixtureSecret/);
  assert.match(listRunner(args, {}, 1), /Apply-only mode requires an applicant login and password/);
  assert.match(listRunner([...args, '--user=existing'], login, 1), /Choose either --apply.*--user=existing/);
});

test('regapply handles initial submission, installation approval, and direct follow-ups', () => {
  const run = args => listRunner(['--e2e', ...args, '--regapply']);
  const stages = output => [...output.matchAll(/^Running (0[123])_/gm)].map(([, stage]) => stage);
  assert.deepEqual(stages(run([])), ['01', '02']);
  assert.deepEqual(stages(run(['initial', '--user=new', '--AppType=NCI', '--PerType=Res'])), ['01', '02']);

  const followUps = [
    ['var', 'variance', CONVEYANCE_VARIANCE_DETAILS.conveyanceNumber],
    ['alt', 'alteration', CONVEYANCE_ALTERATION_DETAILS.conveyanceNumber],
  ];
  for (const [flow, phase, numberFromConfig] of followUps) {
    const plain = run([flow]);
    assert.ok(plain.includes(
      `Planned stages: 01_RegisterUser [installation] -> 02_LoginApply [installation] -> 03_ApproveApplication [installation] -> 02_LoginApply [${phase}]`,
    ));
    assert.deepEqual(stages(plain), ['01', '02', '03', '02']);
    assert.doesNotMatch(plain, /^Conveyance #:/m);

    const output = run([flow, '--ConvNum=004749']);
    assert.match(output, /Conveyance #: 004749/);
    const directPlan = `Planned stages: 01_RegisterUser -> 02_LoginApply [${phase}]`;
    assert.ok(output.includes(directPlan));
    assert.deepEqual(stages(output), ['01', '02']);

    const configArgs = ['--e2e', flow, '--regapply', '--ExistingConveyance'];
    if (numberFromConfig) {
      const configured = listRunner(configArgs);
      assert.ok(configured.includes(directPlan));
      assert.ok(configured.includes(`Conveyance #: ${numberFromConfig}`));
      assert.deepEqual(stages(configured), ['01', '02']);
    } else {
      assert.match(listRunner(configArgs, {}, 1), /--ExistingConveyance requires conveyanceNumber/);
    }
  }

  const hoist = run(['alt', '--AppType=CHI', '--PerType=CPH-A10.4']);
  assert.match(hoist, /Application \/ permit: CA \/ CHI \/ CPH\(A10.4\)/);
  assert.deepEqual(stages(hoist), ['01', '02', '03', '02']);
});

test('applicant and register-apply flags reject conflicting selections', () => {
  for (const [args, error] of [
    [['initial', '--user=other'], /Use --user=new or --user=existing/],
    [['initial', '--user=new', '--user=existing'], /Choose one --user mode/],
    [['initial', '--user=new', '--LoginName=fixture-name'], /--user=new registers an applicant/],
    [['initial', '--regapply', '--user=existing'], /--regapply registers a new applicant/],
    [['initial', '--regapply', '--apply'], /--regapply registers a new applicant/],
    [['var', '--regapply', '--ConvNum='], /var --regapply requires --ConvNum/],
    [['alt', '--regapply', '--ExistingConveyance', '--ConvNum=202866'], /Choose either --ExistingConveyance.*or --ConvNum/],
    [['var', '--regapply', '--ConvNum=202866', '--AppType=NCI'], /does not take installation selectors/],
    [['alt', '--regapply', '--ExistingConveyance', '--AppType=CHI'], /does not take installation selectors/],
  ]) assert.match(listRunner(['--e2e', ...args], {}, 1), error);
});

test('plain follow-up apply submits and approves an installation before the follow-up submission', () => {
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  for (const [flow, phase] of [['var', 'variance'], ['alt', 'alteration']]) {
    const output = listRunner(['--e2e', flow, '--apply'], login);
    assert.ok(output.includes(`Flow: ${flow} (apply after installation approval)`));
    assert.ok(output.includes(
      `Planned stages: 02_LoginApply [installation] -> 03_ApproveApplication [installation] -> 02_LoginApply [${phase}]`,
    ));
    const steps = [...output.matchAll(/^Running (0[123])_[^\r\n]*\[(installation|variance|alteration)\]$/gm)];
    assert.deepEqual(steps.map(([, stage, stepPhase]) => `${stage}:${stepPhase}`), [
      '02:installation', '03:installation', `02:${phase}`,
    ]);
    assert.doesNotMatch(output, /^Conveyance #:|^Running 01_/m);
  }

  const hoist = listRunner(['--e2e', 'alt', '--apply', '--AppType=CHI', '--PerType=CPH-A10.4'], login);
  assert.match(hoist, /Application \/ permit: CA \/ CHI \/ CPH\(A10.4\)/);
});

test('var apply with a selector submits a variance on the configured or specified conveyance', () => {
  const args = ['--e2e', 'var', '--apply'];
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  const output = listRunner([...args, '--AppType', '--PerType', '--ConvNum', '=004749'], login);
  assert.match(output, /Flow: var \(apply only\)/);
  assert.match(output, /Conveyance #: 004749/);
  assert.deepEqual([...output.matchAll(/^Running (0[123])_[^\r\n]*\[variance\]$/gm)].map(([, stage]) => stage), ['02']);
  assert.doesNotMatch(output, /^Running (?:01|03)_|\[installation\]/m);
  const configured = String(CONVEYANCE_VARIANCE_DETAILS.conveyanceNumber ?? '').trim();
  const configuredArgs = [...args, '--ExistingConveyance'];
  if (configured) {
    const configPlan = listRunner(configuredArgs, login);
    assert.ok(configPlan.includes(`Conveyance #: ${configured}`));
    assert.match(configPlan, /Planned stages: 02_LoginApply \[variance\]\r?$/m);
  } else assert.match(listRunner(configuredArgs, login, 1), /--ExistingConveyance requires conveyanceNumber/);
  assert.match(listRunner([...args, '--ConvNum='], login, 1), /var --apply requires --ConvNum/);
  assert.match(listRunner([...args, '--AppType=NCI', '--ConvNum=4749'], login, 1), /does not take installation selectors/);
});

test('variance apply and approval accept either the configured conveyance or a CLI number', () => {
  const args = ['--e2e', 'var', '--user=existing'];
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  const output = listRunner([...args, 'ConvNum=009790'], login);
  assert.match(output, /Flow: var \(existing conveyance\)/);
  assert.match(output, /Conveyance #: 009790/);
  assert.deepEqual([...output.matchAll(/^Running (0[123])_[^\r\n]*\[variance\]$/gm)].map(([, stage]) => stage), ['02', '03']);
  assert.doesNotMatch(output, /^Running 01_|\[installation\]/m);
  const configured = String(CONVEYANCE_VARIANCE_DETAILS.conveyanceNumber ?? '').trim();
  if (configured) {
    const configPlan = listRunner([...args, '--ExistingConveyance'], login);
    assert.ok(configPlan.includes(`Conveyance #: ${configured}`));
    assert.match(configPlan, /Planned stages: 02_LoginApply \[variance\] -> 03_ApproveApplication \[variance\]/);
  } else {
    assert.match(listRunner([...args, '--ExistingConveyance'], login, 1), /--ExistingConveyance requires conveyanceNumber/);
  }
});

test('approval-only uses the configured transaction unless TransacNum overrides it', () => {
  const args = ['--e2e', '--approve'];
  const configured = String(TransactionNumber ?? '').trim();
  if (configured) assert.ok(listRunner(args).includes(`Transaction # ${configured}`));
  else assert.match(listRunner(args, {}, 1), /requires --TransacNum or TransactionNumber/);
  const output = listRunner([...args, '--TransacNum=004324']);
  assert.match(output, /Flow: approval only \(Transaction # 004324\)/);
  assert.deepEqual([...output.matchAll(/^Running (0[123])_/gm)].map(([, stage]) => stage), ['03']);
});

test('alt plans new, existing-applicant, existing-conveyance, and apply-only combinations', () => {
  const args = ['--e2e', 'alt', '--project=chromium'];
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  const stages = value => [...value.matchAll(/^Running (0[123])_[^\r\n]*\[(installation|alteration)\]$/gm)]
    .map(([, stage, phase]) => stage + ':' + phase);
  const full = ['01:installation', '02:installation', '03:installation', '02:alteration', '03:alteration'];
  assert.deepEqual(stages(listRunner([...args, '--user=new'])), full);
  assert.deepEqual(stages(listRunner(['--e2e', '--AppType=CA', '--project=chromium'])), full);
  assert.deepEqual(stages(listRunner([...args, '--user=existing', '--AppType=NCI', '--PerType=Comm', '--CommType=FC'], login)), full.slice(1));
  const direct = listRunner([...args, '--user=existing', '--ConvNum=004749', '--NoConveyanceChanges'], login);
  assert.match(direct, /Conveyance #: 004749/);
  assert.match(direct, /Conveyance Information: unchanged/);
  assert.deepEqual(stages(direct), full.slice(3));
  const configuredDirect = listRunner([...args, '--user=existing', '--ExistingConveyance'], login);
  assert.ok(configuredDirect.includes('Conveyance #: ' + CONVEYANCE_ALTERATION_DETAILS.conveyanceNumber));
  assert.deepEqual(stages(configuredDirect), full.slice(3));
  const configured = listRunner([...args, '--apply', '--ExistingConveyance'], login);
  assert.ok(configured.includes('Conveyance #: ' + CONVEYANCE_ALTERATION_DETAILS.conveyanceNumber));
  assert.match(configured, /Conveyance Information: random subset/);
  assert.deepEqual(stages(configured), ['02:alteration']);
  const override = listRunner([...args, '--apply', 'ConvNum=0092', '--NoConveyanceChanges'], login);
  assert.match(override, /Conveyance #: 0092/);
  assert.match(override, /Conveyance Information: unchanged/);
  assert.deepEqual(stages(override), ['02:alteration']);
});

test('alt rejects invalid modes and options before listing any stage', () => {
  const login = { LOGIN_NAME: 'fixture-name', LOGIN_PASSWORD: 'FixtureSecret' };
  for (const [argv, error] of [
    [['alt', '--ConvNum='], /--ConvNum requires a conveyance number/],
    [['alt', '--user=new', '--ConvNum=4749'], /--user=new registers an applicant/],
    [['alt', '--apply', '--ExistingConveyance', '--AppType=CHI'], /does not take installation selectors/],
    [['alt', '--ExistingConveyance', '--PerType=Comm'], /does not take installation/],
    [['alt', '--apply', '--ConvNum='], /alt --apply requires --ConvNum/],
    [['alt', '--apply', '--ConvNum=abc'], /digits only/],
    [['alt', '--apply', '--ExistingConveyance', '--repeat-each=2'], /one browser project and one repeat/],
    [['alt', '--ExistingConveyance', '--project=chromium', '--project=firefox'], /one browser project and one repeat/],
    [['alt', '--apply', '--ExistingUser'], /Choose either --apply/],
    [['alt', '--apply', '--retries=1'], /require --retries=0/],
    [['alt', '--approve'], /--approve runs by itself/],
    [['alt', '--AppType=CA'], /Unsupported installation AppType/],
    [['var', '--NoConveyanceChanges'], /only supported with Conveyance Alteration/],
    [['initial', '--NoConveyanceChanges'], /only supported with Conveyance Alteration/],
  ]) assert.match(listRunner(['--e2e', ...argv], login, 1), error);
});

test('rejects incompatible and unsafe command options before launching Playwright', () => {
  assert.match(listRunner(['--e2e', 'initial', '--ConvNum=4567'], {}, 1), /--ConvNum requires npm run conv var or npm run conv alt/);
  assert.match(listRunner(['--e2e', 'initial', '--TransacNum=4324'], {}, 1), /--TransacNum requires --approve/);
  assert.match(listRunner(['--e2e', 'var', '--ExistingConveyance', '--ConvNum=4567'], {}, 1), /Choose either --ExistingConveyance.*or --ConvNum/);
  assert.match(listRunner(['--e2e', 'var', '--ConvNum=4567', '--PerType=Comm'], {}, 1), /does not take installation/);
  assert.match(listRunner(['--e2e', '--approve', '--TransacNum=4324', '--AppType=NCI'], {}, 1), /--approve runs by itself/);
  assert.match(listRunner(['--e2e', 'initial', '--AppType=NCI', '--PerType=Res', '--CommType=FC'], {}, 1), /--CommType requires a matching NCI Comm/);
  assert.match(listRunner(['--e2e', 'var', '--AppType=NCI', '--PerType=Comm', '--ResType=ORC'], {}, 1), /--ResType requires a matching NCI Res/);
  assert.match(listRunner(['--e2e', '--approve', '--TransacNum=4324', '--repeat-each=2'], {}, 1), /requires one browser project and one repeat/);
  assert.match(listRunner(['--e2e', '--approve', '--TransacNum=no'], {}, 1), /contain digits only/);
  assert.match(listRunner(['--e2e', 'initial'], { npm_config_transaction: '6331' }, 1), /after npm's -- separator/);
});
