import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApprovalCredentials } from '../../config/approvalTransacNumber.js';

test('uses complete environment-specific approver credentials before shared credentials', () => {
  assert.deepEqual(loadApprovalCredentials('TEST', {
    env: {
      CONVEYANCE_APPROVER_LOGIN_NAME_TEST: 'test-admin',
      CONVEYANCE_APPROVER_PASSWORD_TEST: 'test-only-secret',
      CONVEYANCE_APPROVER_LOGIN_NAME: 'shared-admin',
      CONVEYANCE_APPROVER_PASSWORD: 'shared-only-secret',
    },
  }), { loginName: 'test-admin', password: 'test-only-secret' });
});

test('falls back to a complete shared pair when environment-specific values are partial', () => {
  assert.deepEqual(loadApprovalCredentials('PREPROD', {
    env: {
      CONVEYANCE_APPROVER_LOGIN_NAME_PREPROD: 'partial-admin',
      CONVEYANCE_APPROVER_PASSWORD_PREPROD: '',
      CONVEYANCE_APPROVER_LOGIN_NAME: 'shared-admin',
      CONVEYANCE_APPROVER_PASSWORD: 'shared-only-secret',
    },
  }), { loginName: 'shared-admin', password: 'shared-only-secret' });
});

test('reports the accepted credential pairs without exposing credential values', () => {
  assert.throws(() => loadApprovalCredentials('PROD', { env: {} }), (error) => {
    assert.match(error.message, /CONVEYANCE_APPROVER_LOGIN_NAME_PROD/);
    assert.match(error.message, /CONVEYANCE_APPROVER_PASSWORD_PROD/);
    assert.match(error.message, /CONVEYANCE_APPROVER_LOGIN_NAME/);
    assert.match(error.message, /CONVEYANCE_APPROVER_PASSWORD/);
    assert.doesNotMatch(error.message, /secret|admin/i);
    return true;
  });
});
