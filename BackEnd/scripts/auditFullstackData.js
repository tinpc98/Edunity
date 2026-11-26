const { MongoClient } = require("mongoose").mongo;

const present = { isDeleted: { $ne: true } };
const lookup = (from, localField, as, foreignField = "_id", projection) => ({
  $lookup: {
    from, localField, foreignField, as,
    pipeline: [
      ...(foreignField === "_id" ? [] : [{ $match: { [foreignField]: { $ne: null } } }]),
      { $project: projection },
    ],
  },
});
const empty = (field) => ({ $eq: [{ $size: `$${field}` }, 0] });
const before = (field) => ({
  $and: [{ $eq: [{ $type: `$${field}` }, "date"] }, { $lt: [`$${field}`, "$$NOW"] }],
});
const differs = (left, right) => ({
  $ne: [{ $ifNull: [`$${left}`, null] }, { $ifNull: [{ $first: `$${right}` }, null] }],
});

const auditQueries = {
  pendingWithoutHold: ["enrollments", [
    { $match: { enrollmentStatus: "PENDING_PAYMENT", $expr: { $ne: [{ $type: "$holdExpiresAt" }, "date"] } } },
    lookup("classes", "classId", "classes", "_id", { isDeleted: 1, status: 1, enrolledCount: 1 }),
    lookup("payments", "_id", "payments", "enrollmentId", { paymentStatus: 1, expiredAt: 1, createdAt: 1 }),
    lookup("paymentreconciliations", "payments._id", "reconciliations", "paymentId", { status: 1 }),
    lookup("paymentreconciliations", "_id", "enrollmentReconciliations", "enrollmentId", { status: 1 }),
    lookup("refundcases", "payments._id", "refunds", "sourcePaymentId", { status: 1 }),
    lookup("scholarshipusages", "_id", "scholarships", "enrollmentId", { status: 1 }),
    { $project: {
      classId: 1, classes: 1, createdAt: 1, enrolledAt: 1, paymentSource: 1, payments: 1,
      reconciliations: { $setUnion: ["$reconciliations", "$enrollmentReconciliations"] }, refunds: 1, scholarships: 1,
    } },
    { $sort: { _id: 1 } },
  ]],
  openClasses: ["classes", [
    { $match: { ...present, status: "OPEN" } },
    lookup("sessions", "_id", "sessions", "classId", { status: 1, roomState: 1 }),
    lookup("enrollments", "_id", "enrollments", "classId", { enrollmentStatus: 1 }),
    lookup("payments", "enrollments._id", "payments", "enrollmentId", { paymentStatus: 1 }),
    { $project: {
      className: 1, startDate: 1, endDate: 1, enrollmentEnd: 1,
      startPassed: before("startDate"), endPassed: before("endDate"), registrationEnded: before("enrollmentEnd"),
      sessions: "$sessions.status", roomStates: "$sessions.roomState",
      enrollments: "$enrollments.enrollmentStatus", payments: "$payments.paymentStatus",
    } },
    { $sort: { _id: 1 } },
  ]],
  snapshotDifferences: ["classes", [
    { $match: present },
    lookup("courses", "courseId", "courses", "_id", { title: 1, gradeLevel: 1, categoryId: 1, subjectId: 1, updatedAt: 1 }),
    { $addFields: {
      missingCourse: empty("courses"),
      titleChanged: differs("courseTitle", "courses.title"),
      gradeChanged: differs("gradeLevel", "courses.gradeLevel"),
      categoryChanged: differs("categoryId", "courses.categoryId"),
      subjectChanged: differs("subjectId", "courses.subjectId"),
    } },
    { $match: { $or: ["missingCourse", "titleChanged", "gradeChanged", "categoryChanged", "subjectChanged"].map((key) => ({ [key]: true })) } },
    { $project: {
      className: 1, status: 1, createdAt: 1, courseId: 1, courseTitle: 1, gradeLevel: 1, categoryId: 1, subjectId: 1,
      courses: 1, missingCourse: 1, titleChanged: 1, gradeChanged: 1, categoryChanged: 1, subjectChanged: 1,
    } },
    { $sort: { _id: 1 } },
  ]],
  trashOrphans: ["classes", [
    { $match: { isDeleted: true } },
    lookup("courses", "courseId", "courses", "_id", { _id: 1 }),
    lookup("categories", "categoryId", "categories", "_id", { _id: 1 }),
    lookup("subjects", "subjectId", "subjects", "_id", { _id: 1 }),
    lookup("users", "teacherId", "teachers", "_id", { _id: 1 }),
    { $project: {
      className: 1, courseId: 1, categoryId: 1, subjectId: 1, teacherId: 1,
      missingCourse: empty("courses"), missingCategory: empty("categories"),
      missingSubject: empty("subjects"), missingTeacher: empty("teachers"),
    } },
    { $match: { $or: ["missingCourse", "missingCategory", "missingSubject", "missingTeacher"].map((key) => ({ [key]: true })) } },
    { $sort: { _id: 1 } },
  ]],
};

async function collectAudit(runQuery) {
  const sections = await Promise.all(Object.entries(auditQueries).map(async ([name, [collection, pipeline]]) => [
    name, await runQuery(collection, pipeline),
  ]));
  return { readOnly: true, proposedWrites: 0, ...Object.fromEntries(sections) };
}

async function main() {
  const [option, database, ...extra] = process.argv.slice(2);
  if (option !== "--db" || !database || extra.length || !process.env.MONGODB_URI) {
    throw new Error("Expected --db <database> and MONGODB_URI in the environment");
  }
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const defaultDb = client.db();
    if (defaultDb.databaseName !== database) throw new Error("Database differs from the configured default");
    const audit = await collectAudit((collection, pipeline) => defaultDb.collection(collection)
      .aggregate(pipeline, { maxTimeMS: 20000 }).toArray());
    console.log(JSON.stringify({ database, ...audit }, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Read-only audit failed:", error.codeName || error.name);
    process.exitCode = 1;
  });
}

module.exports = { collectAudit };
