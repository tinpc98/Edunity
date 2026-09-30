const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const crypto = require("crypto");
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
};

const passwordHash = crypto.scryptSync("password", "salt", 64).toString("hex");

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

    console.log("Clearing old seed data...");
    
    // Clear relations first
    const classIds = [ids.classFree30, ids.classPaid200k20, ids.classFree1, ids.classDraft];
    const enrollments = await Enrollment.find({ classId: { $in: classIds } }).distinct("_id");
    
    await Transaction.deleteMany({ relatedEnrollmentId: { $in: enrollments } });
    await Payment.deleteMany({ enrollmentId: { $in: enrollments } });
    await TeacherEarning.deleteMany({ enrollmentId: { $in: enrollments } });
    await Enrollment.deleteMany({ classId: { $in: classIds } });
    
    // Clear main models
    await Class.deleteMany({ _id: { $in: classIds } });
    await Course.deleteMany({ _id: ids.course });
    await Subject.deleteMany({ _id: ids.subject });
    await Category.deleteMany({ _id: ids.category });
    await User.deleteMany({ _id: { $in: [ids.admin, ids.teacher, ids.student1, ids.student2] } });

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

    await Subject.create({
      _id: ids.subject,
      categoryId: ids.category,
      categoryName: "IT",
      name: "Programming",
      slug: "programming",
      status: "ACTIVE",
      createdBy: ids.admin
    });

    await Course.create({
      _id: ids.course,
      subjectId: ids.subject,
      subjectName: "Programming",
      categoryId: ids.category,
      categoryName: "IT",
      title: "NodeJS Mastery",
      slug: "nodejs-mastery",
      status: "ACTIVE",
      createdBy: ids.admin
    });

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
      }
    ]);

    console.log("Seed complete! IDs used:");
    console.table(ids);

    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
