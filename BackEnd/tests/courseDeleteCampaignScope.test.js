// A campaign links courses through scope.courseIds. With strictQuery on (as in src/config/db.js),
// a query on a wrong path is silently dropped and every campaign blocked every course delete.
const mongoose = require("mongoose");
const { User, Category, Subject, Course, ScholarshipCampaign } = require("../src/models");
const { deleteCourse } = require("../src/services/courseCatalogService");
const { getTrashDetail } = require("../src/services/trashService");
const { connectDB, disconnectDB, clearDB } = require("./helpers/db");

let admin, linked, unlinked;

beforeAll(async () => {
  mongoose.set("strictQuery", true);
  await connectDB();
});
afterAll(disconnectDB);

beforeEach(async () => {
  await clearDB();
  admin = await User.create({ email: "admin@del.test", passwordHash: "x", role: "ADMIN", status: "ACTIVE" });
  const category = await Category.create({ name: "THCS", slug: "thcs-del", createdBy: admin._id });
  const subject = await Subject.create({
    name: "Toán",
    slug: "toan-del",
    categoryId: category._id,
    categoryName: category.name,
    createdBy: admin._id,
  });
  const course = (slug) =>
    Course.create({
      title: slug,
      slug,
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_8",
      createdBy: admin._id,
    });
  linked = await course("linked-del");
  unlinked = await course("unlinked-del");
  const campaign = (title, courseIds) =>
    ScholarshipCampaign.create({
      createdBy: admin._id,
      title,
      targetBudget: 1000000,
      expectedSlots: 1,
      awardAmountPerStudent: 1000000,
      scope: { courseIds },
    });
  await campaign("Học bổng có khóa", [linked._id]);
  await campaign("Học bổng khác", []);
});

test("a course outside every campaign scope can be soft-deleted", async () => {
  const res = await deleteCourse(admin._id, unlinked._id.toString());

  expect(res.success).toBe(true);
  expect((await Course.findById(unlinked._id)).isDeleted).toBe(true);
});

test("a course inside a campaign scope is still refused, counting only that campaign", async () => {
  await expect(deleteCourse(admin._id, linked._id.toString())).rejects.toMatchObject({
    statusCode: 409,
    code: "COURSE_IN_SCHOLARSHIP_CAMPAIGN",
    details: { scholarshipCount: 1 },
  });
  expect((await Course.findById(linked._id)).isDeleted).toBe(false);
});

test("a closed campaign no longer blocks the soft delete, a draft still does", async () => {
  await ScholarshipCampaign.create({
    createdBy: admin._id,
    title: "Đã đóng",
    targetBudget: 1000000,
    expectedSlots: 1,
    awardAmountPerStudent: 1000000,
    status: "CLOSED",
    scope: { courseIds: [unlinked._id] },
  });
  expect((await deleteCourse(admin._id, unlinked._id.toString())).success).toBe(true);

  // the linked campaign is a DRAFT (default status)
  await expect(deleteCourse(admin._id, linked._id.toString())).rejects.toMatchObject({ code: "COURSE_IN_SCHOLARSHIP_CAMPAIGN" });
  await ScholarshipCampaign.updateMany({}, { status: "OPEN_FOR_FUNDING" });
  await expect(deleteCourse(admin._id, linked._id.toString())).rejects.toMatchObject({ code: "COURSE_IN_SCHOLARSHIP_CAMPAIGN" });
});

test("permanent delete is only blocked by a campaign that really links the course", async () => {
  await Course.updateMany({}, { isDeleted: true, deletedAt: new Date() });

  expect((await getTrashDetail("COURSE", unlinked._id.toString())).canPermanentDelete).toBe(true);
  const blocked = await getTrashDetail("COURSE", linked._id.toString());
  expect(blocked.canPermanentDelete).toBe(false);
  expect(blocked.permanentDeleteBlockReason).toContain("1 chiến dịch");
});
