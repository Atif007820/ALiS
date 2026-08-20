import { loadProfiles } from '../../config/loadProfiles.js';

function hasProfileOverride(options) {
  return ['threads', 'rampUp', 'duration', 'loops']
    .some((key) => options[key] !== undefined);
}

export function resolveLoadSettings(options = {}) {
  const profileName = options.profile || process.env.PERF_PROFILE || null;
  const useProfileProperties = Boolean(profileName || hasProfileOverride(options));
  const baseProfile = profileName ? loadProfiles[profileName] : {};

  if (profileName && !baseProfile) {
    throw new Error(`Unknown load profile: ${profileName}. Available profiles: ${Object.keys(loadProfiles).join(', ')}`);
  }

  if (!useProfileProperties) {
    return {
      profileName: null,
      profile: null,
      profileApplied: false
    };
  }

  return {
    profileName,
    profile: {
      ...baseProfile,
      ...(options.threads !== undefined ? { threads: Number(options.threads) } : {}),
      ...(options.rampUp !== undefined ? { rampUp: Number(options.rampUp) } : {}),
      ...(options.duration !== undefined ? { duration: Number(options.duration) } : {}),
      ...(options.loops !== undefined ? { loops: Number(options.loops) } : {})
    },
    profileApplied: true
  };
}

export function buildJMeterProperties({ profile, extraProperties = {} }) {
  return {
    ...(profile || {}),
    ...extraProperties
  };
}
