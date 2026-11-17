import { test, addApprovalAnnotations, getApplicationTarget, logger } from '../framework.js';
import { loadApprovalCredentials } from '../config/approvalTransacNumber.js';
import { loadApprovalTransaction, normalizeTransactionNumber, saveApprovedInstallation } from '../utils/transactionStore.js';

// Artifacts could include the approver login form and privileged application data.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const approvalOnly = process.env.CONVEYANCE_APPROVAL_ONLY_TRANSACTION;
const isVariance = !approvalOnly && getApplicationTarget().appType === 'CV';
const installationForVariance = process.env.CONVEYANCE_CV_PHASE === 'installation';

test(isVariance ? 'Conveyance - Approve Variance' : 'Conveyance - Approve Application', async ({ approvalPage }, testInfo) => {
  if (approvalOnly) {
    const transactionNumber = normalizeTransactionNumber(approvalOnly);
    testInfo.annotations.push({ type: 'Transaction Number', description: transactionNumber });
    await test.step('Sign in as approver and open Conveyance Work Queue', () => approvalPage.openWorkQueue(loadApprovalCredentials()));
    await test.step('Read and approve the exact Work Queue transaction', async () => {
      const result = await approvalPage.approveExistingTransaction(transactionNumber);
      addApprovalAnnotations(testInfo, { ...result, status: 'Approved (APR)' });
      logger.success(result.alreadyApproved ? `Transaction ${transactionNumber} is already approved` : `Approved transaction ${transactionNumber}`);
    });
    return;
  }
  const application = await test.step('Load application transaction number', () => {
    const target = loadApprovalTransaction(testInfo);
    addApprovalAnnotations(testInfo, target);
    logger.info('Approval transaction ' + target.transactionNumber);
    return target;
  });

  await test.step('Sign in as approver and open Conveyance Work Queue', async () => {
    await approvalPage.openWorkQueue(loadApprovalCredentials());
  });

  const entityName = await test.step('Open the exact application and accept it for review', async () => {
    const matchedEntity = await approvalPage.acceptApplication(application);
    addApprovalAnnotations(testInfo, { ...application, entityName: matchedEntity, status: 'Accepted (ACP)' });
    return matchedEntity;
  });

  await test.step('Open and approve the accepted application', async () => {
    const approvalResult = await approvalPage.approveApplication({ ...application, entityName }, {
      captureConveyanceNumber: installationForVariance,
    });
    const conveyanceNumber = installationForVariance ? approvalResult : application.conveyanceNumber;
    if (installationForVariance) saveApprovedInstallation(application, conveyanceNumber, testInfo);
    addApprovalAnnotations(testInfo, { ...application, entityName, conveyanceNumber, status: 'Approved (APR)' });
    logger.success('Approved transaction ' + application.transactionNumber);
  });
});
