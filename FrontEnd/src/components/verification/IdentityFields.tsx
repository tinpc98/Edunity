import { DatePicker, Form, Input } from "antd";
import dayjs from "dayjs";

/** Identity as printed on the CCCD (BAO-02). Rendered inside a parent <Form>; values live under `identity`. */
export default function IdentityFields() {
  return (
    <div className="grid gap-x-4 md:grid-cols-2">
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
