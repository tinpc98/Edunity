const {
  User, Category, Subject, Course, Class, Enrollment, Payment, BankTransferEvent,
  PaymentReconciliation, RefundCase, TeacherEarning, Transaction, Payout,
} = require("../../src/models");
const { requireTestConnection } = require("./db");

const studentEmail = "tuition-student@example.test";
const studentName = "Học viên kiểm thử";
const teacherName = "Nguyễn Văn Đức";
const className = "Lớp kiểm thử hoàn tiền Toán 12";
const caseNumber = "REF-FIXTURE-DUPLICATE";
const bankSnapshot = { bankName: "Test Bank", accountNumber: "0000000123", accountHolderName: "TEST ACCOUNT HOLDER" };

async function seedActorsAndCatalog() {
  requireTestConnection();
  const user = { passwordHash: "fixture-hash", status: "ACTIVE" };
  const [admin, student, teacher] = await User.create([
    { ...user, email: "finance-admin@example.test", role: "ADMIN" },
    { ...user, email: studentEmail, role: "STUDENT", studentProfile: { fullName: studentName } },
    { ...user, email: "duc.nguyen@example.test", role: "TEACHER", teacherProfile: { fullName: teacherName } },
  ]);
  const category = await Category.create({ name: "THPT", slug: "fixture-thpt", createdBy: admin._id });
  const subject = await Subject.create({
    name: "Toán", slug: "fixture-toan", categoryId: category._id, categoryName: category.name, createdBy: admin._id,
  });
  const course = await Course.create({
    title: "Toán 12", slug: "fixture-toan-12", gradeLevel: "GRADE_12",
    categoryId: category._id, categoryName: category.name, subjectId: subject._id, subjectName: subject.name, createdBy: admin._id,
  });
  return { admin, student, teacher, category, subject, course };
}

async function seedTuitionIncident(actors) {
  requireTestConnection();
  const { student, teacher, category, subject, course } = actors;
  const cls = await Class.create({
    className, status: "OPEN", teacherId: teacher._id, teacherName,
    categoryId: category._id, subjectId: subject._id, courseId: course._id, courseTitle: course.title,
    gradeLevel: course.gradeLevel, classType: "PAID", price: "3000", capacity: 20, enrolledCount: 1,
  });
  const enrollmentFixture = {
    classId: cls._id, courseId: course._id, studentId: student._id, teacherId: teacher._id,
    paymentSource: "DIRECT_PAYMENT", tuitionAmount: "3000",
  };
  const [duplicate, confirmed, unpaid] = await Enrollment.create([
    { ...enrollmentFixture, enrollmentStatus: "EXPIRED" },
    { ...enrollmentFixture, enrollmentStatus: "CONFIRMED", amountPaidViaPayment: "3000" },
    { ...enrollmentFixture, enrollmentStatus: "EXPIRED" },
  ]);
  const tuition = { purpose: "TUITION", channelKey: "TUITION" };
  const completed = { ...tuition, payerUserId: student._id, gateway: "PAYOS", provider: "PAYOS", paymentStatus: "COMPLETED", providerStatus: "PAID", amount: "3000" };
  const [duplicatePayment, appliedPayment] = await Payment.create([
    { ...completed, enrollmentId: duplicate._id, orderCode: 100000008, gatewayReference: "fixture-duplicate" },
    { ...completed, enrollmentId: confirmed._id, orderCode: 100000009, gatewayReference: "fixture-applied" },
    { ...completed, enrollmentId: unpaid._id, orderCode: 100000010, gatewayReference: "fixture-failed", paymentStatus: "FAILED", providerStatus: "FAILED" },
    { ...completed, enrollmentId: unpaid._id, orderCode: 100000011, gatewayReference: "fixture-pending", paymentStatus: "PENDING", providerStatus: "PENDING" },
  ]);

  const bankEvent = (orderCode, dispatchStatus) => ({
    ...tuition, provider: "PAYOS", orderCode, amount: "3000", currency: "VND",
    fingerprint: `fixture-transfer-${orderCode}`, providerReference: `TEST-${orderCode}`,
    eventStatus: dispatchStatus === "DISPATCHED" ? "DISPATCHED" : "EXPIRED_PAYMENT", dispatchStatus,
  });
  const [duplicateEvent, appliedEvent] = await BankTransferEvent.create([
    bankEvent(100000008, "RECONCILIATION_REQUIRED"),
    bankEvent(100000009, "DISPATCHED"),
  ]);
  const [reconciliation] = await PaymentReconciliation.create([
    { ...tuition, eventId: duplicateEvent._id, orderCode: 100000008, paymentId: duplicatePayment._id, enrollmentId: duplicate._id, reason: "EXPIRED_PAYMENT", receivedAmount: "3000", status: "NEEDS_REVIEW" },
    { ...tuition, eventId: appliedEvent._id, orderCode: 100000009, paymentId: appliedPayment._id, enrollmentId: confirmed._id, reason: "EXPIRED_PAYMENT", receivedAmount: "3000", status: "RESOLVED_APPROVED" },
  ]);
  await RefundCase.create({
    ...tuition, caseNumber, sourcePaymentId: duplicatePayment._id, relatedReconciliationId: reconciliation._id,
    relatedBankEventId: duplicateEvent._id, relatedEnrollmentId: duplicate._id, relatedClassId: cls._id,
    recipientUserId: student._id, beneficiaryBankAccount: bankSnapshot, originalAmount: "3000", eligibleAmount: "3000",
    reason: "OVERPAYMENT", status: "NEEDS_REVIEW",
  });
  const transaction = (payment, event, enrollment, transactionType, status) => ({
    sourceUserId: student._id, relatedPaymentId: payment._id, relatedBankEventId: event._id,
    relatedEnrollmentId: enrollment._id, amount: "3000", transactionType, status,
  });
  await Transaction.create([
    transaction(appliedPayment, appliedEvent, confirmed, "ENROLLMENT_PAYMENT", "COMPLETED"),
    transaction(duplicatePayment, duplicateEvent, duplicate, "UNAPPLIED_TUITION_RECEIPT", "COMPLETED"),
    transaction(duplicatePayment, duplicateEvent, duplicate, "REFUND", "PENDING"),
  ]);
  await TeacherEarning.create({
    teacherId: teacher._id, enrollmentId: confirmed._id, classId: cls._id, grossAmount: "3000",
    commissionAmount: "300", netAmount: "2700", status: "PENDING", settlementHoldRequired: true,
    settlementBlockers: ["POLICY_BLOCKED"],
  });
  return { cls, confirmed };
}

async function seedTestPayouts(teacher) {
  requireTestConnection();
  const [approved] = await Payout.create([
    { status: "APPROVED", amount: "250000" },
    { status: "SCHEDULED", amount: "500000" },
    { status: "FAILED", amount: "100000" },
    { status: "REJECTED", amount: "100000" },
  ].map((payout) => ({
    ...payout, teacherId: teacher._id, isTestData: true, testDataTag: "isolated-fixture", bankAccountSnapshot: bankSnapshot,
  })));
  return approved;
}

module.exports = {
  seedActorsAndCatalog, seedTuitionIncident, seedTestPayouts,
  studentEmail, studentName, teacherName, className, caseNumber, bankSnapshot,
};
