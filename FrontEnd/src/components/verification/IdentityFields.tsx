import { useEffect, useState } from "react";
import { Alert, DatePicker, Form, Input } from "antd";
import dayjs from "dayjs";
import { readCccdQrFromImage } from "../../utils/cccdQr";

type QrStatus = "idle" | "reading" | "filled" | "failed";

/**
 * Identity as printed on the CCCD (BAO-02). Rendered inside a parent <Form>; values live under `identity`.
 * Given the photo of the card's front, it reads the QR code (in the browser) and fills only the fields still empty,
 * so nothing the teacher typed is overwritten. The teacher still checks and submits; the server verifies as before.
 */
export default function IdentityFields({ frontImage }: { frontImage?: File | null }) {
  const form = Form.useFormInstance();
  // Outcome of the last finished read, tied to its photo: any other photo is still being read
  const [result, setResult] = useState<{ file: File; status: "filled" | "failed" } | null>(null);
  const qrStatus: QrStatus = !frontImage ? "idle" : result?.file === frontImage ? result.status : "reading";

  useEffect(() => {
    if (!frontImage) return;
    let cancelled = false; // a newer photo wins over a slower read of the previous one
    readCccdQrFromImage(frontImage)
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setResult({ file: frontImage, status: "failed" });
          return;
        }
        const values = {
          fullName: data.fullName,
          idNumber: data.idNumber,
          dateOfBirth: dayjs(data.dateOfBirth),
          address: data.address,
          issueDate: data.issueDate ? dayjs(data.issueDate) : undefined,
        };
        const current = form.getFieldValue("identity") ?? {};
        const empty = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim());
        const fill = Object.fromEntries(
          Object.entries(values).filter(([key, value]) => value !== undefined && empty(current[key]))
        );
        form.setFieldsValue({ identity: fill });
        setResult({ file: frontImage, status: "filled" });
      });
    return () => {
      cancelled = true;
    };
  }, [frontImage, form]);

  return (
    <div className="grid gap-x-4 md:grid-cols-2">
      {qrStatus !== "idle" && (
        <Alert
          className="md:col-span-2 !mb-3"
          showIcon
          type={qrStatus === "filled" ? "success" : qrStatus === "failed" ? "warning" : "info"}
          message={
            qrStatus === "reading"
              ? "Đang đọc mã QR trên CCCD..."
              : qrStatus === "filled"
                ? "Đã điền từ mã QR trên CCCD, vui lòng kiểm tra lại. Ô \"Có giá trị đến\" cần nhập tay."
                : "Không đọc được mã QR trên ảnh mặt trước, vui lòng nhập tay (hoặc chụp lại rõ nét, đủ góc có mã QR)."
          }
        />
      )}
      <Form.Item
        label="Họ và tên (đúng như trên CCCD)"
        name={["identity", "fullName"]}
        rules={[{ required: true, whitespace: true, message: "Vui lòng nhập họ tên." }, { max: 100 }]}
      >
        <Input autoComplete="name" />
      </Form.Item>
      <Form.Item
        label="Số CCCD"
        name={["identity", "idNumber"]}
        rules={[
          { required: true, message: "Vui lòng nhập số CCCD." },
          { pattern: /^\d{12}$/, message: "Số CCCD gồm đúng 12 chữ số." },
        ]}
      >
        <Input inputMode="numeric" maxLength={12} autoComplete="off" />
      </Form.Item>
      <Form.Item label="Ngày sinh" name={["identity", "dateOfBirth"]} rules={[{ required: true, message: "Vui lòng chọn ngày sinh." }]}>
        <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d.isAfter(dayjs().subtract(18, "year"))} />
      </Form.Item>
      <Form.Item label="Ngày cấp" name={["identity", "issueDate"]}>
        <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d.isAfter(dayjs())} />
      </Form.Item>
      <Form.Item
        className="md:col-span-2"
        label="Nơi thường trú (đúng như trên CCCD)"
        name={["identity", "address"]}
        rules={[{ required: true, whitespace: true, message: "Vui lòng nhập nơi thường trú." }, { max: 300 }]}
      >
        <Input autoComplete="street-address" />
      </Form.Item>
      <Form.Item label="Có giá trị đến (để trống nếu không thời hạn)" name={["identity", "expiryDate"]}>
        <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d.isBefore(dayjs(), "day")} />
      </Form.Item>
      <p className="md:col-span-2 text-xs text-slate-500 -mt-2 mb-3">
        Số CCCD và địa chỉ được mã hoá khi lưu; chỉ quản trị viên xác minh mới xem được và mỗi lần xem đều được ghi lại.
      </p>
    </div>
  );
}
