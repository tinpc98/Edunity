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
import { isSessionLive } from "../../utils/sessionLive";

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

  // Auto-join starts on the connecting screen, so the pre-join camera preview never flashes up
  const [stage, setStage] = useState<ClassroomStage>(() =>
    (location.state as { autoJoin?: boolean } | null)?.autoJoin && user?.role === "STUDENT" ? "joining" : "prejoin"
  );
  const [joinData, setJoinData] = useState<JoinSessionResponse | null>(null);
  const [joinError, setJoinError] = useState<any>(null);

  const [mediaOptions, setMediaOptions] = useState<{ videoEnabled: boolean; audioEnabled: boolean }>({
    videoEnabled: true,
    audioEnabled: true,
  });

  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState<boolean>(false);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState<boolean>(false);
  // One id per mounted classroom page (one browser tab); generated once, outside of render
  const [connectionSessionId] = useState(() => `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const connectionSessionIdRef = useRef<string>(connectionSessionId);

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
  // Students go back to My Learning, never to the Schedule
  const studentBackRoute = ROUTES.STUDENT.HOME;

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
  const { data: liveStatus, error: liveStatusError } = useQuery({
    queryKey: sessionKeys.liveStatus(sessionId || ""),
    queryFn: () => sessionService.getSessionLiveStatus(sessionId!),
    enabled: Boolean(sessionId && isAuthenticated),
    // A Student waiting on the "not started yet" screen polls faster so the join button appears soon after Start
    refetchInterval: stage === "in_room" ? 15000 : stage === "prejoin" && user?.role === "STUDENT" ? 10000 : 30000,
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
    // The backend verifies presence against the LiveKit room, and the media connection is established a moment after
    // this stage begins: an early call is rejected with 403 UNVERIFIED_LIVEKIT_PRESENCE. Retry until it is verified.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryConnect = (attempt: number) => {
      sessionService.connectSessionPresence(sessionId, connId).catch(() => {
        if (!cancelled && attempt < 10) timer = setTimeout(() => tryConnect(attempt + 1), 3000);
      });
    };
    timer = setTimeout(() => tryConnect(1), 1500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sessionService.leaveSessionPresence(sessionId, connId).catch(() => {});
    };
  }, [stage, sessionId]);

  // 1. Join Session Mutation. Every join (first or reconnect) asks the backend again: it re-checks the Session is
  // running and issues a fresh token, so an expired token is never reused.
  const isReconnectRef = useRef(false);
  const joinMutation = useMutation({
    mutationFn: () => sessionService.joinSession(sessionId!),
    onSuccess: (data: JoinSessionResponse) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      setJoinData(data);
      setStage("in_room");
    },
    onError: (err: any) => {
      // The Teacher ended the Session while this user was reconnecting: show the ended screen, not an error
      if (isReconnectRef.current && (err?.code === "SESSION_ENDED" || err?.code === "SESSION_CANCELLED")) {
        setStage("ended");
        return;
      }
      setJoinError(err);
      setStage("error");
    },
  });

  const requestJoin = () => {
    if (joinMutation.isPending) return; // one token request at a time
    setStage("joining");
    joinMutation.mutate();
  };

  // At most MAX_RECONNECTS retries in a row; the counter resets once LiveKit is connected again
  const MAX_RECONNECTS = 3;
  const [reconnectCount, setReconnectCount] = useState(0);
  const handleReconnect = () => {
    isReconnectRef.current = true;
    setReconnectCount((n) => n + 1);
    requestJoin();
  };

  // A Student arriving from a LIVE card on My Learning goes straight in (camera and mic off; they turn them on from the
  // LiveKit control bar, which asks the browser for permission). The backend still checks enrollment and that the
  // Session is running. The flag is cleared so a refresh or a direct URL gets the normal pre-join screen.
  const autoJoinRef = useRef(false);
  const wantsAutoJoin = Boolean((location.state as { autoJoin?: boolean } | null)?.autoJoin);
  useEffect(() => {
    if (!wantsAutoJoin || autoJoinRef.current || user?.role !== "STUDENT" || !sessionId) return;
    autoJoinRef.current = true; // StrictMode runs effects twice: join only once
    navigate(location.pathname, { replace: true, state: null });
    setMediaOptions({ videoEnabled: false, audioEnabled: false });
    requestJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAutoJoin, user?.role, sessionId]);

  // 2. Teacher Start Session Mutation: recording starts first; a mandatory recording failure keeps the room WAITING
  const startSessionMutation = useMutation({
    mutationFn: () => sessionService.startSession(sessionId!),
    onSuccess: () => {
      message.success("Buổi học đã bắt đầu. Hệ thống đang ghi hình.");
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
    onError: (err: any) => {
      const byCode: Record<string, string> = {
        RECORDING_START_FAILED:
          "Không bật được ghi hình nên buổi học chưa bắt đầu. Vui lòng thử lại; quản trị viên đã được thông báo.",
        TEACHER_NOT_IN_ROOM: "Bạn cần kết nối vào phòng học trước khi bắt đầu buổi học.",
        VIDEO_PROVIDER_UNAVAILABLE: "Không kết nối được máy chủ video. Vui lòng thử lại sau ít phút.",
        SESSION_ALREADY_STARTED: "Buổi học đã được bắt đầu.",
      };
      message.error(byCode[err?.code] || err?.message || "Không thể bắt đầu buổi học.");
      queryClient.invalidateQueries({ queryKey: sessionKeys.liveStatus(sessionId || "") });
    },
  });

  const sessionStatus = liveStatus?.status;
  // The backend does not close the LiveKit room when the Teacher ends the session: participants still inside would stay
  // in an empty room. The live status poll (every 15s) moves them to the ended screen instead.
  const sessionClosedRemotely =
    stage === "in_room" && (sessionStatus === "COMPLETED" || sessionStatus === "CANCELLED");
  const canEndSession = isTeacher && (sessionStatus === "IN_PROGRESS" || sessionStatus === "INTERRUPTED");
  const sessionControl = {
    status: sessionStatus,
    recordingStatus: liveStatus?.recording?.status ?? null,
    onStart: isTeacher && isVerifiedTeacher ? () => startSessionMutation.mutate() : undefined,
    isStarting: startSessionMutation.isPending,
  };

  // 3. Teacher End Session Mutation
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
    isReconnectRef.current = false;
    requestJoin();
  };

  const handleLeaveRoom = async () => {
    // Leaving only disconnects this user: unmounting LiveKitRoom closes the media connection and the in_room effect
    // cleanup sends the presence "leave" (sending it here as well produced two concurrent leaves). It never ends the
    // Session; closed tabs and dropped networks are covered by the LiveKit webhook / heartbeat on the backend.
    if (isTeacher) {
      navigate(isVerifiedTeacher ? ROUTES.TEACHER.SCHEDULE : ROUTES.TEACHER.HOME);
    } else {
      navigate(studentBackRoute);
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
          actionText: isTeacher ? "Quay lại lịch dạy" : "Về Lớp học của tôi",
          actionRoute: studentBackRoute,
        };
      case "SESSION_CANCELLED":
        return {
          title: "Buổi học đã bị hủy",
          desc: "Buổi học này đã bị hủy (hoặc tự động hủy do giảng viên vắng mặt sau 30 phút). Học viên không bị tính vắng và sẽ được xếp lịch học bù / bảo vệ quyền lợi.",
          actionText: isTeacher ? "Quay lại lịch dạy" : "Về Lớp học của tôi",
          actionRoute: isTeacher ? ROUTES.TEACHER.SCHEDULE : studentBackRoute,
        };
      case "SESSION_ENDED":
        return {
          title: "Buổi học đã kết thúc",
          desc: "Buổi học này đã kết thúc. Bạn có thể xem lại bản ghi (nếu có) trên trang chi tiết lớp học.",
          actionText: "Quay lại lớp học",
          actionRoute: isTeacher ? ROUTES.TEACHER.CLASSES : ROUTES.STUDENT.HOME,
        };
      case "SESSION_NOT_STARTED":
        return {
          title: "Giáo viên chưa bắt đầu buổi học",
          desc: "Bạn có thể vào phòng khi giáo viên nhấn Bắt đầu buổi học. Thẻ lớp trên trang Lớp học của tôi sẽ hiện LIVE khi buổi học bắt đầu.",
          actionText: "Thử lại",
          actionRoute: null,
        };
      case "SESSION_NOT_JOINABLE":
        return {
          title: isTeacher ? "Ngoài khung giờ của buổi học" : "Chưa thể vào phòng học",
          desc: isTeacher
            ? "Bạn chỉ có thể mở phòng và bắt đầu buổi học trong khung giờ đã lên lịch."
            : "Phòng học chỉ mở khi giáo viên nhấn Bắt đầu buổi học.",
          actionText: isTeacher ? "Quay lại lịch dạy" : "Về Lớp học của tôi",
          actionRoute: isTeacher ? ROUTES.TEACHER.SCHEDULE : studentBackRoute,
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
          actionText: isTeacher ? "Quay lại lớp của tôi" : "Về Lớp học của tôi",
          actionRoute: isTeacher ? ROUTES.TEACHER.CLASSES : studentBackRoute,
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
                className="bg-teal-600 hover:bg-teal-700 rounded-xl h-11 font-semibold"
              >
                {errorInfo.actionText}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={requestJoin}
                className="bg-teal-600 hover:bg-teal-700 rounded-xl h-11 font-semibold"
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
  if (stage === "ended" || sessionClosedRemotely) {
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
              className="bg-teal-600 hover:bg-teal-700 rounded-xl h-11 font-semibold"
            >
              {isTeacher ? "Quay lại Lịch giảng dạy" : "Về Lớp học của tôi"}
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

  // 3a. STUDENT, SESSION NOT LIVE (direct URL / old link): no camera preview, no join call — just say so.
  // The live-status poll switches to the pre-join screen as soon as the Teacher presses Start.
  if (stage === "prejoin" && !isTeacher && !isSessionLive(liveStatus)) {
    const isClosed = liveStatus?.status === "COMPLETED" || liveStatus?.status === "CANCELLED";
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          {!liveStatus && liveStatusError ? (
            <>
              <Title level={4} className="!text-white !mb-2 font-bold">
                Không thể mở buổi học này
              </Title>
              <Paragraph className="text-slate-400 text-xs mb-6">
                {getFriendlyErrorMessage(liveStatusError, "Bạn không có quyền tham gia hoặc không tải được trạng thái buổi học.")}
              </Paragraph>
            </>
          ) : !liveStatus ? (
            <Spin size="large" className="mb-6" />
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto mb-5 text-2xl">
                <ClockCircleOutlined />
              </div>
              <Title level={4} className="!text-white !mb-2 font-bold">
                {isClosed
                  ? liveStatus.status === "CANCELLED"
                    ? "Buổi học đã bị hủy"
                    : "Buổi học đã kết thúc"
                  : "Giáo viên chưa bắt đầu buổi học"}
              </Title>
              <Paragraph className="text-slate-400 text-xs mb-6">
                {isClosed
                  ? sessionTitle
                  : "Phòng học chỉ mở khi giáo viên nhấn Bắt đầu buổi học. Trang này tự cập nhật, nút vào phòng sẽ xuất hiện ngay khi buổi học bắt đầu."}
              </Paragraph>
            </>
          )}
          <Button
            type="primary"
            onClick={handleLeaveRoom}
            className="bg-teal-600 hover:bg-teal-700 rounded-xl h-11 font-semibold w-full"
          >
            Về Lớp học của tôi
          </Button>
        </div>
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
  // WAITING = Teacher in the room, not started yet (only the Teacher can be here then); live status wins once loaded
  const isWaitingRoom = Boolean(liveStatus ? liveStatus.isWaitingRoom : joinData.isWaitingRoom);
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
              Chưa bắt đầu — Học viên chỉ vào được sau khi bạn nhấn Bắt đầu buổi học
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
            <Tag color="cyan" className="m-0">
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
          onEndSession={canEndSession ? handleEndSession : undefined}
          isEndingSession={endSessionMutation.isPending}
          sessionControl={sessionControl}
          onReconnect={reconnectCount < MAX_RECONNECTS ? handleReconnect : undefined}
          onConnected={() => setReconnectCount(0)}
          onRoomClosed={() => queryClient.invalidateQueries({ queryKey: sessionKeys.liveStatus(sessionId || "") })}
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
            onEndSession={canEndSession ? handleEndSession : undefined}
            isEndingSession={endSessionMutation.isPending}
            sessionControl={sessionControl}
          />
          <DevClassroom
            userFullName={userFullName}
            role={effectiveRole}
            initialVideoEnabled={mediaOptions.videoEnabled}
            initialAudioEnabled={mediaOptions.audioEnabled}
            onLeaveRoom={handleLeaveRoom}
            onEndSession={canEndSession ? handleEndSession : undefined}
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
