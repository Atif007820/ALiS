export function addUserAnnotations(testInfo, userData) {
  if (!userData) return;

  const { firstName, lastName, loginName, entityName } = userData;
  if (firstName || lastName) {
    testInfo.annotations.push({
      type: 'Person',
      description: `${firstName ?? ''} ${lastName ?? ''}`.trim(),
    });
  }
  if (loginName) {
    testInfo.annotations.push({ type: 'Login Name', description: loginName });
  }
  if (entityName) {
    testInfo.annotations.push({ type: 'Entity', description: entityName });
  }
}

export function addApplyAnnotations(testInfo, { licenseType, conveyanceType }) {
  if (licenseType) {
    testInfo.annotations.push({ type: 'License Type', description: licenseType });
  }
  if (conveyanceType) {
    testInfo.annotations.push({ type: 'Conveyance Type', description: conveyanceType });
  }
}
