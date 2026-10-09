import { useState, useEffect, useRef } from "react";
import { Button, Alert, Tag, Typography, Tooltip } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  VideoCameraOutlined,
  VideoCameraAddOutlined,
  ArrowLeftOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ClassroomRole } from "../../../types/session";

const { Title, Text } = Typography;

interface ClassroomPreJoinProps {
  sessionTitle: string;
  className?: string;
  role: ClassroomRole;
  userFullName: string;
  isJoining: boolean;
  onJoin: (options: { videoEnabled: boolean; audioEnabled: boolean }) => void;
  onBack: () => void;
}

export default function ClassroomPreJoin({
  sessionTitle,
  className,
  role,
  userFullName,
  isJoining,
  onJoin,
  onBack,
}: ClassroomPreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize preview stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function initMedia() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        activeStream = media;
        setStream(media);
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
      } catch (err: any) {
        console.warn("PreJoin media error:", err?.message);
        // Try audio only if video failed
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeStream = audioOnly;
          setStream(audioOnly);
          setVideoEnabled(false);
          setDeviceError("Không tìm thấy camera hoặc quyền bị từ chối. Bạn vẫn có thể vào lớp bằng âm thanh.");
        } catch {
          setVideoEnabled(false);
          setAudioEnabled(false);
          setDeviceError("Không tìm thấy camera hoặc microphone. Bạn vẫn có thể vào lớp để nghe và theo dõi.");
        }
      }
    }

    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      initMedia();
    } else {


      setVideoEnabled(false);
      setAudioEnabled(false);
      setDeviceError("Trình duyệt không hỗ trợ truy cập thiết bị nghe nhìn trực tiếp.");
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Update track enabled state
  useEffect(() => {
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = videoEnabled;
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = audioEnabled;
      });
    }
  }, [videoEnabled, audioEnabled, stream]);

  const handleToggleVideo = () => {
    setVideoEnabled((prev) => !prev);
  };

  const handleToggleAudio = () => {
    setAudioEnabled((prev) => !prev);
  };

  const handleJoinClick = () => {
    // Stop local preview tracks before handing over to LiveKit room
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onJoin({ videoEnabled, audioEnabled });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-white">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Top Back Action & Role Badge */}
        <div className="flex items-center justify-between mb-6">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"
          >
            Quay lại
          </Button>

          <Tag
            color={role === "HOST" ? "purple" : "blue"}
            className="rounded-full px-3 py-1 font-bold text-xs uppercase tracking-wider border-0"
          >
            {role === "HOST" ? "Giảng viên (Host)" : "Học viên (Participant)"}
          </Tag>
        </div>

        {/* Session Heading */}
        <div className="text-center mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 block mb-1">
            {className || "Lớp học trực tuyến"}
          </span>
          <Title level={3} className="!m-0 !text-white font-black leading-snug">
            {sessionTitle}
          </Title>
          <Text className="text-slate-400 text-xs mt-1 block">
            Chào mừng <span className="font-semibold text-slate-200">{userFullName}</span>! Hãy kiểm tra thiết bị trước khi tham gia buổi học.
          </Text>
        </div>

        {/* Video Preview Box */}
        <div className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 mb-6 flex items-center justify-center shadow-inner">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${!videoEnabled ? "hidden" : "block"}`}
          />

          {!videoEnabled && (
            <div className="flex flex-col items-center justify-center text-slate-500">
              <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-3xl text-slate-400 mb-3 shadow-md">
                <UserOutlined />
              </div>
              <span className="text-sm font-medium text-slate-400">Camera đang tắt</span>
            </div>
          )}

          {/* Quick Floating Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700/60 shadow-lg">
            <Tooltip title={audioEnabled ? "Tắt Micro" : "Bật Micro"}>
              <button
                type="button"
                onClick={handleToggleAudio}
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all cursor-pointer ${
                  audioEnabled
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                    : "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                }`}
              >
                {audioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
              </button>
            </Tooltip>

            <Tooltip title={videoEnabled ? "Tắt Camera" : "Bật Camera"}>
              <button
                type="button"
                onClick={handleToggleVideo}
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all cursor-pointer ${
                  videoEnabled
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                    : "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                }`}
              >
                {videoEnabled ? <VideoCameraOutlined /> : <VideoCameraAddOutlined />}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Device Alert if any */}
        {deviceError && (
          <Alert
            type="warning"
            showIcon
            message={deviceError}
            className="mb-6 rounded-2xl bg-amber-950/40 border-amber-900 text-amber-300 text-xs"
          />
        )}

        {/* Join CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button
            type="primary"
            size="large"
            loading={isJoining}
            onClick={handleJoinClick}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl h-12 shadow-lg shadow-indigo-600/30 text-sm"
          >
            {isJoining ? "Đang kết nối vào phòng học..." : "Tham gia lớp học ngay"}
          </Button>
        </div>

        {/* Privacy Note */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 mt-4 text-center">
          <SafetyCertificateOutlined className="text-emerald-500" />
          <span>Kết nối an toàn được mã hóa bởi hệ thống Edunity Live Classroom</span>
        </div>
      </div>
    </div>
  );
}
