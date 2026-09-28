export function parseOptions(args, env = {}, settings = {}) {
  const values = {
    sites: env.SITES || env.npm_config_site || env.npm_config_sites,
    products: env.PRODUCTS || env.npm_config_product || env.npm_config_products,
    headed: env.npm_config_headed,
    list: env.npm_config_list ?? false,
    parallel: env.npm_config_parallel,
    project: env.npm_config_project,
  };
  const aliases = { site: 'sites', sites: 'sites', product: 'products', products: 'products' };

  for (let index = 0; index < args.length; index += 1) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(args[index]);
    if (!match) throw new Error(`Unexpected argument "${args[index]}". Use npm run sidebar -- --site=NVRCP --product=1.`);
    const [, name, inline] = match;

    if (name === 'headed' || name === 'list' || name === 'headless') {
      const value = boolean(inline ?? true, name);
      values[name === 'headless' ? 'headed' : name] = name === 'headless' ? !value : value;
      continue;
    }
    if (aliases[name]) {
      const parts = inline === undefined ? [] : [inline];
      while (index + 1 < args.length && !args[index + 1].startsWith('--')) parts.push(args[++index]);
      const value = parts.join(' ').trim();
      if (!value) throw new Error(`--${name} needs a value.`);
      values[aliases[name]] = value;
      continue;
    }
    if (name === 'parallel' || name === 'project') {
      let value = inline;
      if (value === undefined && args[index + 1] && !args[index + 1].startsWith('--')) value = args[++index];
      if (name === 'parallel' && value === undefined) value = true;
      if (value === undefined || value === '') throw new Error(`--${name} needs a value.`);
      values[name] = value;
      continue;
    }
    throw new Error(`Unknown option --${name}. Supported: --site, --product, --headed, --headless, --project, --parallel, --list.`);
  }

  const parallel = values.parallel === undefined ? 0 : positiveInteger(
    values.parallel === true || values.parallel === 'true' ? settings.parallelWorkers ?? 3 : values.parallel,
    '--parallel / runSettings.parallelWorkers',
  );
  return {
    sites: values.sites === undefined ? undefined : cleanSelection(values.sites, 'site'),
    products: values.products === undefined ? undefined : cleanSelection(values.products, 'product'),
    headed: values.headed === undefined ? undefined : boolean(values.headed, 'headed'),
    list: boolean(values.list, 'list'),
    parallel,
    project: String(values.project || '').trim(),
  };
}

function cleanSelection(value, kind) {
  let raw = String(value).trim();
  if (kind === 'product') raw = raw.replace(/\bproduct\s*(\d+)\b/gi, '$1');
  const separator = kind === 'site' || /^[\d\s,]+$/.test(raw) ? /[,\s]+/ : ',';
  const parts = raw.split(separator).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error(`--${kind} needs a value.`);
  return [...new Set(parts)].join(',');
}

function positiveInteger(value, name) {
  const raw = String(value).trim();
  const number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function boolean(value, name) {
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error(`--${name} must be true or false.`);
}
