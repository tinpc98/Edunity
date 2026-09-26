import type {
  ClassDiscoveryItem,
  FilterMetadata,
  FilterState,
  PaginatedResult,
} from "../types/classDiscovery";
import {
  COMMON_DISCOVERY_GRADES,
  GRADE_LEVEL_LABELS,
  MOCK_COURSES,
  MOCK_SUBJECTS,
  MOCK_TEACHERS,
  RAW_MOCK_CLASSES,
  transformToDiscoveryItem,
} from "../data/mockClassDiscovery";

/**
 * Service simulating public/student Class Discovery API
 * Applies AND across filter groups, OR within multi-select groups,
 * text search across class, course, subject, teacher, sorting, and pagination.
 */
class ClassDiscoveryService {
  async fetchClasses(filters: FilterState): Promise<PaginatedResult<ClassDiscoveryItem>> {
    // Simulate real network latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    let items = RAW_MOCK_CLASSES.map(transformToDiscoveryItem);

    // 1. Text Search across Class name, Course name, Subject, Teacher
    if (filters.search && filters.search.trim() !== "") {
      const q = filters.search.trim().toLowerCase();
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.courseTitle.toLowerCase().includes(q) ||
          c.subjectName.toLowerCase().includes(q) ||
          c.teacherName.toLowerCase().includes(q) ||
          c.gradeLabel.toLowerCase().includes(q)
      );
    }

    // 2. Subject Filter (Single select or 'All')
    if (filters.subjectId && filters.subjectId !== "ALL") {
      items = items.filter((c) => c.subjectId === filters.subjectId);
    }

    // 3. Grade Level Filter (Multi-select: OR within group)
    if (filters.gradeLevels && filters.gradeLevels.length > 0) {
      items = items.filter(
        (c) => c.gradeLevel !== null && filters.gradeLevels.includes(c.gradeLevel)
      );
    }

    // 4. Course Filter
    if (filters.courseId && filters.courseId !== "ALL") {
      items = items.filter((c) => c.courseId === filters.courseId);
    }

    // 5. Class Type Filter (FREE / PAID) (OR within group)
    if (filters.classTypes && filters.classTypes.length > 0) {
      items = items.filter((c) => filters.classTypes.includes(c.classType));
    }

    // 6. Price Range Filter
    if (filters.minPrice !== undefined) {
      items = items.filter((c) => c.price >= (filters.minPrice ?? 0));
    }
    if (filters.maxPrice !== undefined) {
      items = items.filter((c) => c.price <= (filters.maxPrice ?? Infinity));
    }

    // 7. Schedule / Time of Day Filter (MORNING / AFTERNOON / EVENING) (OR within group)
    if (filters.timeOfDay && filters.timeOfDay.length > 0) {
      items = items.filter((c) => filters.timeOfDay.includes(c.timeOfDay));
    }

    // 8. Status Filter (OR within group)
    if (filters.statuses && filters.statuses.length > 0) {
      items = items.filter((c) => filters.statuses.includes(c.status));
    }

    // 9. Teacher Filter
    if (filters.teacherId && filters.teacherId !== "ALL") {
      items = items.filter((c) => c.teacherId === filters.teacherId);
    }

    // 10. Sorting
    switch (filters.sort) {
      case "upcoming":
        items.sort((a, b) => a.startDate.localeCompare(b.startDate));
        break;
      case "price_asc":
        items.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        items.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        items.sort((a, b) => b.ratingAverage - a.ratingAverage);
        break;
      case "relevance":
      default:
        // Balanced relevance: rating + popularity (enrolled count)
        items.sort((a, b) => {
          const scoreA = a.ratingAverage * 10 + a.enrolledCount;
          const scoreB = b.ratingAverage * 10 + b.enrolledCount;
          return scoreB - scoreA;
        });
        break;
    }

    // 11. Pagination
    const total = items.length;
    const page = Math.max(1, filters.page);
    const pageSize = Math.max(1, filters.pageSize);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async fetchFilterMetadata(): Promise<FilterMetadata> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const allItems = RAW_MOCK_CLASSES.map(transformToDiscoveryItem);

    // Subject counts
    const subjects = MOCK_SUBJECTS.map((s) => ({
      id: s.id,
      name: s.name,
      count: allItems.filter((c) => c.subjectId === s.id).length,
    }));

    // Grade counts
    const grades = COMMON_DISCOVERY_GRADES.map((level) => ({
      level,
      label: GRADE_LEVEL_LABELS[level] || level,
      count: allItems.filter((c) => c.gradeLevel === level).length,
    }));

    // Courses
    const courses = MOCK_COURSES.map((crs) => ({
      id: crs.id,
      title: crs.title,
      count: allItems.filter((c) => c.courseId === crs.id).length,
    }));

    // Teachers
    const teachers = MOCK_TEACHERS.map((t) => ({
      id: t.id,
      name: t.name,
      count: allItems.filter((c) => c.teacherId === t.id).length,
    }));

    // Price bounds
    const prices = allItems.map((c) => c.price);
    const minPrice = 0;
    const maxPrice = Math.max(...prices, 2000000);

    return {
      subjects,
      grades,
      courses,
      teachers,
      minPrice,
      maxPrice,
    };
  }

  async fetchClassById(classId: string): Promise<ClassDiscoveryItem | null> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const found = RAW_MOCK_CLASSES.find((c) => c._id === classId);
    if (!found) return null;
    return transformToDiscoveryItem(found);
  }
}

export const classDiscoveryService = new ClassDiscoveryService();
