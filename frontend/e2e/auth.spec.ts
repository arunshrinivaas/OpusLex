import { test, expect } from './fixtures';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test_acceptance@opuslex.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

test.describe('OpusLex Authentication Acceptance Tests (Phase B)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Set cookie consent to prevent banner from overlaying buttons
    await page.evaluate(() => {
      localStorage.setItem('opuslex_cookie_consent', 'all');
    });
  });

  test('Valid login authenticates user and mounts Dashboard', async ({ page, diagnostics }) => {
    // Navigate to email login
    const logInBtn = page.getByRole('button', { name: /^log in$/i });
    await logInBtn.click();

    // Fill valid credentials
    await page.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);

    // Submit form
    await page.locator('form').getByRole('button', { name: /^log in$/i }).click();

    // Expect transition to Dashboard
    await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });

    // Verify access token is stored in localStorage
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(token).toBeTruthy();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Invalid credentials display error message and block entry', async ({ page, diagnostics }) => {
    const logInBtn = page.getByRole('button', { name: /^log in$/i });
    await logInBtn.click();

    // Fill bad credentials
    await page.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill('WrongPassword999!');

    // Submit form
    await page.locator('form').getByRole('button', { name: /^log in$/i }).click();

    // Expect error feedback
    const errorMsg = page.locator('text=Invalid email or password');
    await expect(errorMsg).toBeVisible({ timeout: 7000 });

    // Verify token was NOT stored
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(token).toBeNull();

    // Verify user is still on Auth screen
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Session persistence survives full page refresh', async ({ page, diagnostics }) => {
    // Perform login
    await page.getByRole('button', { name: /^log in$/i }).click();
    await page.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^log in$/i }).click();

    await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });

    // Reload the page
    await page.reload();

    // Verify Dashboard reloads automatically without returning to login screen
    await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(token).toBeTruthy();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Logout clears session tokens and returns to Auth screen', async ({ page, diagnostics }) => {
    // Perform login
    await page.getByRole('button', { name: /^log in$/i }).click();
    await page.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^log in$/i }).click();

    await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });

    // Open user profile dropdown in sidebar
    const profileTrigger = page.locator('aside button:has-text("OpusLex Workspace")');
    await expect(profileTrigger).toBeVisible();
    await profileTrigger.click();

    // Click Log out button
    const logoutBtn = page.getByRole('button', { name: /log out/i });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Verify tokens were cleared
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible({ timeout: 10000 });
    const tokenAfter = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(tokenAfter).toBeNull();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Invalid or expired token triggers session cleanup on 401', async ({ page }) => {
    // Inject invalid / expired token
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'invalid.token.structure');
      localStorage.setItem('current_user', JSON.stringify({ id: 9999, email: 'fake@expired.com' }));
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Dashboard attempts authenticated fetches, encounters 401, and purges access_token
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('access_token'));
    }, { timeout: 10000 }).toBeNull();

    // Reload page to verify unauthenticated Auth view is mounted
    await page.reload();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible({ timeout: 10000 });
  });
});
