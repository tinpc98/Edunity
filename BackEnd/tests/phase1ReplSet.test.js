const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  CourseProposal,
  SyllabusVersion,
  CurriculumUnit,
  LearningPath,
  CoursePricingPolicy,
  Class,
  AuditLog,
  JobLock,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { toDec } = require("../src/utils/money");
const { signAccessToken } = require("../src/utils/jwt");
const { verifyClassPricingPolicy, resolveEffectivePolicy } = require("../src/services/coursePricingPolicyService");
const { migrateForward, migrateBackward } = require("../scripts/migrateSyllabusVersions");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const authHeader = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

describe("Phase 1 Real MongoMemoryReplSet Verification (CUR-01, CUR-02, CUR-03, CUR-05, CUR-07)", () => {
  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    jest.restoreAllMocks();
  });

  const bootstrap = async () => {
    const passwordHash = hashPassword("Pass@123");
    const admin = await User.create({ email: "admin_p1@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" });
    const teacher = await User.create({
      email: "teacher_p1@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Teacher P1", verificationStatus: "VERIFIED" },
    });
    const student = await User.create({
      email: "student_p1@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student P1" },
    });

    const catTHCS = await Category.create({
      name: "Trung học cơ sở",
      slug: "trung-hoc-co-so-p1",
      status: "ACTIVE",
      createdBy: admin._id,
    });
    const subjectMath = await Subject.create({
      categoryId: catTHCS._id,
      categoryName: catTHCS.name,
      name: "Toán học",
      slug: "toan-hoc-p1",
      status: "ACTIVE",
      createdBy: admin._id,
    });
    const subjectPhysics = await Subject.create({
      categoryId: catTHCS._id,
      categoryName: catTHCS.name,
      name: "Vật lý",
      slug: "vat-ly-p1",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    const course1 = await Course.create({
      categoryId: catTHCS._id,
      categoryName: catTHCS.name,
      subjectId: subjectMath._id,
      subjectName: subjectMath.name,
      title: "Toán 8 Cơ bản",
      slug: "toan-8-co-ban-p1",
      level: "BEGINNER",
      gradeLevel: "GRADE_8",
      curriculumReference: "Kết Nối Tri Thức",
      syllabus: "1. Đa thức\n2. Hằng đẳng thức",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    const course2 = await Course.create({
      categoryId: catTHCS._id,
      categoryName: catTHCS.name,
      subjectId: subjectMath._id,
      subjectName: subjectMath.name,
      title: "Toán 8 Nâng cao",
      slug: "toan-8-nang-cao-p1",
      level: "ADVANCED",
      gradeLevel: "GRADE_8",
      curriculumReference: "Cánh Diều",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    return { admin, teacher, student, catTHCS, subjectMath, subjectPhysics, course1, course2 };
  };

  // ===========================================================================
  // CUR-01: Soft-delete filters + course level propagation + duplicate slug 409
  // ===========================================================================
  describe("CUR-01: Catalog soft-delete exclusion & level propagation", () => {
    test("Excludes soft-deleted Category, Subject, Course from catalog endpoints & propagates level to DRAFT classes only", async () => {
      const { admin, teacher, catTHCS, subjectMath, course1 } = await bootstrap();

      const deletedCat = await Category.create({
        name: "Deleted Cat",
        slug: "deleted-cat-p1",
        status: "ACTIVE",
        isDeleted: true,
        deletedAt: new Date(),
        createdBy: admin._id,
      });
      const deletedSubj = await Subject.create({
        categoryId: catTHCS._id,
        categoryName: catTHCS.name,
        name: "Deleted Subject",
        slug: "deleted-subj-p1",
        status: "ACTIVE",
        isDeleted: true,
        deletedAt: new Date(),
        createdBy: admin._id,
      });
      const deletedCourse = await Course.create({
        categoryId: catTHCS._id,
        categoryName: catTHCS.name,
        subjectId: subjectMath._id,
        subjectName: subjectMath.name,
        title: "Deleted Course",
        slug: "deleted-course-p1",
        level: "BEGINNER",
        gradeLevel: "GRADE_8",
        status: "ACTIVE",
        isDeleted: true,
        deletedAt: new Date(),
        createdBy: admin._id,
      });

      const catRes = await request(app).get("/api/catalog/categories").expect(200);
      const catSlugs = catRes.body.data.map((c) => c.slug);
      expect(catSlugs).toContain(catTHCS.slug);
      expect(catSlugs).not.toContain(deletedCat.slug);
      const thcsNode = catRes.body.data.find((c) => c.slug === catTHCS.slug);
      expect(thcsNode.subjects.map((s) => s.slug)).not.toContain(deletedSubj.slug);

      const filterRes = await request(app).get("/api/catalog/filters").expect(200);
      expect(filterRes.body.data.subjects.map((s) => String(s._id || s.id))).not.toContain(deletedSubj._id.toString());

      const searchRes = await request(app).get("/api/courses").expect(200);
      expect(searchRes.body.data.items.map((c) => c.slug)).not.toContain(deletedCourse.slug);

      // Duplicate slug returns 409 DUPLICATE_SLUG
      const dupRes = await request(app)
        .post("/api/admin/categories")
        .set(authHeader(admin))
        .send({ name: "Another Cat Name", slug: catTHCS.slug })
        .expect(409);
      expect(dupRes.body.error).toBe("DUPLICATE_SLUG");

      // Level propagation on updateCourse: DRAFT updated, OPEN untouched
      const draftCls = await Class.create({
        courseId: course1._id,
        courseTitle: course1.title,
        categoryId: catTHCS._id,
        subjectId: subjectMath._id,
        teacherId: teacher._id,
        teacherName: "Teacher P1",
        className: "Draft Class P1",
        classType: "PAID",
        price: toDec(200000),
        capacity: 10,
        gradeLevel: "GRADE_8",
        level: "BEGINNER",
        status: "DRAFT",
      });
      const openCls = await Class.create({
        courseId: course1._id,
        courseTitle: course1.title,
        categoryId: catTHCS._id,
        subjectId: subjectMath._id,
        teacherId: teacher._id,
        teacherName: "Teacher P1",
        className: "Open Class P1",
        classType: "PAID",
        price: toDec(200000),
        capacity: 10,
        gradeLevel: "GRADE_8",
        level: "BEGINNER",
        status: "OPEN",
      });

      await request(app)
        .patch(`/api/admin/courses/${course1._id}`)
        .set(authHeader(admin))
        .send({ level: "INTERMEDIATE" })
        .expect(200);

      expect((await Class.findById(draftCls._id).lean()).level).toBe("INTERMEDIATE");
      expect((await Class.findById(openCls._id).lean()).level).toBe("BEGINNER");
    });
  });

  // ===========================================================================
  // CUR-02: Real ReplSet SyllabusVersion transactions & non-mocked migration
  // ===========================================================================
  describe("CUR-02: ReplSet transactions, immutability, public syllabus & non-mocked migration", () => {
    test("Full SyllabusVersion CRUD/publish/clone/archive & non-mocked ReplSet migration with JobLock", async () => {
      const { admin, course1 } = await bootstrap();

      // Legacy fallback before versioning
      const legacyPub = await request(app).get(`/api/courses/${course1._id}/syllabus`).expect(200);
      expect(legacyPub.body.data.source).toBe("LEGACY");
      expect(legacyPub.body.data.legacySyllabus).toContain("Đa thức");

      // Run real non-mocked forward migration with JobLock on ReplSet
      const fwd = await migrateForward({ dryRun: false, useLock: true });
      expect(fwd.dryRun).toBe(false);
      expect(fwd.migrated).toBeGreaterThanOrEqual(1);
      // Lock must be released after migration (lockedUntil reset to epoch 0)
      const releasedLock = await JobLock.findOne({ name: "migration_syllabus_versions_forward" }).lean();
      expect(releasedLock).toBeTruthy();
      expect(new Date(releasedLock.lockedUntil).getTime()).toBe(0);

      // Subsequent run must be able to re-acquire the released lock cleanly (idempotent)
      const fwd2 = await migrateForward({ dryRun: false, useLock: true });
      expect(fwd2.skipped).not.toBe(true);

      const syncedCourse1 = await Course.findById(course1._id).lean();
      expect(syncedCourse1.publishedSyllabusVersionId).toBeTruthy();

      const pubRes1 = await request(app).get(`/api/courses/${course1._id}/syllabus`).expect(200);
      expect(pubRes1.body.data.source).toBe("VERSIONED");
      expect(pubRes1.body.data.version.versionNumber).toBe(1);
      expect(pubRes1.body.data.units).toHaveLength(2);
      expect(JSON.stringify(pubRes1.body)).not.toContain(admin._id.toString());

      // Backward migration removes only migratedFromLegacy rows
      const bwd = await migrateBackward({ dryRun: false });
      expect(bwd.versionsToRemove).toBeGreaterThanOrEqual(1);
      expect((await Course.findById(course1._id).lean()).publishedSyllabusVersionId).toBeNull();

      // Create v1 draft via API -> add 2 units -> reorder -> publish -> publish v2 -> check immutability
      const v1Res = await request(app)
        .post(`/api/admin/courses/${course1._id}/syllabus-versions`)
        .set(authHeader(admin))
        .send({ title: "Giáo trình Toán 8 v1", summary: "Bản chính thức 1" })
        .expect(201);
      const v1Id = v1Res.body.data.id || v1Res.body.data._id;

      const u1Res = await request(app)
        .post(`/api/admin/courses/${course1._id}/syllabus-versions/${v1Id}/units`)
        .set(authHeader(admin))
        .send({ title: "Chương 1: Đa thức", durationMinutes: 90, topics: ["Đơn thức", "Đa thức"] })
        .expect(201);
      const u2Res = await request(app)
        .post(`/api/admin/courses/${course1._id}/syllabus-versions/${v1Id}/units`)
        .set(authHeader(admin))
        .send({ title: "Chương 2: Phân thức", durationMinutes: 90 })
        .expect(201);

      const u1Id = u1Res.body.data.id || u1Res.body.data._id;
      const u2Id = u2Res.body.data.id || u2Res.body.data._id;

      await request(app)
        .put(`/api/admin/courses/${course1._id}/syllabus-versions/${v1Id}/units/reorder`)
        .set(authHeader(admin))
        .send({ unitIds: [u2Id, u1Id] })
        .expect(200);

      await request(app)
        .post(`/api/admin/courses/${course1._id}/syllabus-versions/${v1Id}/publish`)
        .set(authHeader(admin))
        .send({})
        .expect(200);

      // Mutating published v1 is blocked with 409 SYLLABUS_VERSION_IMMUTABLE
      const mutErr = await request(app)
        .patch(`/api/admin/courses/${course1._id}/syllabus-versions/${v1Id}`)
        .set(authHeader(admin))
        .send({ title: "Hack" })
        .expect(409);
      expect(mutErr.body.error).toBe("SYLLABUS_VERSION_IMMUTABLE");

      // Clone v1 -> v2 and publish v2 -> auto-archives v1 atomically
      const v2Res = await request(app)
        .post(`/api/admin/courses/${course1._id}/syllabus-versions`)
        .set(authHeader(admin))
        .send({ cloneFromVersionId: v1Id, title: "Giáo trình Toán 8 v2" })
        .expect(201);
      const v2Id = v2Res.body.data.id || v2Res.body.data._id;

      await request(app)
        .post(`/api/admin/courses/${course1._id}/syllabus-versions/${v2Id}/publish`)
        .set(authHeader(admin))
        .send({})
        .expect(200);

      expect((await SyllabusVersion.findById(v1Id).lean()).status).toBe("ARCHIVED");
      expect((await SyllabusVersion.findById(v2Id).lean()).status).toBe("PUBLISHED");
      const pubV2 = await request(app).get(`/api/courses/${course1._id}/syllabus`).expect(200);
      expect(pubV2.body.data.version.versionNumber).toBe(2);
      expect(pubV2.body.data.units[0].title).toBe("Chương 2: Phân thức");
    });
  });

  // ===========================================================================
  // CUR-03: LearningPath DAG validation, lifecycle & redaction
  // ===========================================================================
  describe("CUR-03: LearningPath CRUD, DAG prerequisite checks & public API", () => {
    test("Enforces DAG prerequisites, active courses, lifecycle, RBAC & redaction", async () => {
      const { admin, teacher, student, catTHCS, subjectMath, course1, course2 } = await bootstrap();

      // Non-admin blocked
      await request(app)
        .post("/api/admin/learning-paths")
        .set(authHeader(teacher))
        .send({ title: "Teacher hack" })
        .expect(403);
      await request(app)
        .get("/api/admin/learning-paths")
        .set(authHeader(student))
        .expect(403);

      // Self prerequisite rejected
      const selfRes = await request(app)
        .post("/api/admin/learning-paths")
        .set(authHeader(admin))
        .send({
          title: "Invalid Self Prereq",
          steps: [{ stepOrder: 1, courseId: course1._id, prerequisiteCourseIds: [course1._id] }],
        })
        .expect(400);
      expect(selfRes.body.error).toBe("LEARNING_PATH_INVALID_PREREQUISITE");

      // Forward / cycle prerequisite rejected (step 1 depends on step 2)
      const fwdRes = await request(app)
        .post("/api/admin/learning-paths")
        .set(authHeader(admin))
        .send({
          title: "Invalid Forward Prereq",
          steps: [
            { stepOrder: 1, courseId: course1._id, prerequisiteCourseIds: [course2._id] },
            { stepOrder: 2, courseId: course2._id, prerequisiteCourseIds: [course1._id] },
          ],
        })
        .expect(400);
      expect(fwdRes.body.error).toBe("LEARNING_PATH_INVALID_PREREQUISITE");

      // Inactive course rejected
      const inactiveCourse = await Course.create({
        categoryId: catTHCS._id,
        categoryName: catTHCS.name,
        subjectId: subjectMath._id,
        subjectName: subjectMath.name,
        title: "Inactive Course",
        slug: "inactive-course-p1",
        level: "BEGINNER",
        gradeLevel: "GRADE_8",
        status: "INACTIVE",
        createdBy: admin._id,
      });
      const inactiveRes = await request(app)
        .post("/api/admin/learning-paths")
        .set(authHeader(admin))
        .send({
          title: "Inactive Course Path",
          steps: [{ stepOrder: 1, courseId: inactiveCourse._id }],
        })
        .expect(400);
      expect(inactiveRes.body.error).toBe("COURSE_NOT_ACTIVE");

      // Valid DRAFT creation
      const createRes = await request(app)
        .post("/api/admin/learning-paths")
        .set(authHeader(admin))
        .send({
          title: "Lộ trình Toán 8 toàn diện",
          description: "Từ cơ bản đến nâng cao",
          categoryId: catTHCS._id,
          gradeLevel: "GRADE_8",
          targetLevel: "ADVANCED",
          steps: [
            { stepOrder: 1, courseId: course1._id, isRequired: true },
            { stepOrder: 2, courseId: course2._id, isRequired: true, prerequisiteCourseIds: [course1._id] },
          ],
        })
        .expect(201);
      const lpId = createRes.body.data.id || createRes.body.data._id;

      // DRAFT hidden from public
      const publicBefore = await request(app).get("/api/learning-paths").expect(200);
      expect(publicBefore.body.data.total).toBe(0);
      await request(app).get(`/api/learning-paths/${lpId}`).expect(404);

      // Publish -> visible publicly without admin IDs
      await request(app).post(`/api/admin/learning-paths/${lpId}/publish`).set(authHeader(admin)).send({}).expect(200);
      const publicAfter = await request(app).get("/api/learning-paths").expect(200);
      expect(publicAfter.body.data.total).toBe(1);
      expect(JSON.stringify(publicAfter.body)).not.toContain(admin._id.toString());

      const detailRes = await request(app).get(`/api/learning-paths/${lpId}`).expect(200);
      expect(detailRes.body.data.steps).toHaveLength(2);
      expect(detailRes.body.data.steps[1].prerequisiteCourseIds).toContain(course1._id.toString());
      expect(JSON.stringify(detailRes.body)).not.toContain(admin._id.toString());

      // Archive blocks edits; soft delete hides path
      await request(app).post(`/api/admin/learning-paths/${lpId}/archive`).set(authHeader(admin)).send({}).expect(200);
      await request(app)
        .patch(`/api/admin/learning-paths/${lpId}`)
        .set(authHeader(admin))
        .send({ title: "Should fail" })
        .expect(409);

      await request(app).delete(`/api/admin/learning-paths/${lpId}`).set(authHeader(admin)).expect(200);
      expect((await request(app).get("/api/learning-paths").expect(200)).body.data.total).toBe(0);
      expect((await request(app).get("/api/admin/learning-paths").set(authHeader(admin)).expect(200)).body.data.total).toBe(0);
    });
  });

  // ===========================================================================
  // CUR-05: CourseProposal syllabusDraft, pricingExpectation & tx syllabus publish
  // ===========================================================================
  describe("CUR-05: Enhanced CourseProposal revisionHistory & atomic syllabus v1 creation", () => {
    test("Supports syllabusDraft, pricingExpectation, request-changes -> resubmit without leaking admin._id & creates SyllabusVersion v1 on approve", async () => {
      const { admin, teacher, catTHCS, subjectMath } = await bootstrap();

      const createRes = await request(app)
        .post("/api/teacher/course-proposals")
        .set(authHeader(teacher))
        .send({
          categoryId: catTHCS._id,
          subjectId: subjectMath._id,
          title: "Toán 9 Ôn Thi Vào 10",
          description: "Đề xuất khóa học luyện thi lớp 10",
          level: "INTERMEDIATE",
          gradeLevel: "GRADE_9",
          curriculumReference: "Kết Nối Tri Thức",
          syllabusDraft: {
            summary: "Tổng ôn đại số & hình học",
            units: [
              { unitOrder: 1, title: "Chuyên đề 1: Căn bậc hai", durationMinutes: 120, topics: ["Biến đổi căn thức"] },
              { unitOrder: 2, title: "Chuyên đề 2: Hàm số bậc nhất", durationMinutes: 120 },
            ],
          },
          pricingExpectation: {
            suggestedClassType: "PAID",
            suggestedMinPrice: 300000,
            suggestedMaxPrice: 600000,
            estimatedSessions: 12,
            notes: "Phù hợp nhóm 10 học sinh",
          },
        })
        .expect(201);

      const proposalId = createRes.body.data.id || createRes.body.data._id;
      expect(createRes.body.data.revisionNumber).toBe(1);
      expect(createRes.body.data.revisionHistory).toHaveLength(1);
      expect(createRes.body.data.pricingExpectation.estimatedSessions).toBe(12);

      // Admin requests changes
      await request(app)
        .post(`/api/admin/course-proposals/${proposalId}/request-changes`)
        .set(authHeader(admin))
        .send({ reviewNote: "Bổ sung thêm chuyên đề Đường tròn" })
        .expect(200);

      // Teacher fetches proposals -> MUST NOT leak admin._id anywhere in JSON
      const myList = await request(app)
        .get("/api/teacher/course-proposals")
        .set(authHeader(teacher))
        .expect(200);
      expect(JSON.stringify(myList.body)).not.toContain(admin._id.toString());
      expect(myList.body.data.items[0].revisionHistory).toHaveLength(2);

      // Teacher resubmits with updated syllabusDraft
      const updRes = await request(app)
        .patch(`/api/teacher/course-proposals/${proposalId}`)
        .set(authHeader(teacher))
        .send({
          revisionNote: "Đã thêm chuyên đề Đường tròn",
          syllabusDraft: {
            summary: "Tổng ôn đại số & hình học 9",
            units: [
              { unitOrder: 1, title: "Chuyên đề 1: Căn bậc hai", durationMinutes: 120 },
              { unitOrder: 2, title: "Chuyên đề 2: Hàm số bậc nhất", durationMinutes: 120 },
              { unitOrder: 3, title: "Chuyên đề 3: Đường tròn", durationMinutes: 120 },
            ],
          },
        })
        .expect(200);
      expect(updRes.body.data.revisionNumber).toBe(2);
      expect(updRes.body.data.status).toBe("PENDING_REVIEW");
      expect(JSON.stringify(updRes.body)).not.toContain(admin._id.toString());

      // Admin approves -> atomically creates Course + published SyllabusVersion v1 + 3 CurriculumUnits
      const appRes = await request(app)
        .post(`/api/admin/course-proposals/${proposalId}/approve`)
        .set(authHeader(admin))
        .send({ reviewNote: "Đạt chuẩn" })
        .expect(200);

      const newCourseId = appRes.body.data.course.id || appRes.body.data.course._id;
      const createdSv = await SyllabusVersion.findOne({ courseId: newCourseId, status: "PUBLISHED" }).lean();
      expect(createdSv).toBeTruthy();
      expect(createdSv.versionNumber).toBe(1);
      const units = await CurriculumUnit.find({ syllabusVersionId: createdSv._id }).sort({ unitOrder: 1 }).lean();
      expect(units).toHaveLength(3);
      expect(units[2].title).toBe("Chuyên đề 3: Đường tròn");

      const courseInDb = await Course.findById(newCourseId).lean();
      expect(courseInDb.publishedSyllabusVersionId.toString()).toBe(createdSv._id.toString());
    });
  });

  // ===========================================================================
  // CUR-07: Versioned CoursePricingPolicy (PHASE 1 GATE)
  // ===========================================================================
  describe("CUR-07: Versioned CoursePricingPolicy, effectiveFrom scheduling, precedence, bounds verification & rollback", () => {
    test("Supports versioning, future effectiveFrom, scope precedence, zero-price FREE safety, bounds rejection & rollback", async () => {
      const { admin, teacher, student, catTHCS, subjectMath, course1, course2 } = await bootstrap();

      // RBAC guard
      await request(app)
        .post("/api/admin/pricing-policies")
        .set(authHeader(teacher))
        .send({ name: "Hack" })
        .expect(403);
      await request(app)
        .get("/api/admin/pricing-policies")
        .set(authHeader(student))
        .expect(403);

      const now = new Date();
      const past = new Date(now.getTime() - 3600_000);
      const future = new Date(now.getTime() + 86400_000);

      // 1) GLOBAL v1 (allows free, paid 100k..1M, 4..20 sessions)
      const g1Res = await request(app)
        .post("/api/admin/pricing-policies")
        .set(authHeader(admin))
        .send({
          name: "Global Default v1",
          scopeType: "GLOBAL",
          classType: "ALL",
          allowFree: true,
          minPrice: 100000,
          maxPrice: 1000000,
          minSessions: 4,
          maxSessions: 20,
          effectiveFrom: past.toISOString(),
          changeReason: "Initial global pricing floor",
        })
        .expect(201);
      const g1Id = g1Res.body.data.id || g1Res.body.data._id;
      expect(g1Res.body.data.version).toBe(1);
      expect(g1Res.body.data.status).toBe("ACTIVE");

      // 2) Global v2 effective NOW -> supersedes v1 atomically
      const g2Res = await request(app)
        .post(`/api/admin/pricing-policies/${g1Id}/versions`)
        .set(authHeader(admin))
        .send({
          name: "Global Default v2",
          minPrice: 150000,
          maxPrice: 1500000,
          minSessions: 6,
          maxSessions: 24,
          effectiveFrom: now.toISOString(),
          changeReason: "Adjusted bounds v2",
        })
        .expect(201);
      const g2Id = g2Res.body.data.id || g2Res.body.data._id;
      expect(g2Res.body.data.version).toBe(2);
      expect((await CoursePricingPolicy.findById(g1Id).lean()).status).toBe("SUPERSEDED");
      expect((await CoursePricingPolicy.findById(g2Id).lean()).status).toBe("ACTIVE");

      // 3) Global v3 scheduled in FUTURE -> v2 remains active RIGHT NOW, v3 becomes active at `future`
      const g3Res = await request(app)
        .post(`/api/admin/pricing-policies/${g2Id}/versions`)
        .set(authHeader(admin))
        .send({
          name: "Global Default v3 Scheduled",
          minPrice: 200000,
          maxPrice: 2000000,
          minSessions: 8,
          maxSessions: 30,
          effectiveFrom: future.toISOString(),
          changeReason: "Next semester tariff",
        })
        .expect(201);
      expect(g3Res.body.data.version).toBe(3);
      expect((await CoursePricingPolicy.findById(g2Id).lean()).status).toBe("ACTIVE");

      const currentGlobal = await resolveEffectivePolicy({ course: course2, classType: "PAID", now: new Date() });
      expect(currentGlobal.version).toBe(2);

      const futureGlobal = await resolveEffectivePolicy({
        course: course2,
        classType: "PAID",
        now: new Date(future.getTime() + 1000),
      });
      expect(futureGlobal.version).toBe(3);

      // 4) Precedence test: CATEGORY > GLOBAL, SUBJECT > CATEGORY, COURSE > SUBJECT
      await request(app)
        .post("/api/admin/pricing-policies")
        .set(authHeader(admin))
        .send({
          name: "Category THCS Policy",
          scopeType: "CATEGORY",
          categoryId: catTHCS._id,
          classType: "ALL",
          allowFree: false,
          minPrice: 250000,
          maxPrice: 2500000,
          minSessions: 6,
          maxSessions: 18,
          effectiveFrom: past.toISOString(),
        })
        .expect(201);

      await request(app)
        .post("/api/admin/pricing-policies")
        .set(authHeader(admin))
        .send({
          name: "Subject Math Policy",
          scopeType: "SUBJECT",
          subjectId: subjectMath._id,
          classType: "PAID",
          allowFree: false,
          minPrice: 300000,
          maxPrice: 3000000,
          minSessions: 8,
          maxSessions: 16,
          effectiveFrom: past.toISOString(),
        })
        .expect(201);

      await request(app)
        .post("/api/admin/pricing-policies")
        .set(authHeader(admin))
        .send({
          name: "Course 1 Specific Policy",
          scopeType: "COURSE",
          courseId: course1._id,
          classType: "PAID",
          allowFree: false,
          minPrice: 400000,
          maxPrice: 900000,
          minSessions: 10,
          maxSessions: 15,
          effectiveFrom: past.toISOString(),
        })
        .expect(201);

      // Course 1 resolves COURSE policy; Course 2 resolves SUBJECT policy
      const resolvedC1 = await resolveEffectivePolicy({ course: course1, classType: "PAID" });
      expect(resolvedC1.scopeType).toBe("COURSE");
      const resolvedC2 = await resolveEffectivePolicy({ course: course2, classType: "PAID" });
      expect(resolvedC2.scopeType).toBe("SUBJECT");

      // Teacher endpoint shows effective policy without leaking admin._id
      const teacherPolicyRes = await request(app)
        .get(`/api/teacher/courses/${course1._id}/pricing-policy?classType=PAID`)
        .set(authHeader(teacher))
        .expect(200);
      expect(teacherPolicyRes.body.data.scopeType).toBe("COURSE");
      expect(teacherPolicyRes.body.data.minPrice).toBe("400000");
      expect(JSON.stringify(teacherPolicyRes.body)).not.toContain(admin._id.toString());

      // 5) Verifier bounds enforcement via service & HTTP preview
      const lowPrice = await verifyClassPricingPolicy({ course: course1, classType: "PAID", price: 350000, totalSessions: 12 });
      expect(lowPrice.valid).toBe(false);
      expect(lowPrice.code).toBe("PRICE_OUT_OF_POLICY_RANGE");

      const highPrice = await verifyClassPricingPolicy({ course: course1, classType: "PAID", price: 1200000, totalSessions: 12 });
      expect(highPrice.valid).toBe(false);
      expect(highPrice.code).toBe("PRICE_OUT_OF_POLICY_RANGE");

      const badSessions = await request(app)
        .post("/api/admin/pricing-policies/verify-preview")
        .set(authHeader(admin))
        .send({ courseId: course1._id, classType: "PAID", price: 500000, totalSessions: 20 })
        .expect(200);
      expect(badSessions.body.data.valid).toBe(false);
      expect(badSessions.body.data.code).toBe("SESSION_COUNT_OUT_OF_POLICY_RANGE");

      // FREE class rejected under CATEGORY policy (allowFree: false) when no FREE-specific course/subject policy exists
      const freeBlocked = await verifyClassPricingPolicy({ course: course1, classType: "FREE", price: 0, totalSessions: 12 });
      expect(freeBlocked.valid).toBe(false);
      expect(freeBlocked.code).toBe("PRICING_POLICY_FREE_NOT_ALLOWED");

      // FREE class allowed when Course FREE policy exists with price = 0 (zero-safety)
      await request(app)
        .post("/api/admin/pricing-policies")
        .set(authHeader(admin))
        .send({
          name: "Course 1 Community Free Policy",
          scopeType: "COURSE",
          courseId: course1._id,
          classType: "FREE",
          allowFree: true,
          minPrice: 0,
          maxPrice: 0,
          minSessions: 4,
          maxSessions: 12,
          effectiveFrom: past.toISOString(),
        })
        .expect(201);

      const freeOk = await verifyClassPricingPolicy({ course: course1, classType: "FREE", price: 0, totalSessions: 8 });
      expect(freeOk.valid).toBe(true);
      expect(freeOk.minPrice).toBe("0");
      expect(freeOk.maxPrice).toBe("0");

      const paidOk = await verifyClassPricingPolicy({ course: course1, classType: "PAID", price: 600000, totalSessions: 12 });
      expect(paidOk.valid).toBe(true);
      expect(paidOk.policyVersion).toBe(1);

      // 6) Rollback Global policy via g2Id specifying { targetVersion: 1 } -> creates v4 cloning v1 & marks v2 ROLLED_BACK
      const rbRes = await request(app)
        .post(`/api/admin/pricing-policies/${g2Id}/rollback`)
        .set(authHeader(admin))
        .send({ targetVersion: 1, changeReason: "Revert tariff back to v1" })
        .expect(200);
      expect(rbRes.body.data.version).toBe(4);
      expect(rbRes.body.data.rolledBackFromVersion).toBe(2);
      expect(rbRes.body.data.rolledBackToVersion).toBe(1);
      expect(String(rbRes.body.data.minPrice)).toBe("100000");
      expect((await CoursePricingPolicy.findById(g2Id).lean()).status).toBe("ROLLED_BACK");

      const rbAudit = await AuditLog.findOne({ action: "COURSE_PRICING_POLICY_ROLLED_BACK" }).lean();
      expect(rbAudit).toBeTruthy();
      expect(rbAudit.afterState.rolledBackToVersion).toBe(1);

      // 7) FIX-FINAL anti-coercion & query guards on CUR-07
      for (const badBody of [
        { name: "Bad allowFree", scopeType: "GLOBAL", classType: "ALL", allowFree: "false", minPrice: 0, maxPrice: 500000, minSessions: 2, maxSessions: 10 },
        { name: "Bad minSessions", scopeType: "GLOBAL", classType: "PAID", minPrice: 100000, maxPrice: 500000, minSessions: true, maxSessions: 10 },
        { name: "Bad maxSessions", scopeType: "GLOBAL", classType: "PAID", minPrice: 100000, maxPrice: 500000, minSessions: 2, maxSessions: [5] },
        { name: "Bad level", scopeType: "GLOBAL", classType: "PAID", level: { $ne: null }, minPrice: 100000, maxPrice: 500000, minSessions: 2, maxSessions: 10 },
        { name: "Bad grade", scopeType: "GLOBAL", classType: "PAID", gradeLevel: { $ne: null }, minPrice: 100000, maxPrice: 500000, minSessions: 2, maxSessions: 10 },
      ]) {
        const res = await request(app).post("/api/admin/pricing-policies").set(authHeader(admin)).send(badBody);
        expect(res.statusCode).toBe(400);
      }

      const badRb = await request(app)
        .post(`/api/admin/pricing-policies/${g2Id}/rollback`)
        .set(authHeader(admin))
        .send({ targetVersion: true });
      expect(badRb.statusCode).toBe(400);

      for (const badPreview of [
        { courseId: course1._id, classType: "PAID", price: true, totalSessions: 10 },
        { courseId: course1._id, classType: "PAID", price: "", totalSessions: 10 },
        { courseId: course1._id, classType: "PAID", price: 500000, totalSessions: true },
        { courseId: course1._id, classType: "PAID", price: 500000, totalSessions: "abc" },
      ]) {
        const res = await request(app).post("/api/admin/pricing-policies/verify-preview").set(authHeader(admin)).send(badPreview);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("VALIDATION_ERROR");
      }

      const badList = await request(app)
        .get("/api/admin/pricing-policies?policyKey=A&policyKey=B")
        .set(authHeader(admin));
      expect(badList.statusCode).toBe(400);
    });
  });
});
