import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editableData } from '../../config/editableData.js';
import { buildEntityName, createEntityNameGenerator } from '../../utils/randomData.js';

test('every BU generates a name ending exactly at its local timestamp', async () => {
  const timestamp = new Date(2026, 9, 19, 13, 20, 31);
  for (const businessUnit of Object.values(editableData.businessUnits)) {
    const generate = createEntityNameGenerator({ now: () => timestamp });
    assert.equal(await generate(businessUnit.entityPrefix), `${businessUnit.entityPrefix}_19-10-2026_01:20:31 PM`);
  }
});

test('default generator returns a timestamp-only name', async () => {
  assert.match(await buildEntityName(), /^ENTITY_\d{2}-\d{2}-\d{4}_\d{2}:\d{2}:\d{2} (AM|PM)$/);
});

test('midnight, noon and single-digit dates and times are formatted correctly', async () => {
  for (const [date, expected] of [
    [new Date(2026, 0, 2, 0, 3, 4), 'HF_02-01-2026_12:03:04 AM'],
    [new Date(2026, 0, 2, 12, 3, 4), 'HF_02-01-2026_12:03:04 PM'],
    [new Date(2026, 0, 2, 1, 3, 4), 'HF_02-01-2026_01:03:04 AM'],
    [new Date(2026, 0, 2, 23, 3, 4), 'HF_02-01-2026_11:03:04 PM'],
  ]) {
    const generate = createEntityNameGenerator({ now: () => date });
    assert.equal(await generate('HF'), expected);
  }
});

test('five simultaneous same-prefix jobs wait for real clock changes without suffixes', async () => {
  let clock = new Date(2026, 9, 19, 13, 20, 31, 250);
  let sleepers = [];
  const generated = [];
  const generate = createEntityNameGenerator({
    now: () => clock,
    wait: (ms) => new Promise((resolve) => sleepers.push({ ms, resolve })),
  });
  const pending = Promise.all(Array.from({ length: 5 }, async () => {
    const name = await generate('HLS');
    generated.push(name);
    return name;
  }));

  await Promise.resolve();
  assert.deepEqual(generated, ['HLS_19-10-2026_01:20:31 PM']);
  assert.equal(sleepers.length, 4);
  assert.equal(sleepers.every(({ ms }) => ms === 750), true);

  for (let second = 32; second <= 35; second += 1) {
    clock = new Date(2026, 9, 19, 13, 20, second);
    const ready = sleepers;
    sleepers = [];
    ready.forEach(({ resolve }) => resolve());
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(generated.length, second - 30);
    assert.equal(generated.at(-1), `HLS_19-10-2026_01:20:${second} PM`);
  }

  const names = await pending;
  assert.equal(new Set(names).size, 5);
  assert.equal(sleepers.length, 0);
});

test('different prefixes can share a timestamp without waiting', async () => {
  const generate = createEntityNameGenerator({
    now: () => new Date(2026, 9, 19, 13, 20, 31),
    wait: () => assert.fail('different prefixes must not wait'),
  });
  assert.deepEqual(await Promise.all(['HLS', 'CL', 'RPM'].map((prefix) => generate(prefix))), [
    'HLS_19-10-2026_01:20:31 PM',
    'CL_19-10-2026_01:20:31 PM',
    'RPM_19-10-2026_01:20:31 PM',
  ]);
});

test('duplicate names roll over to the next day and year using the real clock', async () => {
  let clock = new Date(2026, 11, 31, 23, 59, 59, 999);
  const generate = createEntityNameGenerator({
    now: () => clock,
    wait: async (ms) => {
      assert.equal(ms, 1);
      clock = new Date(2027, 0, 1, 0, 0, 0);
    },
  });
  assert.equal(await generate('HMB'), 'HMB_31-12-2026_11:59:59 PM');
  assert.equal(await generate('HMB'), 'HMB_01-01-2027_12:00:00 AM');
});

test('clock rollback cannot reuse any previously allocated name in this runner', async () => {
  let clock = new Date(2026, 9, 19, 13, 20, 31);
  const generate = createEntityNameGenerator({
    now: () => clock,
    wait: async (ms) => { clock = new Date(clock.getTime() + ms); },
  });
  assert.equal(await generate('HF'), 'HF_19-10-2026_01:20:31 PM');
  clock = new Date(2026, 9, 19, 13, 20, 32);
  assert.equal(await generate('HF'), 'HF_19-10-2026_01:20:32 PM');
  clock = new Date(2026, 9, 19, 13, 20, 31);
  assert.equal(await generate('HF'), 'HF_19-10-2026_01:20:33 PM');
});

test('a frozen clock fails after bounded collision checks instead of hanging', async () => {
  let waits = 0;
  const generate = createEntityNameGenerator({
    now: () => new Date(2026, 9, 19, 13, 20, 31),
    wait: async () => { waits += 1; },
  });
  await generate('HF');
  await assert.rejects(() => generate('HF'), /unique timestamp-only entity name.*60 checks/);
  assert.equal(waits, 59);
});

test('invalid prefixes and dates fail before allocating a name', async () => {
  const generate = createEntityNameGenerator();
  for (const prefix of ['', ' ', null, 1]) {
    await assert.rejects(() => generate(prefix), /non-empty string/);
  }
  const invalidClock = createEntityNameGenerator({ now: () => new Date('invalid') });
  await assert.rejects(() => invalidClock('HLS'), /invalid clock date/);
});
