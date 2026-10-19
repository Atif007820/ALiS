export function isClosedPageError(error) {
  return /target page, context or browser has been closed|target closed|browser has been closed|context has been closed|page has been closed|target page was closed/i
    .test(String(error?.message || error || ''));
}

export function isTransientNavigationError(error) {
  return /net::ERR_(NETWORK_CHANGED|NETWORK_IO_SUSPENDED|CONNECTION_RESET|CONNECTION_ABORTED|CONNECTION_CLOSED|CONNECTION_TIMED_OUT|TIMED_OUT|EMPTY_RESPONSE)\b/
    .test(String(error?.message || error || ''));
}

export function trackNavigationFailures(context) {
  const failures = new WeakMap();
  const mainPage = (request) => {
    try {
      if (!request.isNavigationRequest()) return null;
      const frame = request.frame();
      const page = frame.page();
      return frame === page.mainFrame() ? page : null;
    } catch {
      return null;
    }
  };
  context.on('requestfailed', (request) => {
    const page = mainPage(request);
    if (!page) return;
    const error = request.failure()?.errorText || '';
    if (isTransientNavigationError(error)) {
      failures.set(page, { error, method: request.method(), url: request.url() });
    } else {
      failures.delete(page);
    }
  });
  context.on('response', (response) => {
    const page = mainPage(response.request());
    if (page) failures.delete(page);
  });
  return (page) => page ? failures.get(page) : undefined;
}

export function ensurePageOpen(page, actionName = 'page action') {
  if (!page || page.isClosed?.()) {
    throw new Error(`Target page was closed before ${actionName}.`);
  }
  if (page.url?.().startsWith('chrome-error://')) {
    throw new Error(`Browser navigation failed during ${actionName}. URL=${page.url()}`);
  }
}

export async function assertPageAccess(page, actionName = 'page action') {
  ensurePageOpen(page, actionName);
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
