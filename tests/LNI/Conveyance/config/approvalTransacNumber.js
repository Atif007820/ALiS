import './runConfig.js';

/**
 * Default for npm run conv -- --approve when --TransacNum is omitted.
 * Combined workflows still approve the transaction captured by Apply.
 */
export const TransactionNumber = '6475';

export function loadApprovalCredentials({ env = process.env } = {}) {
  const loginName = env.CONVEYANCE_APPROVER_LOGIN_NAME?.trim();
  const password = env.CONVEYANCE_APPROVER_PASSWORD;
  if (loginName && password?.trim()) return { loginName, password };
  throw new Error('Approval requires CONVEYANCE_APPROVER_LOGIN_NAME and CONVEYANCE_APPROVER_PASSWORD in the Conveyance .env file or process configuration.');
}
