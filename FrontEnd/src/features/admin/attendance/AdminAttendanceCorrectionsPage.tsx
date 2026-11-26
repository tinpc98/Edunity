import { useState } from "react";
import { Alert, App as AntdApp, Button, Card, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FetchError } from "../../../api/apiClient";
import { sessionKeys, sessionService } from "../../../services/session.service";
import {
  ATTENDANCE_CORRECTION_OPTIONS,
  ATTENDANCE_CORRECTION_STATUS_LABELS,
  ATTENDANCE_STATUS_LABELS,
} from "../../../types/session";
import type {
  AdminAttendanceCorrection,
  AttendanceCorrectionStatus,
  AttendanceReviewDecision,
  CorrectableAttendanceStatus,
} from "../../../types/session";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

type ReviewValues = {
  decision: AttendanceReviewDecision;
  attendanceStatus?: CorrectableAttendanceStatus;
  reviewNote: string;
};

const statusOptions = (Object.keys(ATTENDANCE_CORRECTION_STATUS_LABELS) as AttendanceCorrectionStatus[])
  .map((value) => ({ value, label: ATTENDANCE_CORRECTION_STATUS_LABELS[value] }));

export default function AdminAttendanceCorrectionsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AttendanceCorrectionStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminAttendanceCorrection | null>(null);
  const [form] = Form.useForm<ReviewValues>();
  const decision = Form.useWatch("decision", form);
  const requests = useQuery({
    queryKey: [...sessionKeys.corrections(), status, page],
    queryFn: () => sessionService.listAttendanceCorrections(status, page),
  });
  const review = useMutation({
    mutationFn: (values: ReviewValues) => sessionService.reviewAttendanceCorrection(
      selected!._id, selected!.correctionRequest._id, values
    ),
    onSuccess: async () => {
      setSelected(null);
      message.success("Đã xử lý yêu cầu điểm danh.");
      await queryClient.invalidateQueries({ queryKey: sessionKeys.corrections() });
    },
  });

  const error = review.error instanceof FetchError && review.error.code === "ATTENDANCE_EVIDENCE_INSUFFICIENT"
    ? "Nhật ký LiveKit chưa đủ để tính lại. Hãy đối chiếu lý do và chọn duyệt thủ công hoặc từ chối."
    : getFriendlyErrorMessage(review.error, "Không thể xử lý yêu cầu. Hãy tải lại danh sách và thử lại.");

  return (
    <div className="space-y-5">
      <h1 className="m-0 text-2xl font-bold">Điều chỉnh điểm danh</h1>
      <Card>
        <label htmlFor="attendance-correction-status" className="mr-3 font-medium">Trạng thái</label>
        <Select id="attendance-correction-status" className="mb-4 w-40" value={status} options={statusOptions}
          onChange={(value) => { setStatus(value); setPage(1); }} />
        {requests.isError && <Alert type="error" showIcon title="Không thể tải yêu cầu điểm danh."
          action={<Button size="small" onClick={() => requests.refetch()}>Thử lại</Button>} />}
        <Table<AdminAttendanceCorrection>
          rowKey="_id" dataSource={requests.data?.items ?? []} loading={requests.isPending}
          pagination={{
            current: page, pageSize: requests.data?.pageSize ?? 20, total: requests.data?.total ?? 0,
            onChange: setPage, showSizeChanger: false,
          }}
          scroll={{ x: 780 }} locale={{ emptyText: "Chưa có yêu cầu ở trạng thái này." }}
          columns={[
            { title: "Buổi học", key: "session", render: (_, item) => (
              <div><strong>{item.sessionId?.title || "Buổi học"}</strong><div>{item.classId?.className}</div></div>
            ) },
            { title: "Học viên", key: "student", render: (_, item) => item.studentId?.studentProfile?.fullName || "Học viên" },
            { title: "Kết quả hiện tại", key: "status", render: (_, item) => ATTENDANCE_STATUS_LABELS[item.attendanceStatus] },
            { title: "Đề xuất", key: "proposed", render: (_, item) => ATTENDANCE_STATUS_LABELS[item.correctionRequest.requestedStatus] },
            { title: "Thao tác", key: "action", render: (_, item) => (
              <Button onClick={() => { review.reset(); setSelected(item); }}>
                {item.correctionRequest.status === "PENDING" ? "Xem và duyệt" : "Xem kết quả"}
              </Button>
            ) },
          ]}
        />
      </Card>

      <Modal open={Boolean(selected)} destroyOnHidden footer={null} title="Yêu cầu điều chỉnh điểm danh"
        onCancel={() => !review.isPending && setSelected(null)}>
        {selected && (
          <div className="space-y-3">
            <div><strong>{selected.correctionRequest.requestedBy?.teacherProfile?.fullName || "Giáo viên"}</strong></div>
            <div className="whitespace-pre-wrap break-words">{selected.correctionRequest.reason}</div>
            <Space wrap>
              <Tag>Đang ghi nhận: {ATTENDANCE_STATUS_LABELS[selected.attendanceStatus]}</Tag>
              <Tag color="blue">Đề xuất: {ATTENDANCE_STATUS_LABELS[selected.correctionRequest.requestedStatus]}</Tag>
              {selected.attendancePercentage != null && <Tag>LiveKit ghi nhận {selected.attendancePercentage}%</Tag>}
            </Space>
            {(selected.correctionHistory ?? []).length > 0 && (
              <details>
                <summary className="cursor-pointer font-medium">Lịch sử xử lý</summary>
                <ul className="mt-2 space-y-2">
                  {selected.correctionHistory?.map((entry) => (
                    <li key={entry._id}>
                      <strong>{ATTENDANCE_CORRECTION_STATUS_LABELS[entry.status]}</strong>
                      {entry.before && entry.after && ` · ${ATTENDANCE_STATUS_LABELS[entry.before.status]} → ${ATTENDANCE_STATUS_LABELS[entry.after.status]}`}
                      {entry.reviewNote && <div className="whitespace-pre-wrap break-words">{entry.reviewNote}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {selected.correctionRequest.status === "PENDING" && (
              <Form<ReviewValues> form={form} layout="vertical" preserve={false} onFinish={(values) => review.mutate(values)}>
                {review.isError && <Alert className="mb-4" type="error" showIcon title={error} />}
                <Form.Item name="decision" label="Quyết định" rules={[{ required: true, message: "Chọn cách xử lý." }]}>
                  <Select options={[
                    { value: "LIVEKIT", label: "Tính lại theo nhật ký LiveKit và duyệt" },
                    { value: "MANUAL", label: "Duyệt thủ công" },
                    { value: "REJECT", label: "Từ chối yêu cầu" },
                  ]} />
                </Form.Item>
                {decision === "MANUAL" && (
                  <Form.Item name="attendanceStatus" label="Kết quả điểm danh" initialValue={selected.correctionRequest.requestedStatus}
                    rules={[{ required: true, message: "Chọn kết quả điểm danh." }]}>
                    <Select options={ATTENDANCE_CORRECTION_OPTIONS} />
                  </Form.Item>
                )}
                <Form.Item name="reviewNote" label="Lý do xử lý" rules={[{ required: true, whitespace: true, max: 1000, message: "Nhập lý do xử lý." }]}>
                  <Input.TextArea rows={3} maxLength={1000} />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={review.isPending}>Xác nhận</Button>
              </Form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
