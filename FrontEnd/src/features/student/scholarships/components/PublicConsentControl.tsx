import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Switch } from "antd";
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from "../../../../services/scholarshipApplication.service";
import { getFriendlyErrorMessage } from "../../../../utils/apiErrorMap";

interface Props {
  applicationId: string;
  publicConsent?: { consented: boolean; consentedAt?: string | null; revokedAt?: string | null } | null;
}

export default function PublicConsentControl({ applicationId, publicConsent }: Props) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const consented = Boolean(publicConsent?.consented);

  const mutation = useMutation({
    mutationFn: (nextConsented: boolean) =>
      scholarshipApplicationService.setPublicConsent(applicationId, nextConsented),
    onSuccess: (result) => {
      message.success(
        result.consented
          ? "Đã bật hiển thị danh sách minh bạch."
          : "Đã thu hồi hiển thị công khai thành công."
      );
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-3 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold text-slate-800">
            Hiển thị trong Danh sách nhận học bổng minh bạch
          </div>
          <div className="text-xs text-slate-500">
            Họ tên sẽ được làm mờ bảo mật theo chuẩn PII (VD: Nguyễn V** A**) cùng tên trường trên trang chiến dịch. Bạn có thể bật/tắt bất kỳ lúc nào.
          </div>
        </div>
        <Switch
          checked={consented}
          loading={mutation.isPending}
          onChange={(checked) => mutation.mutate(checked)}
        />
      </div>
      {consented && publicConsent?.consentedAt && (
        <div className="text-[11px] text-teal-700 font-medium">
          Đã đồng ý công khai ngày {new Date(publicConsent.consentedAt).toLocaleDateString("vi-VN")}.
        </div>
      )}
      {!consented && publicConsent?.revokedAt && (
        <div className="text-[11px] text-slate-400">
          Đã thu hồi quyền công khai ngày {new Date(publicConsent.revokedAt).toLocaleDateString("vi-VN")}.
        </div>
      )}
    </div>
  );
}
