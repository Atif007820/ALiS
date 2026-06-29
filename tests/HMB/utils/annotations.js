export function addRegistrationAnnotations(testInfo, user) {
  testInfo.annotations.push(
    { type: 'Entity Name', description: user.entityName },
    { type: 'Login Name', description: user.loginName },
    { type: 'HMB Code', description: user.hmbCode || 'Not captured' },
  );
}

export function addApplicationAnnotations(testInfo, result, user = {}) {
  testInfo.annotations.push(
    { type: 'Login Name', description: user.loginName || 'Not captured' },
    { type: 'Entity Name', description: user.entityName || 'Not captured' },
    { type: 'Transaction Number', description: result.transactionNumber || 'Not captured' },
    { type: 'Personnel Documents Uploaded', description: String(result.personnelDocumentsUploaded) },
    { type: 'Mandatory Documents Uploaded', description: String(result.mandatoryDocumentsUploaded) },
    { type: 'Submitted', description: String(result.submitted) },
  );
}
