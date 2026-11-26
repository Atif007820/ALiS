import { PermitNumber } from '../runInputs/approvalPermitNumber.js';
import { TransactionNumber } from '../runInputs/approvalTransacNumber.js';
import { normalizePermitNumber, normalizeTransactionNumber } from './transactionStore.js';

export function resolveStandaloneApprovalTarget({
  permitNumber,
  transactionNumber,
  defaultLookup = 'permit',
  savedPermitNumber = PermitNumber,
  savedTransactionNumber = TransactionNumber,
} = {}) {
  const hasPermit = permitNumber !== undefined;
  const hasTransaction = transactionNumber !== undefined;
  if (hasPermit && hasTransaction) {
    throw new Error('Choose either --PerNum or --TransacNum with --approve.');
  }

  const lookup = hasPermit ? 'permit' : hasTransaction ? 'transaction' : defaultLookup;
  if (lookup !== 'permit' && lookup !== 'transaction') {
    throw new Error('defaultApprovalLookup in config/runSettings.json must be "permit" or "transaction".');
  }

  const isPermit = lookup === 'permit';
  const value = hasPermit ? permitNumber : hasTransaction ? transactionNumber
    : isPermit ? savedPermitNumber : savedTransactionNumber;
  const flag = isPermit ? '--PerNum' : '--TransacNum';
  const label = isPermit ? 'Permit #' : 'Transaction #';
  const inputFile = isPermit ? 'runInputs/approvalPermitNumber.js' : 'runInputs/approvalTransacNumber.js';
  if (!String(value ?? '').trim()) {
    if (hasPermit || hasTransaction) throw new Error(`${flag} requires a value containing digits.`);
    throw new Error(`--approve requires a ${label} in ${inputFile} or an explicit ${flag}.`);
  }
  const number = isPermit ? normalizePermitNumber(value) : normalizeTransactionNumber(value);
  return { lookup, number, label, source: hasPermit || hasTransaction ? flag : inputFile };
}
