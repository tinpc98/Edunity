import { FetchError } from "../api/apiClient";

export function getFriendlyErrorMessage(error: unknown, fallbackMessage = "Có lỗi xảy ra. Vui lòng thử lại."): string {
  if (error instanceof FetchError || (typeof error === "object" && error !== null && ("code" in error || "status" in error))) {
    const err = error as { code?: string; status?: number; message?: string };
    
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
