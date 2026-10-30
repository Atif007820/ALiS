export const ROLE_OPTIONS = ['CNTRADM'];
export const ENTITY_ROLES = ['OWN', 'LPC', 'PRT', 'BDC'];
export const COUNTRIES = ['US'];

export const US_STATES = [
  'AL', 'AK', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'FM', 'GA', 'GU', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MH', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'MP', 'OH',
  'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
  'VT', 'VA', 'WV', 'WI', 'WY',
];

export const US_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
  'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston',
  'Miami', 'Minneapolis', 'Portland', 'Atlanta', 'Las Vegas',
  'Brooklyn', 'Detroit', 'New Orleans', 'Memphis', 'Nashville',
];

export const RESIDENTIAL_ENDORSEMENT_TYPES = Object.freeze({
  ORC: 'OTHER RESIDENTIAL CONVEYANCE',
  RD: 'RESIDENTIAL DUMBWAITER',
  RE: 'RESIDENTIAL ELEVATOR',
  RIC: 'RESIDENTIAL INCLINED CHAIR',
  RIE: 'RESIDENTIAL INCLINED ELEVATOR',
  RPV: 'RESIDENTIAL PNEUMATIC VACUUM',
  RVPL: 'RESIDENTIAL VERTICAL PLATFORM LIFT',
  RIPL: 'RESIDENTIAL INCLINED PLATFORM LIFT',
});

export const COMMERCIAL_ENDORSEMENT_TYPES = Object.freeze({
  FC: 'FREIGHT CABLE',
  FH: 'FREIGHT HYDRAULIC',
  FRHE: 'FREIGHT ROPED HYDRAULIC ELEVATOR',
  IE: 'INCLINED ELEVATOR',
  LULA: 'LIMITED-USE/LIMITED-APPLICATION (LULA)',
  PC: 'PASSENGER CABLE',
  PH: 'PASSENGER HYDRAULIC',
  PRHE: 'PASSENGER ROPED HYDRAULIC ELEVATOR',
  BML: 'BELT MAN LIFT',
  DOTR: 'DUMBWAITER IN OTHER THAN RESIDENCE',
  HPFE: 'HAND POWERED FREIGHT ELEVATOR',
  HPML: 'HAND POWERED MAN LIFT',
  IPL: 'INCLINED PLATFORM LIFT',
  ISCL: 'INCLINED STAIR CHAIR LIFT',
  RL: 'RELOCATABLE LIFT',
  SE: 'SIDEWALK ELEVATOR',
  SP: 'SPECIAL PURPOSE',
  TYPEAML: 'TYPE A MATERIAL LIFT',
  TYPEBML: 'TYPE B MATERIAL LIFT',
  VPL: 'VERTICAL PLATFORM LIFT',
  WACML: 'WAC MATERIAL LIFT',
  ESC: 'ESCALATOR',
  MW: 'MOVING WALK',
  PASS: 'PASSENGER',
});

const ENDORSEMENT_CODE_ALIASES = Object.freeze({
  RESIDENTIAL: Object.freeze({ RC: 'ORC' }),
  COMMERCIAL: Object.freeze({}),
});

export const RESIDENTIAL_CONVEYANCE_TYPES = Object.values(RESIDENTIAL_ENDORSEMENT_TYPES);
export const COMM_CONVEYANCE_TYPES = Object.values(COMMERCIAL_ENDORSEMENT_TYPES);

export function normalizeEndorsementCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[-_\s]+/g, '');
}

export function endorsementCodesForLicense(licenseType) {
  return Object.keys(endorsementTypesForLicense(licenseType));
}

export function resolveEndorsementSelection(licenseType, value) {
  const requestedCode = normalizeEndorsementCode(value);
  if (!requestedCode) return null;

  const normalizedLicenseType = String(licenseType || '').trim().toUpperCase();
  const types = endorsementTypesForLicense(normalizedLicenseType);
  const canonicalCode = ENDORSEMENT_CODE_ALIASES[normalizedLicenseType]?.[requestedCode]
    ?? requestedCode;
  const conveyanceType = types[canonicalCode];

  return conveyanceType ? { code: canonicalCode, conveyanceType } : null;
}

export function endorsementCodeForConveyance(licenseType, conveyanceType) {
  return Object.entries(endorsementTypesForLicense(licenseType))
    .find(([, configuredType]) => configuredType === conveyanceType)?.[0] ?? '';
}

function endorsementTypesForLicense(licenseType) {
  const normalizedLicenseType = String(licenseType || '').trim().toUpperCase();
  if (normalizedLicenseType === 'RESIDENTIAL') return RESIDENTIAL_ENDORSEMENT_TYPES;
  if (normalizedLicenseType === 'COMMERCIAL') return COMMERCIAL_ENDORSEMENT_TYPES;
  throw new Error(`Unsupported license type "${licenseType}" for endorsement lookup.`);
}

export const MACHINE_TYPES = [
  'Winding Drum', 'Screw Drive', 'Pneumatic', 'GearLess', 'Scissor',
  'Hydraulic', 'Geared', 'Friction', 'Roped Hydraulic', 'Hand Powered',
  'Rack and Pinion',
];

export const FEATURE_CHECKBOXES = [
  'Emergency Power',
  'Automatic Battery Lowering',
  'Emergency Lowering Means',
  'Security System',
  'Fire Service Phase 1',
  'Fire Service Phase 2',
];

export const INTERIOR_TYPE_CODES = ['METS', 'FLOM', 'WOOD', 'LAMG', 'OTHR'];
export const GOVERNOR_TYPE_CAR_CODES = ['BAIL', 'CENT', 'FLYB', 'HORZ', 'OTHR'];
export const GOVERNOR_TYPE_COUNTERWEIGHT_CODES = ['BAIL', 'CENT', 'FLYB', 'FRIC', 'OTHR'];
export const ROPE_TYPE_CODES = ['M', 'I', 'S'];
export const COUNTERWEIGHT_ROPE_TYPE_CODES = ['M', 'I', 'S', 'KC', 'AM'];
