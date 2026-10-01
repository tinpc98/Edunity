// Display name/avatar of a User, whichever embedded profile its role uses
const getDisplayProfile = (user) => {
  if (!user) return { fullName: null, avatarUrl: null };
  const profile = user.studentProfile || user.teacherProfile || user.sponsorProfile || {};
  const fullName =
    profile.fullName || profile.representativeName || profile.organizationName || (user.role === "ADMIN" ? "Admin" : null);
  return { fullName, avatarUrl: profile.avatarUrl || null };
};

const PROFILE_SELECT = "email role status studentProfile teacherProfile.fullName teacherProfile.avatarUrl sponsorProfile";

const toUserSummary = (user) =>
  user ? { id: user._id.toString(), role: user.role, ...getDisplayProfile(user) } : null;

module.exports = { getDisplayProfile, toUserSummary, PROFILE_SELECT };
