import { expect, test } from "@playwright/test";
import { getEnrollmentBlock } from "../src/utils/classEnrollmentWindow";

test("registration includes both endpoint instants and closes immediately after the deadline", () => {
  const enrollmentStart = "2026-12-01T00:00:00+07:00";
  const enrollmentEnd = "2026-12-01T10:00:00+07:00";
  const item = { status: "OPEN", isFull: false, enrollmentStart, enrollmentEnd };
  expect(getEnrollmentBlock(item, Date.parse(enrollmentStart) - 1)).toBe("Chưa mở đăng ký");
  expect(getEnrollmentBlock(item, Date.parse(enrollmentStart))).toBeNull();
  expect(getEnrollmentBlock(item, Date.parse(enrollmentEnd))).toBeNull();
  expect(getEnrollmentBlock(item, Date.parse(enrollmentEnd) + 1)).toBe("Đã hết hạn đăng ký");
  expect(getEnrollmentBlock({ ...item, isFull: true }, Date.parse(enrollmentStart))).toBe("Đã đủ chỗ");
  expect(getEnrollmentBlock({ ...item, status: "COMPLETED" }, Date.parse(enrollmentStart))).toBe("Đã kết thúc");
});

test("closed registration is disabled on both the public list and class detail", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-01T12:00:00+07:00"));
  const classItem = {
    _id: "registration-window",
    className: "Lớp kiểm thử hạn đăng ký",
    teacherName: "Giáo viên kiểm thử",
    classType: "PAID",
    status: "OPEN",
    capacity: 10,
    enrolledCount: 2,
    enrollmentEnd: "2026-12-01T10:00:00+07:00",
    startDate: "2026-12-04T10:00:00+07:00",
  };
  const mockData: Record<string, unknown> = {
    "/api/classes": { items: [classItem], page: 1, pageSize: 20, total: 1, totalPages: 1 },
    "/api/classes/registration-window": classItem,
    "/api/classes/registration-window/sessions": [],
    "/api/classes/registration-window/availability": { capacity: 10, enrolledCount: 2, remaining: 8, enrollmentOpen: false },
    "/api/catalog/filters": { subjects: [], courses: [] },
  };
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const { pathname } = new URL(route.request().url());
    return route.fulfill({ json: { success: true, data: mockData[pathname] ?? [] } });
  });

  await page.goto("/classes");
  await expect(page.getByRole("button", { name: "Đã hết hạn đăng ký" })).toBeDisabled();
  await page.goto("/classes/registration-window");
  await expect(page.getByRole("button", { name: "Đã hết hạn đăng ký" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Đăng nhập để đăng ký" })).toHaveCount(0);
});
