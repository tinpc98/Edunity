import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Typography,
  Card,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Upload,
  Skeleton,
  Empty,
  Pagination,
  Alert,
  Segmented,
  Steps,
} from "antd";
import { ExclamationCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { UploadFile } from "antd/es/upload/interface";
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from "../../../services/scholarshipApplication.service";
import type {
  ResubmitScholarshipPayload,
  ScholarshipApplication,
  ScholarshipApplicationStatus,
} from "../../../types/scholarship";
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from "../../../types/scholarship";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import { PRIVATE_DOCUMENT_ACCEPT, validatePrivateDocument } from "../../../utils/fileValidation";
import { useAllMyApplications } from "./hooks/useMyApplications";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type StatusFilter = "ALL" | ScholarshipApplicationStatus;
const STATUS_ORDER: ScholarshipApplicationStatus[] = ["SUBMITTED", "NEED_MORE_INFORMATION", "APPROVED", "REJECTED"];
const PAGE_SIZE = 10;

const formatDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

/** Submitted → Under review → Result, mapped from the 4 backend statuses. */
function ApplicationProgress({ app }: { app: ScholarshipApplication }) {
  const resultTitle =
    app.status === "APPROVED" ? "Được cấp học bổng" : app.status === "REJECTED" ? "Không được duyệt" : "Kết quả";

  const current = app.status === "SUBMITTED" || app.status === "NEED_MORE_INFORMATION" ? 1 : 2;
  const status =
    app.status === "REJECTED" ? "error" : app.status === "APPROVED" ? "finish" : "process";

  return (
    <Steps
      size="small"
      current={current}
      status={status}
      items={[
        { title: "Đã nộp hồ sơ", description: formatDateTime(app.submittedAt) },
        { title: app.status === "NEED_MORE_INFORMATION" ? "Cần bổ sung" : "Đang xét duyệt" },
        { title: resultTitle, description: app.reviewedAt && current === 2 ? formatDateTime(app.reviewedAt) : undefined },
      ]}
    />
  );
}

export default function StudentScholarshipApplicationsPage() {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Selected application for resubmission
  const [resubmitTarget, setResubmitTarget] = useState<ScholarshipApplication | null>(null);
  const [resubmitForm] = Form.useForm<{ statement: string }>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // The endpoint has no status filter: load all of the student's applications and filter locally
  const { data, isLoading, isError, refetch } = useAllMyApplications();
  const allItems = useMemo(() => data?.items ?? [], [data]);

  const counts = useMemo(() => {
    const result: Record<ScholarshipApplicationStatus, number> = { SUBMITTED: 0, NEED_MORE_INFORMATION: 0, APPROVED: 0, REJECTED: 0 };
    for (const app of allItems) result[app.status] += 1;
    return result;
  }, [allItems]);

  const filtered = statusFilter === "ALL" ? allItems : allItems.filter((app) => app.status === statusFilter);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleOpenResubmit = (app: ScholarshipApplication) => {
    setResubmitTarget(app);
    resubmitForm.setFieldsValue({ statement: app.statement });
    setFileList([]);
  };

  const handleCloseResubmit = () => {
    if (isResubmitting) return;
    setResubmitTarget(null);
    resubmitForm.resetFields();
    setFileList([]);
  };

  const handleResubmit = async () => {
    if (!resubmitTarget) return;

    let values: { statement: string };
    try {
      values = await resubmitForm.validateFields();
    } catch {
      return; // field errors are shown inline
    }

    setIsResubmitting(true);
    try {
      const uploadedFiles: { storageKey: string; mimeType?: string; side: "SINGLE" }[] = [];
      for (const item of fileList) {
        if (!item.originFileObj) continue;
        try {
          const res = await scholarshipApplicationService.uploadDocument(item.originFileObj);
          uploadedFiles.push({ storageKey: res.storageKey, mimeType: res.mimeType, side: "SINGLE" });
        } catch (err) {
          throw new Error(`Tải "${item.name}" thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      }

      const payload: ResubmitScholarshipPayload = { statement: values.statement.trim() };
      if (uploadedFiles.length > 0) payload.documents = [{ files: uploadedFiles }];

      await scholarshipApplicationService.resubmit(resubmitTarget.id, payload);
      message.success("Bổ sung hồ sơ thành công! Đơn đã được chuyển về trạng thái Chờ xét duyệt.");
      setResubmitTarget(null);
      resubmitForm.resetFields();
      setFileList([]);
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Bổ sung hồ sơ thất bại. Vui lòng thử lại."));
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 !text-2xl font-black text-slate-900 tracking-tight">
            Hồ sơ xin học bổng
          </Title>
          <Text className="text-xs text-slate-500">
            Theo dõi tiến độ xét duyệt và bổ sung thông tin hồ sơ học bổng theo yêu cầu.
          </Text>
        </div>

        <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}>
          <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-10 px-5 shadow-2xs">
            Tìm học bổng để ứng tuyển
          </Button>
        </Link>
      </div>

      {counts.NEED_MORE_INFORMATION > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`Bạn có ${counts.NEED_MORE_INFORMATION} hồ sơ cần bổ sung thông tin`}
          description="Vui lòng bổ sung theo yêu cầu của Ban quản trị để hồ sơ tiếp tục được xét duyệt."
          action={
            <Button size="small" onClick={() => { setStatusFilter("NEED_MORE_INFORMATION"); setCurrentPage(1); }}>
              Xem ngay
            </Button>
          }
          className="rounded-xl"
        />
      )}

      {!isLoading && !isError && allItems.length > 0 && (
        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}
          options={[
            { label: `Tất cả (${allItems.length})`, value: "ALL" },
            ...STATUS_ORDER.map((status) => ({ label: `${SCHOLARSHIP_APP_STATUS_LABELS[status]} (${counts[status]})`, value: status })),
          ]}
        />
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Lỗi tải danh sách hồ sơ"
          description="Không thể tải danh sách hồ sơ học bổng. Vui lòng thử lại."
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200 text-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={allItems.length === 0 ? "Bạn chưa nộp hồ sơ xin học bổng nào." : "Không có hồ sơ nào ở trạng thái này."}
          >
            {allItems.length === 0 && (
              <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}>
                <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-9 px-5">
                  Tìm kiếm chiến dịch để ứng tuyển
                </Button>
              </Link>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {pageItems.map((app) => {
            const isNeedMoreInfo = app.status === "NEED_MORE_INFORMATION";
            const isApproved = app.status === "APPROVED";
            const isRejected = app.status === "REJECTED";

            return (
              <Card
                key={app.id}
                className={`rounded-2xl border transition-all shadow-2xs ${
                  isNeedMoreInfo
                    ? "border-amber-300 bg-amber-50/20"
                    : isApproved
                    ? "border-emerald-200 bg-emerald-50/10"
                    : isRejected
                    ? "border-rose-200 bg-rose-50/10"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Application Details */}
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${app.campaignId}`}
                        className="font-bold text-base text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {app.campaignTitle || "Chiến dịch học bổng"}
                      </Link>

                      <Tag
                        color={SCHOLARSHIP_APP_STATUS_COLORS[app.status]}
                        className="text-[11px] font-semibold border-none"
                      >
                        {SCHOLARSHIP_APP_STATUS_LABELS[app.status]}
                      </Tag>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        Mức học bổng định mức:{" "}
                        <strong className="text-indigo-700">{formatVND(app.awardAmountPerStudent)}</strong>
                      </span>
                      <span>•</span>
                      <span>Mã hồ sơ: #{app.id.slice(-6).toUpperCase()}</span>
                    </div>

                    <div className="pt-1 max-w-2xl">
                      <ApplicationProgress app={app} />
                    </div>

                    {/* Statement snippet */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Thư nguyện vọng:</div>
                      <Paragraph
                        ellipsis={{ rows: 2, expandable: true, symbol: "Xem thêm" }}
                        className="!mb-0 whitespace-pre-wrap"
                      >
                        {app.statement}
                      </Paragraph>
                    </div>

                    {/* Review Note if any */}
                    {app.reviewNote && (
                      <div
                        className={`p-3 rounded-xl text-xs border ${
                          isNeedMoreInfo
                            ? "bg-amber-100/60 border-amber-300 text-amber-900"
                            : isRejected
                            ? "bg-rose-100/60 border-rose-200 text-rose-900"
                            : "bg-emerald-100/60 border-emerald-200 text-emerald-900"
                        }`}
                      >
                        <div className="font-bold text-[11px] uppercase mb-0.5">
                          {isNeedMoreInfo ? "Yêu cầu bổ sung từ Quản trị viên:" : isRejected ? "Lý do từ chối:" : "Ghi chú phê duyệt:"}
                        </div>
                        <div className="whitespace-pre-wrap">{app.reviewNote}</div>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {isNeedMoreInfo && (
                      <Button
                        type="primary"
                        onClick={() => handleOpenResubmit(app)}
                        className="bg-amber-600 hover:bg-amber-500 text-xs font-bold rounded-xl h-10 px-5 border-none shadow-2xs"
                      >
                        Bổ sung hồ sơ & Gửi lại
                      </Button>
                    )}

                    {isApproved && (
                      <Link to={ROUTES.STUDENT.SCHOLARSHIPS}>
                        <Button
                          type="primary"
                          className="bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded-xl h-10 px-5 border-none shadow-2xs"
                        >
                          Xem học bổng đã cấp
                        </Button>
                      </Link>
                    )}

                    {isRejected && (
                      <Link to={`${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${app.campaignId}`}>
                        <Button className="text-xs font-semibold rounded-xl h-10 px-5">Xem lại chiến dịch</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {filtered.length > PAGE_SIZE && (
            <div className="flex justify-center pt-4">
              <Pagination
                current={currentPage}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Resubmit Modal */}
      <Modal
        open={Boolean(resubmitTarget)}
        onCancel={handleCloseResubmit}
        footer={null}
        width={600}
        destroyOnHidden
        maskClosable={!isResubmitting}
        title={<div className="text-base font-bold text-slate-900">Bổ sung thông tin hồ sơ học bổng</div>}
      >
        {resubmitTarget && (
          <div className="py-2 space-y-4">
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Yêu cầu từ Quản trị viên"
              description={resubmitTarget.reviewNote || "Vui lòng bổ sung đầy đủ thông tin được yêu cầu."}
              className="rounded-xl text-xs"
            />

            <Form form={resubmitForm} layout="vertical" className="space-y-4">
              <Form.Item
                name="statement"
                label={<span className="text-xs font-bold text-slate-700 uppercase">Cập nhật thư nguyện vọng</span>}
                rules={[{ required: true, whitespace: true, message: "Vui lòng không để trống thư nguyện vọng" }]}
              >
                <TextArea rows={4} showCount maxLength={3000} className="rounded-xl text-sm" />
              </Form.Item>

              <Form.Item
                label={<span className="text-xs font-bold text-slate-700 uppercase">Tải lên tài liệu bổ sung (tùy chọn)</span>}
                extra="Tải lên tệp mới nếu Ban quản trị yêu cầu bổ sung giấy tờ, chứng từ. PDF, JPG, PNG, WebP — tối đa 10MB/tệp."
              >
                <Upload
                  fileList={fileList}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  beforeUpload={(file) => {
                    const error = validatePrivateDocument(file);
                    if (error) {
                      message.error(error);
                      return Upload.LIST_IGNORE;
                    }
                    return false;
                  }}
                  multiple
                  maxCount={5}
                  accept={PRIVATE_DOCUMENT_ACCEPT}
                  disabled={isResubmitting}
                >
                  <Button icon={<UploadOutlined />} className="rounded-xl text-xs font-medium">
                    Chọn tệp bổ sung
                  </Button>
                </Upload>
              </Form.Item>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <Button onClick={handleCloseResubmit} disabled={isResubmitting} className="rounded-xl">
                  Hủy
                </Button>
                <Button
                  type="primary"
                  onClick={handleResubmit}
                  loading={isResubmitting}
                  className="bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold px-6 border-none"
                >
                  Gửi lại hồ sơ
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}
