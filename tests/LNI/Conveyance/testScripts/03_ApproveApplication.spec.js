import { test, addApprovalAnnotations, getApplicationTarget, logger } from '../framework.js';
import { loadApprovalCredentials } from '../config/runConfig.js';
import { getFollowUpType } from '../config/applicationTypes.js';
import {
  loadApprovalTransaction, normalizePermitNumber, normalizeTransactionNumber, saveApprovedInstallation,
} from '../utils/transactionStore.js';

// Artifacts could include the approver login form and privileged application data.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const approvalPermit = process.env.CONVEYANCE_APPROVAL_ONLY_PERMIT;
const approvalTransaction = process.env.CONVEYANCE_APPROVAL_ONLY_TRANSACTION;
const approvalOnly = approvalPermit || approvalTransaction;
const followUp = !approvalOnly && getFollowUpType(getApplicationTarget().appType);
const installationForFollowUp = process.env.CONVEYANCE_FOLLOW_UP_PHASE === 'installation';

test(followUp ? `Conveyance - Approve ${followUp.label.slice('Conveyance '.length)}` : 'Conveyance - Approve Application', async ({ approvalPage }, testInfo) => {
  if (approvalOnly) {
    const lookup = approvalPermit ? 'permit' : 'transaction';
    const label = approvalPermit ? 'Permit' : 'Transaction';
    const number = approvalPermit ? normalizePermitNumber(approvalPermit) : normalizeTransactionNumber(approvalTransaction);
    testInfo.annotations.push({ type: `${label} Number`, description: number });
    await test.step('Sign in as approver and open Conveyance Work Queue',
      () => approvalPage.openWorkQueue(loadApprovalCredentials(), { lookup }));
    await test.step(`Find and approve the Work Queue application by ${label} #`, async () => {
      const result = approvalPermit ? await approvalPage.approveExistingPermit(number)
        : await approvalPage.approveExistingTransaction(number);
      addApprovalAnnotations(testInfo, { ...result, status: 'Approved (APR)' });
      logger.success(result.alreadyApproved ? `Transaction ${result.transactionNumber} is already approved`
        : `Approved transaction ${result.transactionNumber}`);
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
      captureConveyanceNumber: installationForFollowUp,
    });
    const conveyanceNumber = installationForFollowUp ? approvalResult : application.conveyanceNumber;
    if (installationForFollowUp) saveApprovedInstallation(application, conveyanceNumber, testInfo);
    addApprovalAnnotations(testInfo, { ...application, entityName, conveyanceNumber, status: 'Approved (APR)' });
    logger.success('Approved transaction ' + application.transactionNumber);
  });
});
