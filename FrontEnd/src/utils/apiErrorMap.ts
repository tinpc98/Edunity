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

    if (err.code === "MESSAGING_NOT_ALLOWED") {
      return "Bạn chỉ có thể nhắn tin cho học viên thuộc lớp của mình.";
    }

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

    // Verification errors
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
