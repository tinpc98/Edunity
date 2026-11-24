// Registration step 2: the teaching profile is stored with the dossier and shown to the Admin reviewing it.
const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-teaching-"));

const request = require("supertest");
const app = require("../src/app");
const { User } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const identity = { fullName: "Nguyễn Văn A", idNumber: "079203001234", dateOfBirth: "1990-05-01", address: "12 Lê Lợi, Quận 1, TP.HCM" };
const profile = (overrides = {}) => ({
  degree: "BACHELOR",
  major: "Sư phạm Toán",
  school: "ĐH Sư phạm Hà Nội",
  certificates: [{ name: "IELTS 7.5", year: 2023 }],
  achievements: "10 học sinh đỗ chuyên",
  subjects: ["Toán", "Vật lý", "Toán"],
  gradeLevels: ["GRADE_10", "UNIVERSITY_EXAM_PREP"],
  studentNote: "Học sinh mất gốc",
  yearsOfExperience: 5,
  ...overrides,
});

let teacher, admin;
const as = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const upload = async (purpose) =>
  (await request(app).post("/api/uploads/private").set(as(teacher)).field("purpose", purpose).attach("file", PNG, { filename: "x.png", contentType: "image/png" }))
    .body.data.storageKey;
const submit = async (teachingProfile) =>
  request(app)
    .post("/api/teacher/verification")
    .set(as(teacher))
    .send({
      documents: [
        { documentType: "IDENTITY", files: [{ side: "FRONT", storageKey: await upload("IDENTITY") }, { side: "BACK", storageKey: await upload("IDENTITY") }] },
        { documentType: "QUALIFICATION", files: [{ storageKey: await upload("QUALIFICATION") }] },
      ],
      identity,
      ...(teachingProfile === undefined ? {} : { teachingProfile }),
    });

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});
afterAll(disconnectDB);
beforeEach(async () => {
  await clearDB();
  admin = await User.create({ email: "admin@tp.test", passwordHash: "x", role: "ADMIN", status: "ACTIVE" });
  teacher = await User.create({ email: "t@tp.test", passwordHash: "x", role: "TEACHER", status: "ACTIVE", teacherProfile: { fullName: "GV" } });
});

test("the teaching profile is saved with the dossier and the Admin sees it", async () => {
  const res = await submit(profile());
  expect(res.status).toBe(201);

  const stored = (await User.findById(teacher._id).lean()).teacherProfile;
  expect(stored.verificationStatus).toBe("PENDING");
  expect(stored.teachingProfile).toMatchObject({
    degree: "BACHELOR",
    certificates: [{ name: "IELTS 7.5", year: 2023 }],
    subjects: ["Toán", "Vật lý"],
    gradeLevels: ["GRADE_10", "UNIVERSITY_EXAM_PREP"],
    yearsOfExperience: 5,
  });

  const view = await request(app).get(`/api/admin/teacher-verifications/${teacher._id}`).set(as(admin));
  expect(view.status).toBe(200);
  expect(view.body.data.teachingProfile.subjects).toEqual(["Toán", "Vật lý"]);
});

test.each([
  ["an unknown degree", { degree: "PHD" }],
  ["no subject", { subjects: [] }],
  ["a grade outside the offer", { gradeLevels: ["GRADE_3"] }],
  ["no grade", { gradeLevels: [] }],
  ["no target students", { studentNote: "  " }],
  ["missing target students", { studentNote: undefined }],
  ["negative experience", { yearsOfExperience: -1 }],
  ["missing experience", { yearsOfExperience: null }],
  ["a certificate without a name", { certificates: [{ name: " ", year: 2020 }] }],
  ["a certificate from the future", { certificates: [{ name: "X", year: 3000 }] }],
])("refuses %s and leaves the teacher unverified", async (_label, overrides) => {
  const res = await submit(profile(overrides));
  expect(res.status).toBe(400);
  expect((await User.findById(teacher._id).lean()).teacherProfile.verificationStatus).toBe("UNVERIFIED");
});

test("approving the profile grants each subject at the profile's grades its category teaches", async () => {
  const { Category, Subject, TeacherSubjectAuthorization } = require("../src/models");
  const thcs = await Category.create({ name: "THCS", slug: "thcs-tp", createdBy: admin._id });
  const thpt = await Category.create({ name: "THPT", slug: "thpt-tp", createdBy: admin._id });
  const subject = (name, slug, category) => Subject.create({ name, slug, categoryId: category._id, categoryName: category.name, createdBy: admin._id });
  const toanThcs = await subject("Toán", "toan-thcs-tp", thcs);
  const toanThpt = await subject("Toán", "toan-thpt-tp", thpt);
  await subject("Hóa học", "hoa-thpt-tp", thpt);

  await submit(profile({ subjects: ["Toán"], gradeLevels: ["GRADE_8", "GRADE_12"] }));
  const res = await request(app).post(`/api/admin/teacher-verifications/${teacher._id}/approve`).set(as(admin)).send({ reviewNote: "ok" });
  expect(res.status).toBe(200);

  const auths = await TeacherSubjectAuthorization.find({ teacherId: teacher._id }).lean();
  expect(auths.map((a) => [String(a.subjectId), a.gradeLevel, a.status]).sort()).toEqual(
    [
      [String(toanThcs._id), "GRADE_8", "APPROVED"],
      [String(toanThpt._id), "GRADE_12", "APPROVED"],
    ].sort()
  );
});

describe("approving the dossier sends the teaching contract", () => {
  const { TeacherContract } = require("../src/models");
  const { signContract } = require("./helpers/contract");
  const approve = async () => {
    await submit(profile());
    return request(app).post(`/api/admin/teacher-verifications/${teacher._id}/approve`).set(as(admin)).send({ reviewNote: "ok" });
  };

  test("a newly verified teacher receives one contract to sign", async () => {
    expect((await approve()).status).toBe(200);
    const contracts = await TeacherContract.find({ teacherId: teacher._id }).lean();
    expect(contracts.map((c) => c.status)).toEqual(["PENDING_SIGNATURE"]);
    const { Notification } = require("../src/models");
    expect(await Notification.countDocuments({ userId: teacher._id, type: "TEACHER_CONTRACT_SENT" })).toBe(1);
  });

  test("a teacher whose contract is still current is not sent another", async () => {
    await signContract(teacher._id, admin._id);
    expect((await approve()).status).toBe(200);
    expect(await TeacherContract.countDocuments({ teacherId: teacher._id })).toBe(1);
  });

  test("a teacher whose contract expired is sent a new one", async () => {
    await signContract(teacher._id, admin._id, { effectiveFrom: new Date(Date.now() - 400 * 86400000), expiresAt: new Date(Date.now() - 86400000) });
    expect((await approve()).status).toBe(200);
    const statuses = (await TeacherContract.find({ teacherId: teacher._id }).lean()).map((c) => c.status).sort();
    expect(statuses).toEqual(["ACTIVE", "PENDING_SIGNATURE"]);
  });
});

test("a resubmission without a teaching profile keeps the stored one", async () => {
  await submit(profile());
  await User.updateOne({ _id: teacher._id }, { "teacherProfile.verificationStatus": "REJECTED" });

  expect((await submit(undefined)).status).toBe(201);
  expect((await User.findById(teacher._id).lean()).teacherProfile.teachingProfile.degree).toBe("BACHELOR");
});
