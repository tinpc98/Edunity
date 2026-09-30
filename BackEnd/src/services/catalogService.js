const { Class, Session, Subject, Course, Category, User } = require("../models");
const { AppError } = require("../utils/errors");

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
    const query = { status: { $ne: "DRAFT" } };

    if (filters.search) {
      query.$or = [
        { className: { $regex: filters.search, $options: "i" } },
        { courseTitle: { $regex: filters.search, $options: "i" } },
        { teacherName: { $regex: filters.search, $options: "i" } },
      ];
    }
    if (filters.subjectId) query.subjectId = filters.subjectId;
    if (filters.courseId) query.courseId = filters.courseId;
    if (filters.teacherId) query.teacherId = filters.teacherId;
    
    if (filters.statuses) {
      query.status = { $in: filters.statuses.split(",") };
    } else {
      query.status = { $in: ["OPEN", "IN_PROGRESS"] };
    }

    if (filters.classTypes) {
      const types = filters.classTypes.split(",");
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
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async getClassById(classId) {
    const cls = await Class.findById(classId).lean();
    if (!cls) throw new AppError("CLASS_NOT_FOUND", "Class not found", 404);

    const teacher = await User.findById(cls.teacherId).select("fullName avatarUrl biography qualificationSummary").lean();
    return {
      ...cls,
      teacher: teacher ? {
        id: teacher._id.toString(),
        fullName: teacher.fullName,
        avatarUrl: teacher.avatarUrl,
        biography: teacher.biography,
        qualificationSummary: teacher.qualificationSummary
      } : null
    };
  }

  async getClassSessions(classId) {
    return await Session.find({ classId }).sort({ startDatetime: 1 }).lean();
  }

  async getTeachers(featured, limit) {
    const query = { role: "TEACHER", verificationStatus: "VERIFIED" };
    // Simplified logic, fetching VERIFIED teachers
    const teachers = await User.find(query).select("-passwordHash -email").limit(limit).lean();
    return teachers;
  }

  async getTeacherById(teacherId) {
    const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", verificationStatus: "VERIFIED" }).select("-passwordHash -email").lean();
    if (!teacher) throw new AppError("TEACHER_NOT_FOUND", "Teacher not found", 404);

    const classes = await Class.find({ teacherId, status: "OPEN" }).lean();
    return {
      ...teacher,
      classes
    };
  }
}

module.exports = new CatalogService();
