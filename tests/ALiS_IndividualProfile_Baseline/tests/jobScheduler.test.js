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
