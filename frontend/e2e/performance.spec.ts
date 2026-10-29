import { test, expect, BASE_API } from './fixtures';
import type { Page } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test_acceptance@opuslex.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

async function authenticateSession(page: Page) {
  const response = await page.request.post(`${BASE_API}/api/v1/auth/login`, {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
  const data = await response.json();

  await page.goto('/');
  await page.evaluate((authData) => {
    localStorage.setItem('access_token', authData.access_token);
    localStorage.setItem('current_user', JSON.stringify(authData.user));
    localStorage.setItem('opuslex_cookie_consent', 'all');
  }, data);

  await page.goto('/');
  await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });
}

test.describe('OpusLex Reliability & Performance Diagnostics (Phase E)', () => {
  test('Browser navigation timings (TTFB, DOMContentLoaded, Load)', async ({ page, diagnostics }) => {
    await authenticateSession(page);

    // Collect Navigation Timing API metrics
    const timingMetrics = await page.evaluate(() => {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (!navEntries || navEntries.length === 0) return null;

      const nav = navEntries[0];
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find((p) => p.name === 'first-contentful-paint');

      return {
        dnsLookupMs: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        tcpConnectMs: Math.round(nav.connectEnd - nav.connectStart),
        ttfbMs: Math.round(nav.responseStart - nav.requestStart),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        loadEventMs: Math.round(nav.loadEventEnd - nav.startTime),
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
      };
    });

    expect(timingMetrics).not.toBeNull();
    console.log('[PERF - Browser Navigation]', timingMetrics);

    // Diagnostics assertions: normal local development threshold
    if (timingMetrics) {
      expect(timingMetrics.ttfbMs).toBeLessThan(3000);
      expect(timingMetrics.domContentLoadedMs).toBeLessThan(8000);
    }

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Backend core API response latencies', async ({ request }) => {
    // 1. Authenticate to get token
    const loginStart = Date.now();
    const loginRes = await request.post(`${BASE_API}/api/v1/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginLatency = Date.now() - loginStart;
    expect(loginRes.status()).toBe(200);
    const { access_token } = await loginRes.json();

    const headers = { Authorization: `Bearer ${access_token}` };

    // 2. Measure /api/v1/auth/me latency
    const meStart = Date.now();
    const meRes = await request.get(`${BASE_API}/api/v1/auth/me`, { headers });
    const meLatency = Date.now() - meStart;
    expect(meRes.status()).toBe(200);

    // 3. Measure /api/v1/workspace/overview latency
    const ovStart = Date.now();
    const ovRes = await request.get(`${BASE_API}/api/v1/workspace/overview`, { headers });
    const ovLatency = Date.now() - ovStart;
    expect(ovRes.status()).toBe(200);

    // 4. Measure /api/v1/assistant/preferences latency
    const prefStart = Date.now();
    const prefRes = await request.get(`${BASE_API}/api/v1/assistant/preferences`, { headers });
    const prefLatency = Date.now() - prefStart;
    expect(prefRes.status()).toBe(200);

    const apiLatencies = {
      loginLatencyMs: loginLatency,
      authMeLatencyMs: meLatency,
      workspaceOverviewLatencyMs: ovLatency,
      assistantPreferencesLatencyMs: prefLatency,
    };
    console.log('[PERF - API Latencies]', apiLatencies);

    expect(meLatency).toBeLessThan(1500);
    expect(ovLatency).toBeLessThan(2000);
    expect(prefLatency).toBeLessThan(1500);
  });

  test('AI streaming measures Time-To-First-Token (TTFT) and Total Response Time separately', async ({ page, diagnostics }) => {
    await authenticateSession(page);

    // Run in browser context to consume SSE streaming cleanly
    const streamMetrics = await page.evaluate(async (apiUrl) => {
      const token = localStorage.getItem('access_token');
      const startTime = performance.now();
      let ttft: number | null = null;
      let totalTime: number | null = null;
      let deltaCount = 0;
      let fullText = '';

      const response = await fetch(`${apiUrl}/api/v1/assistant/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: 'What is 18% of 2,500?' }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to stream: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                if (data.delta) {
                  if (ttft === null) {
                    ttft = Math.round(performance.now() - startTime);
                  }
                  deltaCount++;
                  fullText += data.delta;
                }
              } catch {
                // ignore SSE non-JSON framing
              }
            }
          }
        }
      }

      totalTime = Math.round(performance.now() - startTime);

      return {
        ttftMs: ttft,
        totalTimeMs: totalTime,
        deltaCount,
        hasExpectedAnswer: fullText.includes('450'),
      };
    }, BASE_API);

    console.log('[PERF - AI Streaming]', streamMetrics);

    expect(streamMetrics).not.toBeNull();
    expect(streamMetrics.hasExpectedAnswer).toBe(true);
    expect(streamMetrics.deltaCount).toBeGreaterThan(0);
    expect(streamMetrics.ttftMs).not.toBeNull();
    expect(streamMetrics.totalTimeMs).not.toBeNull();

    // TTFT must strictly occur before total completion
    if (streamMetrics.ttftMs && streamMetrics.totalTimeMs) {
      expect(streamMetrics.ttftMs).toBeLessThanOrEqual(streamMetrics.totalTimeMs);
      expect(streamMetrics.ttftMs).toBeLessThan(5000);
      expect(streamMetrics.totalTimeMs).toBeLessThan(10000);
    }

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Reliability check confirms zero console crashes or 500 error leaks', async ({ page, diagnostics }) => {
    await authenticateSession(page);

    // Ensure no unhandled runtime exceptions occurred
    expect(diagnostics.pageErrors).toEqual([]);

    // Filter out expected cancelled network requests (e.g. background aborted media streams)
    const fatalFailedRequests = diagnostics.failedRequests.filter(
      (r) => !r.failure.includes('cancelled') && !r.failure.includes('ERR_ABORTED')
    );
    expect(fatalFailedRequests).toEqual([]);
  });
});
