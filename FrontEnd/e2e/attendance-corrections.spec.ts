import { expect, test } from "@playwright/test";

test("an administrator reviews a student's correction request from the operations menu", async ({ page }) => {
  const user = { userId: "admin-test", email: "admin@example.test", fullName: "Admin", role: "ADMIN", status: "ACTIVE" };
  await page.addInitScript((account) => {
    localStorage.setItem("edunity-auth", JSON.stringify({
      state: { user: account, accessToken: "test-access", refreshToken: "test-refresh", isAuthenticated: true, rememberMe: true },
      version: 0,
    }));
  }, user);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { success: true, data: user } }));
  const item = {
    _id: "attendance-1", sessionId: { title: "Buổi 1" }, classId: { className: "Tiếng Anh giao tiếp" },
    studentId: { studentProfile: { fullName: "Nguyễn Minh" } }, attendanceStatus: "ABSENT", attendancePercentage: 25,
    correctionRequest: {
      _id: "request-1", reason: "Học viên có sự cố kết nối.", requestedStatus: "EXCUSED", status: "PENDING",
      requestedBy: { teacherProfile: { fullName: "Trần Hà" } },
    },
  };
  let reviewBody: object | undefined;
  await page.route((url) => url.pathname === "/api/admin/attendance-corrections", (route) =>
    route.fulfill({ json: {
      success: true, data: { items: reviewBody ? [] : [item], page: 1, pageSize: 20, total: reviewBody ? 0 : 1 },
    } })
  );
  await page.route("**/api/admin/attendance-corrections/attendance-1/request-1/review", (route) => {
    reviewBody = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, data: { status: "APPROVED" } } });
  });

  await page.goto("/admin/attendance-corrections");
  await expect(page.getByRole("link", { name: "Điều chỉnh điểm danh" })).toBeVisible();
  await page.getByRole("button", { name: "Xem và duyệt" }).click();
  await expect(page.getByText(item.correctionRequest.reason)).toBeVisible();
  await page.getByRole("combobox", { name: "Quyết định" }).click();
  await page.getByText("Duyệt thủ công", { exact: true }).click();
  await page.getByLabel("Lý do xử lý").fill("Đã kiểm tra nội dung yêu cầu.");
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByText("Chưa có yêu cầu ở trạng thái này.")).toBeVisible();
  expect(reviewBody).toEqual({
    decision: "MANUAL", attendanceStatus: "EXCUSED", reviewNote: "Đã kiểm tra nội dung yêu cầu.",
  });
});
