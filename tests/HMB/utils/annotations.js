import { URLS } from '../config/urls.js';
import { registrationEntityNames } from './entityNames.js';

export function addRegistrationAnnotations(testInfo, user) {
  addAnnotations(testInfo, registrationEntityNames(user), [
    ['Login Name', user.loginName],
    ['HMB Code', user.hmbCode],
  ]);
}

export function addApplicationAnnotations(testInfo, result, user = {}) {
  addAnnotations(testInfo, result, [
    ['Login Name', user.loginName],
    ['Personnel Documents Uploaded', result.personnelDocumentsUploaded],
    ['Mandatory Documents Uploaded', result.mandatoryDocumentsUploaded],
    ['Transaction Number', result.transactionNumber],
    ['Submitted', result.submitted],
  ]);
}

export function addApprovalAnnotations(testInfo, { legalName, dbaName, transactionNumber, status }) {
  addAnnotations(testInfo, { legalName, dbaName }, [
    ['Transaction Number', transactionNumber],
    ['Application Status', status],
  ]);
}

function addAnnotations(testInfo, { legalName, dbaName }, fields) {
  const entries = [
    ['URL', URLS.loginUrl],
    ['Entity Name (Legal Name)', legalName],
    ['Entity Name (DBA Name)', dbaName],
    ...fields,
  ];
  for (const [type, value] of entries) {
    testInfo.annotations.push({ type, description: String(value ?? '').trim() || 'Not captured' });
  }
}
