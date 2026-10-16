export function isClosedPageError(error) {
  return /target page, context or browser has been closed|target closed|browser has been closed|context has been closed|page has been closed|target page was closed/i
    .test(String(error?.message || error || ''));
}

export function ensurePageOpen(page, actionName = 'page action') {
  if (!page || page.isClosed?.()) {
    throw new Error(`Target page was closed before ${actionName}.`);
  }
}

export async function assertPageAccess(page, actionName = 'page action') {
  const text = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  if (/\bAccess Denied\b|You do not have permissions to access this functionality/i.test(text)) {
    throw new Error(`ALiS denied access during ${actionName}. URL=${page.url()}`);
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
