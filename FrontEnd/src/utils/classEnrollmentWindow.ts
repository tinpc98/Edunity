interface RegistrationWindow {
  status: string;
  isFull: boolean;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
}

export function getEnrollmentBlock(item: RegistrationWindow, now: number): string | null {
  if (item.status === "COMPLETED") return "Đã kết thúc";
  if (item.status !== "OPEN") return "Đóng đăng ký";
  if (item.enrollmentStart && now < Date.parse(item.enrollmentStart)) return "Chưa mở đăng ký";
  if (item.enrollmentEnd && now > Date.parse(item.enrollmentEnd)) return "Đã hết hạn đăng ký";
  if (item.isFull) return "Đã đủ chỗ";
  return null;
}
