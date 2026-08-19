import { test, expect, type Page } from '@playwright/test';

type PreviewRole = 'STAFF' | 'REGISTRAR' | 'VC';

const users = {
  STAFF: {
    id: 'synthetic-staff-001',
    email: 'staff@example.edu.ng',
    phone: null,
    isActive: true,
    mfaEnabled: false,
    lastLoginAt: null,
    roles: [{ roleName: 'STAFF', staffScope: null, grantedAt: '2026-01-01T00:00:00.000Z' }],
    effectiveRoles: ['STAFF'],
    effectiveScopes: [],
    delegatedRoles: [],
    primaryRole: 'STAFF',
    staffScope: null,
  },
  REGISTRAR: {
    id: 'synthetic-registrar-001',
    email: 'registrar@example.edu.ng',
    phone: null,
    isActive: true,
    mfaEnabled: false,
    lastLoginAt: null,
    roles: [{ roleName: 'REGISTRAR', staffScope: null, grantedAt: '2026-01-01T00:00:00.000Z' }],
    effectiveRoles: ['REGISTRAR'],
    effectiveScopes: [],
    delegatedRoles: [],
    primaryRole: 'REGISTRAR',
    staffScope: null,
  },
  VC: {
    id: 'synthetic-vc-001',
    email: 'vc@example.edu.ng',
    phone: null,
    isActive: true,
    mfaEnabled: true,
    lastLoginAt: null,
    roles: [{ roleName: 'VC', staffScope: null, grantedAt: '2026-01-01T00:00:00.000Z' }],
    effectiveRoles: ['VC'],
    effectiveScopes: [],
    delegatedRoles: [],
    primaryRole: 'VC',
    staffScope: null,
  },
} as const;

async function preparePreview(page: Page, role: PreviewRole) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/payroll/')) requests.push(request.url());
  });

  await page.context().addCookies([
    { name: 'session_active', value: 'synthetic-preview-only', domain: '127.0.0.1', path: '/' },
  ]);

  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: users[role] }),
  }));
  await page.route('**/api/v1/settings/public/branding', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      institutionName: 'Synthetic University',
      institutionCode: 'SYNTH',
      institutionType: 'UNIVERSITY',
      logoUrl: null,
      primaryColor: '#005eb8',
    } }),
  }));
  await page.route('**/api/v1/reports/analytics/my-dashboard', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      kind: 'workspace',
      data: { students: 0, courses: 0, pendingResults: 0, scope: {} },
    } }),
  }));
  await page.route('**/api/v1/payroll/runs?year=*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.route('**/api/v1/payroll/staff/*/payslips', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));

  await page.goto('/dashboard/payroll', { waitUntil: 'networkidle' });
  return requests;
}

test('Staff sees own payslips without requesting payroll runs', async ({ page }) => {
  const requests = await preparePreview(page, 'STAFF');

  await expect(page.getByRole('link', { name: 'Payroll' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'My Payslips' })).toBeVisible();
  await expect(page.getByText('No payslips on record yet.')).toBeVisible();
  expect(requests.some((url) => url.includes('/payroll/runs'))).toBe(false);
  expect(requests.some((url) => url.includes('/payroll/staff/'))).toBe(true);
});

test('Registrar sees payroll runs but not protected run payslips', async ({ page }) => {
  const requests = await preparePreview(page, 'REGISTRAR');

  await expect(page.getByRole('link', { name: 'Payroll' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Payroll Runs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Payslips', exact: true })).toHaveCount(0);
  await expect(page.getByText(/No payroll runs for/)).toBeVisible();
  expect(requests.some((url) => url.includes('/payroll/runs?year='))).toBe(true);
  expect(requests.some((url) => url.includes('/payslips'))).toBe(false);
});

test('VC receives an explicit restricted state and no payroll requests', async ({ page }) => {
  const requests = await preparePreview(page, 'VC');

  await expect(page.getByRole('link', { name: 'Payroll' })).toHaveCount(0);
  await expect(page.getByText('Access restricted')).toBeVisible();
  await expect(page.getByText(/Payroll access is limited/)).toBeVisible();
  expect(requests).toHaveLength(0);
});
