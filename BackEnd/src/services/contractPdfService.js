const crypto = require("crypto");
const fs = require("fs");
const zlib = require("zlib");
const {
  TEMPLATE_VERSION,
  CONTRACT_TITLE,
  REVENUE_SHARING_TERMS,
  getCompanyConfig,
  formatDateVN,
  formatDateTimeVN,
} = require("./contractTemplateService");

/**
 * Pure Node.js Multi-Page Vietnamese PDF Generator for Edunity eContracts.
 *
 * - Embeds system TrueType fonts (Times New Roman / Arial) via PDF Type0 + CIDFontType2 (/Identity-H)
 *   with a /ToUnicode CMap so full Vietnamese diacritics render accurately in any PDF reader
 *   without requiring external npm dependencies or headless Chromium binaries.
 * - Falls back gracefully to a built-in ASCII-normalized Type1 font if no system TrueType font is present.
 * - Embeds the Teacher's drawn PNG signature image directly into the Party B signature box when provided.
 */

const FONT_CANDIDATES_REGULAR = [
  "C:/Windows/Fonts/times.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
];

const FONT_CANDIDATES_BOLD = [
  "C:/Windows/Fonts/timesbd.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
];

let cachedFontPair = undefined;

function parseTtf(buffer) {
  const numTables = buffer.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    const tag = buffer.toString("ascii", offset, offset + 4);
    tables[tag] = {
      offset: buffer.readUInt32BE(offset + 8),
      length: buffer.readUInt32BE(offset + 12),
    };
  }
  if (!tables.head || !tables.hhea || !tables.maxp || !tables.hmtx || !tables.cmap) {
    throw new Error("Incomplete TTF tables");
  }

  const head = tables.head.offset;
  const unitsPerEm = buffer.readUInt16BE(head + 18);
  const xMin = Math.round((buffer.readInt16BE(head + 36) * 1000) / unitsPerEm);
  const yMin = Math.round((buffer.readInt16BE(head + 38) * 1000) / unitsPerEm);
  const xMax = Math.round((buffer.readInt16BE(head + 40) * 1000) / unitsPerEm);
  const yMax = Math.round((buffer.readInt16BE(head + 42) * 1000) / unitsPerEm);

  const hhea = tables.hhea.offset;
  const ascent = Math.round((buffer.readInt16BE(hhea + 4) * 1000) / unitsPerEm);
  const descent = Math.round((buffer.readInt16BE(hhea + 6) * 1000) / unitsPerEm);
  const numHMetrics = buffer.readUInt16BE(hhea + 34);

  const maxp = tables.maxp.offset;
  const numGlyphs = buffer.readUInt16BE(maxp + 4);

  const hmtx = tables.hmtx.offset;
  const widths = new Uint16Array(numGlyphs);
  const lastMetricOffset = hmtx + (numHMetrics - 1) * 4;
  const lastAdvance = Math.round((buffer.readUInt16BE(lastMetricOffset) * 1000) / unitsPerEm);
  for (let gid = 0; gid < numGlyphs; gid++) {
    if (gid < numHMetrics) {
      widths[gid] = Math.round((buffer.readUInt16BE(hmtx + gid * 4) * 1000) / unitsPerEm);
    } else {
      widths[gid] = lastAdvance;
    }
  }

  // Parse cmap format 4 (Windows Unicode BMP: platform 3, encoding 1 or platform 0)
  const cmapOffset = tables.cmap.offset;
  const numSubtables = buffer.readUInt16BE(cmapOffset + 2);
  let format4Offset = null;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platformId = buffer.readUInt16BE(rec);
    const encodingId = buffer.readUInt16BE(rec + 2);
    const subOffset = cmapOffset + buffer.readUInt32BE(rec + 4);
    const format = buffer.readUInt16BE(subOffset);
    if (format === 4 && ((platformId === 3 && encodingId === 1) || platformId === 0)) {
      format4Offset = subOffset;
      if (platformId === 3 && encodingId === 1) break;
    }
  }
  if (!format4Offset) throw new Error("No format 4 Unicode cmap found");

  const segCountX2 = buffer.readUInt16BE(format4Offset + 6);
  const segCount = segCountX2 / 2;
  const endCodesOffset = format4Offset + 14;
  const startCodesOffset = endCodesOffset + segCountX2 + 2;
  const idDeltasOffset = startCodesOffset + segCountX2;
  const idRangeOffsetsOffset = idDeltasOffset + segCountX2;

  const segments = [];
  for (let i = 0; i < segCount; i++) {
    segments.push({
      endCode: buffer.readUInt16BE(endCodesOffset + i * 2),
      startCode: buffer.readUInt16BE(startCodesOffset + i * 2),
      idDelta: buffer.readInt16BE(idDeltasOffset + i * 2),
      idRangeOffset: buffer.readUInt16BE(idRangeOffsetsOffset + i * 2),
      rangeOffsetPos: idRangeOffsetsOffset + i * 2,
    });
  }

  const charToGidCache = new Map();
  const charToGid = (codePoint) => {
    if (charToGidCache.has(codePoint)) return charToGidCache.get(codePoint);
    let gid = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (codePoint <= seg.endCode) {
        if (codePoint >= seg.startCode) {
          if (seg.idRangeOffset === 0) {
            gid = (codePoint + seg.idDelta) & 0xffff;
          } else {
            const glyphIndexAddress =
              seg.rangeOffsetPos + seg.idRangeOffset + (codePoint - seg.startCode) * 2;
            if (glyphIndexAddress + 2 <= buffer.length) {
              const rawGid = buffer.readUInt16BE(glyphIndexAddress);
              if (rawGid !== 0) {
                gid = (rawGid + seg.idDelta) & 0xffff;
              }
            }
          }
        }
        break;
      }
    }
    charToGidCache.set(codePoint, gid);
    return gid;
  };

  return {
    compressedTtf: zlib.deflateSync(buffer),
    originalLength: buffer.length,
    bbox: [xMin, yMin, xMax, yMax],
    ascent,
    descent,
    widths,
    charToGid,
  };
}

