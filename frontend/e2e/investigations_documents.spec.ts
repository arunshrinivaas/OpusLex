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
    .createHmac('sha256', JWT_SECRET)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');
  return `${b64Header}.${b64Payload}.${sig}`;
}

function generateMinimalPdf(text: string): Buffer {
  const streamContent = `BT\n/F1 12 Tf\n72 712 Td\n(${text}) Tj\nET`;
  const streamLength = Buffer.byteLength(streamContent);
  const pdfSource = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamLength} >> stream
${streamContent}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000350 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
427
%%EOF`;
  return Buffer.from(pdfSource, 'utf-8');
}


async function loginUser(request: APIRequestContext, email: string, pass: string): Promise<string> {
  const res = await request.post(`${BASE_API}/api/v1/auth/login`, {
    data: { email, password: pass },
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  return data.access_token;
}

test.describe('OpusLex Stage 5: Investigations and Documents Functional QA', () => {
  test.describe.configure({ mode: 'serial' });

  let tokenUserA: string;
  let tokenUserB: string;

  const createdInvestigationIds: number[] = [];
  const createdDocumentIds: number[] = [];

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    tokenUserA = await loginUser(request, USER_A_EMAIL, USER_A_PASSWORD);
    tokenUserB = mintUserToken(USER_B_ID, USER_B_EMAIL);
    await request.dispose();
  });

  test.afterEach(async ({ request }) => {
    // Verified cleanup of all investigations created during test
    while (createdInvestigationIds.length > 0) {
      const id = createdInvestigationIds.pop()!;
      await request.delete(`${BASE_API}/api/v1/investigations/${id}`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
    }

    // Verified cleanup of all documents created during test
    while (createdDocumentIds.length > 0) {
      const docId = createdDocumentIds.pop()!;
      await request.delete(`${BASE_API}/api/v1/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
    }
  });

  // =========================================================================
  // INVESTIGATIONS CRUD
  // =========================================================================

  test('INV-01: Create investigation with valid title and description', async ({ request }) => {
    const title = `TEST_STAGE5_INV_${Date.now()}`;
    const desc = 'Functional QA investigation description';

    const res = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title, description: desc },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.title).toBe(title);
    expect(data.description).toBe(desc);
    expect(data.status).toBe('Active');
    expect(data.id).toBeTruthy();

    createdInvestigationIds.push(data.id);
  });

  test('INV-02: Read and filter investigations by status', async ({ request }) => {
    const title = `TEST_STAGE5_FILTER_${Date.now()}`;
    const createRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title, description: 'Filter test' },
    });
    expect(createRes.status()).toBe(201);
    const inv = await createRes.json();
    createdInvestigationIds.push(inv.id);

    // Get specific investigation
    const getRes = await request.get(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(getRes.status()).toBe(200);
    expect((await getRes.json()).id).toBe(inv.id);

    // List with status filter Active
    const listRes = await request.get(`${BASE_API}/api/v1/investigations/?status=Active`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(listRes.status()).toBe(200);
    const items = await listRes.json();
    expect(items.some((i: any) => i.id === inv.id)).toBe(true);
  });

  test('INV-03: Update investigation title and description', async ({ request }) => {
    const title = `TEST_STAGE5_UPDATE_${Date.now()}`;
    const createRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title, description: 'Before update' },
    });
    const inv = await createRes.json();
    createdInvestigationIds.push(inv.id);

    const updatedTitle = `${title}_UPDATED`;
    const updatedDesc = 'After update description';

    const patchRes = await request.patch(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: updatedTitle, description: updatedDesc },
    });
    expect(patchRes.status()).toBe(200);
    const updated = await patchRes.json();
    expect(updated.title).toBe(updatedTitle);
    expect(updated.description).toBe(updatedDesc);
  });

  test('INV-04: Transition investigation status from Active to Archived', async ({ request }) => {
    const title = `TEST_STAGE5_STATUS_${Date.now()}`;
    const createRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title, description: 'Status transition test' },
    });
    const inv = await createRes.json();
    createdInvestigationIds.push(inv.id);

    const statusRes = await request.patch(`${BASE_API}/api/v1/investigations/${inv.id}/status`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { status: 'Archived' },
    });
    expect(statusRes.status()).toBe(200);
    expect((await statusRes.json()).status).toBe('Archived');
  });

  test('INV-05: Delete investigation removes record', async ({ request }) => {
    const title = `TEST_STAGE5_DELETE_${Date.now()}`;
    const createRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title, description: 'Delete test' },
    });
    const inv = await createRes.json();

    const delRes = await request.delete(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(delRes.status()).toBe(204);

    // Verify 404 on subsequent get
    const getRes = await request.get(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(getRes.status()).toBe(404);
  });

  // =========================================================================
  // DOCUMENTS UPLOAD, LIST, DEDUPLICATION, PREVIEW & DELETION
  // =========================================================================

  test('DOC-01: Upload valid PDF document, extract text, and generate embeddings', async ({ request }) => {
    const uniqueFileName = `test_doc_${Date.now()}.pdf`;
    const pdfBuffer = generateMinimalPdf('Audit and compliance verification content for Stage 5 QA testing.');

    const uploadRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: {
          name: uniqueFileName,
          mimeType: 'application/pdf',
          buffer: pdfBuffer,
        },
      },
    });
    expect(uploadRes.status()).toBe(200);
    const data = await uploadRes.json();
    expect(data.duplicate).toBe(false);
    expect(data.document_id).toBeTruthy();
    expect(data.processing_status).toBe('Ready');
    expect(data.chunks_created).toBeGreaterThanOrEqual(1);

    createdDocumentIds.push(data.document_id);
  });

  test('DOC-02: Document deduplication identifies identical file content by SHA-256 hash', async ({ request }) => {
    const uniqueFileName = `dedup_test_${Date.now()}.pdf`;
    const pdfBuffer = generateMinimalPdf('Unique deduplication content string.');

    // First upload
    const res1 = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: { name: uniqueFileName, mimeType: 'application/pdf', buffer: pdfBuffer },
      },
    });
    expect(res1.status()).toBe(200);
    const doc1 = await res1.json();
    expect(doc1.duplicate).toBe(false);
    createdDocumentIds.push(doc1.document_id);

    // Second upload with identical bytes
    const res2 = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: { name: `copy_${uniqueFileName}`, mimeType: 'application/pdf', buffer: pdfBuffer },
      },
    });
    expect(res2.status()).toBe(200);
    const doc2 = await res2.json();
    expect(doc2.duplicate).toBe(true);
    expect(doc2.document_id).toBe(doc1.document_id);
    expect(doc2.processing_status).toBe('Already uploaded');
  });

  test('DOC-03: Document listing and inline preview return valid metadata and PDF stream', async ({ request }) => {
    const uniqueFileName = `preview_test_${Date.now()}.pdf`;
    const pdfBuffer = generateMinimalPdf('Previewable legal text stream.');

    const uploadRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: { name: uniqueFileName, mimeType: 'application/pdf', buffer: pdfBuffer },
      },
    });
    const doc = await uploadRes.json();
    createdDocumentIds.push(doc.document_id);

    // List documents
    const listRes = await request.get(`${BASE_API}/api/v1/documents/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(listRes.status()).toBe(200);
    const listData = await listRes.json();
    expect(listData.items.some((d: any) => d.id === doc.document_id)).toBe(true);

    // Preview document
    const prevRes = await request.get(`${BASE_API}/api/v1/documents/${doc.document_id}/preview`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(prevRes.status()).toBe(200);
    expect(prevRes.headers()['content-type']).toContain('application/pdf');
    const body = await prevRes.body();
    expect(body.length).toBeGreaterThan(0);
  });

  test('DOC-04 to DOC-06: Document attach, duplicate attach rejection, and detach lifecycle', async ({ request }) => {
    // 1. Create investigation
    const invRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: `TEST_ATTACH_FLOW_${Date.now()}` },
    });
    const inv = await invRes.json();
    createdInvestigationIds.push(inv.id);

    // 2. Upload document
    const docRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: {
          name: `attach_${Date.now()}.pdf`,
          mimeType: 'application/pdf',
          buffer: generateMinimalPdf('Attached evidence content.'),
        },
      },
    });
    const doc = await docRes.json();
    createdDocumentIds.push(doc.document_id);

    // 3. Attach document to investigation (DOC-04)
    const attachRes = await request.post(`${BASE_API}/api/v1/investigations/${inv.id}/documents/${doc.document_id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(attachRes.status()).toBe(201);

    // 4. Verify attached in list
    const attachedListRes = await request.get(`${BASE_API}/api/v1/investigations/${inv.id}/documents`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(attachedListRes.status()).toBe(200);
    const attachedItems = await attachedListRes.json();
    expect(attachedItems.some((d: any) => d.id === doc.document_id)).toBe(true);

    // 5. Attempt duplicate attachment (DOC-05) -> Expect 409 Conflict
    const dupAttachRes = await request.post(`${BASE_API}/api/v1/investigations/${inv.id}/documents/${doc.document_id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(dupAttachRes.status()).toBe(409);
    expect((await dupAttachRes.json()).detail).toMatch(/already attached/i);

    // 6. Detach document (DOC-06) -> Expect 204 No Content
    const detachRes = await request.delete(`${BASE_API}/api/v1/investigations/${inv.id}/documents/${doc.document_id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(detachRes.status()).toBe(204);

    // 7. Verify document is detached from investigation
    const postDetachList = await request.get(`${BASE_API}/api/v1/investigations/${inv.id}/documents`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect((await postDetachList.json()).some((d: any) => d.id === doc.document_id)).toBe(false);

    // 8. Verify document still exists in library
    const libRes = await request.get(`${BASE_API}/api/v1/documents/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect((await libRes.json()).items.some((d: any) => d.id === doc.document_id)).toBe(true);
  });

  test('DOC-07: Delete document removes record and chunks from library', async ({ request }) => {
    const docRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: {
          name: `del_doc_${Date.now()}.pdf`,
          mimeType: 'application/pdf',
          buffer: generateMinimalPdf('Document to be permanently removed.'),
        },
      },
    });
    const doc = await docRes.json();

    const delRes = await request.delete(`${BASE_API}/api/v1/documents/${doc.document_id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(delRes.status()).toBe(204);

    // Verify 404 on preview
    const previewRes = await request.get(`${BASE_API}/api/v1/documents/${doc.document_id}/preview`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(previewRes.status()).toBe(404);
  });

  // =========================================================================
  // OWNERSHIP & CROSS-USER ISOLATION
  // =========================================================================

  test('OWN-01: Cross-user investigation isolation strictly rejects foreign access', async ({ request }) => {
    // User A creates investigation
    const invRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: `USER_A_PRIVATE_INV_${Date.now()}` },
    });
    const inv = await invRes.json();
    createdInvestigationIds.push(inv.id);

    // User B attempts to read User A's investigation -> Expect 404
    const foreignGet = await request.get(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    expect(foreignGet.status()).toBe(404);

    // User B attempts to update User A's investigation -> Expect 404
    const foreignPatch = await request.patch(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
      data: { title: 'Hacked Title' },
    });
    expect(foreignPatch.status()).toBe(404);

    // User B attempts to delete User A's investigation -> Expect 404
    const foreignDelete = await request.delete(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    expect(foreignDelete.status()).toBe(404);

    // Verify User A's investigation was untouched
    const checkRes = await request.get(`${BASE_API}/api/v1/investigations/${inv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(checkRes.status()).toBe(200);
    expect((await checkRes.json()).title).toBe(inv.title);
  });

  test('OWN-02: Cross-user document isolation strictly rejects foreign attachment and deletion', async ({ request }) => {
    // User A uploads document
    const docRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: {
          name: `user_a_doc_${Date.now()}.pdf`,
          mimeType: 'application/pdf',
          buffer: generateMinimalPdf('User A confidential text.'),
        },
      },
    });
    const doc = await docRes.json();
    createdDocumentIds.push(doc.document_id);

    // User B creates their own investigation
    const userBInvRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
      data: { title: `USER_B_INV_${Date.now()}` },
    });
    const userBInv = await userBInvRes.json();

    // User B attempts to attach User A's document -> Expect 404 Document not found
    const foreignAttach = await request.post(
      `${BASE_API}/api/v1/investigations/${userBInv.id}/documents/${doc.document_id}`,
      { headers: { Authorization: `Bearer ${tokenUserB}` } }
    );
    expect(foreignAttach.status()).toBe(404);
    expect((await foreignAttach.json()).detail).toMatch(/document not found/i);

    // User B attempts to delete User A's document -> Expect 404
    const foreignDeleteDoc = await request.delete(`${BASE_API}/api/v1/documents/${doc.document_id}`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    expect(foreignDeleteDoc.status()).toBe(404);

    // Clean up User B's investigation
    await request.delete(`${BASE_API}/api/v1/investigations/${userBInv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
  });

  // =========================================================================
  // NEGATIVE TESTS & VALIDATION ERRORS
  // =========================================================================

  test('NEG-01: Input validation rejects invalid payloads and empty files', async ({ request }) => {
    // 1. Empty title on investigation create -> 422
    const emptyTitleRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: '' },
    });
    expect(emptyTitleRes.status()).toBe(422);

    // 2. Whitespace-only title on investigation update -> 422
    const validInvRes = await request.post(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: `TEST_VALID_INV_${Date.now()}` },
    });
    const validInv = await validInvRes.json();
    createdInvestigationIds.push(validInv.id);

    const spaceTitleRes = await request.patch(`${BASE_API}/api/v1/investigations/${validInv.id}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: '   ' },
    });
    expect(spaceTitleRes.status()).toBe(422);

    // 3. Empty file on upload -> 400
    const emptyFileRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: { name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.from('') },
      },
    });
    expect(emptyFileRes.status()).toBe(400);

    // 4. Corrupted bytes on upload -> 400
    const corruptedRes = await request.post(`${BASE_API}/api/v1/documents/upload`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      multipart: {
        file: { name: 'corrupted.pdf', mimeType: 'application/pdf', buffer: Buffer.from('NOT_A_VALID_PDF_HEADER') },
      },
    });
    expect(corruptedRes.status()).toBe(400);
  });

  test('NEG-02: Non-existent IDs return 404 without mutating database state', async ({ request }) => {
    const nonExistentId = 99999999;

    const res1 = await request.get(`${BASE_API}/api/v1/investigations/${nonExistentId}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(res1.status()).toBe(404);

    const res2 = await request.patch(`${BASE_API}/api/v1/investigations/${nonExistentId}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
      data: { title: 'New' },
    });
    expect(res2.status()).toBe(404);

    const res3 = await request.delete(`${BASE_API}/api/v1/investigations/${nonExistentId}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(res3.status()).toBe(404);

    const res4 = await request.delete(`${BASE_API}/api/v1/documents/${nonExistentId}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(res4.status()).toBe(404);
  });

  // =========================================================================
  // UI PERSISTENCE ACROSS NAVIGATION & RELOAD
  // =========================================================================

  test('UI-PER-01: UI investigation creation, module navigation, and full-page reload persistence', async ({ page, diagnostics, request }) => {
    const uniqueTitle = `UI_PERSIST_${Date.now()}`;

    // 1. Authenticate in browser session
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok) => {
      localStorage.setItem('access_token', tok);
      localStorage.setItem('opuslex_cookie_consent', 'all');
    }, tokenUserA);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/OpusLex Workspace/i)).toBeVisible({ timeout: 10000 });

    // 2. Navigate to Investigations module
    const invNav = page.locator('aside button:has-text("Investigations")');
    await expect(invNav).toBeVisible();
    await invNav.click();

    // 3. Fill creation form
    const titleInput = page.getByPlaceholder(/Investigation title/i).first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill(uniqueTitle);

    const descInput = page.getByPlaceholder(/Description \(optional\)/i).first();
    await descInput.fill('UI created investigation description');

    // 4. Click Create
    const createBtn = page
      .getByRole('button', { name: /^Create investigation$/i })
      .or(page.getByRole('button', { name: /^Create$/i }))
      .first();
    await createBtn.click();

    // 5. Verify investigation appears in active investigation list
    const invCard = page.locator(`text=${uniqueTitle}`).first();
    await expect(invCard).toBeVisible({ timeout: 10000 });

    // Find created investigation ID for cleanup
    const listRes = await request.get(`${BASE_API}/api/v1/investigations/`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const invItem = (await listRes.json()).find((i: any) => i.title === uniqueTitle);
    if (invItem) {
      createdInvestigationIds.push(invItem.id);
    }

    // 6. Navigate away to Governance module
    const govNav = page.locator('aside button:has-text("Governance")');
    await govNav.click();
    await expect(page.getByText(/Governance/i).first()).toBeVisible({ timeout: 7000 });

    // 7. Navigate back to Investigations module
    await invNav.click();
    await expect(page.locator(`text=${uniqueTitle}`).first()).toBeVisible({ timeout: 7000 });

    // 8. Full page reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`text=${uniqueTitle}`).first()).toBeVisible({ timeout: 10000 });

    expect(diagnostics.pageErrors).toEqual([]);
  });
});
