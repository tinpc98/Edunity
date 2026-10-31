const { Class, Session, Subject, Course, Category, User } = require("../models");
const { AppError } = require("../utils/errors");
const { toPublic } = require("../utils/publicView");
const { escapeRegex } = require("../utils/http");

// Class chưa được Admin duyệt (DRAFT, PENDING_APPROVAL, REJECTED) không được hiển thị công khai
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
    const categories = await Category.find({ status: "ACTIVE" }).lean();
    const subjects = await Subject.find({ status: "ACTIVE" }).lean();
    const courses = await Course.find({ status: "ACTIVE" }).lean();

    return categories.map(cat => ({
      id: cat._id.toString(),
      name: cat.name,
      slug: cat.slug,
      subjects: subjects.filter(sub => sub.categoryId.toString() === cat._id.toString()).map(sub => ({
        id: sub._id.toString(),
        name: sub.name,
        slug: sub.slug,
        classCount: 0 // Simplification for now
      }))
    }));
  }

  async getFilters() {
    const subjects = await Subject.find({ status: "ACTIVE" }).select("name slug").lean();
    const courses = await Course.find({ status: "ACTIVE" }).select("title slug subjectId").lean();
    
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
    if (filters.subjectId) query.subjectId = filters.subjectId;
    if (filters.courseId) query.courseId = filters.courseId;
    if (filters.teacherId) query.teacherId = filters.teacherId;
    
    if (filters.statuses) {
      query.status = { $in: asList(filters.statuses).filter(status => PUBLIC_CLASS_STATUSES.includes(status)) };
    } else {
      query.status = { $in: ["OPEN", "IN_PROGRESS"] };
    }

    if (filters.classTypes) {
      const types = asList(filters.classTypes);
      if (types.includes("FREE") && !types.includes("PAID")) query.price = 0;
      if (types.includes("PAID") && !types.includes("FREE")) query.price = { $gt: 0 };
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
      if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
    }

    let sort = {};
    switch (filters.sort) {
      case "price_asc": sort = { price: 1 }; break;
      case "price_desc": sort = { price: -1 }; break;
      case "upcoming": sort = { startDate: 1 }; break;
      default: sort = { createdAt: -1 }; break;
    }

    const skip = (page - 1) * pageSize;
    const items = await Class.find(query).sort(sort).skip(skip).limit(pageSize).lean();
    const total = await Class.countDocuments(query);

    return {
      items: items.map(toPublic),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
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
