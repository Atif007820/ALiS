import './runConfig.js';

/**
 * Transaction number for running only Script 3 (03_ApproveApplication.spec.js).
 * Enter the exact transaction number here. The full 01 -> 02 -> 03 flow ignores
 * this value and uses the transaction captured by Script 2.
 */
export const TransactionNumber = '6351';

export function loadApprovalCredentials({ env = process.env } = {}) {
  const loginName = env.CONVEYANCE_APPROVER_LOGIN_NAME?.trim();
  const password = env.CONVEYANCE_APPROVER_PASSWORD;
  if (loginName && password?.trim()) return { loginName, password };
  throw new Error('Approval requires CONVEYANCE_APPROVER_LOGIN_NAME and CONVEYANCE_APPROVER_PASSWORD in the Conveyance .env file or process configuration.');
}
