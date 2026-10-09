import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  message,
} from "antd";
import {
  ExclamationCircleOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { UploadFile } from "antd/es/upload/interface";
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from "../../../services/scholarshipApplication.service";
import type { ScholarshipApplication } from "../../../types/scholarship";
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from "../../../types/scholarship";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function StudentScholarshipApplicationsPage() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected application for resubmission
  const [resubmitTarget, setResubmitTarget] = useState<ScholarshipApplication | null>(null);
  const [resubmitForm] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Fetch student applications
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: scholarshipApplicationKeys.myList({ page: currentPage, pageSize }),
    queryFn: () => scholarshipApplicationService.getMyApplications(currentPage, pageSize),
  });

  const handleOpenResubmit = (app: ScholarshipApplication) => {
    setResubmitTarget(app);
    resubmitForm.setFieldsValue({
      statement: app.statement,
    });
    setFileList([]);
  };

  const handleCloseResubmit = () => {
    setResubmitTarget(null);
    resubmitForm.resetFields();
    setFileList([]);
  };

  const handleResubmit = async () => {
    if (!resubmitTarget) return;

    try {
      const values = await resubmitForm.validateFields();
      setIsResubmitting(true);

      const uploadedFiles: { storageKey: string; mimeType?: string; side?: "SINGLE" }[] = [];
      for (const item of fileList) {
        if (item.originFileObj) {
          const res = await scholarshipApplicationService.uploadDocument(item.originFileObj);
          uploadedFiles.push({
            storageKey: res.storageKey,
            mimeType: res.mimeType,
            side: "SINGLE",
          });
        }
      }

      const payload: any = {
        statement: values.statement,
      };

      if (uploadedFiles.length > 0) {
        payload.documents = [
          {
            files: uploadedFiles,
          },
        ];
      }

      await scholarshipApplicationService.resubmit(resubmitTarget.id, payload);
      message.success("Bổ sung hồ sơ thành công! Đơn đã được chuyển về trạng thái Chờ xét duyệt.");
      handleCloseResubmit();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    } catch (err: any) {
      message.error(err.message || "Bổ sung hồ sơ thất bại. Vui lòng thử lại.");
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

        <Link to={(ROUTES as any).CAMPAIGNS || "/campaigns"}>
          <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-10 px-5 shadow-2xs">
            Khám phá chiến dịch học bổng
          </Button>
        </Link>
      </div>

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
      ) : !data || data.items.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200 text-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Bạn chưa nộp hồ sơ xin học bổng nào."
          >
            <Link to={(ROUTES as any).CAMPAIGNS || "/campaigns"}>
              <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-9 px-5">
                Tìm kiếm chiến dịch để ứng tuyển
              </Button>
            </Link>
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((app) => {
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
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/campaigns/${app.campaignId}`}
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
                        <strong className="text-indigo-700">
                          {formatVND(app.awardAmountPerStudent)}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Ngày nộp:{" "}
                        {new Date(app.submittedAt).toLocaleDateString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Statement snippet */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Thư nguyện vọng:
                      </div>
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
                          {isNeedMoreInfo
                            ? "Yêu cầu bổ sung từ Quản trị viên:"
                            : isRejected
                            ? "Lý do từ chối:"
                            : "Ghi chú phê duyệt:"}
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
                      <Link to="/student/scholarships">
                        <Button
                          type="primary"
                          className="bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded-xl h-10 px-5 border-none shadow-2xs"
                        >
                          Xem học bổng đã cấp
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {data.total > pageSize && (
            <div className="flex justify-center pt-4">
              <Pagination
                current={currentPage}
                total={data.total}
                pageSize={pageSize}
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
        destroyOnClose
        title={
          <div className="text-base font-bold text-slate-900">
            Bổ sung thông tin hồ sơ học bổng
          </div>
        }
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
                label={
                  <span className="text-xs font-bold text-slate-700 uppercase">
                    Cập nhật thư nguyện vọng
                  </span>
                }
                rules={[{ required: true, message: "Vui lòng không để trống thư nguyện vọng" }]}
              >
                <TextArea rows={4} className="rounded-xl text-sm" />
              </Form.Item>

              <Form.Item
                label={
                  <span className="text-xs font-bold text-slate-700 uppercase">
                    Tải lên tài liệu bổ sung (tùy chọn)
                  </span>
                }
                extra="Tải lên tệp mới nếu Ban quản trị yêu cầu bổ sung giấy tờ, chứng từ."
              >
                <Upload
                  fileList={fileList}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  beforeUpload={() => false}
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
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
