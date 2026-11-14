import { FetchError } from "../api/apiClient";

export function getFriendlyErrorMessage(error: unknown, fallbackMessage = "Có lỗi xảy ra. Vui lòng thử lại."): string {
  if (error instanceof FetchError || (typeof error === "object" && error !== null && ("code" in error || "status" in error))) {
    const err = error as { code?: string; status?: number; message?: string };
    
    // Auth errors
    if (err.code === "RATE_LIMITED" || err.status === 429) {
      return "Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.";
    }
    if (err.code === "DUPLICATE_EMAIL") {
      return "Email này đã được sử dụng. Vui lòng dùng email khác hoặc đăng nhập.";
    }
    if (err.code === "ACCOUNT_BLOCKED") {
      return "Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ Edunity để được hỗ trợ.";
    }
    if (err.code === "ACCOUNT_NOT_ACTIVE") {
      return "Tài khoản của bạn hiện chưa ở trạng thái hoạt động.";
    }

    if (err.code === "MESSAGING_NOT_ALLOWED") {
      return "Bạn chỉ có thể nhắn tin cho học viên thuộc lớp của mình.";
    }

    // Teacher contract errors (TEA-12)
    const contractMessages: Record<string, string> = {
      TEACHER_CONTRACT_NOT_FOUND: "Bạn cần ký hợp đồng giảng dạy trước khi mở lớp. Xem mục Hợp đồng trong Hồ sơ giáo viên.",
      TEACHER_CONTRACT_NOT_ACTIVE: "Hợp đồng giảng dạy chưa có hiệu lực, nên chưa thể mở lớp.",
      TEACHER_CONTRACT_EXPIRED: "Hợp đồng giảng dạy đã hết hạn. Vui lòng liên hệ Edunity để gia hạn.",
      CONTRACT_ALREADY_PENDING: "Giáo viên này đang có một hợp đồng chờ ký.",
      TEACHER_NOT_VERIFIED: "Chỉ gửi được hợp đồng cho giáo viên đã xác minh.",
      CONTRACT_NOT_PENDING: "Hợp đồng này không còn ở trạng thái chờ ký.",
      ECONTRACT_PROVIDER_UNAVAILABLE: "Dịch vụ hợp đồng điện tử chưa sẵn sàng. Vui lòng thử lại sau.",
      IDENTITY_NUMBER_IN_USE: "Số CCCD này đã được dùng cho một tài khoản khác. Liên hệ Edunity nếu bạn cho rằng có nhầm lẫn.",
      IDENTITY_DOCUMENT_EXPIRED: "CCCD đã hết hạn. Vui lòng dùng CCCD còn hiệu lực.",
    };
    if (err.code && contractMessages[err.code]) return contractMessages[err.code];

    // Scholarship errors
    if (err.code === "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS") {
      return "Chiến dịch này hiện không trong thời gian nhận hồ sơ.";
    }
    if (err.code === "DUPLICATE_APPLICATION") {
      return "Bạn đã có hồ sơ đang xử lý hoặc đã được duyệt cho chiến dịch này.";
    }
    if (err.code === "APPLICATION_NOT_RESUBMITTABLE") {
      return "Hồ sơ này hiện không ở trạng thái cần bổ sung thông tin.";
    }
    if (err.code === "APPLICATION_NOT_FOUND") {
      return "Không tìm thấy hồ sơ học bổng.";
    }
    if (err.code === "CAMPAIGN_NOT_FOUND") {
      return "Không tìm thấy chiến dịch học bổng.";
    }

    // Avatar errors
    if (err.code === "UNSUPPORTED_FILE_TYPE") {
      return "Định dạng tệp không được hỗ trợ. Chỉ chấp nhận tệp JPG, PNG hoặc WebP (tối đa 5MB).";
    }
    if (err.code === "FILE_TOO_LARGE" || err.status === 413) {
      return "Kích thước tệp vượt quá giới hạn cho phép.";
    }
    if (err.code === "PROFILE_NOT_EDITABLE") {
      return "Hồ sơ giáo viên chưa được khởi tạo đầy đủ. Không thể cập nhật ảnh đại diện.";
    }

    // Verification & teaching authorization errors
    if (err.code === "TEACHER_NOT_VERIFIED") {
      return "Bạn cần được xác minh hồ sơ giảng viên trước khi sử dụng chức năng này.";
    }
    if (err.code === "CONTRACT_DEPENDENCY_BLOCKED") {
      return "Chưa thể xác minh điều kiện hợp đồng vì Backend chưa kết nối bộ kiểm tra hợp đồng. Lớp chưa được tạo hoặc gửi duyệt; vui lòng liên hệ quản trị viên.";
    }
    if (err.code === "TEACHER_CONTRACT_NOT_FOUND") {
      return "Bạn chưa có hợp đồng giảng dạy được ghi nhận. Vui lòng liên hệ quản trị viên để được hướng dẫn.";
    }
    if (err.code === "TEACHER_CONTRACT_NOT_ACTIVE") {
      return "Hợp đồng giảng dạy của bạn chưa ở trạng thái có hiệu lực. Vui lòng liên hệ quản trị viên.";
    }
    if (err.code === "TEACHER_CONTRACT_EXPIRED") {
      return "Hợp đồng giảng dạy của bạn đã hết hạn. Vui lòng liên hệ quản trị viên.";
    }
    if (err.code === "CLASS_NOT_ACTIVE") {
      return "Lớp học chưa được phê duyệt hoặc hiện không trong trạng thái hoạt động để mở phòng học.";
    }
    if (err.code === "CLASS_NOT_EDITABLE") {
      return "Lớp học hiện không thể chỉnh sửa ở trạng thái này.";
    }
    if (err.code === "ALREADY_VERIFIED") {
      return "Hồ sơ của bạn đã được xác minh thành công trước đó.";
    }
    if (err.code === "VERIFICATION_PENDING") {
      return "Hồ sơ xác minh của bạn đang trong quá trình xét duyệt.";
    }
    if (err.code === "VERIFICATION_NOT_PENDING") {
      return "Hồ sơ này hiện không ở trạng thái chờ duyệt.";
    }
    if (err.code === "TEACHER_NOT_FOUND") {
      return "Không tìm thấy hồ sơ giáo viên.";
    }
    if (err.code === "INVALID_FILE_URL") {
      return "Liên kết tài liệu đã hết hạn hoặc không hợp lệ. Vui lòng làm mới trang.";
    }
    if (err.code === "FILE_NOT_FOUND") {
      return "Không tìm thấy tệp tài liệu trên hệ thống.";
    }

    // Catalog, Course & CourseProposal errors
    if (err.code === "DUPLICATE_CATEGORY") {
      return "Danh mục với tên này đã tồn tại. Vui lòng chọn tên danh mục khác.";
    }
    if (err.code === "DUPLICATE_SUBJECT") {
      return "Môn học với tên này đã tồn tại trong danh mục đã chọn. Vui lòng chọn tên môn học khác.";
    }
    if (err.code === "DUPLICATE_COURSE") {
      return "Khóa học với tên này đã tồn tại trong môn học đã chọn. Vui lòng đặt tên khóa học khác.";
    }
    if (err.code === "DUPLICATE_SLUG") {
      return "Đường dẫn tĩnh (slug) đã tồn tại. Vui lòng đổi tên hoặc nhập slug khác.";
    }
    if (err.code === "GRADE_LEVEL_CATEGORY_MISMATCH") {
      return "Khối lớp đã chọn không thuộc phạm vi khối lớp của danh mục này. Vui lòng chọn lại khối lớp phù hợp.";
    }
    if (err.code === "INVALID_GRADE_LEVEL") {
      return "Khối lớp không hợp lệ. Vui lòng chọn khối lớp theo danh sách chuẩn.";
    }
    if (err.code === "SUBJECT_CATEGORY_MISMATCH") {
      return "Môn học đã chọn không thuộc danh mục tương ứng. Vui lòng chọn lại môn học.";
    }
    if (err.code === "COURSE_PROPOSAL_NOT_PENDING") {
      return "Đề xuất khóa học này không còn ở trạng thái chờ duyệt. Vui lòng làm mới danh sách.";
    }
    if (err.code === "COURSE_PROPOSAL_NOT_EDITABLE") {
      return "Đề xuất khóa học này hiện không thể chỉnh sửa.";
    }
    if (err.code === "COURSE_PROPOSAL_NOT_FOUND") {
      return "Không tìm thấy đề xuất khóa học yêu cầu.";
    }
    if (err.code === "COURSE_NOT_FOUND") {
      return "Không tìm thấy khóa học hoặc khóa học đã tạm ngưng hoạt động.";
    }
    if (err.code === "COURSE_HAS_DEPENDENCIES") {
      return "Khóa học đã có lớp học hoặc dữ liệu nghiệp vụ liên quan nên không thể xóa. Vui lòng chuyển khóa học sang trạng thái Tạm ngưng (INACTIVE).";
    }
    if (err.code === "COURSE_NOT_ACTIVE") {
      return "Khóa học này hiện không ở trạng thái Hoạt động (ACTIVE) nên không thể sử dụng để tạo hoặc duyệt lớp học mới.";
    }
    if (err.code === "CATEGORY_NOT_FOUND") {
      return "Không tìm thấy danh mục yêu cầu.";
    }
    if (err.code === "SUBJECT_NOT_FOUND") {
      return "Không tìm thấy môn học yêu cầu.";
    }

    // Status codes
    if (err.status === 401) {
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    }
    if (err.status === 403) {
      return "Bạn không có quyền thực hiện hành động này.";
    }
    if (err.status === 404) {
      return "Không tìm thấy dữ liệu yêu cầu.";
    }

    // Validation error details or safe message
    if (err.code === "VALIDATION_ERROR" && err.message) {
      return err.message;
    }

    if (err.code === "NETWORK_ERROR") {
      return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.";
    }

    if (err.message && err.message !== "An unexpected error occurred") {
      return err.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

/** Login/register: a 401 there means wrong credentials, not an expired session. */
export function getAuthErrorMessage(error: unknown, fallbackMessage = "Đã xảy ra lỗi. Vui lòng thử lại."): string {
  const err = (error ?? {}) as { code?: string; status?: number; message?: string };
  if (err.status === 401 || err.code === "UNAUTHORIZED") {
    return "Email hoặc mật khẩu không chính xác.";
  }
  if (err.code === "VALIDATION_ERROR") {
    return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại email và mật khẩu (tối thiểu 8 ký tự).";
  }
  return getFriendlyErrorMessage(error, fallbackMessage);
}
