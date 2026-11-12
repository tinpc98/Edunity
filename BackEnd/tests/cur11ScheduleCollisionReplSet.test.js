const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, TeacherScheduleLock, TeacherSubjectAuthorization, CoursePricingPolicy } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TASK CUR-11 (Real MongoMemoryReplSet): Concurrent Schedule Collision & Retry Serialization", () => {
  let admin, teacher, classA, classB;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("password123");

    admin = await User.create({ email: "admin-cur11@test.com", passwordHash, role: "ADMIN" });
    teacher = await User.create({
      email: "teacher-cur11@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Concurrency Teacher", verificationStatus: "VERIFIED" },
    });

    const cat = await Category.create({ name: "Toán THPT", slug: "toan-thpt", createdBy: admin._id, status: "ACTIVE" });
    const sub = await Subject.create({
      name: "Toán",
      slug: "toan",
      categoryId: cat._id,
      categoryName: cat.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const course = await Course.create({
      title: "Toán 12",
      slug: "toan-12",
      categoryId: cat._id,
      categoryName: cat.name,
      subjectId: sub._id,
      subjectName: sub.name,
      gradeLevel: "GRADE_12",
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });

    const startDate = new Date("2028-05-01T00:00:00+07:00");
    const endDate = new Date("2028-05-15T23:59:59+07:00");

    classA = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Concurrency Teacher",
      categoryId: cat._id,
      subjectId: sub._id,
      gradeLevel: "GRADE_12",
      level: "INTERMEDIATE",
      className: "Class A",
      classType: "FREE",
      price: 0,
      capacity: 20,
      startDate,
      endDate,
      schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      status: "DRAFT",
    });

    classB = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Concurrency Teacher",
      categoryId: cat._id,
      subjectId: sub._id,
      gradeLevel: "GRADE_12",
      level: "INTERMEDIATE",
      className: "Class B",
      classType: "FREE",
      price: 0,
      capacity: 20,
      startDate,
      endDate,
      schedule: [{ dayOfWeek: 1, startTime: "19:30", endTime: "21:30" }],
      status: "DRAFT",
    });
  });

  it("CONC-CUR11-01: Barrier-synchronized concurrent createSessions on overlapping teacher slots across Class A and Class B allows ONLY ONE", async () => {
    let firstPaused = false;
    let releaseFirst = null;
    const barrier = new Promise((r) => {
      releaseFirst = r;
    });

    const originalInsertMany = Session.insertMany;
    let triggerCount = 0;
    Session.insertMany = async function (docs, options) {
      triggerCount += 1;
      if (triggerCount === 1) {
        firstPaused = true;
        await barrier;
      }
      return originalInsertMany.call(this, docs, options);
    };

    try {
      // Supertest Test instances are lazy thenables; attach .then() immediately so req1 starts before polling the barrier
      const req1 = Promise.resolve(
        request(app)
          .post(`/api/teacher/classes/${classA._id}/sessions`)
          .set(as(teacher))
          .send({
            title: "Class A Mon 19:00",
            startDatetime: "2028-05-08T19:00:00",
            endDatetime: "2028-05-08T21:00:00",
          })
      );

      const start = Date.now();
      while (!firstPaused && Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(firstPaused).toBe(true);

      // Second request hits WiredTiger lock WriteConflict -> retries after req1 commits -> sees Session A -> 409!
      const req2 = Promise.resolve(
        request(app)
          .post(`/api/teacher/classes/${classB._id}/sessions`)
          .set(as(teacher))
          .send({
            title: "Class B Overlap Mon 20:00",
            startDatetime: "2028-05-08T20:00:00",
            endDatetime: "2028-05-08T22:00:00",
          })
      );

      await new Promise((r) => setTimeout(r, 60));
      releaseFirst();

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.statusCode, res2.statusCode].sort();
      expect(statuses).toEqual([201, 409]);

      const rejected = res1.statusCode === 409 ? res1 : res2;
      expect(rejected.body.error).toBe("SESSION_TIME_CONFLICT");

      const allSessions = await Session.find({ teacherId: teacher._id }).lean();
      expect(allSessions).toHaveLength(1);
    } finally {
      Session.insertMany = originalInsertMany;
      if (releaseFirst) releaseFirst();
    }
  });

  it("CONC-CUR11-02: Concurrent generateSessions vs overlapping createSessions serializes via TeacherScheduleLock with 0 overlaps", async () => {
    const genReq = request(app)
      .post(`/api/teacher/classes/${classA._id}/sessions/generate`)
      .set(as(teacher))
      .send({});

    const createReq = request(app)
      .post(`/api/teacher/classes/${classB._id}/sessions`)
      .set(as(teacher))
      .send({
        title: "Class B Overlap",
        startDatetime: "2028-05-08T19:30:00",
        endDatetime: "2028-05-08T21:30:00",
      });

    const [rGen, rCreate] = await Promise.all([genReq, createReq]);
    expect([rGen.statusCode, rCreate.statusCode].sort()).toEqual([201, 409]);

    const sessions = await Session.find({ teacherId: teacher._id }).sort({ startDatetime: 1 }).lean();
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].startDatetime.getTime()).toBeGreaterThanOrEqual(sessions[i - 1].endDatetime.getTime());
    }
  });

  it("CONC-CUR11-03: Concurrent non-overlapping mutations both commit cleanly with sequential sessionNumber and lockSeq", async () => {
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/teacher/classes/${classA._id}/sessions`).set(as(teacher)).send({
        title: "Non-overlap 1",
        startDatetime: "2028-05-08T09:00:00",
        endDatetime: "2028-05-08T11:00:00",
      }),
      request(app).post(`/api/teacher/classes/${classA._id}/sessions`).set(as(teacher)).send({
        title: "Non-overlap 2",
        startDatetime: "2028-05-08T14:00:00",
        endDatetime: "2028-05-08T16:00:00",
      }),
    ]);

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);

    const sessions = await Session.find({ classId: classA._id }).sort({ startDatetime: 1 }).lean();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionNumber).sort()).toEqual([1, 2]);

    const lock = await TeacherScheduleLock.findOne({ teacherId: teacher._id }).lean();
    expect(lock.lockSeq).toBeGreaterThanOrEqual(2);
  });

  it("CONC-CUR11-04: Parallel generateSessions retries sharing the same Idempotency-Key create only ONE batch", async () => {
    const [r1, r2] = await Promise.all([
      request(app)
        .post(`/api/teacher/classes/${classA._id}/sessions/generate`)
        .set({ ...as(teacher), "Idempotency-Key": "batch-retry-99" })
        .send({ titlePrefix: "Phiên" }),
      request(app)
        .post(`/api/teacher/classes/${classA._id}/sessions/generate`)
        .set({ ...as(teacher), "Idempotency-Key": "batch-retry-99" })
        .send({ titlePrefix: "Phiên" }),
    ]);

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect([r1.body.data.idempotent, r2.body.data.idempotent].sort()).toEqual([false, true]);

    const count = await Session.countDocuments({ classId: classA._id });
    expect(count).toBe(3); // May 1, May 8, May 15, 2028 are all Mondays
    expect(count).toBe(r1.body.data.generatedCount);
  });

  it("CONC-CUR11-05 / TEA-07 / CUR-10 (Real ReplSet): Unique index blocks duplicate gradeLevel=null auth & CUR-10 persists 0 unauthorized classes", async () => {
    const langCat = await Category.create({ name: "Ngoại ngữ", slug: "ngoai-ngu", createdBy: admin._id, status: "ACTIVE" });
    const ieltsSub = await Subject.create({
      name: "IELTS",
      slug: "ielts",
      categoryId: langCat._id,
      categoryName: langCat.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const langCourse = await Course.create({
      title: "IELTS 6.5",
      slug: "ielts-6-5",
      categoryId: langCat._id,
      categoryName: langCat.name,
      subjectId: ieltsSub._id,
      subjectName: ieltsSub.name,
      gradeLevel: null,
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });

    await TeacherSubjectAuthorization.create({
      teacherId: teacher._id,
      subjectId: ieltsSub._id,
      categoryId: langCat._id,
      gradeLevel: null,
      level: "INTERMEDIATE",
      status: "APPROVED",
      createdBy: admin._id,
    });

    // Real MongoDB unique index must reject a duplicate (teacherId, subjectId, gradeLevel: null, level)
    let dupErr = null;
    try {
      await TeacherSubjectAuthorization.create({
        teacherId: teacher._id,
        subjectId: ieltsSub._id,
        categoryId: langCat._id,
        gradeLevel: null,
        level: "INTERMEDIATE",
        status: "PENDING",
        createdBy: teacher._id,
      });
    } catch (err) {
      dupErr = err;
    }
    expect(dupErr).not.toBeNull();
    expect(dupErr.code).toBe(11000);

    // Without an active CoursePricingPolicy, CUR-07 gate rejects with 400 PRICING_POLICY_NOT_CONFIGURED
    const noPolicyRes = await request(app)
      .post("/api/teacher/classes")
      .set(as(teacher))
      .send({
        courseId: langCourse._id,
        className: "IELTS Blocked",
        classType: "PAID",
        price: 500000,
        capacity: 15,
      });
    expect(noPolicyRes.statusCode).toBe(400);
    expect(noPolicyRes.body.error).toBe("PRICING_POLICY_NOT_CONFIGURED");
    expect(await Class.countDocuments({ className: "IELTS Blocked" })).toBe(0);

    // Seed an active CoursePricingPolicy (CUR-07 satisfied): POST /api/teacher/classes MUST still fail closed (503) because TEA-12 contract is absent
    await CoursePricingPolicy.create({
      policyKey: "GLOBAL:PAID:ALL:ALL",
      version: 1,
      name: "Global Paid Policy",
      scopeType: "GLOBAL",
      classType: "PAID",
      allowFree: false,
      minPrice: 100000,
      maxPrice: 2000000,
      minSessions: 1,
      maxSessions: 50,
      effectiveFrom: new Date(Date.now() - 60000),
      status: "ACTIVE",
      createdBy: admin._id,
    });

    const res = await request(app)
      .post("/api/teacher/classes")
      .set(as(teacher))
      .send({
        courseId: langCourse._id,
        className: "IELTS Blocked",
        classType: "PAID",
        price: 500000,
        capacity: 15,
      });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("CONTRACT_DEPENDENCY_BLOCKED");
    expect(await Class.countDocuments({ className: "IELTS Blocked" })).toBe(0);
  });
});
