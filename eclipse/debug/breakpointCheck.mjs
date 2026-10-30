import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function checkpoint(role) {
  const inspection = { role, status: 'paused-for-inspection', answer: 42 };
  debugger;
  console.log(`Breakpoint check: ${inspection.role}, answer=${inspection.answer}`);
  return inspection.answer;
}

if (process.argv.includes('--child')) {
  assert.equal(checkpoint('child'), 42);
} else {
  assert.equal(checkpoint('parent'), 42);
  await new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--child'], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 && !signal) resolve();
      else reject(new Error(`Breakpoint child failed: code=${code}, signal=${signal}`));
    });
  });
  console.log('Breakpoint check complete. No application or load tests were executed.');
}
