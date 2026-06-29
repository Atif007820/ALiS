/**
 * annotations.js
 *
 * Helpers that attach structured metadata to a Playwright `testInfo` object.
 * These appear in the HTML report under "Parameters".
 */

import { BASE_URL, ENVIRONMENT_LABEL } from '../config/URL.js';
import { appConfig } from '../config/runConfig.js';

const ENVIRONMENT_ANNOTATION_TYPES = new Set(['Environment', 'Env URL', 'ENV URL']);

function upsertAnnotation(testInfo, type, description) {
  if (!description) return;

  const existing = testInfo.annotations.find((annotation) => annotation.type === type);
  if (existing) {
    existing.description = description;
    return;
  }

  testInfo.annotations.push({ type, description });
}

export function addEnvironmentAnnotations(testInfo) {
  const otherAnnotations = testInfo.annotations.filter(
    (annotation) => !ENVIRONMENT_ANNOTATION_TYPES.has(annotation.type)
  );

  testInfo.annotations.splice(
    0,
    testInfo.annotations.length,
    { type: 'Environment', description: ENVIRONMENT_LABEL },
    { type: 'ENV URL', description: BASE_URL },
    ...otherAnnotations
  );
}

/**
 * Attach registered-user details to the test report.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {{ firstName?: string, lastName?: string, loginName?: string, entityName?: string, ubi?: string }} userData
 */
export function addUserAnnotations(testInfo, userData) {
  if (!userData) return;

  addEnvironmentAnnotations(testInfo);

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
 * @param {{ licenseType?: string, conveyanceType?: string, typeName?: string }} selection
 */
export function addApplyAnnotations(testInfo, { licenseType, conveyanceType, typeName } = {}) {
  addEnvironmentAnnotations(testInfo);

  const resolvedLicenseType = licenseType || appConfig.licenseType;
  const resolvedTypeName = typeName || conveyanceType;

  upsertAnnotation(testInfo, 'License Type', resolvedLicenseType);
  upsertAnnotation(testInfo, 'Conveyance Type', resolvedTypeName);
}
