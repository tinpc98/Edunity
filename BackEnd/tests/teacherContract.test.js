const crypto = require("crypto");
const zlib = require("zlib");
const request = require("supertest");
const app = require("../src/app");
const { User, TeacherContract, VerificationDocument, AuditLog, Notification } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const pii = require("../src/utils/pii");
const { assertTeacherContractGate } = require("../src/services/classCreationGateService");
const econtractProvider = require("../src/services/econtractProvider");
const storage = require("../src/services/storageService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const WEBHOOK = "/api/contracts/econtract-webhook";
const SECRET = "test-econtract-secret";

// Minimal valid 2x2 RGBA PNG data URL for testing drawn signature pad upload
function makeSamplePngDataUrl() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const makeChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); // width 2
  ihdr.writeUInt32BE(2, 4); // height 2
  ihdr[8] = 8; // bitDepth 8
  ihdr[9] = 6; // colorType 6 (RGBA)
  // 2 rows, each: filterByte(0) + 2 pixels * 4 bytes = 9 bytes -> 18 bytes
  const rawScanlines = Buffer.from([
    0, 15, 118, 110, 255, 15, 118, 110, 255,
    0, 255, 255, 255, 0, 15, 118, 110, 255,
  ]);
  const idat = zlib.deflateSync(rawScanlines);
  const png = Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

let users, tokens;
const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });

const createUser = async (name, role, extra = {}) => {
  const user = await User.create({
    email: `${name}@test.com`,
    passwordHash: hashPassword("password123"),
    role,
    ...(role === "TEACHER"
      ? {
          teacherProfile: {
            fullName: name,
            verificationStatus: "VERIFIED",
            qualificationSummary: "Thạc sĩ Toán học - ĐHSP Hà Nội",
            identity: {
              fullName: `Giáo viên ${name}`,
              dateOfBirth: new Date("1992-05-15"),
              idNumberEnc: pii.encrypt("079092001234"),
              idNumberHash: pii.blindIndex(`079092001234-${name}`),
              idNumberLast4: "1234",
              addressEnc: pii.encrypt("123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"),
              submittedAt: new Date(),
            },
            teachingProfile: {
              degree: "MASTER",
              major: "Sư phạm Toán",
              school: "ĐHSP",
              subjects: ["Toán"],
              gradeLevels: ["GRADE_10", "GRADE_11", "GRADE_12"],
              studentNote: "Học sinh THPT",
              yearsOfExperience: 6,
            },
          },
        }
      : {}),
    ...extra,
  });
  tokens[name] = signAccessToken(user);
  users[name] = user;
  return user;
};

const send = (teacher = "teacherA", body = {}) =>
  request(app).post(`/api/admin/teachers/${users[teacher]._id}/contracts`).set(as("admin")).send(body);

