const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { User, TeacherContract, AuditLog, Notification } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { assertTeacherContractGate } = require("../src/services/classCreationGateService");
const econtractProvider = require("../src/services/econtractProvider");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const WEBHOOK = "/api/contracts/econtract-webhook";
const SECRET = "test-econtract-secret";

let users, tokens;
const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });

const createUser = async (name, role, extra = {}) => {
  const user = await User.create({
    email: `${name}@test.com`,
    passwordHash: hashPassword("password123"),
    role,
    ...(role === "TEACHER" ? { teacherProfile: { fullName: name, verificationStatus: "VERIFIED" } } : {}),
    ...extra,
  });
  tokens[name] = signAccessToken(user);
  users[name] = user;
};

const send = (teacher = "teacherA", body = {}) =>
  request(app).post(`/api/admin/teachers/${users[teacher]._id}/contracts`).set(as("admin")).send(body);

const signedWebhook = (payload, secret = SECRET) => {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return request(app).post(WEBHOOK).set("Content-Type", "application/json").set("X-Econtract-Signature", signature).send(raw);
};

const gate = (teacher) => assertTeacherContractGate({ teacher: { _id: users[teacher]._id } });

beforeAll(async () => {
  process.env.FPT_ECONTRACT_WEBHOOK_SECRET = SECRET;
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
  await createUser("pendingTeacher", "TEACHER", { teacherProfile: { fullName: "P", verificationStatus: "PENDING" } });
});

afterAll(async () => {
  delete process.env.FPT_ECONTRACT_WEBHOOK_SECRET;
  await disconnectDB();
});

describe("Admin sends a contract", () => {
  it("only to a verified teacher, one awaiting signature at a time, 12 months by default", async () => {
    expect((await send("pendingTeacher")).body.error).toBe("TEACHER_NOT_VERIFIED");

    const res = await send();
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({ status: "PENDING_SIGNATURE", provider: "SANDBOX", canSignInSandbox: true });
    const months = (new Date(res.body.data.expiresAt) - new Date(res.body.data.effectiveFrom)) / (30 * 24 * 3600 * 1000);
    expect(Math.round(months)).toBe(12);

    expect((await send()).body.error).toBe("CONTRACT_ALREADY_PENDING");
    expect(await AuditLog.countDocuments({ action: "TEACHER_CONTRACT_SENT" })).toBe(1);
    expect(await Notification.countDocuments({ userId: users.teacherA._id, type: "TEACHER_CONTRACT_SENT" })).toBe(1);
  });

  it("concurrent sends still leave a single pending contract", async () => {
    const results = await Promise.all([send(), send(), send()]);
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(await TeacherContract.countDocuments({ teacherId: users.teacherA._id })).toBe(1);
  });

  it("rejects an expiry before the start", async () => {
    const res = await send("teacherA", { effectiveFrom: "2030-01-01", expiresAt: "2029-01-01" });
    expect(res.statusCode).toBe(400);
  });
});

