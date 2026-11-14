const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-identity-"));

const request = require("supertest");
const app = require("../src/app");
const { User, AuditLog } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { validateEnv } = require("../src/config/env");
const pii = require("../src/utils/pii");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const ID_NUMBER = "079203001234";
const ADDRESS = "12 Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM";
const identity = (overrides = {}) => ({ fullName: "Nguyễn Văn A", idNumber: ID_NUMBER, dateOfBirth: "1990-05-01", address: ADDRESS, ...overrides });

let users, tokens;
const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });

const createUser = async (name, role) => {
  const user = await User.create({
    email: `${name}@test.com`,
    passwordHash: hashPassword("password123"),
    role,
    ...(role === "TEACHER" ? { teacherProfile: { fullName: name, verificationStatus: "UNVERIFIED" } } : {}),
  });
  users[name] = user;
  tokens[name] = signAccessToken(user);
};

const upload = async (name, purpose) =>
  (await request(app).post("/api/uploads/private").set(as(name)).field("purpose", purpose).attach("file", PNG, { filename: "x.png", contentType: "image/png" }))
    .body.data.storageKey;

const submit = async (name, identityBody) =>
  request(app)
    .post("/api/teacher/verification")
    .set(as(name))
    .send({
      documents: [
        { documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: await upload(name, "IDENTITY") }] },
        { documentType: "QUALIFICATION", files: [{ storageKey: await upload(name, "QUALIFICATION") }] },
      ],
      identity: identityBody,
    });

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

beforeEach(async () => {
  await clearDB();
  users = {};
  tokens = {};
  await createUser("admin", "ADMIN");
  await createUser("teacherA", "TEACHER");
  await createUser("teacherB", "TEACHER");
});

afterAll(disconnectDB);

describe("utils/pii", () => {
  it("encrypts with a fresh IV each time, decrypts back, and rejects tampering", () => {
    const a = pii.encrypt(ID_NUMBER);
    expect(a).not.toBe(pii.encrypt(ID_NUMBER));
    expect(a).not.toContain(ID_NUMBER);
    expect(pii.decrypt(a)).toBe(ID_NUMBER);

    const raw = Buffer.from(a.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => pii.decrypt(`v1:${raw.toString("base64")}`)).toThrow();
  });

  it("blind index is stable and masks hide the sensitive part", () => {
    expect(pii.blindIndex(ID_NUMBER)).toBe(pii.blindIndex(ID_NUMBER));
    expect(pii.blindIndex(ID_NUMBER)).not.toBe(pii.blindIndex("079203001235"));
    expect(pii.maskTail(ID_NUMBER)).toBe("********1234");
    expect(pii.maskAddress(ADDRESS)).toBe("***, Quận 1, TP.HCM");
  });

  it("production refuses to boot without PII_ENCRYPTION_KEY", () => {
    const problems = validateEnv({ NODE_ENV: "production", CORS_ORIGIN: "https://edunity.vn" });
    expect(problems).toContain("PII_ENCRYPTION_KEY is required in production");
  });
});

describe("Teacher declares identity with the verification", () => {
  it("is required and validated", async () => {
    expect((await submit("teacherA", undefined)).body.message).toMatch(/identity is required/);
    expect((await submit("teacherA", identity({ idNumber: "12345" }))).statusCode).toBe(400);
    expect((await submit("teacherA", identity({ dateOfBirth: new Date().toISOString() }))).body.message).toMatch(/18/);
    expect((await submit("teacherA", identity({ expiryDate: "2020-01-01" }))).body.error).toBe("IDENTITY_DOCUMENT_EXPIRED");
  });

  it("stores the number and address encrypted and only ever returns them masked", async () => {
    const res = await submit("teacherA", identity());
    expect(res.statusCode).toBe(201);
    expect(res.body.data.identity).toMatchObject({ fullName: "Nguyễn Văn A", idNumberMasked: "********1234", addressMasked: "***, Quận 1, TP.HCM" });

    const raw = JSON.stringify(await User.collection.findOne({ _id: users.teacherA._id }));
    expect(raw).not.toContain(ID_NUMBER);
    expect(raw).not.toContain("Lê Lợi");

    for (const view of [res, await request(app).get("/api/teacher/verification").set(as("teacherA")), await request(app).get(`/api/admin/teacher-verifications/${users.teacherA._id}`).set(as("admin"))]) {
      expect(JSON.stringify(view.body)).not.toContain(ID_NUMBER);
      expect(JSON.stringify(view.body)).not.toContain("Lê Lợi");
      expect(JSON.stringify(view.body)).not.toContain("idNumberEnc");
    }
  });

  it("one CCCD number cannot verify two accounts", async () => {
    expect((await submit("teacherA", identity())).statusCode).toBe(201);
    const dup = await submit("teacherB", identity({ fullName: "Kẻ mạo danh" }));
    expect(dup.statusCode).toBe(409);
    expect(dup.body.error).toBe("IDENTITY_NUMBER_IN_USE");
  });
});

describe("Admin access to identity data is audited", () => {
  beforeEach(async () => {
    await submit("teacherA", identity());
  });

  it("opening the dossier is logged", async () => {
    await request(app).get(`/api/admin/teacher-verifications/${users.teacherA._id}`).set(as("admin"));
    expect(await AuditLog.countDocuments({ action: "TEACHER_VERIFICATION_VIEWED", targetId: users.teacherA._id, actorAdminId: users.admin._id })).toBe(1);
  });

  it("revealing the full number needs a reason, is logged, and is admin-only", async () => {
    const url = `/api/admin/teacher-verifications/${users.teacherA._id}/identity/reveal`;
    expect((await request(app).post(url).set(as("admin")).send({})).statusCode).toBe(400);
    expect((await request(app).post(url).set(as("teacherA")).send({ reason: "x" })).statusCode).toBe(403);

    const revealed = await request(app).post(url).set(as("admin")).send({ reason: "Đối chiếu với ảnh CCCD" });
    expect(revealed.body.data).toEqual({ idNumber: ID_NUMBER, address: ADDRESS });
    const log = await AuditLog.findOne({ action: "TEACHER_IDENTITY_REVEALED" }).lean();
    expect(log.afterState.reason).toBe("Đối chiếu với ảnh CCCD");
    expect(JSON.stringify(log)).not.toContain(ID_NUMBER);
  });

  it("an admin opening someone else's private file is logged; the owner opening their own is not", async () => {
    const storageKey = await upload("teacherB", "IDENTITY");
    await request(app).post("/api/files/signed-url").set(as("teacherB")).send({ storageKey });
    expect(await AuditLog.countDocuments({ action: "PRIVATE_FILE_ACCESSED" })).toBe(0);

    expect((await request(app).post("/api/files/signed-url").set(as("admin")).send({ storageKey })).statusCode).toBe(200);
    const log = await AuditLog.findOne({ action: "PRIVATE_FILE_ACCESSED" }).lean();
    expect(log.targetId.toString()).toBe(users.teacherB._id.toString());
    expect(log.afterState).toMatchObject({ storageKey, purpose: "IDENTITY" });
  });
});
