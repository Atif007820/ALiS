// Run independent profiles together while keeping operations on the same saved
// entity exclusive. The key is resolved by the caller from the actual portal
// URL and entity reference, rather than from browser or flow names.
export async function runJobsWithWorkers(jobs, workers, runner) {
  const requestedWorkers = Number(workers);
  const workerCount = Number.isFinite(requestedWorkers)
    ? Math.max(1, Math.floor(requestedWorkers))
    : 1;
  const pending = jobs.map((job, index) => ({ job, index }));
  const results = new Array(jobs.length);
  const active = new Set();
  const lockedResources = new Set();
  let failed = false;
  let failure;

  const resourceKey = (job) => job?.exclusiveResourceKey ?? '';

  const start = ({ job, index }) => {
    const key = resourceKey(job);
    if (key !== '') lockedResources.add(key);

    const task = Promise.resolve()
      .then(() => runner(job))
      .then(
        (result) => { results[index] = result; },
        (error) => {
          if (!failed) {
            failed = true;
            failure = error;
          }
        },
      )
      .finally(() => {
        active.delete(task);
        if (key !== '') lockedResources.delete(key);
      });

    active.add(task);
  };

  while (pending.length || active.size) {
    while (!failed && active.size < workerCount && pending.length) {
      const nextIndex = pending.findIndex(({ job }) => {
        const key = resourceKey(job);
        return key === '' || !lockedResources.has(key);
      });
      if (nextIndex < 0) break;
      start(pending.splice(nextIndex, 1)[0]);
    }

    if (failed) {
      // Existing jobs own browser resources until their runners finish. Drain
      // them before rejecting, and leave queued jobs unstarted.
      await Promise.all(active);
      throw failure;
    }

    if (active.size) await Promise.race(active);
  }

  if (failed) throw failure;
  return results;
}
