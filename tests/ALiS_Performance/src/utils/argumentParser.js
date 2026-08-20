export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const withoutPrefix = token.slice(2);
    if (withoutPrefix.includes('=')) {
      const [key, ...rest] = withoutPrefix.split('=');
      args[key] = rest.join('=');
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[withoutPrefix] = next;
      index += 1;
    } else {
      args[withoutPrefix] = true;
    }
  }

  return args;
}

export function numericOverride(args, key) {
  if (args[key] === undefined || args[key] === '') return undefined;
  const value = Number(args[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for --${key}: ${args[key]}`);
  }
  return value;
}

export function profileOverrides(args) {
  return {
    threads: numericOverride(args, 'threads'),
    rampUp: numericOverride(args, 'ramp-up') ?? numericOverride(args, 'rampUp'),
    duration: numericOverride(args, 'duration'),
    loops: numericOverride(args, 'loops')
  };
}

export function jmeterPropertyOverrides(args) {
  const properties = {};
  for (const [key, value] of Object.entries(args)) {
    if (key.startsWith('J.')) {
      properties[key.slice(2)] = value;
    }
  }
  return properties;
}

export function scriptSelections(args) {
  const rawValue = args.scripts ?? args.script;
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    throw new Error('Missing required --script or --scripts value.');
  }

  const selections = String(rawValue)
    .split(/[;,\r\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = [];
  const seen = new Set();

  for (const selection of selections) {
    const key = selection.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(selection);
  }

  if (!unique.length) {
    throw new Error('No JMeter scripts were provided.');
  }
  return unique;
}

export function profileSelections(args) {
  const rawValue = args.profiles ?? args.profile;
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return [null];
  }

  const selections = String(rawValue)
    .split(/[;,\r\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = [];
  const seen = new Set();

  for (const selection of selections) {
    const key = selection.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(selection);
  }

  if (!unique.length) {
    throw new Error('No load profiles were provided.');
  }
  return unique;
}

export function resolveParallelWorkers(args, {
  parallelExecution = true,
  parallelWorkers = 1,
  scriptCount = 1
} = {}) {
  const count = Math.max(1, Math.floor(Number(scriptCount) || 1));
  const configuredWorkers = positiveInteger(parallelWorkers, 'parallelWorkers');
  const commandValue = args.parallel;

  if (commandValue === undefined) {
    return parallelExecution ? Math.min(configuredWorkers, count) : 1;
  }

  const normalized = String(commandValue).trim().toLowerCase();
  if (['false', 'off', 'no'].includes(normalized)) return 1;
  if (commandValue === true || ['true', 'on', 'yes'].includes(normalized)) {
    return Math.min(configuredWorkers, count);
  }

  return Math.min(positiveInteger(commandValue, '--parallel'), count);
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }
  return number;
}
