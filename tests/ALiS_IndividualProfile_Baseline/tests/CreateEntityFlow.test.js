import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCreateSaveState,
  findCreateValidationRecoveryRule,
} from '../flows/CreateEntityFlow.js';

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
