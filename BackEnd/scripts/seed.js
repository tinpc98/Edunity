const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const crypto = require("crypto");
const { hashPassword } = require("../src/utils/password");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");
const Category = require("../src/models/Category");
const Subject = require("../src/models/Subject");
const Course = require("../src/models/Course");
const Class = require("../src/models/Class");
const Enrollment = require("../src/models/Enrollment");
const Payment = require("../src/models/Payment");
const Transaction = require("../src/models/Transaction");
const TeacherEarning = require("../src/models/TeacherEarning");
const Session = require("../src/models/Session");

const ids = {
  admin: "66a000000000000000000001",
  teacher: "66a000000000000000000002",
  student1: "66a000000000000000000003",
  student2: "66a000000000000000000004",
  category: "66b000000000000000000001",
  subject: "66c000000000000000000001",
  course: "66d000000000000000000001",
  classFree30: "66e000000000000000000001",
  classPaid200k20: "66e000000000000000000002",
  classFree1: "66e000000000000000000003",
  classDraft: "66e000000000000000000004",
  sponsor: "66a000000000000000000005",
  teacher2: "66a000000000000000000006",
  subjectEn: "66c000000000000000000002",
  subjectPhy: "66c000000000000000000003",
  courseEn: "66d000000000000000000002",
  coursePhy: "66d000000000000000000003",
  classOpen5: "66e000000000000000000005",
  classOpen6: "66e000000000000000000006",
  classOpen7: "66e000000000000000000007",
  classOpen8: "66e000000000000000000008",
  classOpen9: "66e000000000000000000009",
  classOpen10: "66e000000000000000000010",
};

const passwordHash = hashPassword("password");

