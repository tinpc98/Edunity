const { GRADE_LEVELS } = require("../models/constants");
const { AppError } = require("./errors");

const range = (from, to) => {
  const levels = [];
  for (let grade = from; grade <= to; grade += 1) levels.push(`GRADE_${grade}`);
  return levels;
};

const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * BR-45: grade levels offered for a Category.
 * Category has no dedicated field for this, so the group is recognised from its name/slug.
 * Returns null when the Category is not tied to a formal grade group (BR-46):
 * gradeLevel may then be null or any standard value.
 */
const allowedGradeLevelsForCategory = (category) => {
  if (!category) return null;
  let text = ` ${normalize(category.name)} ${normalize(category.slug)} `;
  const levels = [];

  if (/ (tien tieu hoc|mam non|pre primary) /.test(text)) {
    levels.push("PRE_PRIMARY");
    text = text.replace(/tien tieu hoc/g, " ");
  }
  if (/ tieu hoc /.test(text)) levels.push(...range(1, 5));
  if (/ (trung hoc co so|thcs) /.test(text)) levels.push(...range(6, 9));
  if (/ (trung hoc pho thong|thpt) /.test(text)) levels.push(...range(10, 12));
  if (/ (dai hoc|university) /.test(text)) levels.push("UNIVERSITY");
  if (/ (cao dang|college) /.test(text)) levels.push("COLLEGE");

  return levels.length ? levels : null;
};

/**
 * BR-43/BR-44/BR-45: validates a gradeLevel against the standard list and the Category.
 * Returns the normalized value (null when not provided).
 */
const resolveGradeLevel = (category, gradeLevel) => {
  if (gradeLevel === undefined || gradeLevel === null || gradeLevel === "") return null;
  if (!GRADE_LEVELS.includes(gradeLevel)) {
    throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
  }
  const allowed = allowedGradeLevelsForCategory(category);
  if (allowed && !allowed.includes(gradeLevel)) {
    const err = new AppError("gradeLevel does not match the selected category", "GRADE_LEVEL_CATEGORY_MISMATCH", 400);
    err.details = { allowedGradeLevels: allowed };
    throw err;
  }
  return gradeLevel;
};

module.exports = { allowedGradeLevelsForCategory, resolveGradeLevel };
