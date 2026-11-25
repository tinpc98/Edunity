import { expect, test } from "@playwright/test";

test("requests a reset from the login page and sets a new password from the email link", async ({ page }) => {
  const email = "student@example.test";
  const token = "A".repeat(43);
  let requestedEmail: string | undefined;
  let resetBody: { token: string; password: string } | undefined;
  await page.route("**/api/auth/forgot-password", (route) => {
    requestedEmail = route.request().postDataJSON().email;
    return route.fulfill({ status: 202, json: { success: true, data: { accepted: true } } });
  });
  await page.route("**/api/auth/reset-password", (route) => {
    resetBody = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, data: { changed: true } } });
  });

  await page.goto("/login");
  await page.getByRole("link", { name: "Quên mật khẩu?" }).click();
  await page.getByLabel("Email đã đăng ký").fill(email);
  await page.getByRole("button", { name: "Gửi liên kết đặt lại" }).click();
  await expect(page.getByText("Hãy kiểm tra email")).toBeVisible();
  expect(requestedEmail).toBe(email);

  await page.goto(`/reset-password#${token}`);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("New-password123");
  await page.getByLabel("Nhập lại mật khẩu").fill("New-password123");
  await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
  await expect(page.getByText("Đã đặt mật khẩu mới")).toBeVisible();
  expect(resetBody).toEqual({ token, password: "New-password123" });
});
