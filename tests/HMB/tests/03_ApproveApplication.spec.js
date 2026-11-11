import { test } from '../fixtures/hmb.fixture.js';
import { TransactionNumber, loadApprovalCredentials } from '../config/approvalTransacNumber.js';
import { addApprovalAnnotations } from '../utils/annotations.js';
import { resolveEntityNames } from '../utils/entityNames.js';
import { loadApprovalTransaction } from '../utils/transactionStore.js';
import { findRegisteredEntityNames } from '../utils/userStore.js';

// Avoid retaining the approver login form or privileged application details in artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('HMB - Approve Application', async ({ approvalPage }, testInfo) => {
  if (process.env.ALIS_ECLIPSE_MODE !== 'debug') test.setTimeout(300000);

  let application;
  let entity;
  let registeredNames;
  let status;
  try {
    application = await test.step('Load HMB transaction number', () =>
      loadApprovalTransaction(testInfo, { standaloneTransactionNumber: TransactionNumber }));

    await test.step('Sign in as approver and open HMB Work Queue', () =>
      approvalPage.openWorkQueue(loadApprovalCredentials()));

    entity = await test.step('Find and open the exact HMB transaction', () =>
      approvalPage.openTransaction(application));
    if (application.source === 'standalone') {
      registeredNames = await findRegisteredEntityNames(testInfo.project.name, {
        entityName: entity.legalName || entity.entityName,
      });
    }

    await test.step('Complete HMB checklist and approve application', () => approvalPage.reviewChecklist());
    status = 'Approved (APR)';
  } finally {
    const names = resolveEntityNames(resolveEntityNames(entity, application), registeredNames);
    addApprovalAnnotations(testInfo, {
      legalName: names.legalName || application?.entityName || entity?.entityName,
      dbaName: names.dbaName,
      transactionNumber: application?.transactionNumber,
      status,
    });
  }
});
