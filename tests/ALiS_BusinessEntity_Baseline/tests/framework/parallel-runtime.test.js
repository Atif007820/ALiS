import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runJobsWithWorkers } from '../../utils/parallelRuntime.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushTasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('parallel=4 fills four slots with independent jobs and preserves input order', async () => {
  const gates = Array.from({ length: 6 }, deferred);
  const started = [];
  let active = 0;
  let maxActive = 0;
  const run = runJobsWithWorkers(gates.map((_, id) => ({ id })), 4, async ({ id }) => {
    started.push(id);
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      await gates[id].promise;
      return `result-${id}`;
    } finally {
      active -= 1;
    }
  });

  await flushTasks();
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.equal(active, 4);
  gates[3].resolve();
  gates[1].resolve();
  await flushTasks();
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  assert.equal(maxActive, 4);
  for (const gate of gates) gate.resolve();
  assert.deepEqual(await run, gates.map((_, id) => `result-${id}`));
});

test('same entity jobs serialize while blocked jobs do not occupy worker slots', async () => {
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  const activeResources = new Set();
  const jobs = [
    { id: 0, exclusiveResourceKey: 'portal-a/entity-1' },
    { id: 1, exclusiveResourceKey: 'portal-a/entity-1' },
    { id: 2, exclusiveResourceKey: 'portal-a/entity-2' },
    { id: 3, exclusiveResourceKey: 'portal-b/entity-1' },
    { id: 4 },
  ];
  const run = runJobsWithWorkers(jobs, 4, async ({ id, exclusiveResourceKey: key }) => {
    if (key) {
      assert.equal(activeResources.has(key), false, `resource overlapped: ${key}`);
      activeResources.add(key);
    }
    started.push(id);
    try {
      await gates[id].promise;
      return id;
    } finally {
      if (key) activeResources.delete(key);
    }
  });

  await flushTasks();
  assert.deepEqual(started, [0, 2, 3, 4]);
  gates[0].resolve();
  await flushTasks();
  assert.deepEqual(started, [0, 2, 3, 4, 1]);
  for (const gate of gates) gate.resolve();
  assert.deepEqual(await run, [0, 1, 2, 3, 4]);
  assert.equal(activeResources.size, 0);
});

test('a failed runtime result releases its entity for the next job', async () => {
  const jobs = [0, 1].map((id) => ({ id, exclusiveResourceKey: 'same-entity' }));
  const started = [];
  const results = await runJobsWithWorkers(jobs, 4, async ({ id }) => {
    started.push(id);
    return { id, failed: id === 0 };
  });
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(results, [{ id: 0, failed: true }, { id: 1, failed: false }]);
});

test('fatal rejection drains active jobs without starting queued jobs', async () => {
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  const finished = [];
  const failure = new Error('runner failed');
  let settled = false;
  const run = runJobsWithWorkers(gates.map((_, id) => ({ id })), 4, async ({ id }) => {
    started.push(id);
    try {
      await gates[id].promise;
    } finally {
      finished.push(id);
    }
    return id;
  });
  const rejection = assert.rejects(run, (error) => error === failure)
    .then(() => { settled = true; });

  await flushTasks();
  gates[0].reject(failure);
  await flushTasks();
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.equal(settled, false);
  gates[1].resolve();
  gates[2].resolve();
  gates[3].resolve();
  await rejection;
  assert.deepEqual([...finished].sort(), [0, 1, 2, 3]);
  assert.deepEqual(started, [0, 1, 2, 3]);
});

test('synchronous runner errors reject and empty queues do not invoke runners', async () => {
  const failure = new Error('synchronous failure');
  await assert.rejects(
    runJobsWithWorkers([{ id: 0 }], 4, () => { throw failure; }),
    (error) => error === failure,
  );
  assert.deepEqual(await runJobsWithWorkers([], 4, () => assert.fail('unexpected runner')), []);
});
