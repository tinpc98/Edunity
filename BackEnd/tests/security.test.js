const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));

const crypto = require("crypto");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { User, RefreshToken, ScholarshipCampaign, Class, Session, Enrollment } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { getSecret } = require("../src/utils/jwt");
const { validateEnv } = require("../src/config/env");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const STRONG = {
  JWT_SECRET: "a".repeat(40),
  FILE_URL_SECRET: "b".repeat(40),
  PAYMENT_WEBHOOK_SECRET: "c".repeat(40),
  ROOM_TOKEN_SECRET: "d".repeat(40),
};
const PROD = { NODE_ENV: "production", CORS_ORIGIN: "https://edunity.example", ...STRONG };
const ALL_KEYS = ["NODE_ENV", "CORS_ORIGIN", ...Object.keys(STRONG), "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
const NON_TEST_ENVS = [undefined, "development", "staging", "Production", "prod", "production"];

/** Runs fn with exactly these env values (the rest of ALL_KEYS unset), then restores. */
const withEnv = async (values, fn) => {
  const saved = Object.fromEntries(ALL_KEYS.map((key) => [key, process.env[key]]));
  ALL_KEYS.forEach((key) => delete process.env[key]);
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) process.env[key] = value;
  });
  try {
    return await fn();
  } finally {
    ALL_KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const ADMIN_ONLY = "/api/admin/users";
const PASSWORD = "password1";
let admin, teacher, student;

const signFor = (user, secret, options = {}) =>
  jwt.sign({ role: user.role }, secret, { algorithm: "HS256", issuer: "edunity", subject: user._id.toString(), expiresIn: "1h", ...options });

const login = (email, password = PASSWORD) => request(app).post("/api/auth/login").send({ email, password });

const paidClass = (name = "Lớp có phí") => {
  const id = teacher._id;
  return Class.create({
    courseId: id, courseTitle: "Khoá", teacherId: id, teacherName: "GV", categoryId: id, subjectId: id, className: name,
    classType: "PAID", price: 500000, capacity: 5, status: "OPEN", reviewedBy: admin._id, reviewNote: "ghi chú nội bộ",
    enrollmentStart: new Date(Date.now() - 864e5), enrollmentEnd: new Date(Date.now() + 864e5), startDate: new Date(Date.now() + 2 * 864e5),
  });
};

const pendingPayment = async () => {
  const session = await login("hs@test.com");
  const headers = bearer(session.body.data.accessToken);
  const cls = await paidClass();
  const enrollment = await request(app).post(`/api/classes/${cls._id}/enrollments`).set(headers);
  const enrollmentId = enrollment.body.data._id || enrollment.body.data.enrollmentId || enrollment.body.data.id;
  const payment = await request(app).post(`/api/enrollments/${enrollmentId}/payments`).set(headers);
  return { enrollmentId, gatewayReference: payment.body.data.gatewayReference };
};

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  const passwordHash = hashPassword(PASSWORD);
  admin = await User.create({ email: "admin@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" });
  teacher = await User.create({ email: "gv@test.com", passwordHash, role: "TEACHER", status: "ACTIVE", teacherProfile: { fullName: "GV", verificationStatus: "VERIFIED" } });
  student = await User.create({ email: "hs@test.com", passwordHash, role: "STUDENT", status: "ACTIVE", studentProfile: { fullName: "HS" } });
});

describe("P0: dev bypass only exists under NODE_ENV=test", () => {
  it.each(NON_TEST_ENVS)("NODE_ENV=%s refuses x-user-id, dev tokens and dev-login", async (mode) => {
    await withEnv({ NODE_ENV: mode, JWT_SECRET: STRONG.JWT_SECRET }, async () => {
      expect((await request(app).get(ADMIN_ONLY)).statusCode).toBe(401);
      expect((await request(app).get(ADMIN_ONLY).set("x-user-id", admin._id.toString())).statusCode).toBe(401);
      expect((await request(app).get(ADMIN_ONLY).set("x-user-id", admin._id.toString()).set("x-user-role", "ADMIN")).statusCode).toBe(401);
      expect((await request(app).get(ADMIN_ONLY).set(bearer(`dev-${admin._id}`))).statusCode).toBe(401);
      expect((await request(app).post("/api/auth/dev-login").send({ email: "admin@test.com", password: PASSWORD })).statusCode).toBe(404);
    });
  });

  it("a real JWT keeps working in those environments", async () => {
    await withEnv(PROD, async () => {
      const session = await login("admin@test.com");
      expect((await request(app).get(ADMIN_ONLY).set(bearer(session.body.data.accessToken))).statusCode).toBe(200);
    });
  });
});

