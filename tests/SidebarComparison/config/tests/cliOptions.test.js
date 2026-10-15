import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOptions } from '../../scripts/cliOptions.js';

for (const args of [['--parallel=5'], ['--parallel', '5']]) {
  for (const visibility of ['--headed', '--headless']) {
    test(`${args.join(' ')} preserves five workers with ${visibility}`, () => {
      const options = parseOptions([
        '--site=ALL', '--product=ALL', ...args, visibility,
      ], {}, { parallelWorkers: 3 });
      assert.equal(options.parallel, 5);
      assert.equal(options.sites, 'ALL');
      assert.equal(options.products, 'ALL');
      assert.equal(options.headed, visibility === '--headed');
    });
  }
}

test('an explicit five-worker command overrides environment and configured defaults', () => {
  const options = parseOptions(['--parallel=5'], { npm_config_parallel: '3' }, { parallelWorkers: 4 });
  assert.equal(options.parallel, 5);
});

test('bare --parallel respects a configured five-worker default', () => {
  assert.equal(parseOptions(['--parallel'], {}, { parallelWorkers: 5 }).parallel, 5);
});

test('omitting --parallel leaves the default worker selection unchanged', () => {
  assert.equal(parseOptions([], {}, { parallelWorkers: 5 }).parallel, 0);
});

for (const value of ['0', '-1', '1.5', 'five']) {
  test(`invalid worker count ${value} fails instead of silently changing concurrency`, () => {
    assert.throws(() => parseOptions([`--parallel=${value}`]), /must be a positive integer/);
  });
}
