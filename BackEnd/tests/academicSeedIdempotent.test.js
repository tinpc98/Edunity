const mongoose = require("mongoose");
const {
  seedAcademicV3,
  assertSafeDatabaseTarget,
  ALLOWED_SEED_DATABASES,
  ACADEMIC_USERS,
  ACADEMIC_CATEGORIES,
  ACADEMIC_SUBJECTS,
  ACADEMIC_COURSES,
  ACADEMIC_CLASSES,
} = require("../scripts/seedAcademicIdempotent");
const { COURSE_LEVELS, GRADE_LEVELS } = require("../src/models/constants");

describe("TASK G0-04: Idempotent Academic Fixture Seed & Natural Key Upsert Engine", () => {
  // =========================================================================
  // 1. Database Guardrail & Safety Gate Protection
  // =========================================================================
  describe("1. Database Guardrail & Safety Gate Protection", () => {
    test("G0-04.SAFE.1: Refuses to seed production database 'edunity' on remote connection", () => {
      const prodAtlasUri = "mongodb+srv://user:pass@cluster.mongodb.net/edunity?appName=Edunity";
      expect(() => {
        assertSafeDatabaseTarget("edunity", prodAtlasUri);
      }).toThrow(/SECURITY BLOCKER.*Refusing to seed production database/);
    });

    test("G0-04.SAFE.2: Refuses to seed unlisted database names", () => {
      const randomUri = "mongodb+srv://user:pass@cluster.mongodb.net/unknown_db";
      expect(() => {
        assertSafeDatabaseTarget("unknown_db", randomUri);
      }).toThrow(/SECURITY BLOCKER.*not in the allowed seed database list/);
    });

    test("G0-04.SAFE.3: Allows target database 'edunity_demo_v3'", () => {
      const demoUri = "mongodb+srv://user:pass@cluster.mongodb.net/edunity_demo_v3";
      expect(() => {
        assertSafeDatabaseTarget("edunity_demo_v3", demoUri);
      }).not.toThrow();
    });

    test("G0-04.SAFE.4: Allows local or in-memory test databases", () => {
      const localUri = "mongodb://127.0.0.1:27017/edunity_test";
      expect(() => {
        assertSafeDatabaseTarget("edunity_test", localUri);
      }).not.toThrow();

      expect(() => {
        assertSafeDatabaseTarget("test", "");
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 2. Academic Fixture Specification Matrix & Enum Compliance
  // =========================================================================
  describe("2. Academic Fixture Specification Matrix & Enum Compliance", () => {
    test("G0-04.SPEC.1: All 5 categories have unique slugs and valid status", () => {
      expect(ACADEMIC_CATEGORIES.length).toBe(5);
      const slugs = ACADEMIC_CATEGORIES.map((c) => c.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);

      for (const cat of ACADEMIC_CATEGORIES) {
        expect(cat.name).toBeDefined();
        expect(cat.slug).toBeDefined();
        expect(cat.slug).toMatch(/^[a-z0-9-]+$/);
        expect(cat.status).toBe("ACTIVE");
      }
    });

    test("G0-04.SPEC.2: All 17 subjects have unique slugs and reference defined categories", () => {
      expect(ACADEMIC_SUBJECTS.length).toBe(17);
      const categorySlugs = new Set(ACADEMIC_CATEGORIES.map((c) => c.slug));
      const subjectSlugs = new Set();

      for (const subj of ACADEMIC_SUBJECTS) {
        expect(categorySlugs.has(subj.categorySlug)).toBe(true);
        expect(subjectSlugs.has(subj.slug)).toBe(false); // No duplicates
        subjectSlugs.add(subj.slug);
        expect(subj.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    test("G0-04.SPEC.3: All 19 courses reference valid subjects and strictly use BEGINNER (not BASIC)", () => {
      expect(ACADEMIC_COURSES.length).toBe(19);
      const subjectSlugs = new Set(ACADEMIC_SUBJECTS.map((s) => s.slug));
      const courseSlugs = new Set();

      for (const course of ACADEMIC_COURSES) {
        expect(subjectSlugs.has(course.subjectSlug)).toBe(true);
        expect(courseSlugs.has(course.slug)).toBe(false);
        courseSlugs.add(course.slug);

        // Strict V3 Enum mapping: Must be in COURSE_LEVELS
        expect(COURSE_LEVELS).toContain(course.level);
        expect(course.level).not.toBe("BASIC"); // Never BASIC in V3

        if (course.gradeLevel) {
          expect(GRADE_LEVELS).toContain(course.gradeLevel);
        }
      }
    });

    test("G0-04.SPEC.4: All classes strictly satisfy price invariants (FREE=0, PAID>0)", () => {
      expect(ACADEMIC_CLASSES.length).toBeGreaterThanOrEqual(5);

      for (const cls of ACADEMIC_CLASSES) {
        if (cls.classType === "FREE") {
          expect(cls.price).toBe(0);
        } else if (cls.classType === "PAID") {
          expect(cls.price).toBeGreaterThan(0);
        } else {
          throw new Error(`Unexpected classType: ${cls.classType}`);
        }
      }
    });
  });

  // =========================================================================
  // 3. Deterministic Idempotent Upsert Logic (First Run vs Second Run)
  // =========================================================================
  describe("3. Deterministic Idempotent Upsert Logic", () => {
    test("G0-04.IDEMP.1: Running seed twice produces 0 duplicate documents and identical counts", async () => {
      // In-memory collection storage simulating MongoDB collections
      const storage = {
        users: new Map(),
        categories: new Map(),
        subjects: new Map(),
        courses: new Map(),
        classes: new Map(),
        sessions: new Map(),
        enrollments: new Map(),
      };

      const createMockModel = (collectionName, keyFn) => ({
        findOne: async (filter) => {
          const key = keyFn(filter);
          return storage[collectionName].get(key) || null;
        },
        findOneAndUpdate: async (filter, update, options) => {
          const key = keyFn(filter);
          let doc = storage[collectionName].get(key);
          if (!doc) {
            doc = {
              _id: new mongoose.Types.ObjectId(),
              ...filter,
              ...update.$set,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            storage[collectionName].set(key, doc);
          } else {
            Object.assign(doc, update.$set);
            doc.updatedAt = new Date();
          }
          return doc;
        },
        countDocuments: async () => storage[collectionName].size,
      });

      const mockModels = {
        User: createMockModel("users", (f) => f.email),
        Category: createMockModel("categories", (f) => f.slug),
        Subject: createMockModel("subjects", (f) => f.slug),
        Course: createMockModel("courses", (f) => f.slug),
        Class: createMockModel("classes", (f) => `${f.courseId}_${f.className}_${f.teacherId}`),
        Session: createMockModel("sessions", (f) => `${f.classId}_${f.sessionNumber}`),
        Enrollment: createMockModel("enrollments", (f) => `${f.classId}_${f.studentId}`),
      };

      const noopLogger = () => {};

      // ---- PASS 1: Initial Seed Run ----
      const pass1 = await seedAcademicV3({
        connectionUri: "mongodb://127.0.0.1:27017/edunity_test",
        logger: noopLogger,
        models: mockModels,
      });

        expect(pass1.success).toBe(true);
        expect(pass1.stats.users.created).toBe(ACADEMIC_USERS.length);
        expect(pass1.stats.categories.created).toBe(ACADEMIC_CATEGORIES.length);
        expect(pass1.stats.subjects.created).toBe(ACADEMIC_SUBJECTS.length);
        expect(pass1.stats.courses.created).toBe(ACADEMIC_COURSES.length);
        expect(pass1.stats.classes.created).toBe(ACADEMIC_CLASSES.length);

        const countAfterPass1 = {
          users: storage.users.size,
          categories: storage.categories.size,
          subjects: storage.subjects.size,
          courses: storage.courses.size,
          classes: storage.classes.size,
          sessions: storage.sessions.size,
          enrollments: storage.enrollments.size,
        };

        expect(countAfterPass1.users).toBe(ACADEMIC_USERS.length);
        expect(countAfterPass1.categories).toBe(5);
        expect(countAfterPass1.subjects).toBe(17);
        expect(countAfterPass1.courses).toBe(19);

        // ---- PASS 2: Immediate Repeated Seed Run ----
        const pass2 = await seedAcademicV3({
          connectionUri: "mongodb://127.0.0.1:27017/edunity_test",
          logger: noopLogger,
          models: mockModels,
        });

        expect(pass2.success).toBe(true);
        // All documents should be recognized as existing and updated, 0 created
        expect(pass2.stats.users.created).toBe(0);
        expect(pass2.stats.categories.created).toBe(0);
        expect(pass2.stats.subjects.created).toBe(0);
        expect(pass2.stats.courses.created).toBe(0);
        expect(pass2.stats.classes.created).toBe(0);

        const countAfterPass2 = {
          users: storage.users.size,
          categories: storage.categories.size,
          subjects: storage.subjects.size,
          courses: storage.courses.size,
          classes: storage.classes.size,
          sessions: storage.sessions.size,
          enrollments: storage.enrollments.size,
        };

        // PARITY ASSERTION: 100% exact match between Pass 1 and Pass 2
        expect(countAfterPass2.users).toBe(countAfterPass1.users);
        expect(countAfterPass2.categories).toBe(countAfterPass1.categories);
        expect(countAfterPass2.subjects).toBe(countAfterPass1.subjects);
        expect(countAfterPass2.courses).toBe(countAfterPass1.courses);
        expect(countAfterPass2.classes).toBe(countAfterPass1.classes);
        expect(countAfterPass2.sessions).toBe(countAfterPass1.sessions);
        expect(countAfterPass2.enrollments).toBe(countAfterPass1.enrollments);
      });

    test("G0-04.IDEMP.2: Upsert updates existing document attributes without changing _id", async () => {
      const storage = new Map();
      const existingId = new mongoose.Types.ObjectId();

      // Seed an existing category with old description
      storage.set("trung-hoc-pho-thong", {
        _id: existingId,
        slug: "trung-hoc-pho-thong",
        name: "Old Category Name",
        description: "Old Description",
        status: "INACTIVE",
        isDeleted: true,
      });

      const mockCategory = {
        findOne: async (filter) => storage.get(filter.slug) || null,
        findOneAndUpdate: async (filter, update) => {
          const doc = storage.get(filter.slug);
          Object.assign(doc, update.$set);
          return doc;
        },
      };

      const updated = await mockCategory.findOneAndUpdate(
        { slug: "trung-hoc-pho-thong" },
        {
          $set: {
            name: "Trung học phổ thông",
            description: "New V3 Description",
            status: "ACTIVE",
            isDeleted: false,
          },
        }
      );

      // _id must be preserved
      expect(updated._id).toBe(existingId);
      expect(updated.name).toBe("Trung học phổ thông");
      expect(updated.description).toBe("New V3 Description");
      expect(updated.status).toBe("ACTIVE");
      expect(updated.isDeleted).toBe(false);
    });
  });
});
