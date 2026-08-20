export async function runWithConcurrency(items, workerCount, runner) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const requestedWorkers = Math.max(1, Math.floor(Number(workerCount) || 1));
  const activeWorkers = Math.min(requestedWorkers, items.length);
  const results = new Array(items.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: activeWorkers }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await runner(items[index], index);
    }
  }));

  return results;
}
