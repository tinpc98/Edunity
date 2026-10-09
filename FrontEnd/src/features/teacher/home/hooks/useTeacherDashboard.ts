import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../../../stores/auth.store";
import { profileService } from "../../../../services/profile.service";
import { classService, classKeys } from "../../../../services/class.service";
import { financeService, financeKeys } from "../../../../services/finance.service";
import { messageService, messageKeys } from "../../../../services/message.service";
import type { Session } from "../../../../types/session";
import type { TeacherProfile } from "../../../../types/profile";

export function useTeacherDashboard() {
  const { user } = useAuthStore();
  const teacherId = user?.userId || (user as any)?.id;

  // 1. Profile for real teacher name, ratingAverage, ratingCount
  const profileQuery = useQuery({
    queryKey: ["teacher-dashboard-profile", teacherId],
    queryFn: () => profileService.getMyProfile(),
    enabled: Boolean(user),
  });

  // 2. Classes for active count, total students, class list
  const classesQuery = useQuery({
    queryKey: classKeys.teacherList({ pageSize: 50 }),
    queryFn: () => classService.listMyClasses({ pageSize: 50 }),
    enabled: Boolean(user),
  });

  const classes = classesQuery.data?.items || [];
  const classesTotal = classesQuery.data?.total || classes.length;

  // 3. Earnings for revenue KPIs and monthly chart
  const earningsQuery = useQuery({
    queryKey: financeKeys.teacherEarnings(),
    queryFn: () => financeService.getTeacherEarnings(),
    enabled: Boolean(user),
  });

  // 4. Shared schedule query for sessions
  const { data: allSessions = [], isLoading: isLoadingSessions } = useQuery<Session[]>({
    queryKey: ["teacherScheduleSessions", classes.map((c) => c.id).join(",")],
    queryFn: async () => {
      if (classes.length === 0) return [];
      const classDetails = await Promise.all(
        classes.map(async (cls) => {
          try {
            const detail = await classService.getMyClass(cls.id);
            return ((detail as any).sessions || []) as Session[];
          } catch {
            return [] as Session[];
          }
        })
      );
      const flattened = classDetails.flat();
      return flattened.sort(
        (a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()
      );
    },
    enabled: classes.length > 0,
  });

  // 5. Recent conversations for message widget
  const messagesQuery = useQuery({
    queryKey: messageKeys.conversations({ pageSize: 3 }),
    queryFn: () => messageService.listMyConversations({ pageSize: 3 }),
    enabled: Boolean(user),
  });

  // Derivations
  const profile = profileQuery.data;
  const teacherProfile = profile && "ratingAverage" in profile ? (profile as TeacherProfile) : undefined;
  const teacherName = profile?.fullName || user?.fullName || "Thầy / Cô";
  const ratingAverage = teacherProfile?.ratingAverage || 0;
  const ratingCount = teacherProfile?.ratingCount || 0;

  // Active classes (OPEN or IN_PROGRESS)
  const activeClassesList = useMemo(() => {
    return classes.filter((c) => c.status === "OPEN" || c.status === "IN_PROGRESS");
  }, [classes]);

  const activeClassesCount = activeClassesList.length;

  // Total enrolled students across teacher's classes
  const totalStudents = useMemo(() => {
    return classes.reduce((sum, c) => sum + (c.enrolledCount || 0), 0);
  }, [classes]);

  // Today sessions
  const todaySessions = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return allSessions.filter((s) => {
      const sDate = s.startDatetime ? new Date(s.startDatetime).toISOString().slice(0, 10) : "";
      return sDate === todayStr && s.status !== "CANCELLED";
    });
  }, [allSessions]);

  // Nearest upcoming / ongoing session
  const nextSession = useMemo(() => {
    const now = Date.now();
    return allSessions.find((s) => {
      if (s.status === "CANCELLED" || s.status === "COMPLETED") return false;
      const end = new Date(s.endDatetime).getTime();
      return end >= now;
    });
  }, [allSessions]);

  // Revenue computations
  const earningsSummary = earningsQuery.data?.summary;
  const earningsItems = earningsQuery.data?.items || [];
  const totalNetRevenue = earningsSummary?.totalNet ? parseFloat(String(earningsSummary.totalNet)) : 0;
  const totalGrossRevenue = earningsSummary?.totalGross ? parseFloat(String(earningsSummary.totalGross)) : 0;
  const totalCommission = earningsSummary?.totalCommission ? parseFloat(String(earningsSummary.totalCommission)) : 0;

  // Monthly revenue for the last 6 months
  const monthlyRevenueData = useMemo(() => {
    const now = new Date();
    const result = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const monthLabel = `T${month + 1}`;
      const isoMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

      const sumNet = earningsItems
        .filter((item) => {
          const itemDate = new Date(item.createdAt);
          return itemDate.getUTCFullYear() === year && itemDate.getUTCMonth() === month;
        })
        .reduce((sum, item) => sum + (item.netAmount || 0), 0);

      result.push({
        month: monthLabel,
        isoMonth,
        value: Number((sumNet / 1000000).toFixed(1)),
        rawNet: sumNet,
        isActive: offset === 0,
      });
    }
    return result;
  }, [earningsItems]);

  const isLoading = classesQuery.isLoading && earningsQuery.isLoading;

  return {
    teacherId,
    teacherName,
    ratingAverage,
    ratingCount,
    classes,
    classesTotal,
    activeClassesCount,
    activeClassesList,
    totalStudents,
    todaySessions,
    nextSession,
    earningsSummary,
    totalNetRevenue,
    totalGrossRevenue,
    totalCommission,
    monthlyRevenueData,
    conversations: messagesQuery.data?.items || [],
    isLoading,
    isLoadingSessions,
    refetch: () => {
      classesQuery.refetch();
      earningsQuery.refetch();
      profileQuery.refetch();
      messagesQuery.refetch();
    },
  };
}