describe("P0: JWT secret", () => {
  const LEAKED = ["edunity-dev-jwt-secret", "change-me"];

  it.each(LEAKED)("a token forged with the published value %s is refused in development", async (secret) => {
    await withEnv({ NODE_ENV: "development" }, async () => {
      expect((await request(app).get(ADMIN_ONLY).set(bearer(signFor(admin, secret)))).statusCode).toBe(401);
    });
  });

  it("development without a configured secret signs with a random per-process value", async () => {
    await withEnv({ NODE_ENV: "development" }, async () => {
      const session = await login("admin@test.com");
      expect((await request(app).get(ADMIN_ONLY).set(bearer(session.body.data.accessToken))).statusCode).toBe(200);
      expect(getSecret()).toHaveLength(96);
    });
  });

  it.each([undefined, "staging", "production"])("NODE_ENV=%s without a secret fails closed", async (mode) => {
    await withEnv({ NODE_ENV: mode }, async () => {
      expect(() => getSecret()).toThrow("JWT_SECRET is not set");
      expect((await request(app).get(ADMIN_ONLY).set(bearer(signFor(admin, "anything")))).statusCode).toBe(401);
    });
  });

  it("refuses alg:none, a wrong issuer and an expired token", async () => {
    const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: admin._id, iss: "edunity", exp: 9999999999 })}.`;
    expect((await request(app).get(ADMIN_ONLY).set(bearer(none))).statusCode).toBe(401);
    expect((await request(app).get(ADMIN_ONLY).set(bearer(signFor(admin, getSecret(), { issuer: "evil" })))).statusCode).toBe(401);
    const expired = await request(app).get(ADMIN_ONLY).set(bearer(signFor(admin, getSecret(), { expiresIn: -10 })));
    expect(expired.body.error).toBe("TOKEN_EXPIRED");
  });
});

describe("P0: startup configuration", () => {
  const problemsWith = (overrides) => validateEnv({ ...PROD, ...overrides });

  it("accepts a complete production configuration", () => {
    expect(validateEnv(PROD)).toEqual([]);
  });

  it("accepts development with nothing but NODE_ENV", () => {
    expect(validateEnv({ NODE_ENV: "development" })).toEqual([]);
  });

  it.each([undefined, "", "test", "staging", "Production"])("refuses to boot with NODE_ENV=%s", (mode) => {
    expect(validateEnv({ ...PROD, NODE_ENV: mode }).join()).toMatch(/NODE_ENV must be/);
  });

  it.each(["JWT_SECRET", "FILE_URL_SECRET", "PAYMENT_WEBHOOK_SECRET", "ROOM_TOKEN_SECRET"])("requires a strong %s in production", (name) => {
    expect(problemsWith({ [name]: undefined }).join()).toMatch(`${name} is required`);
    expect(problemsWith({ [name]: "short" }).join()).toMatch(`${name} must be at least 32`);
    expect(problemsWith({ [name]: `change-me-${"x".repeat(40)}` }).join()).toMatch(`${name} still contains a placeholder`);
  });

  it("refuses the same secret used twice, and never prints a value", () => {
    const problems = problemsWith({ FILE_URL_SECRET: STRONG.JWT_SECRET });
    expect(problems.join()).toMatch(/must all be different/);
    expect(problems.join()).not.toContain(STRONG.JWT_SECRET);
  });

  it("LiveKit replaces ROOM_TOKEN_SECRET only when fully configured", () => {
    const liveKit = { LIVEKIT_URL: "wss://lk.example", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret" };
    expect(problemsWith({ ROOM_TOKEN_SECRET: undefined, ...liveKit })).toEqual([]);
    expect(problemsWith({ LIVEKIT_URL: "wss://lk.example" }).join()).toMatch(/must be set together/);
  });

  it.each([[undefined, /is required/], ["*", /not \*/], ["edunity.example", /invalid origin/], ["https://a.example,*", /not \*/]])(
    "refuses CORS_ORIGIN=%s",
    (origin, message) => {
      expect(problemsWith({ CORS_ORIGIN: origin }).join()).toMatch(message);
    }
  );

  it("accepts several CORS origins", () => {
    expect(problemsWith({ CORS_ORIGIN: "https://a.example, https://b.example/" })).toEqual([]);
  });
});

describe("P0: payment webhooks", () => {
  it.each([undefined, "staging", "production"])("the sandbox webhook does not exist under NODE_ENV=%s", async (mode) => {
    const { gatewayReference, enrollmentId } = await pendingPayment();
    await withEnv({ ...PROD, NODE_ENV: mode }, async () => {
      const res = await request(app).post("/api/payments/sandbox/webhook").send({ gatewayReference, status: "SUCCESS" });
      expect(res.statusCode).toBe(404);
    });
    expect((await Enrollment.findById(enrollmentId)).enrollmentStatus).toBe("PENDING_PAYMENT");
  });

  it("the sandbox webhook still works in development and validates its input", async () => {
    const { gatewayReference } = await pendingPayment();
    await withEnv({ NODE_ENV: "development" }, async () => {
      expect((await request(app).post("/api/payments/sandbox/webhook").send({ gatewayReference, status: "NOPE" })).statusCode).toBe(400);
      const ok = await request(app).post("/api/payments/sandbox/webhook").send({ gatewayReference, status: "SUCCESS" });
      expect(ok.body.data.enrollmentStatus).toBe("CONFIRMED");
    });
  });

  it("the gateway webhook needs the right secret", async () => {
    const { gatewayReference, enrollmentId } = await pendingPayment();
    const call = (secret) => {
      const req = request(app).post("/api/payments/webhook");
      if (secret) req.set("x-webhook-secret", secret);
      return req.send({ gatewayReference, status: "SUCCESS" });
    };
    await withEnv(PROD, async () => {
      expect((await call()).statusCode).toBe(401);
      expect((await call("wrong")).statusCode).toBe(401);
      expect((await Enrollment.findById(enrollmentId)).enrollmentStatus).toBe("PENDING_PAYMENT");
      expect((await call(STRONG.PAYMENT_WEBHOOK_SECRET)).body.data.enrollmentStatus).toBe("CONFIRMED");
    });
  });

  it.each([undefined, "staging", "production"])("the gateway webhook fails closed without a secret under NODE_ENV=%s", async (mode) => {
    const { gatewayReference } = await pendingPayment();
    await withEnv({ NODE_ENV: mode }, async () => {
      expect((await request(app).post("/api/payments/webhook").send({ gatewayReference, status: "SUCCESS" })).statusCode).toBe(401);
    });
  });
});

describe("P0: public endpoints do not expose staff ids", () => {
  it("campaigns and classes hide who created and reviewed them", async () => {
    const window = { applicationStart: new Date(Date.now() - 864e5), applicationEnd: new Date(Date.now() + 864e5), fundingStart: new Date(Date.now() - 864e5), fundingEnd: new Date(Date.now() + 864e5) };
    const campaign = await ScholarshipCampaign.create({ createdBy: admin._id, title: "HB", targetBudget: 1000000, expectedSlots: 1, awardAmountPerStudent: 100000, status: "OPEN_FOR_FUNDING", ...window });
    const cls = await paidClass();
    await Session.create({ classId: cls._id, className: cls.className, teacherId: teacher._id, title: "Buổi 1", startDatetime: new Date(), endDatetime: new Date(Date.now() + 36e5), meetingRoomId: "room-secret", status: "SCHEDULED" });

    const responses = await Promise.all([
      request(app).get("/api/campaigns"),
      request(app).get(`/api/campaigns/${campaign._id}`),
      request(app).get("/api/classes"),
      request(app).get(`/api/classes/${cls._id}`),
      request(app).get(`/api/classes/${cls._id}/sessions`),
    ]);
    responses.forEach((res) => {
      expect(res.statusCode).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(admin._id.toString());
      expect(body).not.toContain("ghi chú nội bộ");
      expect(body).not.toContain("room-secret");
    });
    // the data the FE needs is still there
    expect(responses[1].body.data.title).toBe("HB");
    expect(responses[3].body.data.className).toBe(cls.className);
    expect(responses[4].body.data[0].title).toBe("Buổi 1");
  });

  it("the admin view of a campaign keeps them", async () => {
    const campaign = await ScholarshipCampaign.create({ createdBy: admin._id, title: "HB", targetBudget: 1000000, expectedSlots: 1, awardAmountPerStudent: 100000 });
    const session = await login("admin@test.com");
    const res = await request(app).get(`/api/admin/campaigns/${campaign._id}`).set(bearer(session.body.data.accessToken));
    expect(res.body.data.createdBy).toBe(admin._id.toString());
  });
});

describe("P1: signed file URLs", () => {
  it("cannot be forged with the old fallback or the JWT secret", async () => {
    await withEnv(PROD, async () => {
      const session = await login("hs@test.com");
      const upload = await request(app)
        .post("/api/uploads/private")
        .set(bearer(session.body.data.accessToken))
        .field("purpose", "IDENTITY")
        .attach("file", Buffer.from("%PDF-1.4\n%%EOF\n"), { filename: "cccd.pdf", contentType: "application/pdf" });
      const key = upload.body.data.storageKey;
      const expires = Date.now() + 60000;
      const download = (secret) =>
        request(app).get("/api/files/download").query({ key, expires, signature: crypto.createHmac("sha256", secret).update(`${key}:${expires}`).digest("hex") });

      expect((await download("edunity-dev-file-secret")).statusCode).toBe(403);
      expect((await download(STRONG.JWT_SECRET)).statusCode).toBe(403);

      const real = await download(STRONG.FILE_URL_SECRET);
      expect(real.statusCode).toBe(200);
      // the FE previews documents in an iframe from its own origin, and only there
      expect(real.headers["x-frame-options"]).toBeUndefined();
      expect(real.headers["content-security-policy"]).toBe("frame-ancestors https://edunity.example");
    });
  });
});

describe("P1: refresh token rotation", () => {
  it("presenting one token several times at once leaves no usable session", async () => {
    const session = await login("hs@test.com");
    const refreshToken = session.body.data.refreshToken;
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post("/api/auth/refresh").send({ refreshToken })));
    const ok = results.filter((res) => res.statusCode === 200);
    expect(ok.length).toBeLessThanOrEqual(1);
    expect(results.filter((res) => res.statusCode === 401).length).toBeGreaterThanOrEqual(4);
    expect(await RefreshToken.countDocuments({ userId: student._id, revokedAt: null })).toBe(0);
    for (const res of ok) {
      expect((await request(app).post("/api/auth/refresh").send({ refreshToken: res.body.data.refreshToken })).statusCode).toBe(401);
    }
  });
});

describe("P1: CORS", () => {
  const preflight = (origin) =>
    request(app).options("/api/auth/login").set("Origin", origin).set("Access-Control-Request-Method", "POST");

  it("answers only the allowed origin", async () => {
    expect((await preflight("http://localhost:5173")).headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect((await preflight("https://evil.example")).headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("no longer offers the bypass headers", async () => {
    const allowed = (await preflight("http://localhost:5173")).headers["access-control-allow-headers"];
    expect(allowed).toBe("Content-Type,Authorization");
  });

  it("malformed JSON is a 400 the browser can read", async () => {
    const res = await request(app).post("/api/auth/login").set("Origin", "http://localhost:5173").set("Content-Type", "application/json").send("{bad json");
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("P2: password change ends existing sessions", () => {
  it("rejects older access tokens at once and hands this device a new session", async () => {
    const old = jwt.sign({ role: "STUDENT", iat: Math.floor(Date.now() / 1000) - 60 }, getSecret(), { algorithm: "HS256", issuer: "edunity", subject: student._id.toString(), expiresIn: "1h" });
    expect((await request(app).get("/api/auth/me").set(bearer(old))).statusCode).toBe(200);

    const changed = await request(app).post("/api/me/password").set(bearer(old)).send({ currentPassword: PASSWORD, newPassword: "password2" });
    expect(changed.statusCode).toBe(200);

    expect((await request(app).get("/api/auth/me").set(bearer(old))).statusCode).toBe(401);
    expect((await request(app).get("/api/auth/me").set(bearer(changed.body.data.accessToken))).statusCode).toBe(200);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: changed.body.data.refreshToken })).statusCode).toBe(200);
  });
});

describe("P2: password change has no same-second gap", () => {
  it("a token issued a moment before the change is refused too", async () => {
    const session = await login("hs@test.com");
    const token = session.body.data.accessToken;
    const changed = await request(app).post("/api/me/password").set(bearer(token)).send({ currentPassword: PASSWORD, newPassword: "password2" });
    expect(changed.statusCode).toBe(200);
    expect((await request(app).get("/api/auth/me").set(bearer(token))).statusCode).toBe(401);
    expect((await request(app).get("/api/auth/me").set(bearer(changed.body.data.accessToken))).statusCode).toBe(200);
  });
});

describe("P2: input and headers", () => {
  it("register answers 400, not 500, on malformed input", async () => {
    const register = (body) => request(app).post("/api/auth/register").send(body);
    const valid = { fullName: "X", email: "x@test.com", password: "password1", role: "STUDENT" };
    expect((await register({ ...valid, email: { $gt: "" } })).statusCode).toBe(400);
    expect((await register({ ...valid, password: ["a", "b", "c", "d", "e", "f", "g", "h"] })).statusCode).toBe(400);
    expect((await register({ ...valid, fullName: { a: 1 } })).statusCode).toBe(400);
    expect((await register({ ...valid, password: "1234567" })).statusCode).toBe(400);
    expect((await register({ ...valid, password: "x".repeat(129) })).statusCode).toBe(400);
    expect((await register({ ...valid, role: "ADMIN" })).statusCode).toBe(400);
    expect((await register(valid)).statusCode).toBe(201);
  });

  it("two simultaneous registrations of one email give one account and a 409", async () => {
    const body = { fullName: "X", email: "race@test.com", password: "password1", role: "STUDENT" };
    const results = await Promise.all([request(app).post("/api/auth/register").send(body), request(app).post("/api/auth/register").send(body)]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
  });

  it("login refuses operator injection", async () => {
    expect((await request(app).post("/api/auth/login").send({ email: { $gt: "" }, password: { $gt: "" } })).statusCode).toBe(401);
  });

  it("sends the security headers and hides the framework", async () => {
    const res = await request(app).get("/api/catalog/categories");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("P2: LiveKit webhook", () => {
  const LIVEKIT = { LIVEKIT_URL: "wss://lk.example", LIVEKIT_API_KEY: "lk-key", LIVEKIT_API_SECRET: "lk-secret" };
  const body = JSON.stringify({ event: "room_started" });
  const signed = (content, secret = LIVEKIT.LIVEKIT_API_SECRET) =>
    jwt.sign({ sha256: crypto.createHash("sha256").update(content).digest("base64") }, secret, { issuer: LIVEKIT.LIVEKIT_API_KEY, algorithm: "HS256" });
  const post = (authorization, content = body) => {
    const req = request(app).post("/api/sessions/livekit-webhook").set("Content-Type", "application/webhook+json");
    if (authorization) req.set("Authorization", authorization);
    return req.send(content);
  };

  it("accepts LiveKit's signature and binds it to the body", async () => {
    await withEnv({ NODE_ENV: "test", ...LIVEKIT }, async () => {
      expect((await post(signed(body))).statusCode).toBe(200);
      expect((await post(signed(body), JSON.stringify({ event: "egress_ended" }))).statusCode).toBe(401);
      expect((await post(signed(body, "wrong-secret"))).statusCode).toBe(401);
      expect((await post()).statusCode).toBe(401);
    });
  });
});
