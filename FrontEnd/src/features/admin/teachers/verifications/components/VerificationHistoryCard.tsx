import { Card, Collapse, Empty, Tag, Timeline } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PrivateDocumentCard from '../../../../../components/common/PrivateDocumentCard';
import type { VerificationDocument } from '../../../../../types/teacherVerification';
import type { VerificationSubmission } from '../verificationSubmissions';

const STATUS_META: Record<VerificationSubmission['status'], { label: string; color: string; dot: string }> = {
  PENDING: { label: 'Chờ duyệt', color: 'processing', dot: 'blue' },
  APPROVED: { label: 'Đã phê duyệt', color: 'success', dot: 'green' },
  REJECTED: { label: 'Bị từ chối', color: 'error', dot: 'red' },
  UNKNOWN: { label: 'Không rõ', color: 'default', dot: 'gray' },
};

const formatDateTime = (value?: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '—');

const fileTitle = (doc: VerificationDocument, side: string) => {
  if (doc.documentType === 'IDENTITY') {
    return `Định danh - mặt ${side === 'FRONT' ? 'trước' : side === 'BACK' ? 'sau' : 'đơn'}`;
  }
  return 'Bằng cấp / Chứng chỉ';
};

interface Props {
  submissions: VerificationSubmission[];
}

export default function VerificationHistoryCard({ submissions }: Props) {
  const total = submissions.length;

  return (
    <Card
      className="rounded-2xl shadow-sm border-gray-100"
      title={
        <span className="font-bold flex items-center gap-2">
          <HistoryOutlined className="text-indigo-500" /> Lịch sử nộp & xét duyệt hồ sơ
        </span>
      }
    >
      {total === 0 ? (
        <Empty description="Giáo viên chưa nộp hồ sơ xác minh nào" />
      ) : (
        <Timeline
          className="!mt-2"
          items={submissions.map((submission, index) => {
            const meta = STATUS_META[submission.status];
            const round = total - index;
            const fileCount = submission.documents.reduce((sum, doc) => sum + (doc.files?.length ?? 0), 0);
            const isLatest = index === 0;

            return {
              key: submission.key,
              color: meta.dot,
              content: (
                <div className="flex flex-col gap-2 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">Lần nộp #{round}</span>
                    <Tag color={meta.color} className="!m-0 rounded">{meta.label}</Tag>
                    {isLatest && <Tag className="!m-0 rounded">Mới nhất</Tag>}
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Nộp lúc: <strong className="text-gray-700">{formatDateTime(submission.submittedAt)}</strong></span>
                    {submission.reviewedAt && (
                      <span>Xét duyệt lúc: <strong className="text-gray-700">{formatDateTime(submission.reviewedAt)}</strong></span>
                    )}
                  </div>
                  {submission.reviewNote && (
                    <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <span className="font-medium">Ghi chú của admin:</span> {submission.reviewNote}
                    </div>
                  )}
                  {isLatest ? (
                    <div className="text-xs text-gray-400">Giấy tờ của lần nộp này đang hiển thị ở các mục phía trên.</div>
                  ) : (
                    <Collapse
                      size="small"
                      ghost
                      items={[
                        {
                          key: 'files',
                          label: <span className="text-xs font-medium text-indigo-600">Xem giấy tờ đã nộp ({fileCount} tệp)</span>,
                          children: (
                            <div className="flex flex-col gap-2">
                              {submission.documents.flatMap((doc) =>
                                (doc.files ?? []).map((file) => (
                                  <PrivateDocumentCard
                                    key={file.storageKey}
                                    file={file}
                                    variant="row"
                                    title={fileTitle(doc, file.side)}
                                    documentType={doc.documentType === 'IDENTITY' ? 'Định danh' : 'Bằng cấp / Chứng chỉ'}
                                  />
                                ))
                              )}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </div>
              ),
            };
          })}
        />
      )}
    </Card>
  );
}
