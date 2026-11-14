import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Input, Switch } from "antd";
import { scholarshipPrivacyService } from "../../../../services/scholarshipPrivacy.service";
import { scholarshipApplicationKeys } from "../../../../services/scholarshipApplication.service";
import { getFriendlyErrorMessage } from "../../../../utils/apiErrorMap";

interface Props {
  applicationId: string;
  publicStory?: { consent: boolean; text?: string | null } | null;
}

/** BAO-11: an approved student may share an anonymised story with the campaign's sponsors; off by default. */
export default function PublicStoryControl({ applicationId, publicStory }: Props) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(publicStory?.text ?? "");
  const shared = Boolean(publicStory?.consent);

  const mutation = useMutation({
    mutationFn: (payload: { consent: boolean; text?: string }) => scholarshipPrivacyService.setPublicStory(applicationId, payload),
    onSuccess: (result) => {
      message.success(result.consent ? "Đã chia sẻ câu chuyện ẩn danh." : "Đã ngừng chia sẻ.");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (error) => message.error(getFriendlyErrorMessage(error)),
  });

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold text-slate-800">Chia sẻ câu chuyện với nhà hảo tâm</div>
          <div className="text-xs text-slate-500">Chỉ hiện chữ cái đầu tên, khối lớp và tỉnh; không hiện tên, trường hay giấy tờ.</div>
        </div>
        <Switch
          checked={shared || editing}
          loading={mutation.isPending}
          onChange={(on) => (on ? setEditing(true) : shared ? mutation.mutate({ consent: false }) : setEditing(false))}
        />
      </div>
      {editing && (
        <>
          <Input.TextArea rows={3} maxLength={500} showCount value={text} onChange={(e) => setText(e.target.value)} placeholder="Ước mơ, điều học bổng giúp em làm được... (20–500 ký tự)" />
          <Button type="primary" size="small" loading={mutation.isPending} onClick={() => mutation.mutate({ consent: true, text })}>
            Chia sẻ
          </Button>
        </>
      )}
      {shared && !editing && publicStory?.text && <div className="text-sm text-slate-600 italic">“{publicStory.text}”</div>}
    </div>
  );
}
