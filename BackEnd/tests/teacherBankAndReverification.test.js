const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-bao5-"));

const request = require("supertest");
const app = require("../src/app");
const { User, Notification, AuditLog } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const pii = require("../src/utils/pii");
const { resolvePayoutAccount, PAYOUT_LOCK_HOURS } = require("../src/services/teacherBankAccountService");
const { runReverificationSweep } = require("../src/services/teacherVerificationService");
const { assertVerificationCurrent } = require("../src/services/classCreationGateService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const DAY = 24 * 60 * 60 * 1000;
const MONDAY_NOW = "2026-11-09T03:00:00.000Z"; // inside the Monday payout request window
const IDENTITY = { fullName: "Nguyễn Văn An", idNumber: "079203001234", dateOfBirth: "1990-05-01", address: "12 Lê Lợi, Quận 1, TP.HCM" };

const storedIdentity = () => ({
  fullName: IDENTITY.fullName,
  dateOfBirth: new Date(IDENTITY.dateOfBirth),
  idNumberEnc: pii.encrypt(IDENTITY.idNumber),
  idNumberHash: pii.blindIndex(IDENTITY.idNumber),
  idNumberLast4: "1234",
  addressEnc: pii.encrypt(IDENTITY.address),
  submittedAt: new Date(),
});

let users, tokens;
const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });

const createUser = async (name, role, teacherProfile = {}) => {
  users[name] = await User.create({
    email: `${name}@test.com`,
    passwordHash: hashPassword("password123"),
    role,
    ...(role === "TEACHER" ? { teacherProfile: { fullName: name, verificationStatus: "VERIFIED", ...teacherProfile } } : {}),
  });
  tokens[name] = signAccessToken(users[name]);
};

const reload = async (name) => (await User.findById(users[name]._id).lean()).teacherProfile;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

beforeEach(async () => {
  await clearDB();
  users = {};
  tokens = {};
  await createUser("admin", "ADMIN");
  await createUser("teacher", "TEACHER", { identity: storedIdentity(), verifiedUntil: new Date(Date.now() + 120 * DAY) });
});

afterAll(disconnectDB);

// ---------------------------------------------------------------- BAO-09
describe("Teacher bank account", () => {
  const submit = (body) => request(app).put("/api/teacher/bank-account").set(as("teacher")).send(body);
  const BANK = { bankName: "Vietcombank", accountNumber: "0071 0001 23456", accountHolderName: "NGUYEN VAN AN" };

  it("requires a verified teacher with a declared identity", async () => {
    await createUser("legacy", "TEACHER");
    const res = await request(app).put("/api/teacher/bank-account").set(as("legacy")).send(BANK);
    expect(res.body.error).toBe("IDENTITY_REQUIRED");
  });

  it("the holder must be the person named on the CCCD", async () => {
    const res = await submit({ ...BANK, accountHolderName: "TRAN THI B" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("BANK_HOLDER_NAME_MISMATCH");
  });

  it("is stored encrypted, shown masked, and goes to admin review with a payout lock", async () => {
    const res = await submit(BANK);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ status: "PENDING_REVIEW", accountNumberMasked: "******3456", accountHolderName: "NGUYEN VAN AN" });
    expect(JSON.stringify(res.body)).not.toContain("0071000123456");
    expect(JSON.stringify(await User.collection.findOne({ _id: users.teacher._id }))).not.toContain("0071000123456");

    const lock = new Date(res.body.data.payoutLockedUntil) - new Date(res.body.data.submittedAt);
    expect(lock).toBe(PAYOUT_LOCK_HOURS * 60 * 60 * 1000);
    expect(await Notification.countDocuments({ userId: users.teacher._id, type: "TEACHER_BANK_ACCOUNT_CHANGED" })).toBe(1);
  });

  it("payouts use only an approved account, after the change lock", async () => {
    await submit(BANK);
    await expect(resolvePayoutAccount(users.teacher._id)).rejects.toMatchObject({ code: "BANK_ACCOUNT_NOT_VERIFIED" });

    const list = await request(app).get("/api/admin/teacher-bank-accounts").set(as("admin"));
    expect(list.body.data.items[0].bankAccount.accountNumber).toBe("0071000123456");
    expect((await request(app).post(`/api/admin/teacher-bank-accounts/${users.teacher._id}/reject`).set(as("admin")).send({})).statusCode).toBe(400);
    const approved = await request(app).post(`/api/admin/teacher-bank-accounts/${users.teacher._id}/approve`).set(as("admin")).send({});
    expect(approved.body.data.status).toBe("VERIFIED");
    expect(await AuditLog.countDocuments({ action: "TEACHER_BANK_ACCOUNT_VERIFIED" })).toBe(1);

    await expect(resolvePayoutAccount(users.teacher._id)).rejects.toMatchObject({ code: "BANK_ACCOUNT_RECENTLY_CHANGED" });
    const later = new Date(Date.now() + (PAYOUT_LOCK_HOURS + 1) * 60 * 60 * 1000);
    await expect(resolvePayoutAccount(users.teacher._id, later)).resolves.toEqual({
      bankName: "Vietcombank",
      accountNumber: "0071000123456",
      accountHolderName: "NGUYEN VAN AN",
    });
  });

  it("a change after approval goes back to review", async () => {
    await submit(BANK);
    await request(app).post(`/api/admin/teacher-bank-accounts/${users.teacher._id}/approve`).set(as("admin")).send({});
    await submit({ ...BANK, accountNumber: "999888777" });
    expect((await reload("teacher")).bankAccount).toMatchObject({ status: "PENDING_REVIEW", accountNumberLast4: "8777" });
  });

  it("a payout request ignores bank details typed by the client", async () => {
    const res = await request(app)
      .post("/api/teacher/payouts")
      .set(as("teacher"))
      .set("x-test-now", MONDAY_NOW)
      .send({ bankName: "Attacker Bank", accountNumber: "111222333", accountHolderName: "NGUYEN VAN AN" });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("BANK_ACCOUNT_NOT_VERIFIED");
  });
});

