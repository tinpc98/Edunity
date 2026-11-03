/** Mirrors BackEnd storageService: private documents are images or PDF, at most 10MB each. */
export const PRIVATE_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const PRIVATE_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
export const MAX_PRIVATE_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_ACCEPT = ".jpg,.jpeg,.png,.webp";
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/** Returns a user-facing error, or null when the file can be uploaded. */
export function validatePrivateDocument(file: { name: string; type?: string; size?: number }): string | null {
  if (!file.type || !PRIVATE_DOCUMENT_TYPES.includes(file.type)) {
    return `"${file.name}" không đúng định dạng. Chỉ chấp nhận PDF, JPG, PNG hoặc WebP.`;
  }
  if ((file.size ?? 0) > MAX_PRIVATE_DOCUMENT_SIZE) {
    return `"${file.name}" vượt quá dung lượng cho phép (tối đa 10MB).`;
  }
  return null;
}

/** Returns a user-facing error, or null when the avatar matches the public image contract. */
export function validateAvatar(file: { name: string; type?: string; size?: number }): string | null {
  if (!file.type || !AVATAR_TYPES.includes(file.type)) {
    return `"${file.name}" không đúng định dạng. Chỉ chấp nhận JPG, PNG hoặc WebP.`;
  }
  if ((file.size ?? 0) > MAX_AVATAR_SIZE) {
    return `"${file.name}" vượt quá dung lượng cho phép (tối đa 5MB).`;
  }
  return null;
}
