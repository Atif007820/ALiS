function isCreateProfileFlow(flow) {
  return ['1', '3'].includes(String(flow));
}

export function exclusiveRuntimeKeyForJob(job) {
  if (!isCreateProfileFlow(job?.flow)) {
    return '';
  }

  // The legacy ALiS credential popup retains server-side state for the active
  // user. New Profile flows must not overlap, even when comparison work uses
  // multiple workers or browsers.
  return 'alis-individual-profile-create';
}

export async function runJobsWithWorkers(jobs, workers, runner, {
  exclusiveKeyForJob = exclusiveRuntimeKeyForJob,
} = {}) {
  const results = new Array(jobs.length);
  const lockTails = new Map();
  let cursor = 0;
  const workerCount = Math.min(Math.max(workers, 1), jobs.length || 1);

  const runJob = (job) => {
    const lockKey = exclusiveKeyForJob(job);
    if (!lockKey) {
      return runner(job);
    }

    const previous = lockTails.get(lockKey) || Promise.resolve();
    const execution = previous.catch(() => {}).then(() => runner(job));
    const tail = execution.catch(() => {});
    lockTails.set(lockKey, tail);

    tail.finally(() => {
      if (lockTails.get(lockKey) === tail) {
        lockTails.delete(lockKey);
      }
    }).catch(() => {});

    return execution;
  };

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < jobs.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await runJob(jobs[currentIndex]);
      }
    }),
  );

  return results;
}
