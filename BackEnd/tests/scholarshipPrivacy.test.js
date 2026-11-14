const os = require("os");
const path = require("path");
const fs = require("fs");
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-privacy-"));

const request = require("supertest");
const app = require("../src/app");
const { User, ScholarshipCampaign, ScholarshipApplication, SponsorContribution, GuardianConsent, AuditLog } = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { assertConsentGate } = require("../src/services/scholarshipDossierGateService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const PDF = Buffer.from("%PDF-1.4\n% signed consent\n%%EOF\n");
const DAY = 24 * 60 * 60 * 1000;
const STORY = "Em ước mơ trở thành kỹ sư phần mềm để giúp đỡ gia đình và quê hương.";
const GUARDIAN = { fullName: "Trần Thị Mẹ", relationship: "MOTHER", phone: "0901234567" };

let users, tokens, campaign;
const as = (name) => ({ Authorization: `Bearer ${tokens[name]}` });
const yearsAgo = (years) => new Date(Date.now() - years * 365.25 * DAY);

const createUser = async (name, role, extra = {}) => {
  users[name] = await User.create({ email: `${name}@test.com`, passwordHash: hashPassword("password123"), role, ...extra });
  tokens[name] = signAccessToken(users[name]);
};

const uploadProof = async (name) =>
  (await request(app).post("/api/uploads/private").set(as(name)).field("purpose", "SCHOLARSHIP_PROOF").attach("file", PDF, { filename: "consent.pdf", contentType: "application/pdf" }))
    .body.data.storageKey;

const submitConsent = async (name, extra = {}) =>
  request(app)
    .post("/api/student/guardian-consents")
    .set(as(name))
    .send({ campaignId: campaign._id, guardian: GUARDIAN, documentStorageKey: await uploadProof(name), ...extra });

const approvedApplication = (name, extra = {}) =>
  ScholarshipApplication.create({
    campaignId: campaign._id, studentId: users[name]._id, statement: "hoàn cảnh riêng tư", status: "APPROVED", submittedAt: new Date(),
    schoolInfo: { schoolName: "THCS A", gradeLevel: "GRADE_8", className: "8A", province: "Hà Giang" }, ...extra,
  });

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

beforeEach(async () => {
  await clearDB();
  users = {};
  tokens = {};
  await createUser("admin", "ADMIN");
  await createUser("minor", "STUDENT", { studentProfile: { fullName: "Lê Minh Anh", dateOfBirth: yearsAgo(14) } });
  await createUser("adult", "STUDENT", { studentProfile: { fullName: "Phạm Thu Hà", dateOfBirth: yearsAgo(19) } });
  await createUser("noDob", "STUDENT", { studentProfile: { fullName: "Không Rõ" } });
  await createUser("sponsor", "SPONSOR", { sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "MTQ" } });
  await createUser("otherSponsor", "SPONSOR", { sponsorProfile: { sponsorType: "INDIVIDUAL", representativeName: "MTQ2" } });
  campaign = await ScholarshipCampaign.create({
    createdBy: users.admin._id, title: "HB", targetBudget: 1000000, expectedSlots: 2, awardAmountPerStudent: 100000, status: "OPEN_FOR_FUNDING",
    fundedAmount: 500000, applicationStart: new Date(Date.now() - DAY), applicationEnd: new Date(Date.now() + DAY),
    fundingStart: new Date(Date.now() - DAY), fundingEnd: new Date(Date.now() + DAY),
    dossierPolicy: { requireGuardianConsentForMinor: true },
  });
  await SponsorContribution.create({ campaignId: campaign._id, sponsorId: users.sponsor._id, amount: 500000, contributionStatus: "COMPLETED", paymentReference: "CTR-1" });
});

afterAll(disconnectDB);

const gate = (name) => assertConsentGate({ student: users[name].toObject(), campaign });

