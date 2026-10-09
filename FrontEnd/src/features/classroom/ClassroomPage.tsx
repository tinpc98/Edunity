import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tag, Typography, Spin, message } from "antd";
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../stores/auth.store";
import { sessionService, sessionKeys } from "../../services/session.service";
import type { JoinSessionResponse, ClassroomRole } from "../../types/session";
import { ROUTES } from "../../routes/routePaths";

import ClassroomPreJoin from "./components/ClassroomPreJoin";
import LiveKitClassroom from "./components/LiveKitClassroom";
import DevClassroom from "./components/DevClassroom";
import ClassroomHeader from "./components/ClassroomHeader";
import TeacherAttendanceModal from "./components/TeacherAttendanceModal";

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

  // Authenticated user role check
  const isTeacher = user?.role === "TEACHER";
  const userFullName = user?.fullName || (isTeacher ? "Giảng viên" : "Học viên");


  // Query student sessions to find current session metadata if available
  const { data: mySessions = [] } = useQuery({
    queryKey: sessionKeys.studentMySessions(),
    queryFn: () => sessionService.getMySessions(),
    enabled: Boolean(user?.role === "STUDENT"),
    staleTime: 60000,
  });


  const currentSession = useMemo(() => {
    return mySessions.find((s) => s.id === sessionId);
  }, [mySessions, sessionId]);

  const sessionTitle = currentSession?.title || "Buổi học trực tuyến";
  const className = currentSession?.className || undefined;

  // 1. Join Session Mutation
  const joinMutation = useMutation({
    mutationFn: () => sessionService.joinSession(sessionId!),
    onSuccess: (data: JoinSessionResponse) => {
      // Invalidate relevant queries since teacher join might have started the session
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
    setMediaOptions(options);
    setStage("joining");
    joinMutation.mutate();
  };

  const handleLeaveRoom = () => {
    if (isTeacher) {
      navigate(ROUTES.TEACHER.SCHEDULE);
    } else {
      navigate(ROUTES.STUDENT.SCHEDULE);
    }
  };

  const handleEndSession = () => {
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
      case "SESSION_CANCELLED":
        return {
          title: "Buổi học đã bị hủy",
          desc: "Giảng viên hoặc ban quản trị đã hủy buổi học này.",
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
          title: "Chưa đến giờ mở phòng học",
          desc: msg || "Phòng học trực tuyến chỉ mở trước giờ học 15 phút và đóng khi buổi học kết thúc.",
          actionText: "Quay lại lịch học",
          actionRoute: isTeacher ? ROUTES.TEACHER.SCHEDULE : ROUTES.STUDENT.SCHEDULE,
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
            Buổi học trực tuyến đã hoàn thành và danh sách điểm danh đã được ghi nhận trên hệ thống.
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

        {/* Attendance Modal for Teacher */}
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

  // 5. IN_ROOM STAGE: Dual Provider Routing
  const effectiveRole: ClassroomRole = joinData.role;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden">
      {joinData.provider === "LIVEKIT" && joinData.serverUrl ? (
        /* Real LiveKit Room Connection */
        <LiveKitClassroom
          serverUrl={joinData.serverUrl}
          token={joinData.accessToken}
          sessionTitle={sessionTitle}
          className={className}
          role={effectiveRole}
          startDatetime={currentSession?.startDatetime}
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
            startDatetime={currentSession?.startDatetime}
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
    </div>
  );
}
