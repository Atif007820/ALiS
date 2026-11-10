export function registrationEntityNames(user) {
  return {
    legalName: user?.entityName,
    // Registrations saved before DBA was tracked used the same value for both fields.
    dbaName: user?.dbaName || user?.entityName,
  };
}

export function resolveEntityNames(entity = {}, fallback = {}) {
  return {
    legalName: capturedName(entity.legalName) || capturedName(fallback.legalName),
    dbaName: capturedName(entity.dbaName) || capturedName(fallback.dbaName),
  };
}

function capturedName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return /^not captured$/i.test(name) ? '' : name;
}

export async function readEntityNames(scope) {
  const [legalName, dbaName] = await Promise.all([
    readNameField(scope, /^(?:Entity Name \(Legal Name\)|Legal Name)\s*[:*]?$/i),
    readNameField(scope, /^(?:Entity Name \(DBA Name\)|DBA Name|Doing Business As)\s*[:*]?$/i),
  ]);
  return { legalName, dbaName };
}

async function readNameField(scope, name) {
  const field = scope.getByRole('textbox', { name }).filter({ visible: true });
  if (await field.count() !== 1) return '';
  return capturedName(await field.inputValue({ timeout: 1000 }).catch(() => ''));
}
