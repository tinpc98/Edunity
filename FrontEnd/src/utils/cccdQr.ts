import jsQR from "jsqr";

/** Fields printed on the CCCD that its QR code carries. Expiry date is not in the QR. */
export interface CccdQrData {
  idNumber: string;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  address: string;
  issueDate: string | null; // YYYY-MM-DD
}

// "01051990" -> "1990-05-01"; null when it is not a real calendar date
const toIsoDate = (ddmmyyyy: string): string | null => {
  if (!/^\d{8}$/.test(ddmmyyyy)) return null;
  const [d, m, y] = [ddmmyyyy.slice(0, 2), ddmmyyyy.slice(2, 4), ddmmyyyy.slice(4)];
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.getUTCDate() === Number(d) && date.getUTCMonth() + 1 === Number(m) ? `${y}-${m}-${d}` : null;
};

/**
 * CCCD QR text: "số CCCD|số CMND cũ|Họ tên|ngày sinh ddmmyyyy|giới tính|nơi thường trú|ngày cấp ddmmyyyy[|...]".
 * Returns null unless the mandatory parts are well formed: autofill must never fill in a guess.
 */
export const parseCccdQr = (text: string): CccdQrData | null => {
  const parts = text.trim().split("|").map((part) => part.trim());
  if (parts.length < 7) return null;
  const [idNumber, , fullName, dob, , address, issued] = parts;
  const dateOfBirth = toIsoDate(dob);
  if (!/^\d{12}$/.test(idNumber) || !fullName || !dateOfBirth || !address) return null;
  return { idNumber, fullName, dateOfBirth, address, issueDate: toIsoDate(issued) };
};

const decodeText = (code: { binaryData: number[]; data: string }) => {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(code.binaryData));
  return utf8.includes("�") ? code.data : utf8; // Vietnamese names are UTF-8 bytes in the QR
};

// Square crops of the photo: the whole image first, then overlapping tiles (50% step) of 1/2 and 1/3 of the shorter side
const cropsFor = (width: number, height: number) => {
  const crops = [{ x: 0, y: 0, w: width, h: height }];
  for (const fraction of [0.5, 0.35]) {
    const side = Math.min(width, height) * fraction;
    for (let y = 0; y + side <= height + 1; y += side / 2)
      for (let x = 0; x + side <= width + 1; x += side / 2) crops.push({ x, y, w: side, h: side });
  }
  return crops;
};

/**
 * Finds the QR code in a photo of the CCCD front, entirely in the browser (the image is not sent anywhere).
 * In a phone photo the QR is small (a few px per module) and may sit in any corner if the card is rotated,
 * so each crop is resampled to TILE_PX before decoding: that is what made a real, sideways card photo readable.
 */
const TILE_PX = 800;
export const readCccdQrFromImage = async (file: File): Promise<CccdQrData | null> => {
  if (!file.type.startsWith("image/")) return null;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingQuality = "high";

    for (const crop of cropsFor(bitmap.width, bitmap.height)) {
      const scale = TILE_PX / Math.max(crop.w, crop.h);
      canvas.width = Math.round(crop.w * scale);
      canvas.height = Math.round(crop.h * scale);
      context.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      const parsed = code ? parseCccdQr(decodeText(code)) : null;
      if (parsed) return parsed;
      await new Promise((resolve) => setTimeout(resolve)); // let the page repaint between tiles
    }
    return null;
  } finally {
    bitmap.close();
  }
};