async function seed() {
  try {
    await connectDB();

    await User.init();
    await Category.init();
    await Subject.init();
    await Course.init();
    await Class.init();
    await Enrollment.init();
    await Payment.init();
    await Transaction.init();
    await TeacherEarning.init();
    await Session.init();

    console.log("Clearing old seed data...");
    
    // Clear relations first
    const classIds = [
      ids.classFree30, ids.classPaid200k20, ids.classFree1, ids.classDraft,
      ids.classOpen5, ids.classOpen6, ids.classOpen7, ids.classOpen8, ids.classOpen9, ids.classOpen10
    ];
    const enrollments = await Enrollment.find({ classId: { $in: classIds } }).distinct("_id");
    
    await Transaction.deleteMany({ relatedEnrollmentId: { $in: enrollments } });
    await Payment.deleteMany({ enrollmentId: { $in: enrollments } });
    await TeacherEarning.deleteMany({ enrollmentId: { $in: enrollments } });
    await Enrollment.deleteMany({ classId: { $in: classIds } });
    await Session.deleteMany({ classId: { $in: classIds } });
    
    // Clear main models
    await Class.deleteMany({ _id: { $in: classIds } });
    await Course.deleteMany({});
    await Subject.deleteMany({});
    await Category.deleteMany({});
    await User.deleteMany({});

    console.log("Creating users...");
    await User.create([
      {
        _id: ids.admin,
        email: "admin@test.com",
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE"
      },
      {
        _id: ids.teacher,
        email: "teacher@test.com",
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: {
          fullName: "Test Teacher",
          verificationStatus: "VERIFIED"
        }
      },
      {
        _id: ids.student1,
        email: "student1@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Test Student 1" }
      },
      {
        _id: ids.student2,
        email: "student2@test.com",
        passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: { fullName: "Test Student 2" }
      },
      {
        _id: ids.sponsor,
        email: "sponsor@test.com",
        passwordHash,
        role: "SPONSOR",
        status: "ACTIVE",
        sponsorProfile: { representativeName: "Test Sponsor", sponsorType: "ORGANIZATION" }
      },
      {
        _id: ids.teacher2,
        email: "teacher2@test.com",
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        teacherProfile: { fullName: "Test Teacher 2", verificationStatus: "VERIFIED" }
      }
    ]);

    console.log("Creating category, subject, course...");
    await Category.create({
      _id: ids.category,
      name: "IT",
      slug: "it",
      status: "ACTIVE",
      createdBy: ids.admin
    });

    await Subject.create([
      {
        _id: ids.subject,
        categoryId: ids.category,
        categoryName: "IT",
        name: "Programming",
        slug: "programming",
        status: "ACTIVE",
        createdBy: ids.admin
      },
      {
        _id: ids.subjectEn,
        categoryId: ids.category,
        categoryName: "IT",
        name: "Tiếng Anh",
        slug: "tieng-anh",
        status: "ACTIVE",
        createdBy: ids.admin
      },
      {
        _id: ids.subjectPhy,
        categoryId: ids.category,
        categoryName: "IT",
        name: "Vật lý",
        slug: "vat-ly",
        status: "ACTIVE",
        createdBy: ids.admin
      }
    ]);

    await Course.create([
      {
        _id: ids.course,
        subjectId: ids.subject,
        subjectName: "Programming",
        categoryId: ids.category,
        categoryName: "IT",
        title: "NodeJS Mastery",
        slug: "nodejs-mastery",
        status: "ACTIVE",
        createdBy: ids.admin
      },
      {
        _id: ids.courseEn,
        subjectId: ids.subjectEn,
        subjectName: "Tiếng Anh",
        categoryId: ids.category,
        categoryName: "IT",
        title: "English Mastery",
        slug: "english-mastery",
        status: "ACTIVE",
        createdBy: ids.admin
      },
      {
        _id: ids.coursePhy,
        subjectId: ids.subjectPhy,
        subjectName: "Vật lý",
        categoryId: ids.category,
        categoryName: "IT",
        title: "Physics Mastery",
        slug: "physics-mastery",
        status: "ACTIVE",
        createdBy: ids.admin
      }
    ]);

    const now = new Date();
    const enrollmentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const enrollmentEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    console.log("Creating classes...");
    await Class.create([
      {
        _id: ids.classFree30,
        courseId: ids.course,
        courseTitle: "NodeJS Mastery",
        teacherId: ids.teacher,
        teacherName: "Test Teacher",
        categoryId: ids.category,
        subjectId: ids.subject,
        className: "Free NodeJS Class (30 slots)",
        classType: "FREE",
        price: mongoose.Types.Decimal128.fromString("0"),
        capacity: 30,
        enrollmentStart,
        enrollmentEnd,
        status: "OPEN",
        createdBy: ids.admin
      },
      {
        _id: ids.classPaid200k20,
        courseId: ids.course,
        courseTitle: "NodeJS Mastery",
        teacherId: ids.teacher,
        teacherName: "Test Teacher",
        categoryId: ids.category,
        subjectId: ids.subject,
        className: "Paid NodeJS Class (20 slots)",
        classType: "PAID",
        price: mongoose.Types.Decimal128.fromString("200000"),
        capacity: 20,
        enrollmentStart,
        enrollmentEnd,
        status: "OPEN",
        createdBy: ids.admin
      },
      {
        _id: ids.classFree1,
        courseId: ids.course,
        courseTitle: "NodeJS Mastery",
        teacherId: ids.teacher,
        teacherName: "Test Teacher",
        categoryId: ids.category,
        subjectId: ids.subject,
        className: "Free NodeJS Class (1 slot)",
        classType: "FREE",
        price: mongoose.Types.Decimal128.fromString("0"),
        capacity: 1,
        enrollmentStart,
        enrollmentEnd,
        status: "OPEN",
        createdBy: ids.admin
      },
      {
        _id: ids.classDraft,
        courseId: ids.course,
        courseTitle: "NodeJS Mastery",
        teacherId: ids.teacher,
        teacherName: "Test Teacher",
        categoryId: ids.category,
        subjectId: ids.subject,
        className: "Draft NodeJS Class",
        classType: "PAID",
        price: mongoose.Types.Decimal128.fromString("100000"),
        capacity: 10,
        status: "DRAFT",
        createdBy: ids.admin
      },
      {
        _id: ids.classOpen5,
        courseId: ids.courseEn, courseTitle: "English Mastery", teacherId: ids.teacher2, teacherName: "Test Teacher 2", categoryId: ids.category, subjectId: ids.subjectEn,
        className: "Class Open 5", classType: "FREE", price: mongoose.Types.Decimal128.fromString("0"), capacity: 20, enrollmentStart, enrollmentEnd, status: "OPEN", createdBy: ids.admin
      },
      {
        _id: ids.classOpen6,
        courseId: ids.courseEn, courseTitle: "English Mastery", teacherId: ids.teacher2, teacherName: "Test Teacher 2", categoryId: ids.category, subjectId: ids.subjectEn,
        className: "Class Open 6", classType: "PAID", price: mongoose.Types.Decimal128.fromString("100000"), capacity: 20, enrollmentStart, enrollmentEnd, status: "OPEN", createdBy: ids.admin
      },
      {
        _id: ids.classOpen7,
        courseId: ids.coursePhy, courseTitle: "Physics Mastery", teacherId: ids.teacher, teacherName: "Test Teacher", categoryId: ids.category, subjectId: ids.subjectPhy,
        className: "Class Open 7", classType: "PAID", price: mongoose.Types.Decimal128.fromString("200000"), capacity: 20, enrollmentStart, enrollmentEnd, status: "OPEN", createdBy: ids.admin
      },
      {
        _id: ids.classOpen8,
        courseId: ids.coursePhy, courseTitle: "Physics Mastery", teacherId: ids.teacher, teacherName: "Test Teacher", categoryId: ids.category, subjectId: ids.subjectPhy,
        className: "Class Open 8", classType: "PAID", price: mongoose.Types.Decimal128.fromString("300000"), capacity: 20, enrollmentStart, enrollmentEnd, status: "OPEN", createdBy: ids.admin
      },
      {
        _id: ids.classOpen9,
        courseId: ids.course, courseTitle: "NodeJS Mastery", teacherId: ids.teacher, teacherName: "Test Teacher", categoryId: ids.category, subjectId: ids.subject,
        className: "Class Open 9", classType: "PAID", price: mongoose.Types.Decimal128.fromString("400000"), capacity: 20, enrollmentStart, enrollmentEnd, status: "OPEN", createdBy: ids.admin
      },
      {
        _id: ids.classOpen10,
        courseId: ids.course, courseTitle: "NodeJS Mastery", teacherId: ids.teacher, teacherName: "Test Teacher", categoryId: ids.category, subjectId: ids.subject,
        className: "Class Open 10", classType: "PAID", price: mongoose.Types.Decimal128.fromString("500000"), capacity: 20, enrollmentStart, enrollmentEnd, status: "OPEN", createdBy: ids.admin
      }
    ]);

    console.log("Creating sessions...");
    const pastStart = new Date(now.getTime() - 5 * 60 * 1000); // 5 mins ago
    const pastEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    
    const futureStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now
    const futureEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000); // 1 day + 2 hours

    const sessions = [
      { classId: ids.classFree30, className: "Free NodeJS Class (30 slots)", teacherId: ids.teacher, title: "Session 1 - Active", startDatetime: pastStart, endDatetime: pastEnd, status: "SCHEDULED" },
      { classId: ids.classFree30, className: "Free NodeJS Class (30 slots)", teacherId: ids.teacher, title: "Session 2 - Future", startDatetime: futureStart, endDatetime: futureEnd, status: "SCHEDULED" },
      { classId: ids.classPaid200k20, className: "Paid NodeJS Class (20 slots)", teacherId: ids.teacher, title: "Session 1 - Active", startDatetime: pastStart, endDatetime: pastEnd, status: "SCHEDULED" },
      { classId: ids.classPaid200k20, className: "Paid NodeJS Class (20 slots)", teacherId: ids.teacher, title: "Session 2 - Future", startDatetime: futureStart, endDatetime: futureEnd, status: "SCHEDULED" }
    ];

    const newClassIds = [ids.classOpen5, ids.classOpen6, ids.classOpen7, ids.classOpen8, ids.classOpen9, ids.classOpen10];
    newClassIds.forEach(cId => {
      for (let i = 1; i <= 4; i++) {
        sessions.push({
          classId: cId,
          className: "Class Open",
          teacherId: cId === ids.classOpen5 || cId === ids.classOpen6 ? ids.teacher2 : ids.teacher,
          title: "Session " + i,
          startDatetime: new Date(now.getTime() + i * 24 * 60 * 60 * 1000),
          endDatetime: new Date(now.getTime() + i * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
          status: "SCHEDULED"
        });
      }
    });

    await Session.create(sessions);

    console.log("Seed complete! IDs used:");
    console.table(ids);

    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
