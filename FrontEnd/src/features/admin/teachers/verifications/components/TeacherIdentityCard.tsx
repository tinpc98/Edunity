import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Form, Input, Modal, message } from 'antd';
import { EyeOutlined, IdcardOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { teacherVerificationService } from '../../../../../services/teacherVerification.service';
import type { TeacherIdentity, VerificationOcr } from '../../../../../types/teacherVerification';
import { getFriendlyErrorMessage } from '../../../../../utils/apiErrorMap';

const formatDate = (value?: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '—');

const OCR_FIELD_LABELS: Record<VerificationOcr['mismatches'][number], string> = {
  fullName: 'Họ tên',
  idNumber: 'Số CCCD',
  dateOfBirth: 'Ngày sinh',
  expiryDate: 'Ngày hết hạn',
  cardExpired: 'CCCD đã hết hạn',
};

interface Props {
  teacherId: string;
  identity?: TeacherIdentity | null;
  ocr?: VerificationOcr;
}

export default function TeacherIdentityCard({ teacherId, identity, ocr }: Props) {
  const [form] = Form.useForm<{ reason: string }>();
  const [isRevealOpen, setIsRevealOpen] = useState(false);
  // Kept in component state only (never in the query cache), and dropped when the page is left
  const [revealed, setRevealed] = useState<{ idNumber: string; address: string } | null>(null);

  const revealMutation = useMutation({
    mutationFn: (reason: string) => teacherVerificationService.adminRevealIdentity(teacherId, reason),
    onSuccess: (data) => {
      setRevealed(data);
      setIsRevealOpen(false);
      form.resetFields();
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  return (
    <Card
      className="rounded-2xl shadow-sm border-gray-100"
      title={<span className="font-bold flex items-center gap-2"><IdcardOutlined className="text-indigo-500" /> Thông tin định danh khai báo</span>}
      extra={
        identity && !revealed ? (
          <Button size="small" icon={<EyeOutlined />} onClick={() => setIsRevealOpen(true)}>
            Hiện số đầy đủ
          </Button>
        ) : null
      }
    >
      {!identity ? (
        <div className="text-gray-500 text-center py-4">Giáo viên chưa khai báo thông tin định danh (hồ sơ nộp trước khi có mục này).</div>
      ) : (
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Họ tên">{identity.fullName}</Descriptions.Item>
          <Descriptions.Item label="Ngày sinh">{formatDate(identity.dateOfBirth)}</Descriptions.Item>
          <Descriptions.Item label="Số CCCD">
            <span className="font-mono">{revealed?.idNumber ?? identity.idNumberMasked}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Ngày cấp / hết hạn">
            {formatDate(identity.issueDate)} / {identity.expiryDate ? formatDate(identity.expiryDate) : 'Không thời hạn'}
          </Descriptions.Item>
          <Descriptions.Item label="Nơi thường trú" span={2}>{revealed?.address ?? identity.addressMasked}</Descriptions.Item>
        </Descriptions>
      )}

      {ocr && (
        <Alert
          className="!mt-3"
          showIcon
          type={ocr.status === 'MATCHED' ? 'success' : ocr.status === 'MISMATCHED' ? 'error' : 'info'}
          message={
            ocr.status === 'MATCHED'
              ? 'OCR khớp với thông tin khai báo'
              : ocr.status === 'MISMATCHED'
                ? `OCR không khớp: ${ocr.mismatches.map((m) => OCR_FIELD_LABELS[m]).join(', ')}`
                : 'Không chạy được OCR, cần đối chiếu thủ công'
          }
          description={
            <span className="text-xs">
              {ocr.readFullName && <>OCR đọc được: {ocr.readFullName}{ocr.readIdNumberLast4 && <> · số CCCD đuôi {ocr.readIdNumberLast4}</>} · </>}
              {ocr.note && <>{ocr.note} · </>}
              Nguồn: {ocr.provider === 'SANDBOX' ? 'Sandbox (giả lập)' : ocr.provider ?? '—'}
            </span>
          }
        />
      )}

      <Modal
        title="Xem đầy đủ số CCCD và địa chỉ"
        open={isRevealOpen}
        onCancel={() => setIsRevealOpen(false)}
        onOk={() => form.submit()}
        okText="Xem"
        confirmLoading={revealMutation.isPending}
      >
        <p className="text-sm text-gray-600">Lần xem này sẽ được ghi vào nhật ký kiểm toán kèm lý do.</p>
        <Form form={form} layout="vertical" onFinish={({ reason }) => revealMutation.mutate(reason)}>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Nhập lý do' }]}>
            <Input placeholder="Ví dụ: Đối chiếu với ảnh CCCD" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
