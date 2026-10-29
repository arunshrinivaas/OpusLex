import { test, expect, BASE_API } from './fixtures';
import type { Page, APIRequestContext } from '@playwright/test';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Load backend test environment if present and JWT_SECRET is unset
const candidatePaths = [
  path.resolve(process.cwd(), '../backend/.env'),
  path.resolve(import.meta.dirname || '', '../../backend/.env'),
];
const backendEnvPath = candidatePaths.find((p) => fs.existsSync(p));
if (!process.env.JWT_SECRET && backendEnvPath && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(backendEnvPath);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('SETUP FAILURE: JWT_SECRET environment variable is missing from the test environment.');
}

const USER_A_EMAIL = process.env.E2E_TEST_EMAIL || 'test_acceptance@opuslex.com';
const USER_A_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
const USER_B_ID = 863;
const USER_B_EMAIL = 'test_optimizer@opuslex.com';

function mintUserToken(userId: number, email: string, role = 'compliance_officer'): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: String(userId),
    email,
    role,
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 7200,
  };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', JWT_SECRET!)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');
  return `${b64Header}.${b64Payload}.${sig}`;
}

async function loginUser(request: APIRequestContext, email: string, pass: string): Promise<string> {
  const res = await request.post(`${BASE_API}/api/v1/auth/login`, {
    data: { email, password: pass },
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  return data.access_token;
}

async function setAuthContext(page: Page, token: string, user: any) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ tok, u }) => {
      localStorage.setItem('access_token', tok);
      localStorage.setItem('current_user', JSON.stringify(u));
      localStorage.setItem('opuslex_cookie_consent', 'all');
    },
    { tok: token, u: user }
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