const signedWebhook = (payload, secret = SECRET) => {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return request(app)
    .post(WEBHOOK)
    .set("Content-Type", "application/json")
    .set("X-Econtract-Signature", signature)
    .send(raw);
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
  await createUser("studentA", "STUDENT", { studentProfile: { fullName: "Student A" } });
  await createUser("pendingTeacher", "TEACHER", {
    teacherProfile: {
      fullName: "Pending Teacher",
      verificationStatus: "PENDING",
      qualificationSummary: "Cử nhân Tiếng Anh",
      identity: {
        fullName: "Nguyễn Văn Giáo Viên",
        dateOfBirth: new Date("1995-08-20"),
        idNumberEnc: pii.encrypt("001095009876"),
        idNumberHash: pii.blindIndex("001095009876"),
        idNumberLast4: "9876",
        addressEnc: pii.encrypt("45 Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội"),
        submittedAt: new Date(),
      },
      teachingProfile: {
        degree: "BACHELOR",
        major: "Sư phạm Tiếng Anh",
        school: "ĐH Ngoại Ngữ",
        subjects: ["Tiếng Anh"],
        gradeLevels: ["GRADE_9"],
        studentNote: "Học sinh lớp 9",
        yearsOfExperience: 3,
      },
    },
  });
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
    expect(res.body.data).toMatchObject({
      status: "PENDING_SIGNATURE",
      lifecycleStatus: "PENDING_SIGNATURE",
      provider: "SANDBOX",
      canSign: true,
      canSignInSandbox: true,
      hasInitialPdf: true,
      hasSignedPdf: false,
    });
    const months =
      (new Date(res.body.data.expiresAt) - new Date(res.body.data.effectiveFrom)) /
      (30 * 24 * 3600 * 1000);
    expect(Math.round(months)).toBe(12);

    expect((await send()).body.error).toBe("CONTRACT_ALREADY_PENDING");
    expect(await AuditLog.countDocuments({ action: "TEACHER_CONTRACT_SENT" })).toBe(1);
    expect(
      await Notification.countDocuments({ userId: users.teacherA._id, type: "TEACHER_CONTRACT_SENT" })
    ).toBe(1);
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

describe("Auto-generation on Admin Approve Teacher Verification & Idempotent Retry", () => {
  beforeEach(async () => {
    await VerificationDocument.create([
      {
        userId: users.pendingTeacher._id,
        documentType: "IDENTITY",
        status: "PENDING",
        files: [
          { side: "FRONT", storageKey: `private/${users.pendingTeacher._id}/IDENTITY/00000000-0000-0000-0000-000000000001.jpg` },
          { side: "BACK", storageKey: `private/${users.pendingTeacher._id}/IDENTITY/00000000-0000-0000-0000-000000000002.jpg` },
        ],
      },
      {
        userId: users.pendingTeacher._id,
        documentType: "QUALIFICATION",
        status: "PENDING",
        files: [
          { side: "SINGLE", storageKey: `private/${users.pendingTeacher._id}/QUALIFICATION/00000000-0000-0000-0000-000000000003.pdf` },
        ],
      },
    ]);
  });

  it("1 & 2 & 12: Admin Approve automatically generates personalized contract with 90/10 revenue share & PDF; duplicate approve/retry does not duplicate", async () => {
    const res = await request(app)
      .post(`/api/admin/teacher-verifications/${users.pendingTeacher._id}/approve`)
      .set(as("admin"))
      .send({ reviewNote: "Hồ sơ hợp lệ" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.verificationStatus).toBe("VERIFIED");
    expect(res.body.data.contractGeneration).toMatchObject({
      status: "CREATED",
      contractStatus: "PENDING_SIGNATURE",
    });

    const contracts = await TeacherContract.find({ teacherId: users.pendingTeacher._id }).lean();
    expect(contracts).toHaveLength(1);
    const contract = contracts[0];
    expect(contract.status).toBe("PENDING_SIGNATURE");
    expect(contract.snapshot.company.companyName).toBe("Công ty TNHH Edunity");
    expect(contract.snapshot.company.representativeName).toBe("Ông Phạm Công Tin");
    expect(contract.snapshot.revenueSharing.teacherSharePercent).toBe(90);
    expect(contract.snapshot.revenueSharing.platformSharePercent).toBe(10);
    expect(contract.snapshot.teacher.fullName).toBe("Nguyễn Văn Giáo Viên");
    expect(contract.snapshot.teacher.idNumberMasked).toBe("********9876");
    expect(contract.initialPdf).toBeTruthy();
    expect(contract.initialPdf.sha256Hash).toMatch(/^[a-f0-9]{64}$/);

    // Verify stored PDF starts with %PDF-1.4 and matches SHA-256 hash
    const storedPdf = await storage.readPrivateFile(contract.initialPdf.storageKey);
    expect(storedPdf.buffer.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(crypto.createHash("sha256").update(storedPdf.buffer).digest("hex")).toBe(
      contract.initialPdf.sha256Hash
    );

    // Duplicate approve attempt is rejected by verification guard and does not create a second contract
    const dupApprove = await request(app)
      .post(`/api/admin/teacher-verifications/${users.pendingTeacher._id}/approve`)
      .set(as("admin"))
      .send({});
    expect(dupApprove.statusCode).toBe(409);
    expect(await TeacherContract.countDocuments({ teacherId: users.pendingTeacher._id })).toBe(1);

    // 14: Admin retry endpoint is idempotent and returns EXISTING without creating duplicates
    const retryRes = await request(app)
      .post(`/api/admin/teachers/${users.pendingTeacher._id}/contracts/retry`)
      .set(as("admin"))
      .send({});
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.body.data.outcome).toBe("EXISTING");
    expect(await TeacherContract.countDocuments({ teacherId: users.pendingTeacher._id })).toBe(1);
  });

  it("13: Admin Reject Teacher Verification does NOT create any contract", async () => {
    const res = await request(app)
      .post(`/api/admin/teacher-verifications/${users.pendingTeacher._id}/reject`)
      .set(as("admin"))
      .send({ reviewNote: "Ảnh CCCD bị mờ" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.verificationStatus).toBe("REJECTED");
    expect(await TeacherContract.countDocuments({ teacherId: users.pendingTeacher._id })).toBe(0);
  });
});

describe("Teacher eContract Signing Workflow, Snapshot Immutability, PDF & Audit Logs", () => {
  it("4, 6, 7, 9, 10, 11: Teacher views detail, signs with drawn signature, generates distinct final PDF, records audit logs, and snapshot stays immutable when profile changes", async () => {
    const created = (await send("teacherA")).body.data;

    // 4: Teacher fetches contract detail (records CONTRACT_VIEWED)
    const detailRes = await request(app)
      .get(`/api/teacher/contracts/${created.id}`)
      .set(as("teacherA"));
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body.data.snapshot.revenueSharing).toMatchObject({
      teacherSharePercent: 90,
      platformSharePercent: 10,
    });
    expect(detailRes.body.data.renderedHtml).toContain("HỢP ĐỒNG CỘNG TÁC GIẢNG DẠY");
    expect(detailRes.body.data.renderedHtml).toContain("Ông Phạm Công Tin");
    expect(detailRes.body.data.renderedHtml).toContain("90%");
    expect(detailRes.body.data.renderedHtml).toContain("10%");
    const initialStorageKey = detailRes.body.data.initialPdf.url;
    const initialHash = detailRes.body.data.initialPdf.sha256Hash;
    expect(initialStorageKey).toBeTruthy();

    // Validation requires readConfirmed and agreedToTerms
    const invalidSign = await request(app)
      .post(`/api/teacher/contracts/${created.id}/sign`)
      .set(as("teacherA"))
      .send({ readConfirmed: true, agreedToTerms: false });
    expect(invalidSign.statusCode).toBe(400);

    // 6: Teacher signs with drawn PNG signature
    const pngDataUrl = makeSamplePngDataUrl();
    const signRes = await request(app)
      .post(`/api/teacher/contracts/${created.id}/sign`)
      .set(as("teacherA"))
      .set("User-Agent", "Jest-eContract-Test/1.0")
      .send({
        readConfirmed: true,
        agreedToTerms: true,
        signingMethod: "DRAWN_SIGNATURE",
        signatureDataUrl: pngDataUrl,
      });

    expect(signRes.statusCode).toBe(200);
    expect(signRes.body.data.status).toBe("ACTIVE");
    expect(signRes.body.data.lifecycleStatus).toBe("SIGNED");
    expect(signRes.body.data.hasInitialPdf).toBe(true);
    expect(signRes.body.data.hasSignedPdf).toBe(true);
    expect(signRes.body.data.signatureSummary).toMatchObject({
      signingMethod: "DRAWN_SIGNATURE",
      hasSignatureImage: true,
      documentHashAtSigning: initialHash,
    });

    // 10: Final PDF is stored separately without overwriting initialPdf
    const dbContract = await TeacherContract.findById(created.id).lean();
    expect(dbContract.initialPdf.storageKey).not.toBe(dbContract.signedPdf.storageKey);
    expect(dbContract.initialPdf.sha256Hash).toBe(initialHash);
    expect(dbContract.signedPdf.sha256Hash).not.toBe(initialHash);

    const finalPdfFile = await storage.readPrivateFile(dbContract.signedPdf.storageKey);
    expect(finalPdfFile.buffer.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(crypto.createHash("sha256").update(finalPdfFile.buffer).digest("hex")).toBe(
      dbContract.signedPdf.sha256Hash
    );

    // 7: Duplicate signing of an already SIGNED contract is rejected with 409 CONTRACT_NOT_PENDING
    const signAgain = await request(app)
      .post(`/api/teacher/contracts/${created.id}/sign`)
      .set(as("teacherA"))
      .send({ readConfirmed: true, agreedToTerms: true, signingMethod: "CLICK_TO_SIGN" });
    expect(signAgain.statusCode).toBe(409);
    expect(signAgain.body.error).toBe("CONTRACT_NOT_PENDING");

    // Download PDF records CONTRACT_PDF_DOWNLOADED
    const pdfRes = await request(app)
      .get(`/api/teacher/contracts/${created.id}/pdf?version=signed`)
      .set(as("teacherA"));
    expect(pdfRes.statusCode).toBe(200);
    expect(pdfRes.body.data.version).toBe("SIGNED");
    expect(pdfRes.body.data.sha256Hash).toBe(dbContract.signedPdf.sha256Hash);

    // 9: Verify Audit Logs recorded all lifecycle events
    const afterDownload = await TeacherContract.findById(created.id).lean();
    const eventTypes = afterDownload.auditLogs.map((e) => e.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "CONTRACT_CREATED",
        "CONTRACT_PDF_GENERATED",
        "CONTRACT_SENT_TO_TEACHER",
        "CONTRACT_VIEWED",
        "CONTRACT_SIGNED",
        "CONTRACT_PDF_DOWNLOADED",
      ])
    );

    // 11: Teacher updates their profile afterwards -> Contract snapshot remains immutable
    const originalSnapName = afterDownload.snapshot.teacher.fullName;
    const profilePatch = await request(app)
      .patch("/api/me/profile")
      .set(as("teacherA"))
      .send({ fullName: "Tên Đã Đổi Sau Khi Ký", qualificationSummary: "Chuyên môn mới" });
    expect(profilePatch.statusCode).toBe(200);

    const contractAfterProfileEdit = await TeacherContract.findById(created.id).lean();
    expect(contractAfterProfileEdit.snapshot.teacher.fullName).toBe(originalSnapName);
    expect(contractAfterProfileEdit.snapshot.teacher.qualificationSummary).toBe(
      "Thạc sĩ Toán học - ĐHSP Hà Nội"
    );
  });

  it("8: Teacher cannot sign a CANCELLED contract", async () => {
    const { id } = (await send("teacherA")).body.data;
    await request(app)
      .post(`/api/admin/contracts/${id}/end`)
      .set(as("admin"))
      .send({ reason: "Hủy hợp đồng cũ" });

    const signCancelled = await request(app)
      .post(`/api/teacher/contracts/${id}/sign`)
      .set(as("teacherA"))
      .send({ readConfirmed: true, agreedToTerms: true, signingMethod: "CLICK_TO_SIGN" });
    expect(signCancelled.statusCode).toBe(409);
    expect(signCancelled.body.error).toBe("CONTRACT_NOT_PENDING");
  });

  it("Public verification endpoint verifies SHA-256 integrity without exposing Teacher PII", async () => {
    const { id, verificationCode } = (await send("teacherA")).body.data;
    await request(app)
      .post(`/api/teacher/contracts/${id}/sign`)
      .set(as("teacherA"))
      .send({ readConfirmed: true, agreedToTerms: true, signingMethod: "CLICK_TO_SIGN" });

    const signedContract = await TeacherContract.findById(id).lean();
    const finalHash = signedContract.signedPdf.sha256Hash;

    const verifyRes = await request(app).get(
      `/api/contracts/verify/${verificationCode}?hash=${finalHash}`
    );
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.data).toMatchObject({
      contractCode: signedContract.contractCode,
      verificationCode,
      lifecycleStatus: "SIGNED",
      companyName: "Công ty TNHH Edunity",
      companyRepresentative: "Ông Phạm Công Tin",
    });
    expect(verifyRes.body.data.integrity.hashCheck).toEqual({
      matched: true,
      matchedVersion: "SIGNED",
    });

    // Must NOT leak raw CCCD, address, or email
    const rawJson = JSON.stringify(verifyRes.body.data);
    expect(rawJson).not.toContain("079092001234");
    expect(rawJson).not.toContain("1234");
    expect(rawJson).not.toContain("Nguyễn Huệ");
    expect(rawJson).not.toContain("teacherA@test.com");
  });
});

