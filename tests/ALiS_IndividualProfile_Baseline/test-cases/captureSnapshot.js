export function snapshotRows(context, key) {
  return context.shared.captureSnapshot?.[key] || null;
}
