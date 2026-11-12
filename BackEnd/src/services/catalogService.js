const mongoose = require("mongoose");
const { Class, Session, Subject, Course, Category, User } = require("../models");
const { AppError } = require("../utils/errors");
const { toPublic } = require("../utils/publicView");
const { escapeRegex } = require("../utils/http");

// Class chua duoc Admin duyet (DRAFT, PENDING_APPROVAL, REJECTED) khong duoc hien thi cong khai
const PUBLIC_CLASS_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const NOT_DELETED = { isDeleted: { $ne: true } };
const MAX_SEARCH_LENGTH = 100;

// A repeated query parameter arrives as an array
const asList = (value) => [].concat(value).join(",").split(",").filter(Boolean);

// Public view of a Teacher: fields live in the embedded teacherProfile; review notes stay private
const toPublicTeacher = (teacher) => {
  const profile = teacher.teacherProfile || {};
  return {
    id: teacher._id.toString(),
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl || null,
    biography: profile.biography,
    qualificationSummary: profile.qualificationSummary,
    ratingAverage: profile.ratingAverage || 0,
    ratingCount: profile.ratingCount || 0
  };
};

class CatalogService {
  async getCategories() {
    const [categories, subjects] = await Promise.all([
      Category.find({ status: "ACTIVE", ...NOT_DELETED }).lean(),
      Subject.find({ status: "ACTIVE", ...NOT_DELETED }).lean(),
    ]);

    return categories.map(cat => ({
      id: cat._id.toString(),
      name: cat.name,
      slug: cat.slug,
      subjects: subjects
        .filter(sub => sub.categoryId && sub.categoryId.toString() === cat._id.toString())
        .map(sub => ({
          id: sub._id.toString(),
          name: sub.name,
          slug: sub.slug,
          classCount: 0 // Simplification for now
        }))
    }));
  }

  async getFilters() {
    const [subjects, courses] = await Promise.all([
      Subject.find({ status: "ACTIVE", ...NOT_DELETED }).select("name slug").lean(),
      Course.find({ status: "ACTIVE", ...NOT_DELETED }).select("title slug subjectId").lean(),
    ]);
    
    // Simplification for counts and minMax
    return {
      subjects: subjects.map(s => ({ id: s._id.toString(), name: s.name, count: 0 })),
      grades: [],
      courses: courses.map(c => ({ id: c._id.toString(), name: c.title, count: 0 })),
      teachers: [],
      minPrice: 0,
      maxPrice: 5000000
    };
  }