// ---------------------------------------------------------------- BAO-10
describe("Re-verification every 6 months", () => {
  const upload = async (name, purpose) =>
    (await request(app).post("/api/uploads/private").set(as(name)).field("purpose", purpose).attach("file", PNG, { filename: "x.png", contentType: "image/png" }));
  const resubmit = async (name) =>
    request(app)
      .post("/api/teacher/verification")
      .set(as(name))
      .send({
        identity: IDENTITY,
        documents: [
          { documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: (await upload(name, "IDENTITY")).body.data.storageKey }, { side: "BACK", storageKey: (await upload(name, "IDENTITY")).body.data.storageKey }] },
          { documentType: "QUALIFICATION", files: [{ storageKey: (await upload(name, "QUALIFICATION")).body.data.storageKey }] },
        ],
      });

  it("approval sets verifiedUntil to 6 months, or the CCCD expiry when sooner", async () => {
    await createUser("fresh", "TEACHER", { verificationStatus: "UNVERIFIED" });
    await request(app)
      .post("/api/teacher/verification")
      .set(as("fresh"))
      .send({
        identity: { ...IDENTITY, idNumber: "079203005555", expiryDate: new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10) },
        documents: [
          { documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: (await upload("fresh", "IDENTITY")).body.data.storageKey }, { side: "BACK", storageKey: (await upload("fresh", "IDENTITY")).body.data.storageKey }] },
          { documentType: "QUALIFICATION", files: [{ storageKey: (await upload("fresh", "QUALIFICATION")).body.data.storageKey }] },
        ],
      });
    await request(app).post(`/api/admin/teacher-verifications/${users.fresh._id}/approve`).set(as("admin")).send({});
    const days = (new Date((await reload("fresh")).verifiedUntil) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(58.9); // the CCCD expiry (a date) wins over approval + 6 months
    expect(days).toBeLessThanOrEqual(60);
  });

  it("is closed while the verification is far from expiry", async () => {
    expect((await upload("teacher", "IDENTITY")).body.error).toBe("ALREADY_VERIFIED");
    expect((await request(app).get("/api/teacher/verification").set(as("teacher"))).body.data.reverificationOpen).toBe(false);
  });

  it("opens 30 days before expiry; the teacher stays VERIFIED while it is reviewed, then gets 6 more months", async () => {
    await User.updateOne({ _id: users.teacher._id }, { $set: { "teacherProfile.verifiedUntil": new Date(Date.now() + 10 * DAY) } });
    const res = await resubmit("teacher");
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({ verificationStatus: "VERIFIED", reverificationStatus: "PENDING" });

    const queue = await request(app).get("/api/admin/teacher-verifications?status=PENDING").set(as("admin"));
    expect(queue.body.data.items).toEqual([expect.objectContaining({ teacherId: users.teacher._id.toString(), isReverification: true })]);

    await request(app).post(`/api/admin/teacher-verifications/${users.teacher._id}/approve`).set(as("admin")).send({});
    const profile = await reload("teacher");
    expect(profile.reverificationStatus).toBeNull();
    expect(Math.round((new Date(profile.verifiedUntil) - Date.now()) / DAY)).toBeGreaterThan(170);
  });

  it("a rejected re-verification leaves the teacher VERIFIED but still expiring", async () => {
    await User.updateOne({ _id: users.teacher._id }, { $set: { "teacherProfile.verifiedUntil": new Date(Date.now() + 5 * DAY) } });
    await resubmit("teacher");
    await request(app).post(`/api/admin/teacher-verifications/${users.teacher._id}/reject`).set(as("admin")).send({ reviewNote: "Ảnh mờ" });
    expect(await reload("teacher")).toMatchObject({ verificationStatus: "VERIFIED", reverificationStatus: "REJECTED" });
    expect((await resubmit("teacher")).statusCode).toBe(201); // and can try again
  });

  it("an expired verification blocks opening new classes", () => {
    const teacher = (verifiedUntil) => ({ teacherProfile: { verifiedUntil } });
    expect(() => assertVerificationCurrent({ teacher: teacher(new Date(Date.now() - DAY)) })).toThrow(
      expect.objectContaining({ code: "TEACHER_REVERIFICATION_REQUIRED", statusCode: 403 })
    );
    expect(() => assertVerificationCurrent({ teacher: teacher(new Date(Date.now() + DAY)) })).not.toThrow();
    expect(() => assertVerificationCurrent({ teacher: teacher(null) })).not.toThrow();
  });

  it("the sweep gives legacy teachers a deadline and reminds each teacher once per expiry", async () => {
    await createUser("legacy", "TEACHER");
    await User.updateOne({ _id: users.teacher._id }, { $set: { "teacherProfile.verifiedUntil": new Date(Date.now() - DAY) } });

    const first = await runReverificationSweep();
    expect(first.legacyGraceGranted).toBe(1);
    expect(Math.round((new Date((await reload("legacy")).verifiedUntil) - Date.now()) / DAY)).toBe(30);
    await runReverificationSweep();

    expect(await Notification.countDocuments({ userId: users.teacher._id, type: "TEACHER_REVERIFICATION_EXPIRED" })).toBe(1);
    expect(await Notification.countDocuments({ userId: users.legacy._id, type: "TEACHER_REVERIFICATION_DUE" })).toBe(1);
  });
});