describe("Class creation gate (TEA-12)", () => {
  it("a VERIFIED teacher without a signed contract cannot open classes; signing unlocks it", async () => {
    await expect(gate("teacherA")).rejects.toMatchObject({
      code: "TEACHER_CONTRACT_NOT_FOUND",
      statusCode: 403,
    });

    const { id } = (await send()).body.data;
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE" });

    const signed = await request(app)
      .post(`/api/teacher/contracts/${id}/sandbox-sign`)
      .set(as("teacherA"))
      .send({ decision: "SIGN" });
    expect(signed.statusCode).toBe(200);
    expect(signed.body.data.status).toBe("ACTIVE");
    await expect(gate("teacherA")).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("an expired or not-yet-effective contract does not count", async () => {
    const base = {
      teacherId: users.teacherA._id,
      status: "ACTIVE",
      provider: { name: "SANDBOX" },
      createdBy: users.admin._id,
      sentAt: new Date(),
    };
    await TeacherContract.create({
      ...base,
      contractCode: "HD-OLD",
      provider: { name: "SANDBOX", envelopeId: "e1" },
      effectiveFrom: new Date("2020-01-01"),
      expiresAt: new Date("2021-01-01"),
    });
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_EXPIRED" });
    expect(
      (await request(app).get("/api/teacher/contracts").set(as("teacherA"))).body.data[0].status
    ).toBe("EXPIRED");

    await TeacherContract.create({
      ...base,
      contractCode: "HD-FUT",
      provider: { name: "SANDBOX", envelopeId: "e2" },
      effectiveFrom: new Date("2099-01-01"),
      expiresAt: new Date("2100-01-01"),
    });
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE" });
  });
});

describe("Teacher access & Authorization (5 & 15)", () => {
  it("cannot see, download, or sign another teacher's contract, and does not see admin bookkeeping", async () => {
    const { id } = (await send()).body.data;
    const otherSign = await request(app)
      .post(`/api/teacher/contracts/${id}/sign`)
      .set(as("teacherB"))
      .send({ readConfirmed: true, agreedToTerms: true });
    expect(otherSign.statusCode).toBe(404);

    const otherSandbox = await request(app)
      .post(`/api/teacher/contracts/${id}/sandbox-sign`)
      .set(as("teacherB"))
      .send({ decision: "SIGN" });
    expect(otherSandbox.statusCode).toBe(404);

    const otherDetail = await request(app)
      .get(`/api/teacher/contracts/${id}`)
      .set(as("teacherB"));
    expect(otherDetail.statusCode).toBe(404);

    const otherPdf = await request(app)
      .get(`/api/teacher/contracts/${id}/pdf`)
      .set(as("teacherB"));
    expect(otherPdf.statusCode).toBe(404);

    const studentAccess = await request(app)
      .get(`/api/teacher/contracts/${id}`)
      .set(as("studentA"));
    expect(studentAccess.statusCode).toBe(403);

    const teacherAdminEndpoint = await request(app)
      .get(`/api/admin/contracts/${id}`)
      .set(as("teacherA"));
    expect(teacherAdminEndpoint.statusCode).toBe(403);

    expect(
      (await request(app).get("/api/teacher/contracts").set(as("teacherB"))).body.data
    ).toEqual([]);

    const mine = (await request(app).get("/api/teacher/contracts").set(as("teacherA"))).body.data[0];
    expect(mine).not.toHaveProperty("createdBy");
    expect(mine).not.toHaveProperty("history");
    expect(mine).not.toHaveProperty("envelopeId");
  });

  it("declining notifies admins and the contract cannot be signed afterwards", async () => {
    const { id } = (await send()).body.data;
    const declined = await request(app)
      .post(`/api/teacher/contracts/${id}/sandbox-sign`)
      .set(as("teacherA"))
      .send({ decision: "DECLINE" });
    expect(declined.body.data.status).toBe("DECLINED");
    expect(
      await Notification.countDocuments({
        userId: users.admin._id,
        type: "TEACHER_CONTRACT_DECLINED",
      })
    ).toBe(1);

    const again = await request(app)
      .post(`/api/teacher/contracts/${id}/sandbox-sign`)
      .set(as("teacherA"))
      .send({ decision: "SIGN" });
    expect(again.body.error).toBe("CONTRACT_NOT_PENDING");
  });
});

describe("Admin ends a contract", () => {
  it("terminates an ACTIVE contract with a reason, which closes the gate again", async () => {
    const { id } = (await send()).body.data;
    await request(app)
      .post(`/api/teacher/contracts/${id}/sandbox-sign`)
      .set(as("teacherA"))
      .send({ decision: "SIGN" });

    expect(
      (await request(app).post(`/api/admin/contracts/${id}/end`).set(as("admin")).send({}))
        .statusCode
    ).toBe(400);
    const ended = await request(app)
      .post(`/api/admin/contracts/${id}/end`)
      .set(as("admin"))
      .send({ reason: "Vi phạm" });
    expect(ended.body.data.status).toBe("TERMINATED");
    await expect(gate("teacherA")).rejects.toMatchObject({ code: "TEACHER_CONTRACT_NOT_ACTIVE" });
    expect(await AuditLog.countDocuments({ action: "TEACHER_CONTRACT_TERMINATED" })).toBe(1);
  });

  it("cancels a contract still awaiting signature", async () => {
    const { id } = (await send()).body.data;
    const ended = await request(app)
      .post(`/api/admin/contracts/${id}/end`)
      .set(as("admin"))
      .send({ reason: "Gửi nhầm" });
    expect(ended.body.data.status).toBe("CANCELLED");
    expect((await send()).statusCode).toBe(201); // a new one can be sent
  });
});

describe("E-contract webhook", () => {
  it("refuses unsigned or wrongly signed deliveries", async () => {
    const { envelopeId } = (await TeacherContract.findById((await send()).body.data.id).lean())
      .provider;
    expect(
      (await request(app).post(WEBHOOK).send({ envelopeId, event: "SIGNED" })).statusCode
    ).toBe(401);
    expect(
      (await signedWebhook({ envelopeId, event: "SIGNED" }, "wrong-secret")).statusCode
    ).toBe(401);
    expect((await TeacherContract.findOne({ "provider.envelopeId": envelopeId })).status).toBe(
      "PENDING_SIGNATURE"
    );
  });

  it("activates on a signed SIGNED event, is idempotent, and ignores late events after termination", async () => {
    const { id } = (await send()).body.data;
    const { envelopeId } = (await TeacherContract.findById(id).lean()).provider;

    expect((await signedWebhook({ envelopeId, event: "SIGNED" })).statusCode).toBe(200);
    expect((await signedWebhook({ envelopeId, event: "SIGNED" })).statusCode).toBe(200);
    const contract = await TeacherContract.findById(id).lean();
    expect(contract.status).toBe("ACTIVE");
    expect(contract.history.filter((h) => h.action === "SIGNED")).toHaveLength(1);

    await request(app)
      .post(`/api/admin/contracts/${id}/end`)
      .set(as("admin"))
      .send({ reason: "x" });
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
      await expect(econtractProvider.createEnvelope({ contractCode: "X" })).rejects.toMatchObject({
        statusCode: 503,
      });
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
