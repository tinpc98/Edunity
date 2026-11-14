import { useQuery } from "@tanstack/react-query";
import { Empty, Skeleton } from "antd";
import { scholarshipPrivacyService } from "../../../services/scholarshipPrivacy.service";

/** BAO-11: anonymised stories students chose to share with this campaign's sponsors. */
export default function CampaignStoriesSection({ campaignId }: { campaignId: string }) {
  const { data: stories = [], isPending, isError } = useQuery({
    queryKey: ["sponsor-campaign-stories", campaignId],
    queryFn: () => scholarshipPrivacyService.campaignStories(campaignId),
    enabled: Boolean(campaignId),
  });

  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Câu chuyện từ học sinh (ẩn danh, có đồng ý)</div>
      {isPending ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : isError || stories.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có câu chuyện nào được chia sẻ" />
      ) : (
        <div className="space-y-2">
          {stories.map((story, index) => (
            <div key={index} className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm text-slate-700 italic">“{story.story}”</div>
              <div className="text-xs text-slate-500 mt-1">
                {story.displayName}
                {story.gradeLevel && ` · ${story.gradeLevel.replace("GRADE_", "Lớp ")}`}
                {story.province && ` · ${story.province}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
