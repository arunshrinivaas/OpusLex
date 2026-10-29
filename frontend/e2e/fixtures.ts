import { test as base, expect } from '@playwright/test';

export interface Diagnostics {
  consoleErrors: string[];
  pageErrors: Error[];
  failedRequests: { url: string; failure: string | null; method: string }[];
}

export const BASE_API = process.env.TEST_API_URL || 'http://127.0.0.1:8001';

/**
 * Extended Playwright test fixture that:
 * 1. Installs context-level network redirection (all pages, popups, workers) from port 8000 to port 8001.
 * 2. Enforces a strict guard on direct API request helpers rejecting any call targeting port 8000.
 * 3. Captures browser console errors, uncaught page errors, and failed network requests.
 */
export const test = base.extend<{ diagnostics: Diagnostics }>({
  context: async ({ context }, use) => {
    // Strict Network Isolation Barrier (Context Level):
    // Covers all pages, popups, and workers created in this context.
    await context.route(/(http:\/\/(localhost|127\.0\.0\.1):8000)(\/.*)/, async (route) => {
      const originalUrl = route.request().url();
      const redirectedUrl = originalUrl.replace(':8000', ':8001');
      await route.continue({ url: redirectedUrl });
    });
    await use(context);
  },

  request: async ({ playwright }, use) => {
    const apiContext = await playwright.request.newContext({
      baseURL: BASE_API,
    });
    // Guard against any direct API helper call targeting port 8000
    const guardedRequest = new Proxy(apiContext, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (
          typeof orig === 'function' &&
          ['get', 'post', 'put', 'delete', 'patch', 'head', 'fetch'].includes(prop as string)
        ) {
          return async (urlOrRequest: any, options?: any) => {
            const urlStr =
              typeof urlOrRequest === 'string' ? urlOrRequest : urlOrRequest?.url?.() || '';
            if (urlStr.includes(':8000')) {
              throw new Error(
                `CRITICAL TEST ISOLATION FAILURE: Direct API request blocked from reaching port 8000: ${urlStr}. Target port 8001 via BASE_API instead.`
              );
            }
            return orig.call(target, urlOrRequest, options);
          };
        }
        return orig;
      },
    });
    await use(guardedRequest as any);
    await apiContext.dispose();
  },

  diagnostics: async ({ page }, use) => {
    const diagnostics: Diagnostics = {
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
    };

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        diagnostics.consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      diagnostics.pageErrors.push(err);
    });

    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText || null;
      // Exclude normal browser stream cancellations (e.g. video preloading paused/aborted on navigation)
      if (failure !== 'cancelled' && failure !== 'net::ERR_ABORTED') {
        diagnostics.failedRequests.push({
          url: request.url(),
          method: request.method(),
          failure,
        });
      }
    });

    await use(diagnostics);
  },
});

export { expect };
