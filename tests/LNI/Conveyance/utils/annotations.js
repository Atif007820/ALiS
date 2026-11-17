/**
 * annotations.js
 *
 * Helpers that attach structured metadata to a Playwright `testInfo` object.
 * These appear in the HTML report under "Parameters".
 */

import { LOGIN_URL } from '../config/URL.js';
import { getApplicationTarget } from '../config/runConfig.js';

function upsertAnnotation(testInfo, type, description) {
  if (!description) return;

  const existing = testInfo.annotations.find((annotation) => annotation.type === type);
  if (existing) {
    existing.description = description;
    return;
  }

  testInfo.annotations.push({ type, description });
}

function addRunAnnotations(testInfo, applicationType) {
  upsertAnnotation(testInfo, 'Login URL', LOGIN_URL);
  if (applicationType) {
    upsertAnnotation(testInfo, 'Application Type', applicationType);
    return;
  }
  const { application, permit } = getApplicationTarget();
  upsertAnnotation(testInfo, 'Application Type', application.label);
  upsertAnnotation(testInfo, 'Permit Type', permit?.label);
}

/**
 * Attach registered-user details to the test report.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {{ firstName?: string, lastName?: string, loginName?: string, entityName?: string, ubi?: string }} userData
 */
export function addUserAnnotations(testInfo, userData) {
  if (!userData) return;

  addRunAnnotations(testInfo);

  const { firstName, lastName, loginName, entityName, ubi } = userData;

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
  if (ubi) {
    testInfo.annotations.push({ type: 'UBI', description: ubi });
  }
}

/**
 * Attach permit-application details to the test report.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {{ conveyanceType?: string, endorsementCode?: string, transactionNumber?: string }} selection
 */
export function addApplyAnnotations(testInfo, {
  applicationType,
  conveyanceType,
  endorsementCode,
  transactionNumber,
  conveyanceNumber,
  installationTransactionNumber,
} = {}) {
  addRunAnnotations(testInfo, applicationType);
  upsertAnnotation(testInfo, 'Endorsement Code', endorsementCode);
  upsertAnnotation(testInfo, 'Conveyance Type', conveyanceType);
  upsertAnnotation(testInfo, 'Transaction Number', transactionNumber);
  upsertAnnotation(testInfo, 'Conveyance #', conveyanceNumber);
  upsertAnnotation(testInfo, 'Installation Transaction Number', installationTransactionNumber);
}

export function addApprovalAnnotations(testInfo, { entityName, status, ...selection } = {}) {
  addApplyAnnotations(testInfo, selection);
  upsertAnnotation(testInfo, 'Entity', entityName);
  upsertAnnotation(testInfo, 'Application Status', status);
}
