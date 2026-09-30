import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFiles = ['txoca-regression.test.js', 'registration-regression.test.js']
  .map((name) => fileURLToPath(new URL(name, import.meta.url)));
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
