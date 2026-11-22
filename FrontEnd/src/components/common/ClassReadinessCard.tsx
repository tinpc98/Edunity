import { Alert, Button, Card, Skeleton, Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ClassReadiness } from '../../types/class';

const vnd = (value: number | null) => (value === null ? 'Không hợp lệ' : `${value.toLocaleString('vi-VN')}đ`);

const describeTuition = ({ current, minPrice, maxPrice }: ClassReadiness['tuition']) =>
  `Hiện tại: ${vnd(current)}/học viên · Hợp lệ: ${minPrice === maxPrice ? vnd(minPrice) : `${vnd(minPrice)} – ${vnd(maxPrice)}`}`;

interface ClassReadinessCardProps {
  readiness?: ClassReadiness;
  isFetching: boolean;
  isError: boolean;
  onRefresh: () => void;
  /** Teachers also need to know which unmet conditions stop them from submitting. */
  showSubmitHint?: boolean;
}

export default function ClassReadinessCard({
  readiness,
  isFetching,
  isError,
  onRefresh,
  showSubmitHint = false,
}: ClassReadinessCardProps) {
  return (
    <Card
      className="rounded-2xl shadow-sm border-gray-100"
      title="Điều kiện phê duyệt"
      extra={
        <Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={onRefresh}>
          Kiểm tra lại
        </Button>
      }
    >
      {isError ? (
        <Alert type="error" showIcon message="Không kiểm tra được điều kiện phê duyệt. Vui lòng thử lại." />
      ) : !readiness ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <ul className="m-0 list-none p-0">
          {readiness.checks.map((check) => {
            const passed = check.status === 'PASSED';
            const color = passed ? 'success' : check.blocksSubmit ? 'error' : 'warning';
            const icon = passed ? (
              <CheckCircleOutlined />
            ) : check.blocksSubmit ? (
              <CloseCircleOutlined />
            ) : (
              <ExclamationCircleOutlined />
            );
            return (
              <li key={check.key} className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-0">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-gray-800">{check.label}</div>
                  {check.key === 'CLASS_PRICE_RANGE' && (
                    <div className="text-gray-600">{describeTuition(readiness.tuition)}</div>
                  )}
                  {!passed && <div className="text-gray-600">{check.message}</div>}
                  {!passed && showSubmitHint && (
                    <div className="text-xs text-gray-500">
                      {check.blocksSubmit
                        ? 'Bắt buộc hoàn thiện trước khi gửi duyệt.'
                        : 'Vẫn gửi duyệt được; Admin sẽ kiểm tra trước khi mở lớp.'}
                    </div>
                  )}
                </div>
                <Tag color={color} icon={icon} className="!m-0 shrink-0">
                  {passed ? 'Đạt' : 'Chưa đạt'}
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
