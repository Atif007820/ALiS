function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(rank, sortedValues.length - 1))];
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length <= 1) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function durationSeconds(records) {
  const timestamps = records
    .map((record) => record.timeStamp)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (timestamps.length === 0) return 0;

  const minStart = Math.min(...timestamps);
  const maxEnd = Math.max(...records.map((record) => (record.timeStamp || minStart) + record.elapsed));
  return Math.max((maxEnd - minStart) / 1000, 0.001);
}

export function calculateStats(records, label = 'TOTAL') {
  const elapsedValues = records.map((record) => record.elapsed).sort((a, b) => a - b);
  const total = records.length;
  const passed = records.filter((record) => record.success).length;
  const failed = total - passed;
  const duration = durationSeconds(records);

  return {
    label,
    total,
    passed,
    failed,
    errorRate: total ? (failed / total) * 100 : 0,
    min: elapsedValues[0] || 0,
    max: elapsedValues[elapsedValues.length - 1] || 0,
    average: average(elapsedValues),
    median: percentile(elapsedValues, 50),
    p75: percentile(elapsedValues, 75),
    p90: percentile(elapsedValues, 90),
    p95: percentile(elapsedValues, 95),
    p99: percentile(elapsedValues, 99),
    stdDev: standardDeviation(elapsedValues),
    throughput: total / duration,
    durationSeconds: duration,
    bytesReceived: records.reduce((sum, record) => sum + record.bytes, 0),
    bytesSent: records.reduce((sum, record) => sum + record.sentBytes, 0),
    avgLatency: average(records.map((record) => record.latency)),
    avgConnect: average(records.map((record) => record.connect))
  };
}

export function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const groupKey = record[key] || 'Unknown';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(record);
  }
  return groups;
}

export function calculatePerformanceSummary(records) {
  const overall = calculateStats(records, 'TOTAL');
  const byLabel = [...groupBy(records, 'label').entries()].map(([label, rows]) => calculateStats(rows, label));
  const byThreadGroup = [...groupBy(records, 'threadGroup').entries()].map(([label, rows]) => calculateStats(rows, label));

  return {
    generatedAt: new Date().toISOString(),
    overall,
    byLabel,
    byThreadGroup
  };
}
