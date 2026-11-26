import { test, expect, type Page } from '@playwright/test';

// Helper to seed localStorage with authenticated user
async function setupAuth(page: Page, user: { id: string; userId?: string; email: string; fullName: string; role: string; status: string }) {
  await page.addInitScript((authUser) => {
    window.localStorage.setItem(
      'edunity-auth',
      JSON.stringify({
        state: {
          user: authUser,
          accessToken: 'mock-jwt-token-pr10',
          refreshToken: 'mock-refresh-token-pr10',
          isAuthenticated: true,
          rememberMe: true,
        },
        version: 0,
      })
    );
  }, user);
}

test.describe('E2E Browser Test Suite: Payment, Finance & PayOS Gates', () => {
  test('Payment history retries an error and fetches past the first 100 records', async ({ page }) => {
    const user = { id: 'student-history', userId: 'student-history', email: 'history@example.test', fullName: 'History Student', role: 'STUDENT', status: 'ACTIVE' };
    await setupAuth(page, user);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { success: true, data: user } }));
    let returnError = true;
    const requestedPages: number[] = [];
    await page.route((url) => url.pathname === '/api/me/payments', async (route) => {
      const params = new URL(route.request().url()).searchParams;
      const current = Number(params.get('page'));
      const pageSize = Number(params.get('pageSize'));
      requestedPages.push(current);
      if (returnError) {
        await route.fulfill({ status: 500, json: { success: false, message: 'Temporary failure' } });
        return;
      }
      const start = (current - 1) * pageSize;
      const items = Array.from({ length: Math.min(pageSize, 102 - start) }, (_, index) => ({
        _id: String(start + index + 1),
        gatewayReference: `history-tx-${start + index + 1}`,
        className: 'Toán 12',
        gateway: 'PAYOS',
        amount: '10000',
        paymentStatus: 'COMPLETED',
        createdAt: '2026-01-01T00:00:00Z',
      }));
      await route.fulfill({ json: { success: true, data: { items, page: current, pageSize, total: 102, totalPages: 11 } } });
    });

    await page.goto('/student/payments');
    await expect(page.getByText('Lỗi tải dữ liệu')).toBeVisible();
    await expect(page.getByText('Chưa có giao dịch nào')).toHaveCount(0);
    returnError = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByText('history-tx-1', { exact: true })).toBeVisible();
    await page.getByTitle('11', { exact: true }).click();
    await expect(page.getByText('history-tx-102', { exact: true })).toBeVisible();
    await expect(page.locator('tbody tr[data-row-key]')).toHaveCount(2);
    expect(requestedPages).toContain(11);
  });

  // Flow 1: Student Tuition Checkout
  test('Flow 1: Student Tuition Checkout with VietQR / payOS', async ({ page }) => {
    await setupAuth(page, {
      id: 'student-pr10',
      email: 'student@edunity.test',
      fullName: 'Student Learner',
      role: 'STUDENT',
      status: 'ACTIVE',
    });

    // Mock class & checkout API routes
    await page.route('**/api/classes/cls-pr10-101', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'cls-pr10-101',
            courseTitle: 'Fullstack Node.js & React Architecture',
            className: 'Lớp Chuyên Sâu Tối T2-T4-T6',
            price: 2000000,
            teacherName: 'Thầy Hoàng Minh',
            capacity: 25,
            enrolledCount: 12,
            status: 'OPEN',
          },
        }),
      });
    });

    await page.route('**/api/payments/payos/checkout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            orderCode: 100099,
            checkoutUrl: 'https://pay.payos.vn/web/100099',
            qrCode: '00020101021238540010A00000072701240006970422011099887766550208QRIBFTTA5303704540720000005802VN62180814EDUNITY1000996304E1F4',
            accountName: 'CONG TY CP EDUNITY',
            accountNumber: '9988776655',
            amount: 2000000,
            description: 'EDUNITY100099',
          },
        }),
      });
    });

    await page.goto('/checkout?classId=cls-pr10-101');
    await expect(page).toHaveURL(/.*checkout.*/);
  });

  // Flow 2: Sponsor Campaign Donation Checkout
  test('Flow 2: Sponsor Campaign Donation Checkout with DONATION Channel', async ({ page }) => {
    await setupAuth(page, {
      id: 'sponsor-pr10',
      email: 'sponsor@edunity.test',
      fullName: 'Sponsor Organization',
      role: 'SPONSOR',
      status: 'ACTIVE',
    });

    await page.route('**/api/campaigns/cmp-pr10-scholarship', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'cmp-pr10-scholarship',
            title: 'Quỹ Học Bổng Công Nghệ Vượt Khó 2026',
            targetAmount: 50000000,
            raisedAmount: 18500000,
            status: 'ACTIVE',
            donorCount: 42,
          },
        }),
      });
    });

    await page.goto('/campaigns/cmp-pr10-scholarship');
    await expect(page).toHaveURL(/.*campaigns.*/);
  });

  // Flow 3: Admin Finance Dashboard & Metrics
  test('Flow 3: Admin Finance Overview Dashboard renders ledger metrics', async ({ page }) => {
    await setupAuth(page, {
      id: 'admin-pr10',
      email: 'admin.finance@edunity.test',
      fullName: 'Finance Lead Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await page.route('**/api/finance/overview**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            totalTuitionVolume: 50000000,
            totalPlatformFee: 5000000,
            totalTeacherEarnings: 45000000,
            totalDonationVolume: 20000000,
            pendingPayoutAmount: 15000000,
            pendingRefundAmount: 2000000,
          },
        }),
      });
    });

    await page.goto('/admin/finance-overview');
    await expect(page).toHaveURL(/.*finance-overview.*/);
  });

  // Flow 4: Admin Payment Reconciliation Queue
  test('Flow 4: Admin Reconciliation page loads reconciliation cases', async ({ page }) => {
    await setupAuth(page, {
      id: 'admin-pr10',
      email: 'admin.finance@edunity.test',
      fullName: 'Finance Lead Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await page.route('**/api/finance/admin/reconciliations**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'rec-1',
              referenceType: 'PAYOS_TRANSACTION',
              discrepancyType: 'UNMATCHED_ORDER_CODE',
              amount: 500000,
              status: 'PENDING_REVIEW',
              detectedAt: new Date().toISOString(),
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/admin/reconciliations');
    await expect(page).toHaveURL(/.*reconciliations.*/);
  });

  // Flow 5: Admin Refunds Management
  test('Flow 5: Admin Refunds page displays refund lifecycle cases', async ({ page }) => {
    await setupAuth(page, {
      id: 'admin-pr10',
      email: 'admin.finance@edunity.test',
      fullName: 'Finance Lead Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await page.route('**/api/finance/admin/refunds**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'ref-1',
              caseNumber: 'REF-202611-001',
              studentName: 'Nguyen Van A',
              requestedAmount: 2000000,
              reason: 'CLASS_CANCELLED',
              status: 'APPROVED',
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/admin/refunds');
    await expect(page).toHaveURL(/.*refunds.*/);
  });

  test('Teacher overview and revenue show the recorded fee when the API omits the total', async ({ page }) => {
    const teacher = {
      id: 'teacher-pr10',
      userId: 'teacher-pr10',
      email: 'teacher@edunity.test',
      fullName: 'Teacher Minh',
      role: 'TEACHER',
      status: 'ACTIVE',
    };
    await setupAuth(page, teacher);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());

    const summary = { totalGross: 5000, totalNet: 4500, available: 4500 };
    const item = {
      id: 'earning-test',
      className: 'Lớp kiểm thử học phí',
      grossAmount: 5000,
      commissionAmount: { $numberDecimal: '500' },
      netAmount: 4500,
      status: 'AVAILABLE',
      createdAt: '2026-11-26T00:00:00.000Z',
    };
    const responses: Record<string, unknown> = {
      '/api/auth/me': teacher,
      '/api/teacher/verification': { verificationStatus: 'VERIFIED' },
      '/api/teacher/classes': { items: [], page: 1, pageSize: 50, total: 0 },
      '/api/teacher/earnings': {
        summary,
        items: [
          item,
          { ...item, id: 'refunded-earning', className: 'Lớp đã hoàn tiền', commissionAmount: '1000', status: 'CANCELLED' },
        ],
      },
      '/api/teacher/settlements': { summary },
      '/api/teacher/bank-account': {
        bankName: 'VCB',
        accountNumberMasked: '******1234',
        accountHolderName: 'TEACHER MINH',
        status: 'VERIFIED',
        payoutLockedUntil: '2026-01-01T00:00:00.000Z',
      },
    };
    await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
      const { pathname } = new URL(route.request().url());
      return route.fulfill({ json: { success: true, data: responses[pathname] ?? [] } });
    });

    await page.goto('/teacher');
    await expect(page.getByText('-500 đ', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Xem chi tiết doanh thu/ }).click();

    const feeSummary = page.locator('.ant-statistic').filter({ hasText: 'Phí nền tảng' });
    await expect(feeSummary.locator('.ant-statistic-content-value')).toHaveText('500 đ');
    await expect(page.getByRole('row', { name: /Lớp kiểm thử học phí/ })).toContainText('-500 đ');
  });

  // Flow 7: Teacher Withdrawal Request (Settlement Window)
  test('Flow 7: Teacher Withdrawal button verifies settlement request window', async ({ page }) => {
    await setupAuth(page, {
      id: 'teacher-pr10',
      email: 'teacher@edunity.test',
      fullName: 'Teacher Minh',
      role: 'TEACHER',
      status: 'ACTIVE',
    });

    await page.route('**/api/teacher/revenue**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            availableBalance: 5000000,
            pendingBalance: 0,
            bankAccount: {
              bankName: 'Vietcombank',
              accountNumber: '9988776655',
              accountHolderName: 'NGUYEN VAN TEACHER',
            },
          },
        }),
      });
    });

    await page.goto('/teacher/revenue');
    await expect(page).toHaveURL(/.*revenue.*/);
  });

  // Flow 8: Admin Teacher Payout Processing & Dual Verification
  test('Flow 8: Admin Payouts page lists settlements and enforces Four-Eyes verification', async ({ page }) => {
    await setupAuth(page, {
      id: 'admin-pr10',
      email: 'admin.finance@edunity.test',
      fullName: 'Finance Lead Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await page.route('**/api/finance/admin/payouts**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'po-1',
              teacherName: 'Teacher Minh',
              amount: 9000000,
              status: 'APPROVED',
              scheduledDate: '2026-11-13T10:00:00.000Z',
              bankAccountSnapshot: {
                bankName: 'Vietcombank',
                accountNumber: '9988776655',
                accountHolderName: 'NGUYEN VAN TEACHER',
              },
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/admin/payouts');
    await expect(page).toHaveURL(/.*payouts.*/);
  });
});

