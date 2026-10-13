import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  scholarshipApplicationKeys,
  scholarshipApplicationService,
} from "../../../../services/scholarshipApplication.service";
import type { ScholarshipApplication } from "../../../../types/scholarship";

// GET /api/me/scholarship-applications caps pageSize at 100 — far above what a student submits
const ALL_PARAMS = { page: 1, pageSize: 100 };

/** All of the current student's applications, newest first (backend sorts by submittedAt desc). */
export function useAllMyApplications() {
  return useQuery({
    queryKey: scholarshipApplicationKeys.myList(ALL_PARAMS),
    queryFn: () => scholarshipApplicationService.getMyApplications(ALL_PARAMS.page, ALL_PARAMS.pageSize),
  });
}

/** Latest application per campaign, to show "already applied" on campaign cards and detail. */
export function useMyApplicationByCampaign() {
  const query = useAllMyApplications();
  const byCampaign = useMemo(() => {
    const map = new Map<string, ScholarshipApplication>();
    for (const app of query.data?.items ?? []) {
      if (!map.has(app.campaignId)) map.set(app.campaignId, app);
    }
    return map;
  }, [query.data]);
  return { ...query, byCampaign };
}
