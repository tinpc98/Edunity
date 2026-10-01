const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const {
  User,
  Class,
  Session,
  ScholarshipCampaign,
  SponsorContribution,
  ScholarshipApplication,
  Scholarship,
  ScholarshipUsage,
  VerificationDocument,
  Transaction,
  Notification,
  AuditLog,
  Report,
  Conversation,
  Message,
} = require("../src/models");

const DAY = 24 * 60 * 60 * 1000;
const dec = (value) => mongoose.Types.Decimal128.fromString(String(value));

// Demo data for the flows added on top of the base seed: teacher verification, class approval,
// scholarship campaign → contribution → application → scholarship, complaints and messaging.
const platformIds = {
  teacherPending: "66a000000000000000000007",
  classPending: "66e000000000000000000011",
  campaignOpen: "66f000000000000000000001",
  campaignDraft: "66f000000000000000000002",
  contribution: "66f100000000000000000001",
  applicationApproved: "66f200000000000000000001",
  applicationSubmitted: "66f200000000000000000002",
  scholarship: "66f300000000000000000001",
};

// Minimal one-page PDF used as the placeholder content of every seeded document
const PLACEHOLDER_PDF = Buffer.from(
  [
    "%PDF-1.1",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join("\n")
);

const storageRoot = () => path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "../storage"));

// Writes a placeholder file in private storage and returns its storage key (same layout as POST /uploads/private)
const seedFile = async (userId, purpose, index) => {
  const uuid = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const storageKey = `private/${userId}/${purpose}/${uuid}.pdf`;
  const target = path.join(storageRoot(), storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, PLACEHOLDER_PDF);
  return storageKey;
};

// These collections only reference seeded users, which the base seed wipes entirely
const clearPlatformData = async () => {
  await Promise.all([
    ScholarshipUsage.deleteMany({}),
    Scholarship.deleteMany({}),
    ScholarshipApplication.deleteMany({}),
    SponsorContribution.deleteMany({}),
    ScholarshipCampaign.deleteMany({}),
    VerificationDocument.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
    Report.deleteMany({}),
    Message.deleteMany({}),
    Conversation.deleteMany({}),
    Transaction.deleteMany({ transactionType: { $in: ["SPONSOR_CONTRIBUTION", "SCHOLARSHIP_USAGE"] } }),
    Session.deleteMany({ classId: platformIds.classPending }),
    Class.deleteMany({ _id: platformIds.classPending }),
  ]);
};

