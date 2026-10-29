import { test, expect } from './fixtures';

test.describe('OpusLex Initial E2E Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Start with a clean state on the root page
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('Application loads and renders OpusLex brand and entry controls', async ({ page, diagnostics }) => {
    // Check main root element
    const root = page.locator('#root');
    await expect(root).toBeAttached();

    // Verify tagline
    const tagline = page.getByText(/Beyond books — instant legal clarity/i);
    await expect(tagline).toBeVisible();

    // Verify main action buttons
    const createAccountBtn = page.getByRole('button', { name: /create account/i });
    const signInBtn = page.getByRole('button', { name: /^sign in$/i });
    const logInBtn = page.getByRole('button', { name: /^log in$/i });

    await expect(createAccountBtn).toBeVisible();
    await expect(signInBtn).toBeVisible();
    await expect(logInBtn).toBeVisible();

    // Verify no unhandled runtime exceptions occurred during initial load
    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Cookie consent banner displays and persists user selection', async ({ page, diagnostics }) => {
    const acceptBtn = page.getByRole('button', { name: /accept all/i });
    const rejectBtn = page.getByRole('button', { name: /reject optional/i });

    // The cookie banner appears if no consent is saved in localStorage
    if (await acceptBtn.isVisible()) {
      await expect(rejectBtn).toBeVisible();
      await acceptBtn.click();
      await expect(acceptBtn).not.toBeVisible();

      // Verify localStorage was updated
      const consent = await page.evaluate(() => localStorage.getItem('opuslex_cookie_consent'));
      expect(consent).toBe('all');
    }

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Email login view renders required input controls and back navigation', async ({ page, diagnostics }) => {
    // Dismiss cookie banner if present to avoid intercepting clicks
    const acceptBtn = page.getByRole('button', { name: /accept all/i });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
    }

    // Navigate to email login
    const logInBtn = page.getByRole('button', { name: /^log in$/i });
    await logInBtn.click();

    // Verify email and password inputs
    const emailInput = page.getByPlaceholder(/email address/i);
    const passwordInput = page.getByPlaceholder(/password/i);
    const submitBtn = page.locator('form').getByRole('button', { name: /^log in$/i });
    const backBtn = page.getByRole('button', { name: /back/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(backBtn).toBeVisible();

    // Verify back navigation returns to initial view
    await backBtn.click();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Create account view renders full name, email, and password controls', async ({ page, diagnostics }) => {
    // Dismiss cookie banner if present
    const acceptBtn = page.getByRole('button', { name: /accept all/i });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
    }

    // Navigate to registration
    const createAccountBtn = page.getByRole('button', { name: /create account/i });
    await createAccountBtn.click();

    // Verify registration inputs
    const fullNameInput = page.getByPlaceholder(/full name/i);
    const emailInput = page.getByPlaceholder(/email address/i);
    const passwordInput = page.getByPlaceholder(/password/i);
    const submitBtn = page.locator('form').getByRole('button', { name: /create account/i });
    const backBtn = page.getByRole('button', { name: /back/i });

    await expect(fullNameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verify back navigation
    await backBtn.click();
    await expect(createAccountBtn).toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Provider sign-in stage displays provider options', async ({ page, diagnostics }) => {
    // Dismiss cookie banner if present
    const acceptBtn = page.getByRole('button', { name: /accept all/i });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
    }

    // Navigate to providers view
    const signInBtn = page.getByRole('button', { name: /^sign in$/i });
    await signInBtn.click();

    // Check available providers
    const appleBtn = page.getByRole('button', { name: /continue with apple/i });
    const googleBtn = page.getByRole('button', { name: /continue with google/i });
    const emailOtpBtn = page.getByRole('button', { name: /continue with email/i });
    const phoneBtn = page.getByRole('button', { name: /sign in with phone number/i });
    const backBtn = page.getByRole('button', { name: /back/i });

    await expect(appleBtn).toBeVisible();
    await expect(googleBtn).toBeVisible();
    await expect(emailOtpBtn).toBeVisible();
    await expect(phoneBtn).toBeVisible();
    await expect(phoneBtn).toBeDisabled();

    // Navigate back
    await backBtn.click();
    await expect(signInBtn).toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Policy pages navigate and back navigation functions properly', async ({ page, diagnostics }) => {
    // Dismiss cookie banner if present
    const acceptBtn = page.getByRole('button', { name: /accept all/i });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
    }

    // 1. Terms of Service
    const termsLink = page.getByRole('button', { name: /^terms$/i });
    await expect(termsLink).toBeVisible();
    await termsLink.click();

    const termsHeading = page.getByRole('heading', { name: /terms of service/i });
    await expect(termsHeading).toBeVisible();
    await page.getByRole('button', { name: /back/i }).click();
    await expect(termsHeading).not.toBeVisible();

    // 2. Privacy Policy
    const privacyLink = page.getByRole('button', { name: /^privacy$/i });
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();

    const privacyHeading = page.getByRole('heading', { name: /privacy policy/i });
    await expect(privacyHeading).toBeVisible();
    await page.getByRole('button', { name: /back/i }).click();
    await expect(privacyHeading).not.toBeVisible();

    // 3. Cookies Policy
    const cookiesLink = page.getByRole('button', { name: /^cookies$/i });
    await expect(cookiesLink).toBeVisible();
    await cookiesLink.click();

    const cookiesHeading = page.getByRole('heading', { name: /cookies? policy/i });
    await expect(cookiesHeading).toBeVisible();
    await page.getByRole('button', { name: /back/i }).click();
    await expect(cookiesHeading).not.toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('Language dropdown opens and allows selecting a language', async ({ page, diagnostics }) => {
    // Dismiss cookie banner if present
    const acceptBtn = page.getByRole('button', { name: /accept all/i });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
    }

    // Open language menu
    const langBtn = page.locator('#auth-language-btn');
    await expect(langBtn).toBeVisible();
    await langBtn.click();

    // Select Spanish
    const langOptionEs = page.getByRole('button', { name: /español/i });
    await expect(langOptionEs).toBeVisible();
    await langOptionEs.click();

    // Language button text displays ES (case-insensitive check for DOM content)
    await expect(langBtn).toContainText(/es/i);

    // Restore back to English
    await langBtn.click();
    const langOptionEn = page.getByRole('button', { name: /english/i });
    await expect(langOptionEn).toBeVisible();
    await langOptionEn.click();
    await expect(langBtn).toContainText(/en/i);

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('No unexpected uncaught runtime errors or critical request failures occur', async ({ page, diagnostics }) => {
    // Wait for network activity to settle
    await page.waitForLoadState('networkidle');

    // Verify zero unhandled crashes/exceptions
    expect(diagnostics.pageErrors).toEqual([]);

    // Verify no critical first-party asset or API requests failed
    const criticalFailures = diagnostics.failedRequests.filter(
      (r) => r.url.includes('localhost') || r.url.includes('127.0.0.1')
    );
    expect(criticalFailures).toEqual([]);
  });
});
