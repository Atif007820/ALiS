export function createExecutionJobs(scripts, profiles) {
  if (!Array.isArray(scripts) || scripts.length === 0) return [];
  const selectedProfiles = Array.isArray(profiles) && profiles.length ? profiles : [null];

  return scripts.flatMap((scriptName) => selectedProfiles.map((profileName) => ({
    scriptName,
    profileName
  })));
}

export function executionJobLabel({ scriptName, profileName }) {
  return profileName ? `${scriptName} [${profileName}]` : scriptName;
}
