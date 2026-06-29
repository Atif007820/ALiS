export function addRegistrationAnnotations(testInfo, { site, product, user }) {
  pushUnique(testInfo, 'Environment', site.environment.name);
  pushUnique(testInfo, 'Environment Key', site.environment.key);
  pushUnique(testInfo, 'Site', annotationSiteName(site.displayName));
  pushUnique(testInfo, 'Site Key', site.key);
  pushUnique(testInfo, 'Login URL', site.loginUrl);
  pushUnique(testInfo, 'Product', product.name);
  pushUnique(testInfo, 'Product Key', product.key);

  if (user?.loginName) {
    pushUnique(testInfo, 'Login Name', user.loginName);
  }
  if (user?.entityName || user?.facilityName) {
    pushUnique(testInfo, 'Entity', user.entityName || user.facilityName);
  }
  if (user?.firstName || user?.lastName) {
    pushUnique(testInfo, 'Person', `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim());
  }
  if (user?.email) {
    pushUnique(testInfo, 'Email', user.email);
  }
}

function annotationSiteName(displayName) {
  return String(displayName || '')
    .replace(/\s+User Registration\s*$/i, '')
    .trim();
}

function pushUnique(testInfo, type, description) {
  if (!description) return;
  if (testInfo.annotations.some((annotation) => (
    annotation.type === type && annotation.description === description
  ))) return;

  testInfo.annotations.push({ type, description });
}
