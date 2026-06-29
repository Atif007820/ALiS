export function printComparisonAnnotations(result, logger, { flowLabel = '' } = {}) {
  const { comparison } = result;
  const titlePrefix = flowLabel ? `${flowLabel} | ` : '';

  logger.section(`${titlePrefix}${result.id} annotations`);
  logger.info(`Matched: ${comparison.matched.length}`);
  logger.info(`Mismatch: ${comparison.mismatch?.length || 0}`);
  logger.info(`Missing: ${comparison.missing.length}`);
  logger.info(`Extra: ${comparison.extra.length}`);

  printRows('Mismatch', comparison.mismatch || [], logger);
  printRows('Missing', comparison.missing, logger);
  printRows('Extra', comparison.extra, logger);
}

function printRows(label, rows, logger) {
  if (!rows.length) {
    return;
  }

  logger.info(`${label} details:`);
  rows.forEach((row) => {
    const details = row.message || formatDifferences(row.differences || []);
    logger.item(details ? `${row.key} - ${details}` : row.key);
  });
}

function formatDifferences(differences) {
  return differences
    .map((item) => item.message || `${item.column}: baseline="${item.baseline}", live="${item.actual}"`)
    .join('; ');
}
