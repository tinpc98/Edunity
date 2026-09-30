const User = require("../models/User");
const { AppError } = require("../utils/errors");
const { hashPassword, verifyPassword } = require("../utils/password");

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
    if (!fullName || !email || !password || password.length < 6 || role !== "STUDENT") {
      throw new AppError("VALIDATION_ERROR", "Invalid input", 400);
    }

    const lowerEmail = email.toLowerCase();
    if (!validateEmail(lowerEmail)) {
      throw new AppError("VALIDATION_ERROR", "Invalid email format", 400);
    }

    const existing = await User.findOne({ email: lowerEmail });
    if (existing) {
      throw new AppError("DUPLICATE_EMAIL", "Email already exists", 409);
    }

    const user = new User({
      email: lowerEmail,
      passwordHash: hashPassword(password),
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName }
    });
    await user.save();

    res.status(201).json({
      success: true,
      data: {
        userId: user._id.toString(),
        status: user.status,
        email: user.email,
        fullName: user.studentProfile.fullName,
        role: user.role
      }
    });
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
      throw new AppError("USER_NOT_FOUND", "User not found", 404);
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
