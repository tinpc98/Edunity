const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * SOFT-DELETABLE ENTITY
 * Dùng cho các entity có thể bị ẩn/gỡ khỏi hệ thống nhưng vẫn cần giữ lại
 * để không phá vỡ các tham chiếu lịch sử (Enrollment, Review, Contribution...).
 * Không dùng cho các entity tài chính/ledger (xem lưu ý ở models liên quan).
 */
function softDeletePlugin(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });
  schema.index({ isDeleted: 1 });
}

/**
 * REVIEWABLE ENTITY
 * Dùng cho các entity có vòng đời duyệt/từ chối bởi Admin
 * (Course Proposal, Scholarship Application, Verification Document, Class approval, Report...).
 * `status` được khai báo riêng ở từng schema vì enum giá trị khác nhau theo nghiệp vụ.
 */
function reviewablePlugin(schema) {
  schema.add({
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },
  });
}

/**
 * ADMIN/MANAGED CONTENT
 * Dùng cho catalog content do Admin tạo/sửa trực tiếp (Category, Subject, Course...),
 * nơi actor không thể suy ra được từ field khác.
 */
function adminManagedPlugin(schema, { createdByRequired = true } = {}) {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: createdByRequired },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });
}

module.exports = { softDeletePlugin, reviewablePlugin, adminManagedPlugin };
