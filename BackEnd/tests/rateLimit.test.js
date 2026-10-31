const request = require("supertest");
process.env.RATE_LIMIT_IN_TEST = "1"; // the limits are off for the other suites
const app = require("../src/app");
const { User } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB } = require("./helpers/db");

const login = (email, password) => request(app).post("/api/auth/login").send({ email, password });

beforeAll(connectDB);
afterAll(async () => {
  delete process.env.RATE_LIMIT_IN_TEST;
  await disconnectDB();
});

describe("P1: rate limits", () => {
  beforeAll(async () => {
    await clearDB();
    const passwordHash = hashPassword("password1");
    await User.create({ email: "hs@test.com", passwordHash, role: "STUDENT", status: "ACTIVE", studentProfile: { fullName: "HS" } });
    await User.create({ email: "hs2@test.com", passwordHash, role: "STUDENT", status: "ACTIVE", studentProfile: { fullName: "HS2" } });
    await User.create({ email: "hs3@test.com", passwordHash, role: "STUDENT", status: "ACTIVE", studentProfile: { fullName: "HS3" } });
    await User.create({ email: "hs4@test.com", passwordHash, role: "STUDENT", status: "ACTIVE", studentProfile: { fullName: "HS4" } });
  });

  it("blocks an account after 10 failed logins, without touching other accounts", async () => {
    for (let i = 0; i < 10; i++) expect((await login("hs@test.com", `wrong${i}`)).statusCode).toBe(401);

    const blocked = await login("hs@test.com", "password1");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.error).toBe("RATE_LIMITED");
    expect((await login("hs2@test.com", "password1")).statusCode).toBe(200);
  });

  it("limits reports per account, not per network", async () => {
    const tokenOf = async (email) => (await login(email, "password1")).body.data.accessToken;
    const [one, two] = [await tokenOf("hs3@test.com"), await tokenOf("hs4@test.com")];
    const report = (token) =>
      request(app).post("/api/reports").set("Authorization", `Bearer ${token}`).send({ type: "OTHER", description: "x", reportedUserId: "000000000000000000000000" });
    for (let i = 0; i < 20; i++) expect((await report(one)).statusCode).not.toBe(429);
    expect((await report(one)).statusCode).toBe(429);
    expect((await report(two)).statusCode).not.toBe(429);
  });

  it("successful logins do not use up the allowance", async () => {
    for (let i = 0; i < 15; i++) expect((await login("hs2@test.com", "password1")).statusCode).toBe(200);
  });
});