function loadFontPair() {
  if (cachedFontPair !== undefined) return cachedFontPair;
  try {
    const regPath = FONT_CANDIDATES_REGULAR.find((p) => fs.existsSync(p));
    const boldPath = FONT_CANDIDATES_BOLD.find((p) => fs.existsSync(p)) || regPath;
    if (!regPath) {
      cachedFontPair = null;
      return null;
    }
    cachedFontPair = {
      regular: parseTtf(fs.readFileSync(regPath)),
      bold: parseTtf(fs.readFileSync(boldPath)),
    };
    return cachedFontPair;
  } catch {
    cachedFontPair = null;
    return null;
  }
}

/**
 * Decodes a base64 PNG data URL (from HTML5 Canvas signature pad) into raw RGB + Alpha buffers for PDF XObject embedding.
 * Supports standard 8-bit RGBA (colorType 6) and 8-bit RGB (colorType 2) PNGs.
 */
function decodePngDataUrl(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return null;
    const buf = Buffer.from(match[1], "base64");
    if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idatChunks = [];
    let offset = 8;

    while (offset + 8 <= buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      const dataStart = offset + 8;
      const dataEnd = dataStart + len;
      if (dataEnd > buf.length) break;

      if (type === "IHDR") {
        width = buf.readUInt32BE(dataStart);
        height = buf.readUInt32BE(dataStart + 4);
        bitDepth = buf[dataStart + 8];
        colorType = buf[dataStart + 9];
      } else if (type === "IDAT") {
        idatChunks.push(buf.subarray(dataStart, dataEnd));
      } else if (type === "IEND") {
        break;
      }
      offset = dataEnd + 4;
    }

    if (!width || !height || width > 1600 || height > 1000 || bitDepth !== 8) return null;
    if (colorType !== 6 && colorType !== 2) return null;

    const bpp = colorType === 6 ? 4 : 3;
    const stride = width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    if (raw.length < height * (stride + 1)) return null;

    const recon = Buffer.alloc(height * stride);
    const paeth = (a, b, c) => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      if (pa <= pb && pa <= pc) return a;
      if (pb <= pc) return b;
      return c;
    };

    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const rowIn = y * (stride + 1) + 1;
      const rowOut = y * stride;
      for (let x = 0; x < stride; x++) {
        const byte = raw[rowIn + x];
        const left = x >= bpp ? recon[rowOut + x - bpp] : 0;
        const up = y > 0 ? recon[rowOut - stride + x] : 0;
        const upLeft = y > 0 && x >= bpp ? recon[rowOut - stride + x - bpp] : 0;
        let val = byte;
        if (filter === 1) val = (byte + left) & 0xff;
        else if (filter === 2) val = (byte + up) & 0xff;
        else if (filter === 3) val = (byte + ((left + up) >> 1)) & 0xff;
        else if (filter === 4) val = (byte + paeth(left, up, upLeft)) & 0xff;
        recon[rowOut + x] = val;
      }
    }

    // Flatten onto a white background so the signature renders cleanly without needing an SMask
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const r = recon[i * bpp];
      const g = recon[i * bpp + 1];
      const b = recon[i * bpp + 2];
      const a = colorType === 6 ? recon[i * bpp + 3] / 255 : 1;
      rgb[i * 3] = Math.round(r * a + 255 * (1 - a));
      rgb[i * 3 + 1] = Math.round(g * a + 255 * (1 - a));
      rgb[i * 3 + 2] = Math.round(b * a + 255 * (1 - a));
    }

    return {
      width,
      height,
      compressedRgb: zlib.deflateSync(rgb),
    };
  } catch {
    return null;
  }
}

