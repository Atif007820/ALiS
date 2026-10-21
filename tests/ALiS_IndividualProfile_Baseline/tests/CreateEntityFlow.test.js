import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCreateSaveState,
  findCreateValidationRecoveryRule,
} from '../flows/CreateEntityFlow.js';
import { isClosedPageError } from '../utils/pageGuards.js';

test('classifyCreateSaveState recognizes the license credential validation message', () => {
  const state = classifyCreateSaveState('Please review following errors and correct them. License/Credential information details', '/protected/lic/doe/individualprofile.aspx');

  assert.deepEqual(state, {
    status: 'validation',
    message: 'License/Credential information details',
  });
});

test('classifyCreateSaveState treats a standalone license credential message as recoverable validation', () => {
  const state = classifyCreateSaveState('License/Credential information details', '/protected/lic/doe/individualprofile.aspx');

  assert.deepEqual(state, {
    status: 'validation',
    message: 'License/Credential information details',
  });
});

test('findCreateValidationRecoveryRule finds the configured credential recovery rule', () => {
  const rule = findCreateValidationRecoveryRule([
    { messagePattern: 'License/Credential information details', actions: [{ type: 'popupFromLink' }] },
  ], 'Please provide License/Credential information details.');

  assert.equal(rule?.actions[0]?.type, 'popupFromLink');
});

test('duplicate API validation is reported as validation, not an unconfirmed Save', () => {
  assert.deepEqual(classifyCreateSaveState('New Individual Provided API# already exists, API# must be unique.', '/IndividualProfile.aspx'), {
    status: 'validation', message: 'Provided API# already exists, API# must be unique.',
  });
});

test('visible server validation messages are preserved instead of silently waiting for Save', () => {
  assert.deepEqual(classifyCreateSaveState('New Individual', '/IndividualProfile.aspx', true, '  Business rule rejected this profile. '), {
    status: 'validation', message: 'Business rule rejected this profile.',
  });
});

test('framework page-close guards retain the same bounded retry classification as Playwright errors', () => {
  assert.equal(isClosedPageError('Target page was closed before waiting for app idle.'), true);
  assert.equal(isClosedPageError('Target page, context or browser has been closed'), true);
  assert.equal(isClosedPageError('Provided API# already exists'), false);
  assert.equal(isClosedPageError('HTTP 500'), false);
});