const seedPlatformData = async (ids, passwordHash) => {
  const now = new Date();

  console.log("Creating teacher pending verification...");
  await User.create({
    _id: platformIds.teacherPending,
    email: "teacher3@test.com",
    passwordHash,
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Test Teacher 3",
      biography: "Giáo viên Toán THCS, 5 năm kinh nghiệm.",
      qualificationSummary: "Cử nhân Sư phạm Toán",
      verificationStatus: "PENDING",
    },
  });
  await VerificationDocument.create([
    {
      userId: platformIds.teacherPending,
      documentType: "IDENTITY",
      files: [
        { side: "FRONT", storageKey: await seedFile(platformIds.teacherPending, "IDENTITY", 1), mimeType: "application/pdf" },
        { side: "BACK", storageKey: await seedFile(platformIds.teacherPending, "IDENTITY", 2), mimeType: "application/pdf" },
      ],
    },
    {
      userId: platformIds.teacherPending,
      documentType: "QUALIFICATION",
      files: [{ side: "SINGLE", storageKey: await seedFile(platformIds.teacherPending, "QUALIFICATION", 3), mimeType: "application/pdf" }],
    },
  ]);

  console.log("Creating class pending approval...");
  const classStart = new Date(now.getTime() + 14 * DAY);
  const classEnd = new Date(now.getTime() + 74 * DAY);
  await Class.create({
    _id: platformIds.classPending,
    courseId: ids.courseEn,
    courseTitle: "English Mastery",
    teacherId: ids.teacher2,
    teacherName: "Test Teacher 2",
    categoryId: ids.category,
    subjectId: ids.subjectEn,
    className: "English Speaking - Chờ duyệt",
    description: "Lớp luyện nói tiếng Anh giao tiếp, 2 buổi mỗi tuần.",
    classType: "PAID",
    price: dec(300000),
    capacity: 15,
    enrollmentStart: now,
    enrollmentEnd: classStart,
    startDate: classStart,
    endDate: classEnd,
    schedule: [
      { dayOfWeek: 2, startTime: "19:00", endTime: "20:30" },
      { dayOfWeek: 4, startTime: "19:00", endTime: "20:30" },
    ],
    status: "PENDING_APPROVAL",
  });
  await Session.create(
    [1, 2].map((index) => ({
      classId: platformIds.classPending,
      className: "English Speaking - Chờ duyệt",
      teacherId: ids.teacher2,
      title: `Buổi ${index} - Giao tiếp cơ bản`,
      startDatetime: new Date(classStart.getTime() + index * 2 * DAY),
      endDatetime: new Date(classStart.getTime() + index * 2 * DAY + 90 * 60 * 1000),
      status: "SCHEDULED",
    }))
  );

  console.log("Creating scholarship campaigns...");
  const period = { start: new Date(now.getTime() - 7 * DAY), end: new Date(now.getTime() + 60 * DAY) };
  await ScholarshipCampaign.create([
    {
      _id: platformIds.campaignOpen,
      createdBy: ids.admin,
      title: "Tiếp sức đến trường 2026",
      description: "Hỗ trợ học phí cho học viên có hoàn cảnh khó khăn.",
      eligibilityCriteria: "Học viên thuộc hộ nghèo/cận nghèo, có giấy xác nhận của địa phương.",
      scope: { categoryIds: [ids.category], subjectIds: [], courseIds: [] },
      targetBudget: dec(5000000),
      fundedAmount: dec(2000000),
      allocatedAmount: dec(150000), // = 1 scholarship awarded below
      usedAmount: dec(0),
      expectedSlots: 10,
      awardAmountPerStudent: dec(150000),
      fundingStart: period.start,
      fundingEnd: period.end,
      applicationStart: period.start,
      applicationEnd: period.end,
      status: "OPEN_FOR_FUNDING",
    },
    {
      _id: platformIds.campaignDraft,
      createdBy: ids.admin,
      title: "Học bổng Lập trình trẻ (bản nháp)",
      description: "Chiến dịch đang soạn, chưa công khai.",
      eligibilityCriteria: "Học sinh THPT yêu thích lập trình.",
      scope: { categoryIds: [], subjectIds: [ids.subject], courseIds: [] },
      targetBudget: dec(3000000),
      expectedSlots: 6,
      awardAmountPerStudent: dec(500000),
      status: "DRAFT",
    },
  ]);

  await SponsorContribution.create({
    _id: platformIds.contribution,
    campaignId: platformIds.campaignOpen,
    sponsorId: ids.sponsor,
    amount: dec(2000000),
    contributionStatus: "COMPLETED",
    paymentReference: "SBX-C-seed-0001",
    contributedAt: new Date(now.getTime() - 5 * DAY),
  });
  await Transaction.create({
    transactionType: "SPONSOR_CONTRIBUTION",
    sourceUserId: ids.sponsor,
    amount: dec(2000000),
    status: "COMPLETED",
  });

  console.log("Creating scholarship applications...");
  await ScholarshipApplication.create([
    {
      _id: platformIds.applicationApproved,
      campaignId: platformIds.campaignOpen,
      studentId: ids.student1,
      statement: "Gia đình em thuộc hộ cận nghèo, em mong được hỗ trợ học phí để học lập trình.",
      status: "APPROVED",
      submittedAt: new Date(now.getTime() - 4 * DAY),
      reviewedBy: ids.admin,
      reviewedAt: new Date(now.getTime() - 3 * DAY),
    },
    {
      _id: platformIds.applicationSubmitted,
      campaignId: platformIds.campaignOpen,
      studentId: ids.student2,
      statement: "Em là học sinh mồ côi cha, mong được nhận học bổng để theo học tiếng Anh.",
      status: "SUBMITTED",
      submittedAt: new Date(now.getTime() - 1 * DAY),
    },
  ]);
  await VerificationDocument.create([
    {
      userId: ids.student1,
      applicationId: platformIds.applicationApproved,
      documentType: "SCHOLARSHIP_PROOF",
      files: [{ side: "SINGLE", storageKey: await seedFile(ids.student1, "SCHOLARSHIP_PROOF", 4), mimeType: "application/pdf" }],
      status: "APPROVED",
      reviewedBy: ids.admin,
      reviewedAt: new Date(now.getTime() - 3 * DAY),
    },
    {
      userId: ids.student2,
      applicationId: platformIds.applicationSubmitted,
      documentType: "SCHOLARSHIP_PROOF",
      files: [{ side: "SINGLE", storageKey: await seedFile(ids.student2, "SCHOLARSHIP_PROOF", 5), mimeType: "application/pdf" }],
    },
  ]);

  // student1 holds 150.000đ: using it on a 200.000đ class demonstrates the MIXED co-payment flow
  await Scholarship.create({
    _id: platformIds.scholarship,
    campaignId: platformIds.campaignOpen,
    applicationId: platformIds.applicationApproved,
    studentId: ids.student1,
    allocatedAmount: dec(150000),
    remainingAmount: dec(150000),
    validFrom: new Date(now.getTime() - 3 * DAY),
    expiresAt: new Date(now.getTime() + 180 * DAY),
    status: "ACTIVE",
  });

  console.log("Creating complaint and conversation...");
  await Report.create({
    reporterId: ids.student2,
    reportedUserId: ids.teacher,
    classId: ids.classPaid200k20,
    type: "TEACHING_QUALITY",
    description: "Buổi học bắt đầu trễ 20 phút, mong trung tâm nhắc nhở giáo viên.",
    status: "OPEN",
  });
  const conversation = await Conversation.create({
    participantIds: [ids.student1, ids.teacher],
    classId: ids.classPaid200k20,
    lastMessagePreview: "Lớp học vào 19h tối thứ 2 và thứ 5 nhé em.",
    lastMessageAt: new Date(now.getTime() - 60 * 60 * 1000),
  });
  await Message.create([
    { conversationId: conversation._id, senderId: ids.student1, content: "Thầy ơi, lớp NodeJS học vào những buổi nào ạ?", createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
    { conversationId: conversation._id, senderId: ids.teacher, content: "Lớp học vào 19h tối thứ 2 và thứ 5 nhé em.", createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
  ]);
  await Notification.create([
    { userId: ids.student1, title: "Hồ sơ học bổng được duyệt", content: 'Bạn đã được cấp học bổng 150000 VNĐ từ chiến dịch "Tiếp sức đến trường 2026".', type: "SCHOLARSHIP_APPROVED" },
    { userId: ids.admin, title: "Hồ sơ giáo viên chờ xác minh", content: "Test Teacher 3 đã gửi hồ sơ xác minh.", type: "TEACHER_VERIFICATION_SUBMITTED" },
    { userId: ids.admin, title: "Lớp học chờ duyệt", content: 'Lớp "English Speaking - Chờ duyệt" của Test Teacher 2 đang chờ duyệt.', type: "CLASS_SUBMITTED" },
  ]);
};

module.exports = { platformIds, clearPlatformData, seedPlatformData };
