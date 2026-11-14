const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-ocr-"));

const request = require("supertest");
const app = require("../src/app");
const { User, VerificationDocument } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const ocrProvider = require("../src/services/ocrProvider");
const { compareOcr } = require("../src/services/teacherVerificationService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n% test\n%%EOF\n");
const ID_NUMBER = "079203001234";
const IDENTITY = { fullName: "Nguyễn Văn Đức", idNumber: ID_NUMBER, dateOfBirth: "1990-05-01", address: "12 Lê Lợi, Quận 1, TP.HCM" };

let users, tokens;
const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });

const upload = async (name, purpose, file = PNG, type = "image/png") =>
  (await request(app).post("/api/uploads/private").set(as(name)).field("purpose", purpose).attach("file", file, { filename: "x", contentType: type }))
    .body.data.storageKey;

const submit = async (name = "teacher", front = { file: PNG, type: "image/png" }) =>
  request(app)
    .post("/api/teacher/verification")
    .set(as(name))
    .send({
      identity: IDENTITY,
      documents: [
        { documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: await upload(name, "IDENTITY", front.file, front.type) }] },
        { documentType: "QUALIFICATION", files: [{ storageKey: await upload(name, "QUALIFICATION") }] },
      ],
    });

const identityDoc = () => VerificationDocument.findOne({ userId: users.teacher._id, documentType: "IDENTITY" }).sort({ createdAt: -1 }).lean();
const adminView = () => request(app).get(`/api/admin/teacher-verifications/${users.teacher._id}`).set(as("admin"));

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

beforeEach(async () => {
  await clearDB();
  jest.restoreAllMocks();
  users = {};
  tokens = {};
  for (const [name, role] of [["admin", "ADMIN"], ["teacher", "TEACHER"]]) {
    users[name] = await User.create({
      email: `${name}@test.com`,
      passwordHash: hashPassword("password123"),
      role,
      ...(role === "TEACHER" ? { teacherProfile: { fullName: "GV", verificationStatus: "UNVERIFIED" } } : {}),
    });
    tokens[name] = signAccessToken(users[name]);
  }
});

afterAll(disconnectDB);

describe("compareOcr", () => {
  const declared = { fullName: "Nguyễn Văn Đức", idNumber: ID_NUMBER, dateOfBirth: new Date("1990-05-01"), expiryDate: null };

  it("ignores accents, case and spacing in names", () => {
    expect(compareOcr({ fullName: "NGUYEN  VAN DUC", idNumber: ID_NUMBER, dateOfBirth: "1990-05-01" }, declared)).toEqual([]);
  });

  it("flags each differing field and an expired card", () => {
    const read = { fullName: "Trần Văn Đức", idNumber: "079203001235", dateOfBirth: "1991-05-01", expiryDate: "2020-01-01" };
    expect(compareOcr(read, declared)).toEqual(["fullName", "idNumber", "dateOfBirth", "cardExpired"]);
  });
});

describe("OCR on submission", () => {
  it("sandbox reads back the declared identity: MATCHED, shown to the admin only, without the full number", async () => {
    expect((await submit()).statusCode).toBe(201);
    const doc = await identityDoc();
    expect(doc.ocr).toMatchObject({ status: "MATCHED", provider: "SANDBOX", mismatches: [], readIdNumberLast4: "1234" });
    expect(JSON.stringify(doc)).not.toContain(ID_NUMBER);

    const admin = (await adminView()).body.data.documents.find((d) => d.documentType === "IDENTITY");
    expect(admin.ocr.status).toBe("MATCHED");
    const mine = (await request(app).get("/api/teacher/verification").set(as("teacher"))).body.data.documents;
    expect(mine.every((d) => d.ocr === undefined)).toBe(true);
  });

  it("records a mismatch, and approving it then needs an explanation", async () => {
    jest.spyOn(ocrProvider, "recognizeIdCard").mockResolvedValue({
      provider: "FPT_AI",
      fields: { fullName: "Lê Thị Hoa", idNumber: ID_NUMBER, dateOfBirth: "1990-05-01" },
    });
    await submit();
    expect((await identityDoc()).ocr).toMatchObject({ status: "MISMATCHED", mismatches: ["fullName"], readFullName: "Lê Thị Hoa" });

    const url = `/api/admin/teacher-verifications/${users.teacher._id}/approve`;
    expect((await request(app).post(url).set(as("admin")).send({})).body.error).toBe("OCR_MISMATCH_NOTE_REQUIRED");
    const ok = await request(app).post(url).set(as("admin")).send({ reviewNote: "Ảnh mờ, đã gọi video đối chiếu" });
    expect(ok.body.data.verificationStatus).toBe("VERIFIED");
  });

  it("an OCR failure never blocks the submission", async () => {
    jest.spyOn(ocrProvider, "recognizeIdCard").mockRejectedValue(new Error("timeout"));
    expect((await submit()).statusCode).toBe(201);
    expect((await identityDoc()).ocr).toMatchObject({ status: "UNAVAILABLE", note: "OCR failed: timeout" });
  });

  it("a PDF front side is not read", async () => {
    await submit("teacher", { file: PDF, type: "application/pdf" });
    expect((await identityDoc()).ocr.status).toBe("UNAVAILABLE");
  });
});

describe("Per-document rejection reasons", () => {
  it("are validated, stored on each document and shown to the teacher", async () => {
    await submit();
    const docs = (await adminView()).body.data.documents;
    const identity = docs.find((d) => d.documentType === "IDENTITY");
    const url = `/api/admin/teacher-verifications/${users.teacher._id}/reject`;

    const bad = await request(app).post(url).set(as("admin")).send({ reviewNote: "Thiếu", documents: [{ documentId: users.admin._id, reason: "x" }] });
    expect(bad.statusCode).toBe(400);

    const res = await request(app)
      .post(url)
      .set(as("admin"))
      .send({ reviewNote: "Cần bổ sung", documents: [{ documentId: identity._id, reason: "Ảnh mặt trước bị loá" }] });
    expect(res.statusCode).toBe(200);

    const mine = (await request(app).get("/api/teacher/verification").set(as("teacher"))).body.data.documents;
    expect(mine.find((d) => d.documentType === "IDENTITY").rejectionReason).toBe("Ảnh mặt trước bị loá");
    expect(mine.find((d) => d.documentType === "QUALIFICATION").rejectionReason).toBeNull();
  });
});
