export function resolveExistingProfileName(businessUnit, { flow, entityName } = {}) {
  const text = String(entityName || '').trim();
  if (!text) {
    return String(flow) === '4'
      ? businessUnit.flow4ProfileName || businessUnit.flow2ProfileName
      : businessUnit.flow2ProfileName;
  }
  const commaParts = text.split(',').map((item) => item.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return { lastName: commaParts[0], firstName: commaParts[1] };
  }
  const [firstName, ...lastName] = text.split(/\s+/);
  return { firstName, lastName: lastName.join(' ') };
}

export function profileRuntimeKey({ flow, environment, businessUnit, credentials, entityName }) {
  const url = new URL(environment.loginUrl);
  const portal = `${url.origin}${url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)}`.toLowerCase();
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (['1', '3'].includes(String(flow))) {
    return JSON.stringify([portal, 'individual-create', normalize(credentials.username)]);
  }
  const profile = resolveExistingProfileName(businessUnit, { flow, entityName });
  if (!profile?.firstName || !profile?.lastName) {
    throw new Error(`First Name and Last Name are required for Flow ${flow} profile locking.`);
  }
  return JSON.stringify([portal, 'individual', normalize(profile.firstName), normalize(profile.lastName)]);
}