describe("AID-08 guardian consent", () => {
  it("a minor (or a student with no birth date) needs an Admin-verified consent; an adult does not", async () => {
    await expect(gate("minor")).rejects.toMatchObject({ code: "GUARDIAN_CONSENT_REQUIRED", statusCode: 403 });
    await expect(gate("noDob")).rejects.toMatchObject({ code: "GUARDIAN_CONSENT_REQUIRED" });
    await expect(gate("adult")).resolves.toMatchObject({ status: "NOT_REQUIRED" });

    const submitted = await submitConsent("minor");
    expect(submitted.statusCode).toBe(201);
    await expect(gate("minor")).rejects.toMatchObject({ code: "GUARDIAN_CONSENT_REQUIRED" }); // pending is not enough

    const verified = await request(app).post(`/api/admin/guardian-consents/${submitted.body.data.id}/verify`).set(as("admin")).send({});
    expect(verified.body.data.status).toBe("VERIFIED");
    expect(await AuditLog.countDocuments({ action: "GUARDIAN_CONSENT_VERIFIED" })).toBe(1);
    await expect(gate("minor")).resolves.toMatchObject({ status: "VERIFIED", consentRecordId: expect.anything() });
  });

  it("a campaign that does not require consent never records one as given", async () => {
    await ScholarshipCampaign.updateOne({ _id: campaign._id }, { $set: { "dossierPolicy.requireGuardianConsentForMinor": false } });
    campaign = await ScholarshipCampaign.findById(campaign._id);
    await expect(gate("minor")).resolves.toMatchObject({ status: "NOT_REQUIRED" });
  });

  it("only accepts the student's own SCHOLARSHIP_PROOF file, one live consent per campaign", async () => {
    const otherKey = await uploadProof("adult");
    const stolen = await request(app).post("/api/student/guardian-consents").set(as("minor")).send({ campaignId: campaign._id, guardian: GUARDIAN, documentStorageKey: otherKey });
    expect(stolen.statusCode).toBe(400);

    expect((await submitConsent("minor")).statusCode).toBe(201);
    expect((await submitConsent("minor")).body.error).toBe("GUARDIAN_CONSENT_EXISTS");
  });

  it("rejection needs a reason; the student can revoke and the gate closes again", async () => {
    const { id } = (await submitConsent("minor")).body.data;
    expect((await request(app).post(`/api/admin/guardian-consents/${id}/reject`).set(as("admin")).send({})).statusCode).toBe(400);
    await request(app).post(`/api/admin/guardian-consents/${id}/verify`).set(as("admin")).send({});
    expect((await request(app).post(`/api/student/guardian-consents/${id}/revoke`).set(as("minor"))).body.data.status).toBe("REVOKED");
    await expect(gate("minor")).rejects.toMatchObject({ code: "GUARDIAN_CONSENT_REQUIRED" });
  });

  it("the admin list does not hand out file URLs (opening the form goes through the audited signed-url endpoint)", async () => {
    await submitConsent("minor");
    const list = await request(app).get("/api/admin/guardian-consents").set(as("admin"));
    expect(list.body.data.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/files\/download/);
    const key = list.body.data.items[0].documentStorageKey;
    expect((await request(app).post("/api/files/signed-url").set(as("admin")).send({ storageKey: key })).statusCode).toBe(200);
    expect(await AuditLog.countDocuments({ action: "PRIVATE_FILE_ACCESSED" })).toBe(1);
  });
});

describe("Public stories for sponsors", () => {
  it("are off by default and only shown, anonymised, to sponsors of the campaign", async () => {
    const application = await approvedApplication("adult");
    const url = `/api/sponsor/campaigns/${campaign._id}/stories`;
    expect((await request(app).get(url).set(as("sponsor"))).body.data).toEqual([]);

    const set = await request(app).put(`/api/student/scholarship-applications/${application._id}/public-story`).set(as("adult")).send({ consent: true, text: STORY });
    expect(set.statusCode).toBe(200);

    const stories = (await request(app).get(url).set(as("sponsor"))).body.data;
    expect(stories).toEqual([{ displayName: "P.T.H.", gradeLevel: "GRADE_8", province: "Hà Giang", story: STORY }]);
    const raw = JSON.stringify(stories);
    for (const secret of ["Phạm Thu Hà", "hoàn cảnh riêng tư", users.adult._id.toString(), application._id.toString(), "THCS A"]) {
      expect(raw).not.toContain(secret);
    }

    expect((await request(app).get(url).set(as("otherSponsor"))).statusCode).toBe(403);
    expect((await request(app).get(url).set(as("adult"))).statusCode).toBe(403);
  });

  it("a minor needs guardian consent that covers the story; revoking that consent withdraws the story", async () => {
    const application = await approvedApplication("minor");
    const put = (body) => request(app).put(`/api/student/scholarship-applications/${application._id}/public-story`).set(as("minor")).send(body);
    expect((await put({ consent: true, text: STORY })).body.error).toBe("GUARDIAN_CONSENT_REQUIRED");

    const { id } = (await submitConsent("minor", { allowPublicStory: true })).body.data;
    await request(app).post(`/api/admin/guardian-consents/${id}/verify`).set(as("admin")).send({});
    expect((await put({ consent: true, text: STORY })).statusCode).toBe(200);

    await request(app).post(`/api/student/guardian-consents/${id}/revoke`).set(as("minor"));
    expect((await ScholarshipApplication.findById(application._id).lean()).publicStory.consent).toBe(false);
    expect((await request(app).get(`/api/sponsor/campaigns/${campaign._id}/stories`).set(as("sponsor"))).body.data).toEqual([]);
  });

  it("only the owner can publish a story, and it can be withdrawn", async () => {
    const application = await approvedApplication("adult");
    const url = `/api/student/scholarship-applications/${application._id}/public-story`;
    expect((await request(app).put(url).set(as("minor")).send({ consent: true, text: STORY })).statusCode).toBe(404);
    expect((await request(app).put(url).set(as("adult")).send({ consent: true, text: "ngắn" })).statusCode).toBe(400);
    await request(app).put(url).set(as("adult")).send({ consent: true, text: STORY });
    await request(app).put(url).set(as("adult")).send({ consent: false });
    expect((await request(app).get(`/api/sponsor/campaigns/${campaign._id}/stories`).set(as("sponsor"))).body.data).toEqual([]);
  });

  it("pending (not yet approved) applications are never shown", async () => {
    const application = await approvedApplication("adult", { status: "SUBMITTED" });
    await request(app).put(`/api/student/scholarship-applications/${application._id}/public-story`).set(as("adult")).send({ consent: true, text: STORY });
    expect((await request(app).get(`/api/sponsor/campaigns/${campaign._id}/stories`).set(as("sponsor"))).body.data).toEqual([]);
    expect(await GuardianConsent.countDocuments()).toBe(0);
  });
});
