const User = require("../models/User");
const { AppError } = require("../utils/errors");
const { hashPassword, verifyPassword } = require("../utils/password");
const authTokenService = require("../services/authTokenService");
const { getAccessTtl } = require("../utils/jwt");

// FR-STU-01, FR-TEA-01, FR-SPO-01. ADMIN accounts are never self-registered.
const REGISTRABLE_ROLES = ["STUDENT", "TEACHER", "SPONSOR"];
const SPONSOR_TYPES = ["INDIVIDUAL", "ORGANIZATION"];

const buildProfile = (role, body) => {
  if (role === "TEACHER") {
    // A new Teacher starts UNVERIFIED and must go through Teacher Verification (BR-01)
    return { teacherProfile: { fullName: body.fullName } };
  }
  if (role === "SPONSOR") {
    const sponsorType = body.sponsorType || "INDIVIDUAL";
    if (!SPONSOR_TYPES.includes(sponsorType)) {
      throw new AppError("Invalid input", "VALIDATION_ERROR", 400);
    }
    return {
      sponsorProfile: {
        sponsorType,
        organizationName: body.organizationName,
        representativeName: body.fullName,
      },
    };
  }
  return { studentProfile: { fullName: body.fullName } };
};

const getProfile = (user) => {
  const role = user.role;
  let fullName = "Admin";
  let avatarUrl = null;
  
  if (role === "STUDENT" && user.studentProfile) {
    fullName = user.studentProfile.fullName;
    avatarUrl = user.studentProfile.avatarUrl;
  } else if (role === "TEACHER" && user.teacherProfile) {
    fullName = user.teacherProfile.fullName;
    avatarUrl = user.teacherProfile.avatarUrl;
  } else if (role === "SPONSOR" && user.sponsorProfile) {
    fullName = user.sponsorProfile.representativeName;
    avatarUrl = user.sponsorProfile.avatarUrl;
  }

  return { fullName, avatarUrl };
};

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

exports.register = async (req, res, next) => {
  try {
    const { fullName, email, password, role } = req.body;
    if (!fullName || !email || !password || password.length < 6 || !REGISTRABLE_ROLES.includes(role)) {
      throw new AppError("Invalid input", "VALIDATION_ERROR", 400);
    }

    const lowerEmail = email.toLowerCase();
    if (!validateEmail(lowerEmail)) {
      throw new AppError("Invalid email format", "VALIDATION_ERROR", 400);
    }

    const existing = await User.findOne({ email: lowerEmail });
    if (existing) {
      throw new AppError("Email already exists", "DUPLICATE_EMAIL", 409);
    }

    const user = new User({
      email: lowerEmail,
      passwordHash: hashPassword(password),
      role,
      status: "ACTIVE",
      ...buildProfile(role, req.body)
    });
    await user.save();

    res.status(201).json({
      success: true,
      data: {
        userId: user._id.toString(),
        status: user.status,
        email: user.email,
        fullName: getProfile(user).fullName,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
};

const requestMeta = (req) => ({ userAgent: req.headers["user-agent"], ip: req.ip });

// POST /api/auth/login — JWT access token + refresh token
exports.loginWithRefreshToken = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const unauthorized = () =>
      res.status(401).json({ success: false, error: "UNAUTHORIZED", message: "Invalid email or password" });

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return unauthorized();
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return unauthorized();
    }
    authTokenService.assertAccountUsable(user);

    const { token } = await authTokenService.issueRefreshToken(user._id, requestMeta(req));
    const profile = getProfile(user);

    res.status(200).json({
      success: true,
      data: {
        accessToken: authTokenService.buildAccessToken(user),
        expiresIn: getAccessTtl(),
        refreshToken: token,
        user: {
          userId: user._id.toString(),
          fullName: profile.fullName,
          email: user.email,
          role: user.role,
          avatarUrl: profile.avatarUrl
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/refresh
exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    const result = await authTokenService.refresh(refreshToken, requestMeta(req));

    res.status(200).json({
      success: true,
      data: { accessToken: result.accessToken, expiresIn: result.expiresIn, refreshToken: result.refreshToken }
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    const result = await authTokenService.logout(refreshToken);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(401).json({ success: false, error: "UNAUTHORIZED", message: "Invalid email or password" });
    }
    const lowerEmail = email.toLowerCase();
    const user = await User.findOne({ email: lowerEmail });
    if (!user) {
      return res.status(401).json({ success: false, error: "UNAUTHORIZED", message: "Invalid email or password" });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: "UNAUTHORIZED", message: "Invalid email or password" });
    }

    const profile = getProfile(user);

    res.status(200).json({
      success: true,
      data: {
        accessToken: `dev-${user._id.toString()}`,
        user: {
          userId: user._id.toString(),
          fullName: profile.fullName,
          email: user.email,
          role: user.role,
          avatarUrl: profile.avatarUrl
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError("User not found", "USER_NOT_FOUND", 404);
    }

    const profile = getProfile(user);

    res.status(200).json({
      success: true,
      data: {
        userId: user._id.toString(),
        fullName: profile.fullName,
        email: user.email,
        role: user.role,
        avatarUrl: profile.avatarUrl
      }
    });
  } catch (err) {
    next(err);
  }
};
