const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-bao12-"));

const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../src/app");
const { User } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const videoProvider = require("../src/services/videoProvider");
const { createRoomToken, verifyRoomToken } = require("../src/utils/roomToken");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const LIVEKIT = { LIVEKIT_URL: "wss://livekit.test", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret-0123456789-abcdefghij" };

const withLiveKit = (fn) => {
  const saved = Object.fromEntries(Object.keys(LIVEKIT).map((k) => [k, process.env[k]]));
  Object.assign(process.env, LIVEKIT);
  try {
    return fn();
  } finally {
    Object.entries(saved).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  }
};

describe("LiveKit join tokens (BAO-12)", () => {
  const issue = (role) =>
    withLiveKit(() =>
      videoProvider.createJoinToken({
        roomId: "room-session-1", sessionId: "s1", userId: `user-${role}`, displayName: "X", role, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
    );
  const decode = (token) => jwt.verify(token, LIVEKIT.LIVEKIT_API_SECRET);

  it("a student token joins only that room and cannot moderate it", () => {
    const { provider, accessToken } = issue("PARTICIPANT");
    expect(provider).toBe("LIVEKIT");
    const claims = decode(accessToken);
    expect(claims.video).toMatchObject({ room: "room-session-1", roomJoin: true, roomAdmin: false });
    expect(claims.video.roomCreate).toBeUndefined();
    expect(claims.sub).toBe("user-PARTICIPANT");
  });

  it("only the host (teacher) token can moderate", () => {
    expect(decode(issue("HOST").accessToken).video.roomAdmin).toBe(true);
  });

  it("expires with the session, and a forged signature is rejected", () => {
    const { accessToken } = issue("PARTICIPANT");
    const claims = decode(accessToken);
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(30 * 60 + 1);
    expect(() => jwt.verify(accessToken, "another-secret")).toThrow();
  });

  it("the dev room token rejects tampering and expiry", () => {
    const token = createRoomToken({ roomId: "r1", sessionId: "s1", userId: "u1", role: "PARTICIPANT", expiresAt: new Date(Date.now() + 60000) });
    expect(verifyRoomToken(token)).toMatchObject({ roomId: "r1", role: "PARTICIPANT" });

    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), role: "HOST" })).toString("base64url");
    expect(verifyRoomToken(`${forged}.${signature}`)).toBeNull();

    const expired = createRoomToken({ roomId: "r1", sessionId: "s1", userId: "u1", role: "PARTICIPANT", expiresAt: new Date(Date.now() - 1000) });
    expect(verifyRoomToken(expired)).toBeNull();
  });
});

describe("Sensitive data endpoints: who can reach them (BAO-12)", () => {
  let users, tokens;
  const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
    await clearDB();
    users = {};
    tokens = {};
    const make = async (name, role, extra = {}) => {
      users[name] = await User.create({ email: `${name}@test.com`, passwordHash: hashPassword("password123"), role, ...extra });
      tokens[name] = signAccessToken(users[name]);
    };
    await make("admin", "ADMIN");
    await make("teacher", "TEACHER", { teacherProfile: { fullName: "GV", verificationStatus: "UNVERIFIED" } });
    await make("student", "STUDENT", { studentProfile: { fullName: "HS" } });
    await make("sponsor", "SPONSOR", { sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "MTQ" } });
  });

  afterAll(disconnectDB);

  const ADMIN_ONLY = [
    ["get", "/api/admin/teacher-verifications"],
    ["post", "/api/admin/teacher-verifications/:teacher/identity/reveal"],
    ["get", "/api/admin/teacher-bank-accounts"],
    ["post", "/api/admin/teacher-bank-accounts/:teacher/approve"],
    ["get", "/api/admin/teachers/:teacher/contracts"],
    ["post", "/api/admin/teachers/:teacher/contracts"],
    ["get", "/api/admin/guardian-consents"],
  ];

  it.each(["teacher", "student", "sponsor"])("%s cannot reach any admin-only sensitive endpoint", async (role) => {
    for (const [method, url] of ADMIN_ONLY) {
      const res = await request(app)[method](url.replace(":teacher", users.teacher._id.toString())).set(as(role)).send({ reason: "x" });
      expect([method, url, res.statusCode]).toEqual([method, url, 403]);
    }
  });

  it("role-specific endpoints refuse other roles", async () => {
    const cases = [
      ["get", "/api/teacher/bank-account", ["student", "sponsor"]],
      ["get", "/api/teacher/contracts", ["student", "sponsor"]],
      ["get", "/api/student/guardian-consents", ["teacher", "sponsor"]],
      ["get", `/api/sponsor/campaigns/${users.admin._id}/stories`, ["teacher", "student"]],
    ];
    for (const [method, url, roles] of cases) {
      for (const role of roles) {
        expect([url, role, (await request(app)[method](url).set(as(role))).statusCode]).toEqual([url, role, 403]);
      }
    }
  });

  it("nobody but the owner or an admin can sign a private file, and a tampered download link is refused", async () => {
    const upload = await request(app).post("/api/uploads/private").set(as("teacher")).field("purpose", "IDENTITY").attach("file", PNG, { filename: "id.png", contentType: "image/png" });
    const { storageKey } = upload.body.data;

    for (const role of ["student", "sponsor"]) {
      expect((await request(app).post("/api/files/signed-url").set(as(role)).send({ storageKey })).statusCode).toBe(404);
    }
    const signed = await request(app).post("/api/files/signed-url").set(as("teacher")).send({ storageKey });
    const link = new URL(signed.body.data.url);
    expect((await request(app).get(link.pathname + link.search)).statusCode).toBe(200);

    link.searchParams.set("expires", String(Date.now() + 10 * 60 * 1000)); // extend the link: signature no longer matches
    expect((await request(app).get(link.pathname + link.search)).statusCode).not.toBe(200);
  });
});
