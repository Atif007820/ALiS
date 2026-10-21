import test from 'node:test';
import assert from 'node:assert/strict';
import { exclusiveRuntimeKeyForJob, runJobsWithWorkers } from '../utils/jobScheduler.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('New Profile flows are serialized while non-create flows can use available workers', async () => {
  const jobs = [
    { flow: '1', businessUnit: { id: 'MAMMO' } },
    { flow: '2', businessUnit: { id: 'MAMMO' } },
    { flow: '3', businessUnit: { id: 'MAMMO' } },
    { flow: '4', businessUnit: { id: 'MAMMO' } },
  ];
  let activeCreates = 0;
  let maximumConcurrentCreates = 0;

  const results = await runJobsWithWorkers(jobs, 2, async (job) => {
    if (exclusiveRuntimeKeyForJob(job)) {
      activeCreates += 1;
      maximumConcurrentCreates = Math.max(maximumConcurrentCreates, activeCreates);
      await wait(20);
      activeCreates -= 1;
    } else {
      await wait(5);
    }

    return job.flow;
  });

  assert.deepEqual(results, ['1', '2', '3', '4']);
  assert.equal(maximumConcurrentCreates, 1);
  assert.equal(exclusiveRuntimeKeyForJob({ flow: '2' }), '');
  assert.equal(exclusiveRuntimeKeyForJob({ flow: '4' }), '');
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('parallel=4 fills four independent slots and keeps results in input order', async () => {
  const gates = Array.from({ length: 6 }, deferred);
  const started = [];
  let active = 0;
  let maxActive = 0;
  const running = runJobsWithWorkers(gates.map((_, id) => ({ id })), 4, async ({ id }) => {
    started.push(id);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await gates[id].promise;
    active -= 1;
    return id;
  });
  await flush();
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.equal(active, 4);
  gates[3].resolve();
  gates[1].resolve();
  await flush();
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  gates.forEach(({ resolve }) => resolve());
  assert.deepEqual(await running, [0, 1, 2, 3, 4, 5]);
  assert.equal(maxActive, 4);
});

test('same-profile locks do not consume worker slots or block unrelated jobs', async () => {
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  const running = runJobsWithWorkers([
    { id: 0, exclusiveResourceKey: 'portal/profile-a' },
    { id: 1, exclusiveResourceKey: 'portal/profile-a' },
    { id: 2, exclusiveResourceKey: 'portal/profile-b' },
    { id: 3, exclusiveResourceKey: 'other-portal/profile-a' },
    { id: 4 },
  ], 4, async ({ id }) => {
    started.push(id);
    await gates[id].promise;
    return id;
  });
  await flush();
  assert.deepEqual(started, [0, 2, 3, 4]);
  gates[0].resolve();
  await flush();
  assert.deepEqual(started, [0, 2, 3, 4, 1]);
  gates.forEach(({ resolve }) => resolve());
  assert.deepEqual(await running, [0, 1, 2, 3, 4]);
});

test('failure results release their profile lock for the next job', async () => {
  const results = await runJobsWithWorkers([0, 1].map((id) => ({ id, exclusiveResourceKey: 'same' })), 4,
    async ({ id }) => ({ id, failed: id === 0 }));
  assert.deepEqual(results, [{ id: 0, failed: true }, { id: 1, failed: false }]);
});

test('fatal errors drain running jobs and leave queued jobs unstarted', async () => {
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  const failure = new Error('fatal job error');
  let settled = false;
  const running = runJobsWithWorkers(gates.map((_, id) => ({ id })), 4, async ({ id }) => {
    started.push(id);
    await gates[id].promise;
    return id;
  });
  const rejection = assert.rejects(running, (error) => error === failure).then(() => { settled = true; });
  await flush();
  gates[0].reject(failure);
  await flush();
  assert.equal(settled, false);
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates.slice(1, 4).forEach(({ resolve }) => resolve());
  await rejection;
  assert.deepEqual(started, [0, 1, 2, 3]);
});

test('synchronous failures and empty or invalid worker selections remain bounded', async () => {
  await assert.rejects(() => runJobsWithWorkers([{}], 4, () => { throw new Error('sync'); }), /sync/);
  assert.deepEqual(await runJobsWithWorkers([], 4, () => assert.fail('no jobs')), []);
  assert.deepEqual(await runJobsWithWorkers([{ id: 1 }], Number.NaN, async ({ id }) => id), [1]);
});
