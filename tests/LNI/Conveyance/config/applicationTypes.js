import { endorsementCodesForLicense, resolveEndorsementSelection } from './constants.js';

export const APPLICATION_TYPES = Object.freeze({
  NCI: {
    label: 'New Conveyance Installation',
    radio: 'New Conveyance Installation',
    permits: {
      Res: { label: 'RESIDENTIAL CONVEYANCE - NEW INSTALLATION', radioIndex: 0, endorsementFor: 'RESIDENTIAL', override: 'ResType' },
      Comm: { label: 'COMMERCIAL CONVEYANCE - NEW INSTALLATION', radioIndex: 1, endorsementFor: 'COMMERCIAL', override: 'CommType' },
    },
  },
  CHI: {
    label: 'Construction Hoist Installation',
    radio: /^(?:Construction Hoist|Construction Hoist Installation)$/i,
    permits: {
      'CPH(A10.4)': { label: 'Construction Personnel Hoist (A10.4) - New Installation', radioIndex: 0 },
      'CMH(A10.5)': {
        label: 'Construction Material Hoist (A10.5) - New Installation',
        radio: /^Construction Material Hoist \(A10\.5\)\s*-\s*New Installation$/i,
        radioIndex: 1,
      },
    },
  },
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
  const permitKeys = applications.flatMap(key => Object.keys(APPLICATION_TYPES[key].permits));
  const permits = selectionKeys(PerType, permitKeys, `PerType for ${applications.join(', ')}`);
  const overrides = { ResType, CommType };

  return applications.flatMap(appType => {
    const application = APPLICATION_TYPES[appType];
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
