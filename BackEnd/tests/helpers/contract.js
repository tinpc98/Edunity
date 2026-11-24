// A teacher signs the teaching contract before opening any class: tests that create classes start from a signed one.
const { TeacherContract } = require("../../src/models");

const DAY = 24 * 60 * 60 * 1000;

const signContract = (teacherId, adminId, overrides = {}) =>
  TeacherContract.create({
    contractCode: `HD-TEST-${teacherId}`,
    teacherId,
    status: "ACTIVE",
    effectiveFrom: new Date(Date.now() - DAY),
    expiresAt: new Date(Date.now() + 365 * DAY),
    provider: { name: "SANDBOX", envelopeId: `SBX-TEST-${teacherId}` },
    createdBy: adminId,
    sentAt: new Date(),
    signedAt: new Date(),
    ...overrides,
  });

module.exports = { signContract };
