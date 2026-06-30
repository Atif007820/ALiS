export function isClosedPageError(error) {
  return /target page, context or browser has been closed|target closed|browser has been closed|context has been closed|page has been closed/i
    .test(String(error?.message || error || ''));
}

export function ensurePageOpen(page, actionName = 'page action') {
  if (!page || page.isClosed?.()) {
    throw new Error(`Target page was closed before ${actionName}.`);
  }
}

export async function waitForPageTimeout(page, timeoutMs, actionName = 'wait') {
  ensurePageOpen(page, actionName);

  try {
    await page.waitForTimeout(Number(timeoutMs || 0));
  } catch (error) {
    if (isClosedPageError(error)) {
      throw new Error(`Target page was closed during ${actionName}.`);
    }

    throw error;
  }
}
