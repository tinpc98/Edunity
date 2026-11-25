const request = require("supertest");
const app = require("../src/app");
const { User } = require("../src/models");
const { issueRefreshToken } = require("../src/services/authTokenService");
const { connectDB, clearDB, disconnectDB } = require("./helpers/db");

const post = (path, body) => request(app).post(`/api/auth${path}`).send(body);
const email = "student@reset.test";
const initialPassword = "before-reset123";
const configuredEnv = {
  RESEND_API_KEY: "test-provider-key",
  PASSWORD_RESET_FROM: "Edunity <mail@example.test>",
  PASSWORD_RESET_WEB_ORIGIN: "https://example.test",
};
let delivery;
let savedEnv;

beforeAll(connectDB);
afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  savedEnv = Object.fromEntries(Object.keys(configuredEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, configuredEnv);
  delivery = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true });
  const registered = await post("/register", { email, fullName: "Học viên", password: initialPassword, role: "STUDENT" });
  expect(registered.status).toBe(201);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const requestLink = async () => {
  const response = await post("/forgot-password", { email });
  expect(response.status).toBe(202);
  const mail = JSON.parse(delivery.mock.calls.at(-1)[1].body);
  return new URL(mail.text.match(/https:\/\/\S+/)[0]);
};

test("only sends to the registered address and returns the same response for an unknown address", async () => {
  const unknown = await post("/forgot-password", { email: "unknown@reset.test" });
  expect(unknown.status).toBe(202);
  expect(delivery).not.toHaveBeenCalled();
  const link = await requestLink();
  expect(link.origin + link.pathname).toBe("https://example.test/reset-password");
  expect(link.hash).toHaveLength(44);
  expect(unknown.body).toEqual((await post("/forgot-password", { email })).body);
  expect(delivery).toHaveBeenCalledTimes(1);
  const user = await User.findOne({ email }).select("+passwordResetHash").lean();
  expect(user.passwordResetHash).toMatch(/^[a-f0-9]{64}$/);
  expect(user.passwordResetHash).not.toBe(link.hash.slice(1));
});

test("consumes the link once and invalidates the existing access and refresh tokens", async () => {
  const login = await post("/login", { email, password: initialPassword });
  const { accessToken, refreshToken } = login.body.data;
  const before = await User.findOne({ email }).lean();
  const token = (await requestLink()).hash.slice(1);
  const password = "after-reset123";

  const attempts = await Promise.all([
    post("/reset-password", { token, password }),
    post("/reset-password", { token, password }),
  ]);
  expect(attempts.map(({ status }) => status).sort()).toEqual([200, 400]);
  expect((await post("/login", { email, password: initialPassword })).status).toBe(401);
  expect((await post("/login", { email, password })).status).toBe(200);
  expect((await post("/refresh", { refreshToken })).status).toBe(401);
  const lateIssuance = await issueRefreshToken(before._id, {}, before.tokenVersion);
  expect((await post("/refresh", { refreshToken: lateIssuance.token })).status).toBe(401);
  expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
});

test("rejects expired links and reports a missing mail configuration before sending", async () => {
  const token = (await requestLink()).hash.slice(1);
  await User.updateOne({ email }, { $set: { passwordResetExpiresAt: new Date(0) } });
  const expired = await post("/reset-password", { token, password: "after-reset123" });
  expect(expired.body.error).toBe("INVALID_PASSWORD_RESET");
  delete process.env.RESEND_API_KEY;
  const unavailable = await post("/forgot-password", { email });
  expect(unavailable.status).toBe(503);
  expect(unavailable.body.error).toBe("PASSWORD_RESET_UNAVAILABLE");
  expect(delivery).toHaveBeenCalledTimes(1);
});
