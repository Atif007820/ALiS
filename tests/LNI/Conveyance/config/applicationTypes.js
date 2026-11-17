import { randomInt } from 'node:crypto';
import { endorsementCodesForLicense, resolveEndorsementSelection } from './constants.js';

export const APPLICATION_TYPES = Object.freeze({
  NCI: {
    label: 'New Conveyance Installation',
    radio: 'New Conveyance Installation',
    supportsVariance: true,
    permits: {
      Res: { label: 'RESIDENTIAL CONVEYANCE - NEW INSTALLATION', radioIndex: 0, endorsementFor: 'RESIDENTIAL', override: 'ResType' },
      Comm: { label: 'COMMERCIAL CONVEYANCE - NEW INSTALLATION', radioIndex: 1, endorsementFor: 'COMMERCIAL', override: 'CommType' },
    },
  },
  CHI: {
    label: 'Construction Hoist Installation',
    radio: /^(?:Construction Hoist|Construction Hoist Installation)$/i,
    supportsVariance: true,
    permits: {
      'CPH(A10.4)': { label: 'Construction Personnel Hoist (A10.4) - New Installation', radioIndex: 0 },
      'CMH(A10.5)': {
        label: 'Construction Material Hoist (A10.5) - New Installation',
        radio: /^Construction Material Hoist \(A10\.5\)\s*-\s*New Installation$/i,
        radioIndex: 1,
      },
    },
  },
  CV: { label: 'Conveyance Variance', radio: 'Conveyance Variance' },
});

function selectionKeys(value, keys, option) {
  const tokens = String(value).split(',').map(token => token.trim().toUpperCase());
  if (tokens.length === 1 && tokens[0] === 'ALL') return keys;
  const selected = tokens.map(token => {
    const key = keys.find(candidate => candidate.toUpperCase() === token);
    if (!key) throw new Error(`Unsupported ${option} "${token}". Use ${keys.join(', ')} or ALL.`);
    return key;
  });
  return [...new Set(selected)];
}

function endorsementSelections(permit, value) {
  if (!permit.endorsementFor || !String(value ?? '').trim()) return [null];
  const codes = endorsementCodesForLicense(permit.endorsementFor);
  const requested = String(value).trim().toUpperCase() === 'ALL' ? codes : String(value).split(',');
  const selections = new Map();
  for (const code of requested) {
    const endorsement = resolveEndorsementSelection(permit.endorsementFor, code);
    if (!endorsement) {
      throw new Error(`Unsupported ${permit.override} "${code.trim()}". Use ${codes.join(', ')} or ALL.`);
    }
    selections.set(endorsement.code, endorsement);
  }
  return [...selections.values()];
}

export function buildApplicationTargets({ AppType = 'NCI', PerType = 'ALL', ResType, CommType } = {}) {
  const applications = selectionKeys(AppType, Object.keys(APPLICATION_TYPES), 'AppType');
  const permitKeys = applications.flatMap(key => Object.keys(APPLICATION_TYPES[key].permits ?? {}));
  if (!permitKeys.length && String(PerType).trim().toUpperCase() !== 'ALL') {
    throw new Error('Conveyance Variance does not use PerType. Omit it or use --PerType=ALL.');
  }
  const permits = selectionKeys(PerType, permitKeys, `PerType for ${applications.join(', ')}`);
  const overrides = { ResType, CommType };

  return applications.flatMap(appType => {
    const application = APPLICATION_TYPES[appType];
    if (!application.permits) {
      const key = appType.toLowerCase();
      return [{ appType, perType: '', application, permit: null, endorsement: null, key, label: appType, slug: key }];
    }
    const selected = Object.entries(application.permits).filter(([key]) => permits.includes(key));
    if (!selected.length) {
      throw new Error(`No PerType selected for AppType ${appType}. Use ${Object.keys(application.permits).join(', ')} or ALL.`);
    }
    return selected.flatMap(([perType, permit]) => endorsementSelections(permit, overrides[permit.override]).map(endorsement => {
      const suffix = permit.endorsementFor ? (endorsement?.code ?? 'RANDOM') : '';
      const key = [appType, perType].join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      return {
        appType, perType, application, permit, endorsement, key,
        label: [appType, perType, suffix].filter(Boolean).join(' / '),
        slug: [key, suffix.toLowerCase()].filter(Boolean).join('-'),
      };
    }));
  });
}

export const INSTALLATION_APP_TYPES = Object.keys(APPLICATION_TYPES).filter(key => APPLICATION_TYPES[key].permits);
export const VARIANCE_INSTALLATION_APP_TYPES = INSTALLATION_APP_TYPES
  .filter(key => APPLICATION_TYPES[key].supportsVariance);

export function selectInstallationTargets(selection = {}, settings = {}, {
  appTypes = INSTALLATION_APP_TYPES,
  pickIndex = randomInt,
} = {}) {
  const app = String(selection.AppType ?? settings.AppType ?? '').trim();
  const permit = String(selection.PerType ?? settings.PerType ?? '').trim();
  const overrides = {
    ResType: selection.ResType ?? settings.ResType,
    CommType: selection.CommType ?? settings.CommType,
  };
  const requestedApps = selectionKeys(app || 'ALL', appTypes, 'installation AppType');
  const keysFor = key => Object.keys(APPLICATION_TYPES[key].permits);
  const useAllApps = /^ALL$/i.test(app);
  const inheritedPermit = !useAllApps && selection.PerType == null && selection.AppType != null;
  const permitScope = inheritedPermit ? INSTALLATION_APP_TYPES : requestedApps;
  const requestedPermits = selectionKeys(permit || 'ALL', permitScope.flatMap(keysFor), 'installation PerType');
  const useAllPermits = /^ALL$/i.test(permit);

  let choices = requestedApps.map(key => {
    const matching = keysFor(key).filter(value => requestedPermits.includes(value));
    return { key, permits: matching.length || !inheritedPermit ? matching : keysFor(key), randomPermit: !permit || !matching.length };
  });
  if (app && !useAllApps) {
    const invalid = choices.find(choice => !choice.permits.length);
    if (invalid) throw new Error(`No PerType selected for AppType ${invalid.key}. Use ${keysFor(invalid.key).join(', ')} or ALL.`);
  } else {
    choices = choices.filter(choice => choice.permits.length);
    if (!app && (!permit || useAllPermits)) {
      const preferred = !permit ? choices.filter(({ key, permits }) => permits.some(value => (
        String(overrides[APPLICATION_TYPES[key].permits[value].override] ?? '').trim()
      ))) : [];
      const pool = preferred.length ? preferred : choices;
      choices = [pool[pickIndex(pool.length)]];
    }
  }

  return choices.flatMap(({ key, permits, randomPermit }) => {
    if (randomPermit) {
      const preferred = permits.filter(value => String(overrides[APPLICATION_TYPES[key].permits[value].override] ?? '').trim());
      const pool = preferred.length ? preferred : permits;
      permits = [pool[pickIndex(pool.length)]];
    }
    return buildApplicationTargets({ ...overrides, AppType: key, PerType: permits.join(',') });
  });
}
