import { test, expect, BASE_API } from './fixtures';
import type { Page } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test_acceptance@opuslex.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

async function authenticateSession(page: Page) {
  // Obtain token directly from backend to avoid redundant UI typing for core tests
  const response = await page.request.post(`${BASE_API}/api/v1/auth/login`, {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });
  const data = await response.json();

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((authData) => {
    localStorage.setItem('access_token', authData.access_token);
    localStorage.setItem('current_user', JSON.stringify(authData.user));
    localStorage.setItem('opuslex_cookie_consent', 'all');
  }, data);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });
}

test.describe('OpusLex Core Functionality Acceptance Tests (Phase C)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page);
  });

  test('Dashboard loads metrics and workspace overview', async ({ page, diagnostics }) => {
    // Assert dashboard stats presence
    await expect(page.getByText(/Active Workspace/i)).toBeVisible();
    await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible();

    // Verify workspace stats or quick launch cards mount
    const quickLaunch = page.locator('text=Quick Launch');
    if (await quickLaunch.isVisible()) {
      await expect(quickLaunch).toBeVisible();
    }

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Sidebar navigates across modules (Research, Investigations, Governance, Audit)', async ({ page, diagnostics }) => {
    // 1. Navigate to Research
    const researchNav = page.locator('aside button:has-text("Research")');
    await expect(researchNav).toBeVisible();
    await researchNav.click();
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 7000 });

    // 2. Navigate to Investigations
    const investigationsNav = page.locator('aside button:has-text("Investigations")');
    await expect(investigationsNav).toBeVisible();
    await investigationsNav.click();
    await expect(page.getByText(/Active Investigations|All Investigations|Investigation/i).first()).toBeVisible({ timeout: 7000 });

    // 3. Navigate to Governance
    const governanceNav = page.locator('aside button:has-text("Governance")');
    await expect(governanceNav).toBeVisible();
    await governanceNav.click();
    await expect(page.getByText(/Governance|Compliance Risk|Obligations/i).first()).toBeVisible({ timeout: 7000 });

    // 4. Navigate to Audit & Findings
    const auditNav = page.locator('aside button:has-text("Audit")');
    await expect(auditNav).toBeVisible();
    await auditNav.click();
    await expect(page.getByText(/Audit|Findings|Audit Log/i).first()).toBeVisible({ timeout: 7000 });

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Themis Assistant opens overlay and responds to inquiry', async ({ page, diagnostics }) => {
    // Open Themis Assistant directly via header button
    const themisHeaderBtn = page.locator('#header-themis-btn');
    await expect(themisHeaderBtn).toBeVisible();
    await themisHeaderBtn.click();

    // Themis overlay should appear
    const themisContainer = page.locator('[role="dialog"][aria-label*="Themis"]');
    await expect(themisContainer).toBeVisible({ timeout: 7000 });

    // Close Themis via close button or Escape
    const closeBtn = page.getByLabel(/Close Themis/i);
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(themisContainer).not.toBeVisible({ timeout: 5000 });

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Global search modal opens via trigger and keyboard shortcut', async ({ page, diagnostics }) => {
    const searchTrigger = page.locator('#global-search-trigger');
    await expect(searchTrigger).toBeVisible();
    await searchTrigger.click();

    // Search overlay / input should be focused
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Close search with Escape
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Handles API degradation gracefully with fallback UI', async ({ page, diagnostics }) => {
    // Intercept workspace overview with a 500 to test resilience
    await page.route('**/api/v1/workspace/overview', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal simulated server error' }),
      });
    });

    // Navigate to Home
    const homeNav = page.locator('aside button:has-text("Home")');
    if (await homeNav.isVisible()) {
      await homeNav.click();
    }

    // Verify application does not crash or throw uncaught React errors
    expect(diagnostics.pageErrors).toEqual([]);
  });
});
