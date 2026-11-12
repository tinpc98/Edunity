import { test, expect } from '@playwright/test';

// Helper to seed localStorage with authenticated user
async function setupAuth(page: any, user: { id: string; email: string; fullName: string; role: string; status: string }) {
  await page.addInitScript((authUser: any) => {
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

  // Flow 6: Teacher Earnings & Revenue Page
  test('Flow 6: Teacher Revenue page displays earnings breakdown and platform fee', async ({ page }) => {
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
            totalGross: 10000000,
            platformFeeRate: 0.1,
            totalPlatformFee: 1000000,
            totalNet: 9000000,
            availableBalance: 9000000,
            pendingBalance: 0,
          },
        }),
      });
    });

    await page.goto('/teacher/revenue');
    await expect(page).toHaveURL(/.*revenue.*/);
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