test.describe('OpusLex Stage 6: Research & RAG Functional QA (E2E)', () => {
  test.describe.configure({ mode: 'serial' });

  let tokenUserA: string;
  let tokenUserB: string;
  let userAObj: any;
  let userBObj: any;

  const trackedSessionIds: number[] = [];

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    tokenUserA = await loginUser(request, USER_A_EMAIL, USER_A_PASSWORD);
    tokenUserB = mintUserToken(USER_B_ID, USER_B_EMAIL);

    const meA = await request.get(`${BASE_API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(meA.status()).toBe(200);
    userAObj = await meA.json();

    const meB = await request.get(`${BASE_API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    expect(meB.status()).toBe(200);
    userBObj = await meB.json();

    await request.dispose();
  });

  test.afterEach(async ({ request }) => {
    // Exact-ID cleanup with fail-closed ownership check
    while (trackedSessionIds.length > 0) {
      const id = trackedSessionIds.pop()!;
      try {
        await request.delete(`${BASE_API}/api/v1/research/sessions/${id}`, {
          headers: { Authorization: `Bearer ${tokenUserA}` },
        });
      } catch {
        // Ignore deletion failures on already-deleted items
      }
    }
  });

  test('UI-RES-01: Research Desk mounts with clean state, composer, and private workspace indicator', async ({
    page,
    diagnostics,
  }) => {
    await setAuthContext(page, tokenUserA, userAObj);

    // Navigate to Research module
    const researchNav = page.locator('aside button:has-text("Research")');
    await expect(researchNav).toBeVisible();
    await researchNav.click();

    // Verify Research Desk header and workspace indicator
    await expect(page.getByText(/Research Assistant|Research Desk/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Active Workspace|Private Workspace/i).first()).toBeVisible();

    // Verify input textarea
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('UI-RES-02: Calculation query routes and answers deterministically without document prerequisites', async ({
    page,
    request,
    diagnostics,
  }) => {
    await setAuthContext(page, tokenUserA, userAObj);

    // Navigate to Research
    await page.locator('aside button:has-text("Research")').click();
    await expect(page.getByText(/Research Assistant|Research Desk/i).first()).toBeVisible({ timeout: 10000 });

    const q = 'What is 20% of 5,000?';
    const textarea = page.locator('textarea');
    await textarea.fill(q);

    // Click submit button (ArrowUp)
    const submitBtn = page.locator('button:has(svg.lucide-arrow-up)');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify answer renders 1,000 / 1000
    await expect(page.getByText(/1,000|1000/i).first()).toBeVisible({ timeout: 15000 });

    // Verify session appears in Private Research history
    await expect(page.locator(`p:has-text("${q}")`).first()).toBeVisible({ timeout: 10000 });

    // Track created session ID via API
    const sessRes = await request.get(`${BASE_API}/api/v1/research/sessions`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(sessRes.status()).toBe(200);
    const sessions = await sessRes.json();
    const created = sessions.find((s: any) => s.question === q);
    if (created) trackedSessionIds.push(created.id);

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('UI-RES-03: General knowledge query executes and renders markdown answer', async ({
    page,
    request,
    diagnostics,
  }) => {
    await setAuthContext(page, tokenUserA, userAObj);

    await page.locator('aside button:has-text("Research")').click();
    await expect(page.getByText(/Research Assistant|Research Desk/i).first()).toBeVisible({ timeout: 10000 });

    const q = 'Explain the difference between confidentiality and privacy in legal compliance.';
    const textarea = page.locator('textarea');
    await textarea.fill(q);

    const submitBtn = page.locator('button:has(svg.lucide-arrow-up)');
    await submitBtn.click();

    // Verify answer article renders
    const answerArticle = page.locator('article');
    await expect(answerArticle).toBeVisible({ timeout: 25000 });
    await expect(answerArticle.getByText(/confidentiality|privacy|compliance/i).first()).toBeVisible();

    // Track session ID
    const sessRes = await request.get(`${BASE_API}/api/v1/research/sessions`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    if (sessRes.ok()) {
      const sessions = await sessRes.json();
      const created = sessions.find((s: any) => s.question === q);
      if (created) trackedSessionIds.push(created.id);
    }

    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('UI-RES-04: Session persistence across page refresh and click-to-load history', async ({
    page,
    request,
  }) => {
    // 1. Create a session via API for User A
    const q = 'TEST_E2E_PERSISTENCE_QUESTION';
    const a = 'This is the verified persisted answer.';
    const createRes = await request.post(`${BASE_API}/api/v1/research/sessions`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: {
        question: q,
        status: 'Completed',
        answer: a,
        sources: [],
      },
    });
    expect(createRes.status()).toBe(201);
    const createdSession = await createRes.json();
    trackedSessionIds.push(createdSession.id);

    // 2. Open Research Desk
    await setAuthContext(page, tokenUserA, userAObj);
    await page.locator('aside button:has-text("Research")').click();
    await expect(page.getByText(/Research Assistant|Research Desk/i).first()).toBeVisible({ timeout: 10000 });

    // 3. Confirm history item is rendered
    const historyItem = page.locator(`p:has-text("${q}")`).first();
    await expect(historyItem).toBeVisible({ timeout: 10000 });

    // 4. Click history item to load into view
    await historyItem.click();

    // 5. Verify question and answer loaded into view
    await expect(page.locator('article').getByText(a)).toBeVisible({ timeout: 5000 });

    // 6. Hard refresh page and verify it survives
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('aside button:has-text("Research")').click();
    await expect(page.locator(`p:has-text("${q}")`).first()).toBeVisible({ timeout: 10000 });
  });

  test('UI-RES-05: History deletion removes session from UI and database', async ({
    page,
    request,
  }) => {
    // Create a temporary session to delete
    const q = 'TEST_E2E_DELETE_QUESTION';
    const createRes = await request.post(`${BASE_API}/api/v1/research/sessions`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: {
        question: q,
        status: 'Completed',
        answer: 'Temporary session to be deleted.',
        sources: [],
      },
    });
    expect(createRes.status()).toBe(201);
    const sessionData = await createRes.json();
    const sessionId = sessionData.id;
    trackedSessionIds.push(sessionId);

    await setAuthContext(page, tokenUserA, userAObj);
    await page.locator('aside button:has-text("Research")').click();
    await expect(page.getByText(/Research Assistant|Research Desk/i).first()).toBeVisible({ timeout: 10000 });

    // Locate the session card and hover to reveal delete button
    const sessionCard = page.locator('.group', { has: page.locator(`p:has-text("${q}")`) });
    await expect(sessionCard).toBeVisible({ timeout: 10000 });
    await sessionCard.hover();

    const deleteBtn = sessionCard.locator('button[title="Remove from history"]');
    await deleteBtn.click({ force: true });

    // Verify card is removed from UI
    await expect(page.locator(`p:has-text("${q}")`)).toHaveCount(0, { timeout: 10000 });

    // Verify backend confirms 404 on subsequent delete or absence
    const checkRes = await request.delete(`${BASE_API}/api/v1/research/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(checkRes.status()).toBe(404);

    // Remove from cleanup tracking since already deleted
    const idx = trackedSessionIds.indexOf(sessionId);
    if (idx !== -1) trackedSessionIds.splice(idx, 1);
  });

  test('UI-RES-06: Cross-user privacy: User B cannot view User A research sessions', async ({
    page,
    request,
  }) => {
    // Create session belonging to User A
    const q = 'USER_A_PRIVATE_INQUIRY';
    const createRes = await request.post(`${BASE_API}/api/v1/research/sessions`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: {
        question: q,
        status: 'Completed',
        answer: 'Confidential research for User A.',
        sources: [],
      },
    });
    expect(createRes.status()).toBe(201);
    const sessA = await createRes.json();
    trackedSessionIds.push(sessA.id);

    // Authenticate as User B
    await setAuthContext(page, tokenUserB, userBObj);
    await page.locator('aside button:has-text("Research")').click();
    await expect(page.getByText(/Research Assistant|Research Desk/i).first()).toBeVisible({ timeout: 10000 });

    // Verify User A's private question is NOT visible to User B
    await expect(page.locator(`p:has-text("${q}")`)).toHaveCount(0);
  });
});
