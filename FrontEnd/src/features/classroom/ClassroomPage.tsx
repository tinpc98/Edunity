import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tag, Typography, Spin, message } from "antd";
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../stores/auth.store";
import { sessionService, sessionKeys } from "../../services/session.service";
import type { JoinSessionResponse, ClassroomRole } from "../../types/session";
import { ROUTES } from "../../routes/routePaths";
import { TeacherVerificationGateCard } from "../../components/guards/RequireVerifiedTeacher";
import { useTeacherVerification } from "../../hooks/useTeacherVerification";
import { getFriendlyErrorMessage } from "../../utils/apiErrorMap";

import ClassroomPreJoin from "./components/ClassroomPreJoin";
import LiveKitClassroom from "./components/LiveKitClassroom";
import DevClassroom from "./components/DevClassroom";
import ClassroomHeader from "./components/ClassroomHeader";
import TeacherAttendanceModal from "./components/TeacherAttendanceModal";
import TeacherIncidentModal from "./components/TeacherIncidentModal";

const { Title, Text, Paragraph } = Typography;

type ClassroomStage = "prejoin" | "joining" | "in_room" | "error" | "ended";

export default function ClassroomPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [stage, setStage] = useState<ClassroomStage>("prejoin");
  const [joinData, setJoinData] = useState<JoinSessionResponse | null>(null);
  const [joinError, setJoinError] = useState<any>(null);

  const [mediaOptions, setMediaOptions] = useState<{ videoEnabled: boolean; audioEnabled: boolean }>({
    videoEnabled: true,
    audioEnabled: true,
  });

  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState<boolean>(false);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState<boolean>(false);
  const connectionSessionIdRef = useRef<string>(`ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Authenticated user check
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }
    if (user.role !== "STUDENT" && user.role !== "TEACHER") {
      message.error("Chỉ học viên và giáo viên mới có quyền vào phòng học trực tuyến.");
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.pathname]);

  const isTeacher = user?.role === "TEACHER";
  const userFullName = user?.fullName || (isTeacher ? "Giảng viên" : "Học viên");

  const {
    verification,
    isVerified: isVerifiedTeacher,
    isLoading: isVerificationLoading,
    isError: isVerificationError,
    error: verificationError,
    refetch: refetchVerification,
  } = useTeacherVerification();

  // Query student sessions to find current session metadata if available
  const { data: mySessions = [] } = useQuery({
    queryKey: sessionKeys.studentMySessions(),
    queryFn: () => sessionService.getMySessions(),
    enabled: Boolean(user?.role === "STUDENT"),
    staleTime: 60000,
  });

  // Query Smart Classroom Live Status (TIN-05D)
  const { data: liveStatus } = useQuery({
    queryKey: sessionKeys.liveStatus(sessionId || ""),
    queryFn: () => sessionService.getSessionLiveStatus(sessionId!),
    enabled: Boolean(sessionId && isAuthenticated),
    refetchInterval: stage === "in_room" ? 15000 : 30000,
  });

  const currentSession = useMemo(() => {
    return mySessions.find((s) => s.id === sessionId);
  }, [mySessions, sessionId]);

  const sessionTitle = liveStatus?.title || currentSession?.title || "Buổi học trực tuyến";
  const className = liveStatus?.className || currentSession?.className || undefined;

  // Automatically report verified presence connection & clean disconnect when in_room
  useEffect(() => {
    if (stage !== "in_room" || !sessionId) return;
    const connId = connectionSessionIdRef.current;
    sessionService.connectSessionPresence(sessionId, connId).catch(() => {});

    return () => {
      sessionService.leaveSessionPresence(sessionId, connId).catch(() => {});
    };
  }, [stage, sessionId]);

  // 1. Join Session Mutation
  const joinMutation = useMutation({
    mutationFn: () => sessionService.joinSession(sessionId!),
    onSuccess: (data: JoinSessionResponse) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      setJoinData(data);
      setStage("in_room");
    },
    onError: (err: any) => {
      setJoinError(err);
      setStage("error");
    },
  });

  // 2. Teacher End Session Mutation
  const endSessionMutation = useMutation({
    mutationFn: () => sessionService.endSession(sessionId!),
    onSuccess: () => {
      message.success("Đã kết thúc buổi học và hoàn tất điểm danh học viên!");
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      setStage("ended");
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể kết thúc buổi học.");
    },
  });

  const handleStartJoin = (options: { videoEnabled: boolean; audioEnabled: boolean }) => {
    if (isTeacher && !isVerifiedTeacher) {
      return;
    }
    setMediaOptions(options);
    setStage("joining");
    joinMutation.mutate();
  };

  const handleLeaveRoom = async () => {
    if (sessionId && stage === "in_room") {
      try {
        await sessionService.leaveSessionPresence(sessionId, connectionSessionIdRef.current);
      } catch {
        // ignore leave telemetry error
      }
    }
    if (isTeacher) {
      navigate(isVerifiedTeacher ? ROUTES.TEACHER.SCHEDULE : ROUTES.TEACHER.HOME);
    } else {
      navigate(ROUTES.STUDENT.SCHEDULE);
    }
  };

  const handleEndSession = () => {
    if (isTeacher && !isVerifiedTeacher) {
      return;
    }
    endSessionMutation.mutate();
  };

  // Error code resolution to user-friendly messages
  const renderErrorContent = () => {
    const code = joinError?.code || "";
    const msg = joinError?.message || "";

    switch (code) {
      case "NOT_ENROLLED":
        return {
          title: "Chưa đăng ký lớp học",
          desc: "Bạn cần có đơn đăng ký đã được xác nhận (CONFIRMED) của lớp học này để tham gia buổi học.",
          actionText: "Xem danh sách lớp",
          actionRoute: ROUTES.CLASSES,
        };
      case "JOIN_WINDOW_CLOSED":
        return {
          title: "Đã quá hạn 20 phút vào lớp lần đầu",
          desc: "Quy định điểm danh thông minh (TIN-05D): Học viên chỉ được vào lớp lần đầu trong vòng 20 phút đầu kể từ giờ bắt đầu. (Nếu bạn đã vào lớp trước mốc 20 phút và bị rớt mạng, hệ thống sẽ cho phép kết nối lại).",
          actionText: "Quay lại lịch học",
          actionRoute: ROUTES.STUDENT.SCHEDULE,
        };
      case "SESSION_CANCELLED":
        return {
          title: "Buổi học đã bị hủy",
          desc: "Buổi học này đã bị hủy (hoặc tự động hủy do giảng viên vắng mặt sau 30 phút). Học viên không bị tính vắng và sẽ được xếp lịch học bù / bảo vệ quyền lợi.",
          actionText: "Quay lại lịch học",
          actionRoute: isTeacher ? ROUTES.TEACHER.SCHEDULE : ROUTES.STUDENT.SCHEDULE,
        };
      case "SESSION_ENDED":
        return {
          title: "Buổi học đã kết thúc",
          desc: "Buổi học này đã kết thúc. Bạn có thể xem lại bản ghi (nếu có) trên trang chi tiết lớp học.",
          actionText: "Quay lại lớp học",
          actionRoute: isTeacher ? ROUTES.TEACHER.CLASSES : ROUTES.STUDENT.HOME,
        };
      case "SESSION_NOT_JOINABLE":
        return {
          title: "Chưa đến giờ mở phòng chờ",
          desc: msg || "Phòng chờ trực tuyến mở trước giờ bắt đầu 10 phút và đóng khi buổi học kết thúc.",
          actionText: "Quay lại lịch học",
          actionRoute: isTeacher ? ROUTES.TEACHER.SCHEDULE : ROUTES.STUDENT.SCHEDULE,
        };
      case "TEACHER_NOT_VERIFIED":
        return {
          title: "Chưa xác minh hồ sơ giảng viên",
          desc: "Bạn cần được xác minh hồ sơ giảng viên trước khi mở hoặc điều hành phòng học trực tuyến.",
          actionText: "Xem hồ sơ giáo viên",
          actionRoute: ROUTES.TEACHER.PROFILE,
        };
      case "CLASS_NOT_ACTIVE":
        return {
          title: "Lớp học chưa được kích hoạt",
          desc: getFriendlyErrorMessage(joinError, "Lớp học chưa được phê duyệt hoặc hiện không trong trạng thái hoạt động để mở phòng học."),
          actionText: isTeacher ? "Quay lại lớp của tôi" : "Quay lại lịch học",
          actionRoute: isTeacher ? ROUTES.TEACHER.CLASSES : ROUTES.STUDENT.SCHEDULE,
        };
      case "FORBIDDEN":
        return {
          title: "Không có quyền truy cập",
          desc: msg || "Bạn không có quyền tham gia buổi học này.",
          actionText: "Quay lại",
          actionRoute: isTeacher ? ROUTES.TEACHER.HOME : ROUTES.STUDENT.HOME,
        };
      default:
        return {
          title: "Không thể vào phòng học",
          desc: msg || "Đã xảy ra lỗi khi kết nối vào phòng học trực tuyến. Vui lòng thử lại sau.",
          actionText: "Thử lại",
          actionRoute: null,
        };
    }
  };

  if (!isAuthenticated || !user || (user.role !== "STUDENT" && user.role !== "TEACHER")) {
    return null;
  }

  // 0. TEACHER VERIFICATION GATE (Fail-closed before any prejoin/join/token/egress)
  if (isTeacher && !isVerifiedTeacher) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <TeacherVerificationGateCard
          verification={verification}
          isLoading={isVerificationLoading}
          isError={isVerificationError}
          error={verificationError}
          onRetry={() => {
            void refetchVerification();
          }}
          darkMode
        />
      </div>
    );
  }

  // 1. ERROR STAGE
  if (stage === "error") {
    const errorInfo = renderErrorContent();

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-5 text-2xl">
            <CloseCircleOutlined />
          </div>

          <Title level={4} className="!text-white !mb-2 font-bold">
            {errorInfo.title}
          </Title>

          <Paragraph className="text-slate-400 text-xs mb-6">
            {errorInfo.desc}
          </Paragraph>

          <div className="flex flex-col gap-3">
            {isTeacher && sessionId && (
              <Button
                icon={<WarningOutlined />}
                onClick={() => setIsIncidentModalOpen(true)}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 rounded-xl h-11 font-semibold"
              >
                Báo cáo sự cố / Đề xuất học bù
              </Button>
            )}

            {errorInfo.actionRoute ? (
              <Button
                type="primary"
                onClick={() => navigate(errorInfo.actionRoute!)}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 font-semibold"
              >
                {errorInfo.actionText}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => {
                  setStage("joining");
                  joinMutation.mutate();
                }}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 font-semibold"
              >
                Thử kết nối lại
              </Button>
            )}

            <Button
              type="text"
              onClick={handleLeaveRoom}
              className="text-slate-400 hover:text-white rounded-xl"
            >
              Rời khỏi đây
            </Button>
          </div>
        </div>

        {isTeacher && sessionId && (
          <TeacherIncidentModal
            open={isIncidentModalOpen}
            sessionId={sessionId}
            sessionTitle={sessionTitle}
            onClose={() => setIsIncidentModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // 2. ENDED STAGE (Teacher finished session or student was notified)
  if (stage === "ended") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-5 text-2xl">
            <CheckCircleOutlined />
          </div>

          <Tag color="success" className="rounded-full px-3 py-1 font-bold text-xs uppercase mb-3">
            BUỔI HỌC ĐÃ KẾT THÚC
          </Tag>

          <Title level={4} className="!text-white !mb-2 font-bold">
            {sessionTitle}
          </Title>

          <Paragraph className="text-slate-400 text-xs mb-6">
            Buổi học trực tuyến đã hoàn thành và thời lượng điểm danh (chuẩn 70%) đã được chốt trên hệ thống.
          </Paragraph>

          <div className="flex flex-col gap-3">
            {isTeacher && (
              <Button
                icon={<TeamOutlined />}
                onClick={() => setIsAttendanceModalOpen(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 rounded-xl h-11 font-semibold"
              >
                Xem danh sách điểm danh
              </Button>
            )}

            <Button
              type="primary"
              onClick={handleLeaveRoom}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 font-semibold"
            >
              {isTeacher ? "Quay lại Lịch giảng dạy" : "Quay lại Lịch học của tôi"}
            </Button>
          </div>
        </div>

        {isTeacher && sessionId && (
          <TeacherAttendanceModal
            open={isAttendanceModalOpen}
            sessionId={sessionId}
            isSessionActive={false}
            onClose={() => setIsAttendanceModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // 3. PREJOIN STAGE
  if (stage === "prejoin") {
    return (
      <ClassroomPreJoin
        sessionTitle={sessionTitle}
        className={className}
        role={isTeacher ? "HOST" : "PARTICIPANT"}
        userFullName={userFullName}
        isJoining={false}
        onJoin={handleStartJoin}
        onBack={handleLeaveRoom}
      />
    );
  }

  // 4. JOINING STAGE
  if (stage === "joining" || !joinData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <Spin size="large" className="mb-4" />
        <Title level={4} className="!text-white font-bold !mb-1">
          Đang kết nối vào phòng học...
        </Title>
        <Text className="text-slate-400 text-xs">
          Hệ thống đang xác thực quyền truy cập và cấp token LiveKit bảo mật.
        </Text>
      </div>
    );
  }

  // 5. IN_ROOM STAGE: Dual Provider Routing + Smart Classroom Status Banner
  const effectiveRole: ClassroomRole = joinData.role;
  const isWaitingRoom = Boolean(liveStatus?.isWaitingRoom || joinData.isWaitingRoom);
  const isOvertime = Boolean(liveStatus?.isOvertimeGracePeriod);
  const isInterrupted = liveStatus?.status === "INTERRUPTED";
  const teacherLateWarning = Boolean(
    !liveStatus?.teacherPresence?.firstTeachingJoinAt &&
      (liveStatus?.teacherPresence?.yellowWarningTriggeredAt ||
        liveStatus?.teacherPresence?.redViolationTriggeredAt)
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Smart Classroom Status Bar (TIN-05D + TIN-05E) */}
      <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 z-30">
        <div className="flex items-center gap-2 flex-wrap">
          {isWaitingRoom && (
            <Tag color="cyan" icon={<ClockCircleOutlined />} className="m-0 font-semibold">
              Phòng chờ mở sớm 10 phút — Thời gian chờ chưa tính vào điểm danh chính thức
            </Tag>
          )}
          {!isWaitingRoom && !isOvertime && !isInterrupted && (
            <Tag color="green" className="m-0 font-semibold">
              Đang trong giờ học chính thức (Yêu cầu ≥ 70% thời lượng để tính Có mặt)
            </Tag>
          )}
          {isOvertime && (
            <Tag color="gold" icon={<WarningOutlined />} className="m-0 font-semibold">
              Đã hết giờ học theo lịch — Phòng đang trong 30 phút ân hạn trước khi tự động hoàn tất
            </Tag>
          )}
          {isInterrupted && (
            <Tag color="volcano" icon={<WarningOutlined />} className="m-0 font-semibold">
              Buổi học tạm gián đoạn do giảng viên mất kết nối quá 30 phút — Thời gian học viên đã học được bảo lưu
            </Tag>
          )}
          {!isTeacher && teacherLateWarning && (
            <Tag color="warning" className="m-0">
              Giảng viên đang vào lớp trễ — Hệ thống đang theo dõi tự động
            </Tag>
          )}
          {!isTeacher && joinData.isReconnect && (
            <Tag color="purple" className="m-0">
              Đã khôi phục kết nối (Reconnected)
            </Tag>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isTeacher && liveStatus?.myAttendance && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400">
                Đã học:{" "}
                <strong className="text-white">
                  {Math.floor((liveStatus.myAttendance.scheduledOnlineSeconds || 0) / 60)}p
                </strong>{" "}
                ({Math.round(liveStatus.myAttendance.attendancePercentage || 0)}% / 70%)
              </span>
              {liveStatus.myAttendance.isLate && (
                <Tag color="warning" className="m-0 text-[10px]">
                  Vào muộn &gt; 5p
                </Tag>
              )}
            </div>
          )}

          {isTeacher && (
            <Button
              size="small"
              icon={<WarningOutlined />}
              onClick={() => setIsIncidentModalOpen(true)}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 rounded-lg text-xs"
            >
              Báo cáo sự cố / Học bù
            </Button>
          )}
        </div>
      </div>

      {joinData.provider === "LIVEKIT" && joinData.serverUrl ? (
        /* Real LiveKit Room Connection */
        <LiveKitClassroom
          serverUrl={joinData.serverUrl}
          token={joinData.accessToken}
          sessionTitle={sessionTitle}
          className={className}
          role={effectiveRole}
          startDatetime={liveStatus?.startDatetime || currentSession?.startDatetime}
          initialVideoEnabled={mediaOptions.videoEnabled}
          initialAudioEnabled={mediaOptions.audioEnabled}
          onOpenAttendance={isTeacher ? () => setIsAttendanceModalOpen(true) : undefined}
          onLeaveRoom={handleLeaveRoom}
          onEndSession={isTeacher ? handleEndSession : undefined}
          isEndingSession={endSessionMutation.isPending}
        />
      ) : (
        /* Fallback / Local Dev Mode (EDUNITY_DEV) */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <ClassroomHeader
            sessionTitle={sessionTitle}
            className={className}
            role={effectiveRole}
            participantCount={1}
            startDatetime={liveStatus?.startDatetime || currentSession?.startDatetime}
            onOpenAttendance={isTeacher ? () => setIsAttendanceModalOpen(true) : undefined}
            onLeaveRoom={handleLeaveRoom}
            onEndSession={isTeacher ? handleEndSession : undefined}
            isEndingSession={endSessionMutation.isPending}
          />
          <DevClassroom
            userFullName={userFullName}
            role={effectiveRole}
            initialVideoEnabled={mediaOptions.videoEnabled}
            initialAudioEnabled={mediaOptions.audioEnabled}
            onLeaveRoom={handleLeaveRoom}
            onEndSession={isTeacher ? handleEndSession : undefined}
            isEndingSession={endSessionMutation.isPending}
          />
        </div>
      )}

      {/* Teacher Attendance Modal */}
      {isTeacher && sessionId && (
        <TeacherAttendanceModal
          open={isAttendanceModalOpen}
          sessionId={sessionId}
          isSessionActive={true}
          onClose={() => setIsAttendanceModalOpen(false)}
        />
      )}

      {/* Teacher Incident Modal */}
      {isTeacher && sessionId && (
        <TeacherIncidentModal
          open={isIncidentModalOpen}
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          onClose={() => setIsIncidentModalOpen(false)}
        />
      )}
    </div>
  );
}