describe("Class creation gate (TEA-12)", () => {
  it("a VERIFIED teacher without a signed contract cannot open classes; signing unlocks it", async () => {
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_FOUND", statusCode: 403 });

    const { id } = (await send()).body.data;
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE" });

    const signed = await request(app).post(`/api/teacher/contracts/${id}/sandbox-sign`).set(as("teacherA")).send({ decision: "SIGN" });
    expect(signed.statusCode).toBe(200);
    expect(signed.body.data.status).toBe("ACTIVE");
    await expect(gate("teacherA")).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("an expired or not-yet-effective contract does not count", async () => {
    const base = { teacherId: users.teacherA._id, status: "ACTIVE", provider: { name: "SANDBOX" }, createdBy: users.admin._id, sentAt: new Date() };
    await TeacherContract.create({ ...base, contractCode: "HD-OLD", provider: { name: "SANDBOX", envelopeId: "e1" }, effectiveFrom: new Date("2020-01-01"), expiresAt: new Date("2021-01-01") });
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_EXPIRED" });
    expect((await request(app).get("/api/teacher/contracts").set(as("teacherA"))).body.data[0].status).toBe("EXPIRED");

    await TeacherContract.create({ ...base, contractCode: "HD-FUT", provider: { name: "SANDBOX", envelopeId: "e2" }, effectiveFrom: new Date("2099-01-01"), expiresAt: new Date("2100-01-01") });
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE" });
  });
});

describe("Teacher access", () => {
  it("cannot see or sign another teacher's contract, and does not see admin bookkeeping", async () => {
    const { id } = (await send()).body.data;
    const other = await request(app).post(`/api/teacher/contracts/${id}/sandbox-sign`).set(as("teacherB")).send({ decision: "SIGN" });
    expect(other.statusCode).toBe(404);
    expect((await request(app).get("/api/teacher/contracts").set(as("teacherB"))).body.data).toEqual([]);

    const mine = (await request(app).get("/api/teacher/contracts").set(as("teacherA"))).body.data[0];
    expect(mine).not.toHaveProperty("createdBy");
    expect(mine).not.toHaveProperty("history");
    expect(mine).not.toHaveProperty("envelopeId");
  });

  it("declining notifies admins and the contract cannot be signed afterwards", async () => {
    const { id } = (await send()).body.data;
    const declined = await request(app).post(`/api/teacher/contracts/${id}/sandbox-sign`).set(as("teacherA")).send({ decision: "DECLINE" });
    expect(declined.body.data.status).toBe("DECLINED");
    expect(await Notification.countDocuments({ userId: users.admin._id, type: "TEACHER_CONTRACT_DECLINED" })).toBe(1);

    const again = await request(app).post(`/api/teacher/contracts/${id}/sandbox-sign`).set(as("teacherA")).send({ decision: "SIGN" });
    expect(again.body.error).toBe("CONTRACT_NOT_PENDING");
  });
});

describe("Admin ends a contract", () => {
  it("terminates an ACTIVE contract with a reason, which closes the gate again", async () => {
    const { id } = (await send()).body.data;
    await request(app).post(`/api/teacher/contracts/${id}/sandbox-sign`).set(as("teacherA")).send({ decision: "SIGN" });

    expect((await request(app).post(`/api/admin/contracts/${id}/end`).set(as("admin")).send({})).statusCode).toBe(400);
    const ended = await request(app).post(`/api/admin/contracts/${id}/end`).set(as("admin")).send({ reason: "Vi phạm" });
    expect(ended.body.data.status).toBe("TERMINATED");
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE" });
    expect(await AuditLog.countDocuments({ action: "TEACHER_CONTRACT_TERMINATED" })).toBe(1);
  });

  it("cancels a contract still awaiting signature", async () => {
    const { id } = (await send()).body.data;
    const ended = await request(app).post(`/api/admin/contracts/${id}/end`).set(as("admin")).send({ reason: "Gửi nhầm" });
    expect(ended.body.data.status).toBe("CANCELLED");
    expect((await send()).statusCode).toBe(201); // a new one can be sent
  });
});

describe("E-contract webhook", () => {
  it("refuses unsigned or wrongly signed deliveries", async () => {
    const { envelopeId } = (await TeacherContract.findById((await send()).body.data.id).lean()).provider;
    expect((await request(app).post(WEBHOOK).send({ envelopeId, event: "SIGNED" })).statusCode).toBe(401);
    expect((await signedWebhook({ envelopeId, event: "SIGNED" }, "wrong-secret")).statusCode).toBe(401);
    expect((await TeacherContract.findOne({ "provider.envelopeId": envelopeId })).status).toBe("PENDING_SIGNATURE");
  });

  it("activates on a signed SIGNED event, is idempotent, and ignores late events after termination", async () => {
    const { id } = (await send()).body.data;
    const { envelopeId } = (await TeacherContract.findById(id).lean()).provider;

    expect((await signedWebhook({ envelopeId, event: "SIGNED" })).statusCode).toBe(200);
    expect((await signedWebhook({ envelopeId, event: "SIGNED" })).statusCode).toBe(200);
    const contract = await TeacherContract.findById(id).lean();
    expect(contract.status).toBe("ACTIVE");
    expect(contract.history.filter((h) => h.action === "SIGNED")).toHaveLength(1);

    await request(app).post(`/api/admin/contracts/${id}/end`).set(as("admin")).send({ reason: "x" });
    const late = await signedWebhook({ envelopeId, event: "SIGNED" });
    expect(late.body.data).toMatchObject({ received: true, ignored: true });
    expect((await TeacherContract.findById(id).lean()).status).toBe("TERMINATED");
  });
});

describe("Provider mode", () => {
  it("outside development/test, without the real provider, sending fails closed and sandbox signing does not exist", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "staging";
    try {
      expect(econtractProvider.isSandbox()).toBe(false);
      await expect(econtractProvider.createEnvelope({ contractCode: "X" })).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
