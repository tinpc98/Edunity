import { expect, test } from "@playwright/test";
import type { CreateClassPayload } from "../src/types/class";

test("teacher selects weekly times and saves the selected minutes in a new class", async ({ page }) => {
  const teacher = { userId: "teacher-one", email: "teacher@example.test", fullName: "Giáo viên", role: "TEACHER", status: "ACTIVE" };
  const course = {
    _id: "course-one", title: "Toán lớp 8", categoryId: "category-one", subjectId: "subject-one",
    subjectName: "Toán", gradeLevel: "GRADE_8", status: "ACTIVE",
  };
  const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
  const mockData: Record<string, unknown> = {
    "/api/auth/me": teacher,
    "/api/teacher/verification": { verificationStatus: "VERIFIED" },
    "/api/teacher/contracts": [{ status: "ACTIVE", effectiveFrom: "2026-01-01", expiresAt: "2028-01-01" }],
    "/api/teacher/subject-authorizations": paged([{ _id: "auth-one", subjectId: course.subjectId, gradeLevel: "GRADE_8", status: "APPROVED" }]),
    "/api/courses": paged([course]),
  };
  await page.clock.setFixedTime(new Date("2026-11-26T10:00:00+07:00"));
  await page.addInitScript((account) => {
    localStorage.setItem("edunity-auth", JSON.stringify({
      state: { user: account, accessToken: "test-access", refreshToken: "test-refresh", isAuthenticated: true, rememberMe: true },
      version: 0,
    }));
  }, teacher);
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  let saved: CreateClassPayload | undefined;
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/teacher/classes" && route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { success: true, data: { _id: "class-one", ...saved } } });
    }
    return route.fulfill({ json: { success: true, data: mockData[pathname] ?? [] } });
  });

  await page.goto("/teacher/classes/create");
  await page.getByText(course.title, { exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  const addSlot = page.getByRole("button", { name: /Thêm ca học/ });
  await addSlot.click();

  const choose = async (label: string, value: string) => {
    const input = page.getByRole("combobox", { name: label, exact: true });
    await input.fill(value);
    const dropdown = page.locator(".ant-select-dropdown:visible");
    await dropdown.locator(".ant-select-item-option").getByText(value, { exact: true }).click();
    await expect(dropdown).toHaveCount(0);
  };
  const selectTime = async (label: string, hour: string, minute: string) => {
    await choose(`Giờ ${label}`, hour);
    await choose(`Phút ${label}`, minute);
  };

  await selectTime("bắt đầu ca 1", "09", "15");
  await selectTime("kết thúc ca 1", "08", "30");
  await expect(page.getByRole("alert").filter({ hasText: "Giờ bắt đầu phải trước giờ kết thúc" })).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByText("Ca học chưa hợp lệ: hãy sửa các ca được đánh dấu đỏ.")).toBeVisible();
  expect(saved).toBeUndefined();
  await selectTime("kết thúc ca 1", "10", "17");
  await expect(page.getByRole("alert").filter({ hasText: "Giờ bắt đầu phải trước giờ kết thúc" })).toHaveCount(0);

  await addSlot.click();
  await expect(page.getByRole("combobox", { name: "Phút bắt đầu ca 2" })).toBeDisabled();
  await selectTime("bắt đầu ca 2", "14", "05");
  await selectTime("kết thúc ca 2", "15", "00");

  const enrollmentEnd = page.getByLabel("Hạn chót tuyển sinh");
  await enrollmentEnd.fill("29/11/2026");
  await enrollmentEnd.press("Tab");
  const startDate = page.getByLabel("Ngày bắt đầu lớp");
  await startDate.fill("30/11/2026");
  await startDate.press("Tab");
  await page.getByLabel("Mô tả lớp học & Mục tiêu đào tạo").fill("Lớp luyện tập Toán lớp 8.");
  await expect(page.getByText("09:15 – 10:17", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("14:05 – 15:00", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect.poll(() => saved?.schedule).toEqual([
    { dayOfWeek: 1, startTime: "09:15", endTime: "10:17" },
    { dayOfWeek: 2, startTime: "14:05", endTime: "15:00" },
  ]);
});
