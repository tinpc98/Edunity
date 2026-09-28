import { Modal, Button, Tag } from "antd";
import {
  BookOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { EnrollableClassTarget } from "../hooks/useClassEnrollment";

interface FreeEnrollmentModalProps {
  open: boolean;
  classItem: EnrollableClassTarget | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FreeEnrollmentModal({
  open,
  classItem,
  loading,
  onConfirm,
  onCancel,
}: FreeEnrollmentModalProps) {
  if (!classItem) return null;

  const displayTitle = classItem.className || classItem.title;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={480}
      className="free-enrollment-modal"
      title={
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
          <span>Xác nhận đăng ký lớp</span>
          <Tag color="green" className="text-[11px] font-bold border-none px-2 py-0.5">
            MIỄN PHÍ
          </Tag>
        </div>
      }
    >
      <div className="pt-4 space-y-4">
        {/* Class Info Box */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
          <div className="text-base font-bold text-slate-900 leading-snug">
            {displayTitle}
          </div>

          {classItem.courseTitle && (
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <BookOutlined className="text-indigo-600 shrink-0" />
              <span>
                Thuộc khóa học: <strong>{classItem.courseTitle}</strong>
              </span>
            </div>
          )}

          {classItem.teacherName && (
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <UserOutlined className="text-indigo-600 shrink-0" />
              <span>
                Giảng viên: <strong>{classItem.teacherName}</strong>
              </span>
            </div>
          )}

          {classItem.scheduleText && (
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <ClockCircleOutlined className="text-indigo-600 shrink-0" />
              <span>
                Lịch học: <strong>{classItem.scheduleText}</strong>
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Học phí:</span>
            <span className="font-bold text-emerald-600 text-sm">Miễn phí</span>
          </div>
        </div>

        {/* Confirmation prompt */}
        <p className="text-xs text-slate-600 font-medium text-center">
          Bạn có chắc chắn muốn đăng ký tham gia lớp học này?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg text-xs font-semibold h-9 px-4"
          >
            Hủy
          </Button>

          <Button
            type="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
            icon={<CheckCircleOutlined />}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-semibold h-9 px-5 shadow-xs border-none"
          >
            Xác nhận đăng ký
          </Button>
        </div>
      </div>
    </Modal>
  );
}
