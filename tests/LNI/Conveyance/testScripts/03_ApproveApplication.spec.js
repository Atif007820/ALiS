import { test, addApprovalAnnotations, logger } from '../framework.js';
import { loadApprovalCredentials, TransactionNumber } from '../config/approvalTransacNumber.js';
import { loadApprovalTransaction } from '../utils/transactionStore.js';

// Artifacts could include the approver login form and privileged application data.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('Conveyance - Approve Application', async ({ approvalPage }, testInfo) => {
  const application = await test.step('Load application transaction number', () => {
    const target = loadApprovalTransaction(testInfo, {
      standaloneTransactionNumber: TransactionNumber,
    });
    addApprovalAnnotations(testInfo, target);
    logger.info('Approval transaction ' + target.transactionNumber);
    return target;
  });

  await test.step('Sign in as approver and open Conveyance Work Queue', async () => {
    await approvalPage.openWorkQueue(loadApprovalCredentials());
  });

  const entityName = await test.step('Pull and accept the application for review', async () => {
    const matchedEntity = await approvalPage.acceptApplication(application);
    addApprovalAnnotations(testInfo, { ...application, entityName: matchedEntity, status: 'Accepted (ACP)' });
    return matchedEntity;
  });

  await test.step('Pull and approve the accepted application', async () => {
    await approvalPage.approveApplication({ ...application, entityName });
    addApprovalAnnotations(testInfo, { ...application, entityName, status: 'Approved (APR)' });
    logger.success('Approved transaction ' + application.transactionNumber);
  });
});
