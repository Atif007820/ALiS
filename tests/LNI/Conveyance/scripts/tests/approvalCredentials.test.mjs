import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApprovalCredentials } from '../../config/approvalTransacNumber.js';

test('reads the configured approver credential pair', () => {
  const env = {
    CONVEYANCE_APPROVER_LOGIN_NAME: ' fixture-admin ',
    CONVEYANCE_APPROVER_PASSWORD: 'fixture-password',
  };
  assert.deepEqual(loadApprovalCredentials({ env }), { loginName: 'fixture-admin', password: 'fixture-password' });
});

test('requires a complete approver pair without disclosing credential values', () => {
  assert.throws(() => loadApprovalCredentials({ env: { CONVEYANCE_APPROVER_LOGIN_NAME: 'private-value' } }), error => {
    assert.match(error.message, /CONVEYANCE_APPROVER_LOGIN_NAME and CONVEYANCE_APPROVER_PASSWORD/);
    assert.doesNotMatch(error.message, /private-value/);
    return true;
  });
});