  async getClasses(filters, page, pageSize) {
    const query = { ...NOT_DELETED };

    const search = [].concat(filters.search)[0];
    if (typeof search === "string" && search) {
      // Plain-text search: user input must never be interpreted as a regular expression
      const pattern = { $regex: escapeRegex(search.slice(0, MAX_SEARCH_LENGTH)), $options: "i" };
      query.$or = [{ className: pattern }, { courseTitle: pattern }, { teacherName: pattern }];
    }

    // BUG-CAT-03 Fix: Include categoryId filter
    if (filters.categoryId) {
      if (mongoose.isValidObjectId(filters.categoryId)) {
        query.categoryId = filters.categoryId;
      } else {
        query._id = null; // defensive fallback if called directly
      }
    }
    if (filters.subjectId) query.subjectId = filters.subjectId;
    if (filters.courseId) query.courseId = filters.courseId;
    if (filters.teacherId) query.teacherId = filters.teacherId;
    
    if (filters.statuses) {
      query.status = { $in: asList(filters.statuses).filter(status => PUBLIC_CLASS_STATUSES.includes(status)) };
    } else {
      query.status = { $in: ["OPEN", "IN_PROGRESS"] };
    }

    // BUG-CAT-02 Fix: Unified price & classTypes filtering without overwrite
    let isFreeOnly = false;
    let isPaidOnly = false;
    if (filters.classTypes) {
      const types = asList(filters.classTypes);
      const hasFree = types.includes("FREE");
      const hasPaid = types.includes("PAID");
      if (hasFree && !hasPaid) isFreeOnly = true;
      if (hasPaid && !hasFree) isPaidOnly = true;
    }

    let minPriceNum = undefined;
    if (filters.minPrice !== undefined && filters.minPrice !== null && filters.minPrice !== "") {
      const parsed = Number(filters.minPrice);
      if (Number.isFinite(parsed)) {
        minPriceNum = Math.max(parsed, 0); // clamp negative to 0
      }
    }

    let maxPriceNum = undefined;
    if (filters.maxPrice !== undefined && filters.maxPrice !== null && filters.maxPrice !== "") {
      const parsed = Number(filters.maxPrice);
      if (Number.isFinite(parsed)) {
        maxPriceNum = parsed;
      }
    }

    if (isFreeOnly) {
      // FREE classes must have price = 0
      if ((minPriceNum !== undefined && minPriceNum > 0) || (maxPriceNum !== undefined && maxPriceNum < 0)) {
        query.price = -1; // impossible match since class price >= 0
      } else {
        query.price = 0;
      }
    } else if (isPaidOnly) {
      // PAID classes must have price > 0
      if (maxPriceNum !== undefined && maxPriceNum <= 0) {
        query.price = -1; // impossible match
      } else {
        const priceCond = { $gt: 0 };
        if (minPriceNum !== undefined && minPriceNum > 0) {
          priceCond.$gte = minPriceNum;
        }
        if (maxPriceNum !== undefined) {
          priceCond.$lte = maxPriceNum;
        }
        query.price = priceCond;
      }
    } else {
      const hasMin = minPriceNum !== undefined;
      const hasMax = maxPriceNum !== undefined;
      if (hasMin || hasMax) {
        const priceCond = {};
        if (hasMin) priceCond.$gte = minPriceNum;
        if (hasMax) priceCond.$lte = maxPriceNum;
        query.price = priceCond;
      }
    }

    // Stable sorting with unique tie-breaker (_id)
    let sort = {};
    switch (filters.sort) {
      case "price_asc": sort = { price: 1, _id: 1 }; break;
      case "price_desc": sort = { price: -1, _id: 1 }; break;
      case "upcoming": sort = { startDate: 1, _id: 1 }; break;
      case "newest": sort = { createdAt: -1, _id: -1 }; break;
      case "oldest": sort = { createdAt: 1, _id: 1 }; break;
      default: sort = { createdAt: -1, _id: -1 }; break;
    }

    // BUG-CAT-04 Fix: Ensure safe positive page and pageSize
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 12;

    const skip = (safePage - 1) * safePageSize;
    const items = await Class.find(query).sort(sort).skip(skip).limit(safePageSize).lean();
    const total = await Class.countDocuments(query);

    return {
      items: items.map(toPublic),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize)
    };
  }

  async getClassById(classId) {
    const cls = await Class.findOne({ _id: classId, status: { $in: PUBLIC_CLASS_STATUSES }, ...NOT_DELETED }).lean();
    if (!cls) throw new AppError("Class not found", "CLASS_NOT_FOUND", 404);

    const teacher = await User.findById(cls.teacherId).select("teacherProfile").lean();
    return {
      ...toPublic(cls),
      teacher: teacher ? toPublicTeacher(teacher) : null
    };
  }

  async getClassSessions(classId) {
    const visible = await Class.exists({ _id: classId, status: { $in: PUBLIC_CLASS_STATUSES }, ...NOT_DELETED });
    if (!visible) throw new AppError("Class not found", "CLASS_NOT_FOUND", 404);
    // meetingRoomId and recording locations stay private: joining and playback go through authenticated endpoints
    return await Session.find({ classId })
      .select("-meetingRoomId -recording.storageKey -recording.providerRecordingId")
      .sort({ startDatetime: 1 })
      .lean();
  }

  async getTeachers(featured, limit) {
    const query = { role: "TEACHER", status: "ACTIVE", "teacherProfile.verificationStatus": "VERIFIED", ...NOT_DELETED };
    // Featured = highest rated first
    const sort = featured ? { "teacherProfile.ratingAverage": -1, "teacherProfile.ratingCount": -1 } : { createdAt: -1 };
    const teachers = await User.find(query).select("teacherProfile").sort(sort).limit(limit).lean();
    return teachers.map(toPublicTeacher);
  }

  async getTeacherById(teacherId) {
    const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", status: "ACTIVE", "teacherProfile.verificationStatus": "VERIFIED", ...NOT_DELETED }).select("teacherProfile").lean();
    if (!teacher) throw new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);

    const classes = await Class.find({ teacherId, status: "OPEN", ...NOT_DELETED }).lean();
    return {
      ...toPublicTeacher(teacher),
      classes: classes.map(toPublic)
    };
  }
}

module.exports = new CatalogService();
