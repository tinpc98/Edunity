import { test, expect, type Page } from '@playwright/test';

// Helper to seed localStorage with authenticated user
async function setupTeacherAuth(
  page: Page,
  teacher: { id: string; email: string; fullName: string; role: string; status: string }
) {
  await page.addInitScript((authUser) => {
    window.localStorage.setItem(
      'edunity-auth',
      JSON.stringify({
        state: {
          user: authUser,
          accessToken: 'mock-jwt-token-teacher',
          refreshToken: 'mock-refresh-token-teacher',
          isAuthenticated: true,
          rememberMe: true,
        },
        version: 0,
      })
    );
  }, teacher);
}

test.describe('E2E Browser Test Suite: Teacher Revenue & Bank Account Lifecycle', () => {
  test('1. Teacher WITHOUT bank account: page does NOT crash, displays registration card, disables payout', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const teacher = {
      id: 'teacher-no-bank',
      email: 'khang.tran@example.test',
      fullName: 'Trần Minh Khang',
      role: 'TEACHER',
      status: 'ACTIVE',
    };

    await setupTeacherAuth(page, teacher);
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { success: true, data: teacher } })
    );

    // Backend returns null when teacher has no bank account
    await page.route('**/api/teacher/bank-account', (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );

    await page.route('**/api/teacher/earnings', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            summary: {
              totalGross: 0,
              totalCommission: 0,
              totalNet: 0,
              pending: 0,
              available: 0,
              paidOut: 0,
            },
          },
        },
      })
    );

    await page.route('**/api/teacher/settlements', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            summary: {
              pendingHeld: 0,
              pendingMaturing: 0,
              available: 0,
              inPayout: 0,
              paidOut: 0,
              totalNet: 0,
            },
            window: {
              isMondayWithdrawalWindow: false,
              notice: 'Cổng rút tiền mở vào Thứ Hai hàng tuần từ 08:00 đến 17:00 (GMT+7)',
            },
          },
        },
      })
    );

    await page.route('**/api/teacher/payouts*', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 5,
          },
        },
      })
    );

    await page.goto('/teacher/revenue');
    await page.waitForLoadState('networkidle');

    // 1. Verify page title is rendered (NOT white screen / crashed)
    await expect(page.locator('text=Quản lý Doanh thu & Quyết toán Thù lao')).toBeVisible();

    // 2. Verify bank account card displays friendly prompt for unregistered account
    await expect(page.locator('text=Chưa có tài khoản nhận tiền')).toBeVisible();
    await expect(page.locator('button:has-text("Đăng ký tài khoản")')).toBeVisible();

    // 3. Verify Payout button is disabled and indicates verified account requirement
    const payoutButton = page.locator('button:has-text("Cần tài khoản nhận tiền đã duyệt")');
    await expect(payoutButton).toBeVisible();
    await expect(payoutButton).toBeDisabled();

    // 4. Verify no TypeError regarding color was thrown
    const colorError = consoleErrors.find((e) => e.includes("Cannot read properties of undefined (reading 'color')"));
    expect(colorError).toBeUndefined();
  });

  test('2. Teacher WITH verified bank account (under lock): displays account details, tag Đã duyệt, blocks payout', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const teacher = {
      id: 'teacher-with-bank',
      email: 'ngoc.le@example.test',
      fullName: 'Lê Bảo Ngọc',
      role: 'TEACHER',
      status: 'ACTIVE',
    };

    await setupTeacherAuth(page, teacher);
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { success: true, data: teacher } })
    );

    // Bank account with 72-hour lock in the future
    const futureLock = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await page.route('**/api/teacher/bank-account', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            bankName: 'TechcomBank',
            accountNumberMasked: '••••0123',
            accountHolderName: 'LE BAO NGOC',
            status: 'VERIFIED',
            submittedAt: '2026-11-26T09:00:00.000Z',
            payoutLockedUntil: futureLock,
            reviewedAt: '2026-11-26T09:05:00.000Z',
            reviewNote: null,
          },
        },
      })
    );

    await page.route('**/api/teacher/earnings', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            summary: {
              totalGross: 5000000,
              totalCommission: 500000,
              totalNet: 4500000,
              pending: 0,
              available: 4500000,
              paidOut: 0,
            },
          },
        },
      })
    );

    await page.route('**/api/teacher/settlements', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            summary: {
              pendingHeld: 0,
              pendingMaturing: 0,
              available: 4500000,
              inPayout: 0,
              paidOut: 0,
              totalNet: 4500000,
            },
            window: {
              isMondayWithdrawalWindow: true, // Simulate Monday
              notice: 'Cổng rút tiền đang mở',
            },
          },
        },
      })
    );

    await page.route('**/api/teacher/payouts*', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 5,
          },
        },
      })
    );

    await page.goto('/teacher/revenue');
    await page.waitForLoadState('networkidle');

    // 1. Verify bank details are displayed correctly
    await expect(page.locator('text=TechcomBank · ••••0123')).toBeVisible();
    await expect(page.locator('text=LE BAO NGOC')).toBeVisible();
    await expect(page.locator('.ant-tag:has-text("Đã duyệt")')).toBeVisible();

    // 2. Verify temporary payout lock notice is shown
    await expect(page.locator('text=Vì tài khoản vừa thay đổi, rút tiền tạm khoá đến')).toBeVisible();
    await expect(page.locator('button:has-text("Đổi tài khoản")')).toBeVisible();

    // 3. Verify Payout button is disabled due to active lock (fail-safe)
    const payoutButton = page.locator('button:has-text("Tài khoản đang tạm khóa rút tiền")');
    await expect(payoutButton).toBeVisible();
    await expect(payoutButton).toBeDisabled();

    // 4. Verify no console errors
    const colorError = consoleErrors.find((e) => e.includes("Cannot read properties of undefined (reading 'color')"));
    expect(colorError).toBeUndefined();
  });

  test('3. Corrupted lock timestamp fail-safe test: invalid date string MUST block payout', async ({ page }) => {
    const teacher = {
      id: 'teacher-corrupt-date',
      email: 'corrupt.date@example.test',
      fullName: 'Teacher Test',
      role: 'TEACHER',
      status: 'ACTIVE',
    };

    await setupTeacherAuth(page, teacher);
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { success: true, data: teacher } })
    );

    // Corrupted lock date string
    await page.route('**/api/teacher/bank-account', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            bankName: 'Vietcombank',
            accountNumberMasked: '••••9999',
            accountHolderName: 'TEACHER TEST',
            status: 'VERIFIED',
            submittedAt: '2026-11-26T09:00:00.000Z',
            payoutLockedUntil: 'INVALID_CORRUPTED_DATE_STRING',
          },
        },
      })
    );

    await page.route('**/api/teacher/earnings', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: { items: [], summary: { totalGross: 0, totalCommission: 0, totalNet: 0, pending: 0, available: 1000000, paidOut: 0 } },
        },
      })
    );

    await page.route('**/api/teacher/settlements', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            summary: { pendingHeld: 0, pendingMaturing: 0, available: 1000000, inPayout: 0, paidOut: 0, totalNet: 1000000 },
            window: { isMondayWithdrawalWindow: true },
          },
        },
      })
    );

    await page.route('**/api/teacher/payouts*', (route) =>
      route.fulfill({ json: { success: true, data: { items: [], total: 0, page: 1, pageSize: 5 } } })
    );

    await page.goto('/teacher/revenue');
    await page.waitForLoadState('networkidle');

    // Fail-safe verification: corrupted date MUST be treated as locked, button MUST be disabled
    const payoutButton = page.locator('button:has-text("Tài khoản đang tạm khóa rút tiền")');
    await expect(payoutButton).toBeVisible();
    await expect(payoutButton).toBeDisabled();
  });
});
