/** Standalone Script 03 reads this exact HMB transaction number. */
export const TransactionNumber = '6504';

const APPROVER_CREDENTIALS = Object.freeze({
  loginName: 'admin',
  password: 'password',
});

export function loadApprovalCredentials() {
  return { ...APPROVER_CREDENTIALS };
}
