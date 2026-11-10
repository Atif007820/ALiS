import { appConfig } from './runConfig.js';

/**
 * Transaction number for running only Script 3 (03_ApproveApplication.spec.js).
 * Enter the exact transaction number here. The full 01 -> 02 -> 03 flow ignores
 * this value and uses the transaction captured by Script 2.
 */
export const TransactionNumber = '6351';

export function loadApprovalCredentials(environment = appConfig.environment, { env = process.env } = {}) {
  const suffix = String(environment).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const scopedLogin = `CONVEYANCE_APPROVER_LOGIN_NAME_${suffix}`;
  const scopedPassword = `CONVEYANCE_APPROVER_PASSWORD_${suffix}`;
  const genericLogin = 'CONVEYANCE_APPROVER_LOGIN_NAME';
  const genericPassword = 'CONVEYANCE_APPROVER_PASSWORD';
  const scopedLoginName = env[scopedLogin]?.trim();
  const scopedPasswordValue = env[scopedPassword];

  if (scopedLoginName && scopedPasswordValue?.trim()) {
    return { loginName: scopedLoginName, password: scopedPasswordValue };
  }

  const genericLoginName = env[genericLogin]?.trim();
  const genericPasswordValue = env[genericPassword];
  if (genericLoginName && genericPasswordValue?.trim()) {
    return { loginName: genericLoginName, password: genericPasswordValue };
  }

  throw new Error(
    `Approval requires a complete approver credential pair for ${environment}. Set both ${scopedLogin} and ${scopedPassword}, ` +
    `or both ${genericLogin} and ${genericPassword}, in the environment or the Conveyance .env file. ` +
    'Environment-specific credentials take precedence when both are set.',
  );
}
