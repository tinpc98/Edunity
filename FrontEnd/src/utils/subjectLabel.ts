/** Legacy catalog names are also used as teaching-profile values. Format them for display only. */
export function formatSubjectLabel(name: string | null | undefined, slug?: string, categoryName?: string | null): string {
  const label = name ?? "";
  const normalized = label.trim().normalize("NFC").toLocaleLowerCase("vi");
  const isHighSchool = categoryName?.trim().normalize("NFC").toLocaleLowerCase("vi") === "trung học phổ thông";
  if ((slug === "ly-thpt" || (!slug && isHighSchool)) && normalized === "vật lý") return "Vật lý THPT";
  if ((slug === "hoa-thpt" || (!slug && isHighSchool)) && (normalized === "hóa học" || normalized === "hoá học")) {
    return "Hóa học THPT";
  }
  return label;
}
