function isCreateProfileFlow(flow) {
  return ['1', '3'].includes(String(flow));
}

export function exclusiveRuntimeKeyForJob(job) {
  if (job?.exclusiveResourceKey !== undefined) {
    return job.exclusiveResourceKey;
  }
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
  const requestedWorkers = Number(workers);
  const workerCount = Number.isFinite(requestedWorkers) ? Math.max(1, Math.floor(requestedWorkers)) : 1;
  const pending = jobs.map((job, index) => ({ job, index, key: exclusiveKeyForJob(job) }));
  const results = new Array(jobs.length);
  const active = new Set();
  const locked = new Set();
  let failed = false;
  let failure;

  const start = ({ job, index, key }) => {
    if (key) locked.add(key);
    const task = Promise.resolve().then(() => runner(job)).then(
      (result) => { results[index] = result; },
      (error) => {
        if (!failed) { failed = true; failure = error; }
      },
    ).finally(() => {
      active.delete(task);
      if (key) locked.delete(key);
    });
    active.add(task);
  };

  while (pending.length || active.size) {
    while (!failed && active.size < workerCount && pending.length) {
      const nextIndex = pending.findIndex(({ key }) => !key || !locked.has(key));
      if (nextIndex < 0) break;
      start(pending.splice(nextIndex, 1)[0]);
    }
    if (failed) {
      // Let active jobs release their browsers before reporting a fatal failure.
      await Promise.all(active);
      throw failure;
    }
    if (active.size) await Promise.race(active);
  }
  if (failed) throw failure;
  return results;
}
