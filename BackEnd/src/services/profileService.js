const { User, Class } = require("../models");
const { AppError } = require("../utils/errors");
const { validationError, parseDate, isBlank } = require("../utils/http");
const { hashPassword, verifyPassword } = require("../utils/password");
const storage = require("./storageService");
const authTokenService = require("./authTokenService");

const PROFILE_KEY = { STUDENT: "studentProfile", TEACHER: "teacherProfile", SPONSOR: "sponsorProfile" };
const SPONSOR_TYPES = ["INDIVIDUAL", "ORGANIZATION"];

const getUser = async (userId) => {
  const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } });
  if (!user) throw new AppError("User not found", "USER_NOT_FOUND", 404);
  return user;
};

const present = (user) => {
  const base = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  if (user.role === "STUDENT") {
    const profile = user.studentProfile || {};
    return { ...base, fullName: profile.fullName, dateOfBirth: profile.dateOfBirth || null, avatarUrl: profile.avatarUrl || null, bio: profile.bio || null };
  }
  if (user.role === "TEACHER") {
    const profile = user.teacherProfile || {};
    return {
      ...base,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl || null,
      biography: profile.biography || null,
      qualificationSummary: profile.qualificationSummary || null,
      // read-only: decided by Admin verification and student reviews
      verificationStatus: profile.verificationStatus,
      ratingAverage: profile.ratingAverage || 0,
      ratingCount: profile.ratingCount || 0,
    };
  }
  if (user.role === "SPONSOR") {
    const profile = user.sponsorProfile || {};
    return {
      ...base,
      fullName: profile.representativeName || profile.organizationName || null,
      sponsorType: profile.sponsorType,
      organizationName: profile.organizationName || null,
      representativeName: profile.representativeName || null,
      avatarUrl: profile.avatarUrl || null,
      description: profile.description || null,
    };
  }
  return { ...base, fullName: "Admin", avatarUrl: null };
};

const optionalText = (value, field, maxLength = 2000) => {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw validationError(`${field} must be a string of at most ${maxLength} characters`);
  }
  return value;
};

const requiredName = (value, field) => {
  if (isBlank(value) || value.length > 120) throw validationError(`${field} must not be empty`);
  return value;
};

const parseAvatarUrl = (value) => {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^(https?:\/\/|\/uploads\/)/.test(value)) {
    throw validationError("avatarUrl must be an http(s) URL or a path returned by the upload API");
  }
  return value;
};

const getMyProfile = async (userId) => present(await getUser(userId));

/**
 * FR-STU-03 / FR-TEA-04 / FR-SPO-02. Only the fields a user owns are editable:
 * email, role, account status, verification status and ratings are never taken from the request.
 */
const updateMyProfile = async (userId, body) => {
  const user = await getUser(userId);
  const key = PROFILE_KEY[user.role];
  if (!key) throw new AppError("This account has no editable profile", "PROFILE_NOT_EDITABLE", 400);
  if (!user[key]) user[key] = user.role === "SPONSOR" ? { sponsorType: "INDIVIDUAL" } : { fullName: user.email };
  const profile = user[key];
  const previousName = user.role === "TEACHER" ? profile.fullName : null;

  if (body.avatarUrl !== undefined) profile.avatarUrl = parseAvatarUrl(body.avatarUrl);

  if (user.role === "STUDENT") {
    if (body.fullName !== undefined) profile.fullName = requiredName(body.fullName, "fullName");
    if (body.bio !== undefined) profile.bio = optionalText(body.bio, "bio");
    if (body.dateOfBirth !== undefined) {
      const dateOfBirth = parseDate(body.dateOfBirth, "dateOfBirth");
      if (dateOfBirth && dateOfBirth > new Date()) throw validationError("dateOfBirth must be in the past");
      profile.dateOfBirth = dateOfBirth || undefined;
    }
  } else if (user.role === "TEACHER") {
    if (body.fullName !== undefined) profile.fullName = requiredName(body.fullName, "fullName");
    if (body.biography !== undefined) profile.biography = optionalText(body.biography, "biography", 5000);
    if (body.qualificationSummary !== undefined) {
      profile.qualificationSummary = optionalText(body.qualificationSummary, "qualificationSummary");
    }
  } else {
    if (body.sponsorType !== undefined) {
      if (!SPONSOR_TYPES.includes(body.sponsorType)) throw validationError("sponsorType must be INDIVIDUAL or ORGANIZATION");
      profile.sponsorType = body.sponsorType;
    }
    const representativeName = body.representativeName !== undefined ? body.representativeName : body.fullName;
    if (representativeName !== undefined) profile.representativeName = requiredName(representativeName, "representativeName");
    if (body.organizationName !== undefined) profile.organizationName = optionalText(body.organizationName, "organizationName", 200);
    if (body.description !== undefined) profile.description = optionalText(body.description, "description", 5000);
  }

  await user.save();

  if (previousName !== null && previousName !== user.teacherProfile.fullName) {
    // teacherName is denormalized in Class
    await Class.updateMany({ teacherId: user._id }, { $set: { teacherName: user.teacherProfile.fullName } });
  }
  return present(user);
};

// Uploads the image to public storage and sets it as the avatar in one step
const updateMyAvatar = async (userId, file) => {
  const user = await getUser(userId);
  const key = PROFILE_KEY[user.role];
  if (!key || !user[key]) throw new AppError("This account has no editable profile", "PROFILE_NOT_EDITABLE", 400);

  const saved = await storage.savePublicFile("AVATAR", file);
  user[key].avatarUrl = saved.url;
  await user.save();
  return { avatarUrl: saved.url };
};

// Changing the password signs the account out everywhere (all refresh tokens revoked)
const changeMyPassword = async (userId, body) => {
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    throw validationError("currentPassword and newPassword are required");
  }
  if (newPassword.length < 6) throw validationError("newPassword must be at least 6 characters");

  const user = await getUser(userId);
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new AppError("Current password is incorrect", "INVALID_PASSWORD", 400);
  }
  if (currentPassword === newPassword) throw validationError("newPassword must be different from the current password");

  user.passwordHash = hashPassword(newPassword);
  await user.save();
  await authTokenService.revokeAllForUser(user._id);
  return { changed: true };
};

module.exports = { getMyProfile, updateMyProfile, updateMyAvatar, changeMyPassword };