const stripDiacritics = (str) =>
  String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7E]/g, " ");

function measureTextPt(text, fontSize, fontMeta) {
  if (!fontMeta) return String(text || "").length * fontSize * 0.52;
  let total = 0;
  for (const ch of String(text || "")) {
    const cp = ch.codePointAt(0);
    const gid = fontMeta.charToGid(cp);
    const w = fontMeta.widths[gid] || 500;
    total += (w / 1000) * fontSize;
  }
  return total;
}

function wrapParagraph(text, maxWidthPt, fontSize, fontMeta) {
  const lines = [];
  const rawLines = String(text || "").split(/\r?\n/);
  for (const rawLine of rawLines) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (measureTextPt(candidate, fontSize, fontMeta) <= maxWidthPt) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

function buildToUnicodeCMap(gidToCodePoint) {
  const entries = [...gidToCodePoint.entries()].sort((a, b) => a[0] - b[0]);
  const bfchars = entries
    .map(
      ([gid, cp]) =>
        `<${gid.toString(16).padStart(4, "0").toUpperCase()}> <${cp
          .toString(16)
          .padStart(4, "0")
          .toUpperCase()}>`
    )
    .join("\n");

  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${entries.length} beginbfchar
${bfchars}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

/**
 * Generates the complete A4 multi-page contract PDF buffer and its SHA-256 hash.
 */
const generateContractPdf = async ({
  snapshot,
  status = "PENDING_SIGNATURE",
  signature = null,
}) => {
  const snap = snapshot || {};
  const company = snap.company || getCompanyConfig();
  const teacher = snap.teacher || {};
  const revenue = snap.revenueSharing || REVENUE_SHARING_TERMS;
  const clauses = Array.isArray(snap.clauses) ? snap.clauses : [];
  const legalBasis = Array.isArray(snap.legalBasis) ? snap.legalBasis : [];
  const isSigned = Boolean(signature && signature.signedAt) || status === "ACTIVE" || status === "SIGNED";

  // Use lightweight Type1 mode during Jest test runs so 100+ test cases run in milliseconds,
  // while embedding full Unicode TrueType fonts in development/production or when FULL_PDF_FONT=true.
  const useUnicodeTtf =
    process.env.FULL_PDF_FONT === "true" || process.env.NODE_ENV !== "test";
  const fontPair = useUnicodeTtf ? loadFontPair() : null;

  const usedGidsRegular = new Map();
  const usedGidsBold = new Map();

  const encodePdfText = (text, isBold = false) => {
    const clean = String(text || "").replace(/\s+/g, " ");
    if (!fontPair) {
      const ascii = stripDiacritics(clean)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
      return `(${ascii})`;
    }
    const font = isBold ? fontPair.bold : fontPair.regular;
    const usedMap = isBold ? usedGidsBold : usedGidsRegular;
    let hex = "";
    for (const ch of clean) {
      const cp = ch.codePointAt(0);
      const gid = font.charToGid(cp);
      usedMap.set(gid, cp);
      hex += gid.toString(16).padStart(4, "0").toUpperCase();
    }
    return `<${hex}>`;
  };

  // Page geometry (A4: 595.28 x 841.89 pt)
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_X = 48;
  const MARGIN_TOP = 52;
  const MARGIN_BOTTOM = 56;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  const pages = [[]];
  let currentY = PAGE_H - MARGIN_TOP;

  const currentPage = () => pages[pages.length - 1];
  const ensureSpace = (neededPt) => {
    if (currentY - neededPt < MARGIN_BOTTOM) {
      pages.push([]);
      currentY = PAGE_H - MARGIN_TOP;
    }
  };

  const drawLine = (x1, y1, x2, y2, width = 0.7, rgb = "0.06 0.46 0.43") => {
    currentPage().push(`q ${width} w ${rgb} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  };

  const drawRect = (x, y, w, h, strokeRgb = "0.82 0.85 0.86", fillRgb = null, lineWidth = 0.8) => {
    if (fillRgb) {
      currentPage().push(
        `q ${lineWidth} w ${strokeRgb} RG ${fillRgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`
      );
    } else {
      currentPage().push(
        `q ${lineWidth} w ${strokeRgb} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S Q`
      );
    }
  };

  const drawText = (text, x, y, { size = 10.5, bold = false, color = "0.07 0.09 0.15", align = "left", maxWidth = CONTENT_W } = {}) => {
    const fontMeta = fontPair ? (bold ? fontPair.bold : fontPair.regular) : null;
    const w = measureTextPt(text, size, fontMeta);
    let drawX = x;
    if (align === "center") drawX = x + Math.max(0, (maxWidth - w) / 2);
    else if (align === "right") drawX = x + Math.max(0, maxWidth - w);
    const fontRef = bold ? "/F2" : "/F1";
    currentPage().push(
      `BT ${fontRef} ${size} Tf ${color} rg 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm ${encodePdfText(text, bold)} Tj ET`
    );
  };

  const writeWrapped = (text, { size = 10.5, bold = false, color = "0.07 0.09 0.15", indent = 0, lineGap = 4.5, paragraphGap = 4 } = {}) => {
    const fontMeta = fontPair ? (bold ? fontPair.bold : fontPair.regular) : null;
    const lines = wrapParagraph(text, CONTENT_W - indent, size, fontMeta);
    for (const line of lines) {
      ensureSpace(size + lineGap);
      if (line) {
        drawText(line, MARGIN_X + indent, currentY, { size, bold, color });
      }
      currentY -= size + lineGap;
    }
    currentY -= paragraphGap;
  };

  // --- 1. Header Công ty & Quốc hiệu ---
  drawText(company.companyName.toUpperCase(), MARGIN_X, currentY, {
    size: 11,
    bold: true,
    color: "0.06 0.46 0.43",
  });
  drawText("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", MARGIN_X + 210, currentY, {
    size: 10.5,
    bold: true,
    align: "center",
    maxWidth: CONTENT_W - 210,
  });
  currentY -= 14;

  drawText("Nền tảng Kết nối Dạy và Học Trực tuyến Edunity", MARGIN_X, currentY, {
    size: 9.5,
    color: "0.35 0.40 0.45",
  });
  drawText("Độc lập - Tự do - Hạnh phúc", MARGIN_X + 210, currentY, {
    size: 10.5,
    bold: true,
    align: "center",
    maxWidth: CONTENT_W - 210,
  });
  currentY -= 14;

  drawText(`Số hợp đồng: ${snap.contractCode || "—"}`, MARGIN_X, currentY, {
    size: 9.5,
    bold: true,
    color: "0.20 0.25 0.30",
  });
  drawLine(MARGIN_X, currentY - 6, PAGE_W - MARGIN_X, currentY - 6, 1.2, "0.06 0.46 0.43");
  currentY -= 24;

  // --- 2. Tiêu đề hợp đồng ---
  drawText(snap.contractTitle || CONTRACT_TITLE, MARGIN_X, currentY, {
    size: 15,
    bold: true,
    align: "center",
    color: "0.06 0.23 0.25",
  });
  currentY -= 16;

  drawText(
    `Mã hợp đồng: ${snap.contractCode || "—"}  |  Ngày tạo: ${formatDateVN(snap.capturedAt)}  |  Mã xác minh: ${snap.verificationCode || "—"}`,
    MARGIN_X,
    currentY,
    { size: 9.5, color: "0.30 0.35 0.40", align: "center" }
  );
  currentY -= 18;

  // --- 3. Căn cứ pháp lý ---
  for (const basis of legalBasis) {
    writeWrapped(`- ${basis}`, { size: 9.8, color: "0.20 0.25 0.30", lineGap: 3.5, paragraphGap: 2 });
  }
  currentY -= 4;

  // --- 4. Thông tin Bên A ---
  ensureSpace(115);
  const boxATop = currentY + 10;
  drawRect(MARGIN_X, boxATop - 102, CONTENT_W, 102, "0.80 0.88 0.86", "0.96 0.99 0.98", 0.9);
  drawText(`BÊN A: ${company.companyName.toUpperCase()}`, MARGIN_X + 10, currentY - 4, {
    size: 10.5,
    bold: true,
    color: "0.06 0.46 0.43",
  });
  currentY -= 18;
  drawText(`Người đại diện: ${company.representativeName}   |   Chức vụ: ${company.representativeTitle}`, MARGIN_X + 10, currentY, {
    size: 9.8,
    bold: true,
  });
  currentY -= 14;
  drawText(`Mã số thuế: ${company.taxCode}`, MARGIN_X + 10, currentY, { size: 9.5 });
  currentY -= 14;
  drawText(`Địa chỉ trụ sở: ${company.address}`, MARGIN_X + 10, currentY, { size: 9.5 });
  currentY -= 14;
  drawText(`Email: ${company.email}   |   Điện thoại: ${company.phone}   |   Website: ${company.website}`, MARGIN_X + 10, currentY, {
    size: 9.5,
  });
  currentY = boxATop - 114;

  // --- 5. Thông tin Bên B (Giáo viên) ---
  ensureSpace(135);
  const boxBTop = currentY + 10;
  drawRect(MARGIN_X, boxBTop - 122, CONTENT_W, 122, "0.80 0.88 0.86", "0.98 0.99 1.00", 0.9);
  drawText(`BÊN B: GIÁO VIÊN CỘNG TÁC — ${(teacher.fullName || "").toUpperCase()}`, MARGIN_X + 10, currentY - 4, {
    size: 10.5,
    bold: true,
    color: "0.06 0.46 0.43",
  });
  currentY -= 18;
  drawText(
    `Họ và tên: ${teacher.fullName || "—"}   |   Mã giáo viên (Teacher ID): ${teacher.teacherCode || "—"} (${teacher.teacherId || "—"})`,
    MARGIN_X + 10,
    currentY,
    { size: 9.8, bold: true }
  );
  currentY -= 14;
  drawText(
    `Ngày sinh: ${teacher.dateOfBirth ? formatDateVN(teacher.dateOfBirth) : "Theo hồ sơ định danh"}   |   Số CCCD: ${
      teacher.idNumberMasked || "Đã xác minh trên hệ thống"
    }`,
    MARGIN_X + 10,
    currentY,
    { size: 9.5 }
  );
  currentY -= 14;
  drawText(
    `Email: ${teacher.email || "—"}   |   Số điện thoại: ${teacher.phone || "Theo hồ sơ tài khoản đã xác minh"}`,
    MARGIN_X + 10,
    currentY,
    { size: 9.5 }
  );
  currentY -= 14;
  drawText(`Địa chỉ liên hệ: ${teacher.addressMasked || "Theo hồ sơ định danh đã xác minh"}`, MARGIN_X + 10, currentY, {
    size: 9.5,
  });
  currentY -= 14;
  const specText = `Chuyên môn giảng dạy: ${teacher.specialtySummary || teacher.qualificationSummary || "Theo hồ sơ đã xác minh"}`.slice(
    0,
    115
  );
  drawText(specText, MARGIN_X + 10, currentY, { size: 9.5 });
  currentY = boxBTop - 134;

  // --- 6. Hộp tóm tắt Phân chia doanh thu 90% / 10% ---
  ensureSpace(68);
  const revBoxTop = currentY + 8;
  drawRect(MARGIN_X, revBoxTop - 58, CONTENT_W, 58, "0.05 0.58 0.53", "0.94 0.99 0.98", 1.1);
  drawText("THỎA THUẬN PHÂN CHIA DOANH THU CHÍNH THỨC (90% / 10%)", MARGIN_X + 10, currentY - 4, {
    size: 10,
    bold: true,
    color: "0.06 0.46 0.43",
  });
  currentY -= 16;
  drawText(
    `• Giáo viên (Bên B) nhận: ${revenue.teacherSharePercent}% doanh thu đủ điều kiện thực tế Edunity thu được từ khóa học của Giáo viên.`,
    MARGIN_X + 10,
    currentY,
    { size: 9.5, bold: true }
  );
  currentY -= 14;
  drawText(
    `• Edunity (Bên A) nhận: ${revenue.platformSharePercent}% trên cùng cơ sở doanh thu đủ điều kiện thực tế đó. Hiệu lực: ${formatDateVN(
      snap.effectiveFrom
    )} - ${formatDateVN(snap.expiresAt)}.`,
    MARGIN_X + 10,
    currentY,
    { size: 9.5 }
  );
  currentY = revBoxTop - 70;

  // --- 7. Các điều khoản hợp đồng (Điều 1 -> Điều 9) ---
  for (const clause of clauses) {
    ensureSpace(36);
    writeWrapped(clause.title, {
      size: 11,
      bold: true,
      color: "0.06 0.46 0.43",
      lineGap: 4,
      paragraphGap: 3,
    });
    for (const p of clause.paragraphs || []) {
      writeWrapped(p, { size: 10, bold: false, lineGap: 4.2, paragraphGap: 4 });
    }
    currentY -= 2;
  }

  // --- 8. Khu vực ký của Bên A và Bên B ---
  ensureSpace(175);
  currentY -= 6;
  const sigTop = currentY;
  const colW = (CONTENT_W - 14) / 2;
  const boxH = 148;
  const leftX = MARGIN_X;
  const rightX = MARGIN_X + colW + 14;

  drawRect(leftX, sigTop - boxH, colW, boxH, "0.80 0.85 0.88", "0.99 0.99 1.00", 0.9);
  drawRect(rightX, sigTop - boxH, colW, boxH, "0.80 0.85 0.88", "0.99 0.99 1.00", 0.9);

  // Party A signature block
  drawText("ĐẠI DIỆN BÊN A", leftX, sigTop - 18, {
    size: 10.5,
    bold: true,
    align: "center",
    maxWidth: colW,
  });
  drawText(company.companyName, leftX, sigTop - 32, {
    size: 9.5,
    color: "0.35 0.40 0.45",
    align: "center",
    maxWidth: colW,
  });
  drawRect(leftX + 20, sigTop - 94, colW - 40, 48, "0.05 0.58 0.53", "0.94 0.99 0.98", 1);
  drawText("ĐÃ PHÊ DUYỆT & PHÁT HÀNH ĐIỆN TỬ", leftX + 20, sigTop - 58, {
    size: 8.5,
    bold: true,
    color: "0.06 0.46 0.43",
    align: "center",
    maxWidth: colW - 40,
  });
  drawText(`Ngày phát hành: ${formatDateVN(snap.capturedAt)}`, leftX + 20, sigTop - 72, {
    size: 8.2,
    color: "0.06 0.46 0.43",
    align: "center",
    maxWidth: colW - 40,
  });
  drawText("Hệ thống eContract Nội bộ Edunity", leftX + 20, sigTop - 85, {
    size: 8,
    color: "0.25 0.35 0.35",
    align: "center",
    maxWidth: colW - 40,
  });
  drawText(company.representativeName, leftX, sigTop - 116, {
    size: 10.5,
    bold: true,
    align: "center",
    maxWidth: colW,
  });
  drawText(company.representativeTitle, leftX, sigTop - 130, {
    size: 9,
    color: "0.35 0.40 0.45",
    align: "center",
    maxWidth: colW,
  });

  // Party B signature block
  drawText("ĐẠI DIỆN BÊN B (GIÁO VIÊN)", rightX, sigTop - 18, {
    size: 10.5,
    bold: true,
    align: "center",
    maxWidth: colW,
  });
  drawText("Ký xác nhận điện tử trên Edunity", rightX, sigTop - 32, {
    size: 9.5,
    color: "0.35 0.40 0.45",
    align: "center",
    maxWidth: colW,
  });

  const decodedSigPng =
    isSigned && signature && signature.signatureDataUrl
      ? decodePngDataUrl(signature.signatureDataUrl)
      : null;

  if (isSigned) {
    if (decodedSigPng) {
      // Draw the drawn signature image XObject /ImSig inside Party B box
      const imgW = 110;
      const imgH = 34;
      const imgX = rightX + (colW - imgW) / 2;
      const imgY = sigTop - 74;
      currentPage().push(
        `q ${imgW.toFixed(2)} 0 0 ${imgH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm /ImSig Do Q`
      );
      drawText(
        `Đã ký điện tử: ${formatDateTimeVN(signature && signature.signedAt)}`,
        rightX + 10,
        sigTop - 88,
        { size: 8, bold: true, color: "0.06 0.46 0.43", align: "center", maxWidth: colW - 20 }
      );
      drawText(
        `Phương thức: ${(signature && signature.signingMethod) || "DRAWN_SIGNATURE"}`,
        rightX + 10,
        sigTop - 99,
        { size: 7.8, color: "0.25 0.35 0.35", align: "center", maxWidth: colW - 20 }
      );
    } else {
      drawRect(rightX + 20, sigTop - 94, colW - 40, 48, "0.05 0.58 0.53", "0.94 0.99 0.98", 1);
      drawText("ĐÃ KÝ XÁC NHẬN ĐIỆN TỬ NỘI BỘ", rightX + 20, sigTop - 56, {
        size: 8.5,
        bold: true,
        color: "0.06 0.46 0.43",
        align: "center",
        maxWidth: colW - 40,
      });
      drawText(
        `Thời điểm ký: ${formatDateTimeVN(signature && signature.signedAt)}`,
        rightX + 20,
        sigTop - 70,
        { size: 8, color: "0.06 0.46 0.43", align: "center", maxWidth: colW - 40 }
      );
      drawText(
        `Người ký: ${(signature && (signature.signatureText || signature.signerName)) || teacher.fullName || "—"}`,
        rightX + 20,
        sigTop - 84,
        { size: 8, color: "0.20 0.30 0.30", align: "center", maxWidth: colW - 40 }
      );
    }
  } else {
    drawRect(rightX + 20, sigTop - 94, colW - 40, 48, "0.75 0.78 0.82", null, 0.8);
    drawText("CHỜ GIÁO VIÊN KÝ XÁC NHẬN", rightX + 20, sigTop - 64, {
      size: 8.5,
      bold: true,
      color: "0.45 0.48 0.52",
      align: "center",
      maxWidth: colW - 40,
    });
    drawText("(Trạng thái: PENDING_SIGNATURE)", rightX + 20, sigTop - 78, {
      size: 8,
      color: "0.45 0.48 0.52",
      align: "center",
      maxWidth: colW - 40,
    });
  }

  drawText(teacher.fullName || "Giáo viên", rightX, sigTop - 116, {
    size: 10.5,
    bold: true,
    align: "center",
    maxWidth: colW,
  });
  drawText(teacher.email || "", rightX, sigTop - 130, {
    size: 8.8,
    color: "0.35 0.40 0.45",
    align: "center",
    maxWidth: colW,
  });

  currentY = sigTop - boxH - 14;
  writeWrapped(
    `Thông tin xác minh: Mã hợp đồng ${snap.contractCode || "—"} | Mã xác minh ${
      snap.verificationCode || "—"
    } | Mẫu ${snap.templateVersion || TEMPLATE_VERSION} | Trạng thái: ${isSigned ? "SIGNED (ĐÃ KÝ)" : "PENDING_SIGNATURE (CHỜ KÝ)"}. Hợp đồng điện tử nội bộ Edunity (không phải chữ ký số CA-certified công cộng).`,
    { size: 8.5, color: "0.38 0.42 0.46", lineGap: 3, paragraphGap: 0 }
  );

  // Add footer with page numbers on every page
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const pIdx = i;
    const footerY = 26;
    const fontMeta = fontPair ? fontPair.regular : null;
    const footerText = `${snap.contractCode || "EDUNITY-ECONTRACT"}  •  Trang ${pIdx + 1}/${totalPages}`;
    const w = measureTextPt(footerText, 8.5, fontMeta);
    const x = MARGIN_X + (CONTENT_W - w) / 2;
    pages[pIdx].push(
      `q 0.5 w 0.85 0.88 0.90 RG ${MARGIN_X} 38 m ${PAGE_W - MARGIN_X} 38 l S Q`,
      `BT /F1 8.5 Tf 0.40 0.45 0.50 rg 1 0 0 1 ${x.toFixed(2)} ${footerY} Tm ${encodePdfText(footerText, false)} Tj ET`
    );
  }

  // --- Assemble PDF 1.4 binary ---
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const makeStreamObject = (dictEntries, bufferData) => {
    const header = Buffer.from(`<< ${dictEntries} /Length ${bufferData.length} >>\nstream\n`, "binary");
    const footer = Buffer.from("\nendstream", "binary");
    return Buffer.concat([header, bufferData, footer]);
  };

  let font1ObjId;
  let font2ObjId;

  if (fontPair) {
    const buildType0FontObjects = (font, usedMap, baseFontName) => {
      if (usedMap.size === 0) usedMap.set(0, 32);
      const fontFileObjId = addObject(
        makeStreamObject(
          `/Filter /FlateDecode /Length1 ${font.originalLength}`,
          font.compressedTtf
        )
      );
      const descriptorObjId = addObject(
        Buffer.from(
          `<< /Type /FontDescriptor /FontName /${baseFontName} /Flags 32 /FontBBox [${font.bbox.join(
            " "
          )}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${
            font.ascent
          } /StemV 80 /FontFile2 ${fontFileObjId} 0 R >>`,
          "binary"
        )
      );
      const widthPairs = [...usedMap.keys()]
        .sort((a, b) => a - b)
        .map((gid) => `${gid} [${font.widths[gid] || 500}]`)
        .join(" ");
      const cidFontObjId = addObject(
        Buffer.from(
          `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseFontName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorObjId} 0 R /DW 500 /W [${widthPairs}] /CIDToGIDMap /Identity >>`,
          "binary"
        )
      );
      const cmapBuf = zlib.deflateSync(Buffer.from(buildToUnicodeCMap(usedMap), "utf8"));
      const toUnicodeObjId = addObject(makeStreamObject(`/Filter /FlateDecode`, cmapBuf));
      return addObject(
        Buffer.from(
          `<< /Type /Font /Subtype /Type0 /BaseFont /${baseFontName} /Encoding /Identity-H /DescendantFonts [${cidFontObjId} 0 R] /ToUnicode ${toUnicodeObjId} 0 R >>`,
          "binary"
        )
      );
    };

    font1ObjId = buildType0FontObjects(fontPair.regular, usedGidsRegular, "EdunityTimesRegular");
    font2ObjId = buildType0FontObjects(fontPair.bold, usedGidsBold, "EdunityTimesBold");
  } else {
    font1ObjId = addObject(Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, "binary"));
    font2ObjId = addObject(Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`, "binary"));
  }

  let sigImageObjId = null;
  if (decodedSigPng) {
    sigImageObjId = addObject(
      makeStreamObject(
        `/Type /XObject /Subtype /Image /Width ${decodedSigPng.width} /Height ${decodedSigPng.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
        decodedSigPng.compressedRgb
      )
    );
  }

  const pagesTreeObjId = addObject(null); // placeholder
  const pageObjIds = [];

  for (const pageCommands of pages) {
    const contentStream = zlib.deflateSync(Buffer.from(pageCommands.join("\n"), "binary"));
    const contentObjId = addObject(makeStreamObject(`/Filter /FlateDecode`, contentStream));
    const xObjectDict = sigImageObjId ? `/XObject << /ImSig ${sigImageObjId} 0 R >>` : "";
    const pageObjId = addObject(
      Buffer.from(
        `<< /Type /Page /Parent ${pagesTreeObjId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font1ObjId} 0 R /F2 ${font2ObjId} 0 R >> ${xObjectDict} >> /Contents ${contentObjId} 0 R >>`,
        "binary"
      )
    );
    pageObjIds.push(pageObjId);
  }

  objects[pagesTreeObjId - 1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>`,
    "binary"
  );

  const catalogObjId = addObject(
    Buffer.from(`<< /Type /Catalog /Pages ${pagesTreeObjId} 0 R >>`, "binary")
  );
  const infoObjId = addObject(
    Buffer.from(
      `<< /Producer (Edunity Internal eContract Engine) /Title (${stripDiacritics(
        snap.contractCode || "Edunity Contract"
      )}) >>`,
      "binary"
    )
  );

  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  let byteOffset = chunks[0].length;
  const offsets = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteOffset);
    const objHeader = Buffer.from(`${i + 1} 0 obj\n`, "binary");
    const objBody = Buffer.isBuffer(objects[i]) ? objects[i] : Buffer.from(String(objects[i]), "binary");
    const objFooter = Buffer.from("\nendobj\n", "binary");
    chunks.push(objHeader, objBody, objFooter);
    byteOffset += objHeader.length + objBody.length + objFooter.length;
  }

  const xrefOffset = byteOffset;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  xrefLines.push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjId} 0 R /Info ${infoObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  chunks.push(Buffer.from(xrefLines.join(""), "binary"));

  const buffer = Buffer.concat(chunks);
  const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    buffer,
    sha256Hash,
    size: buffer.length,
    pageCount: pageObjIds.length,
    mimeType: "application/pdf",
  };
};

module.exports = {
  generateContractPdf,
  decodePngDataUrl,
};
