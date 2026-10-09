import { useState, useEffect, useRef } from "react";
import { Tooltip, Avatar, Tag, Popconfirm } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  VideoCameraOutlined,
  VideoCameraAddOutlined,
  PoweroffOutlined,
  LogoutOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ClassroomRole } from "../../../types/session";

interface DevClassroomProps {
  userFullName: string;
  role: ClassroomRole;
  initialVideoEnabled: boolean;
  initialAudioEnabled: boolean;
  onLeaveRoom: () => void;
  onEndSession?: () => void;
  isEndingSession?: boolean;
}

export default function DevClassroom({
  userFullName,
  role,
  initialVideoEnabled,
  initialAudioEnabled,
  onLeaveRoom,
  onEndSession,
  isEndingSession,
}: DevClassroomProps) {
  const isTeacher = role === "HOST";
  const [videoEnabled, setVideoEnabled] = useState<boolean>(initialVideoEnabled);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(initialAudioEnabled);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize local user media
  useEffect(() => {
    let localStream: MediaStream | null = null;

    async function startMedia() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStream = media;
        setStream(media);
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
      } catch (err: any) {
        console.warn("DevClassroom local media:", err?.message);
      }
    }

    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      startMedia();
    }



    return () => {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Sync track states
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

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
      {/* Dev Mode Banner */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InfoCircleOutlined className="text-amber-400" />
          <span>
            <strong>Phòng học Chế độ Phát triển (EDUNITY_DEV):</strong> Backend đã cấp token xác thực phòng học và cập nhật trạng thái buổi học thành công.
          </span>
        </div>
        <Tag color="gold" className="m-0 text-[10px] font-bold">
          LOCAL DEV MODE
        </Tag>
      </div>

      {/* Main Classroom Stage */}
      <div className="flex-1 p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-4xl aspect-video bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 relative shadow-2xl flex items-center justify-center">
          {/* Video Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${!videoEnabled ? "hidden" : "block"}`}
          />

          {/* Fallback Avatar when Camera is off */}
          {!videoEnabled && (
            <div className="flex flex-col items-center justify-center gap-3">
              <Avatar
                size={96}
                icon={<UserOutlined />}
                className="bg-indigo-600 text-white font-bold text-3xl shadow-xl"
              >
                {userFullName.charAt(0) || "U"}
              </Avatar>
              <div className="text-center">
                <div className="font-bold text-slate-100 text-lg">{userFullName}</div>
                <div className="text-xs text-slate-400">Camera đang tắt</div>
              </div>
            </div>
          )}

          {/* Participant Overlay Info Badge */}
          <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/60 flex items-center gap-2 text-xs text-white">
            <span className="font-semibold">{userFullName} (Bạn)</span>
            <Tag color={isTeacher ? "purple" : "blue"} className="m-0 text-[10px] font-bold px-1.5 py-0 border-0">
              {isTeacher ? "Giảng viên" : "Học viên"}
            </Tag>
            <span className={audioEnabled ? "text-emerald-400" : "text-rose-400"}>
              {audioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="h-20 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-center gap-3 px-4 shrink-0">
        <Tooltip title={audioEnabled ? "Tắt Micro" : "Bật Micro"}>
          <button
            type="button"
            onClick={handleToggleAudio}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition-all cursor-pointer ${
              audioEnabled
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                : "bg-rose-600 hover:bg-rose-700 text-white shadow-lg"
            }`}
          >
            {audioEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
          </button>
        </Tooltip>

        <Tooltip title={videoEnabled ? "Tắt Camera" : "Bật Camera"}>
          <button
            type="button"
            onClick={handleToggleVideo}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition-all cursor-pointer ${
              videoEnabled
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                : "bg-rose-600 hover:bg-rose-700 text-white shadow-lg"
            }`}
          >
            {videoEnabled ? <VideoCameraOutlined /> : <VideoCameraAddOutlined />}
          </button>
        </Tooltip>

        <div className="h-6 w-px bg-slate-700 mx-1" />

        {/* Leave Room Button */}
        <Tooltip title="Rời khỏi phòng học">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="px-5 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <LogoutOutlined />
            <span>Rời phòng</span>
          </button>
        </Tooltip>

        {/* Teacher-only: End Session Button */}
        {isTeacher && onEndSession && (
          <Popconfirm
            title="Kết thúc buổi học cho tất cả mọi người?"
            description="Buổi học sẽ chuyển sang trạng thái COMPLETED và chốt danh sách điểm danh."
            onConfirm={onEndSession}
            okText="Kết thúc"
            cancelText="Hủy"
            okButtonProps={{ danger: true, loading: isEndingSession }}
          >
            <button
              type="button"
              className="px-5 h-12 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-rose-600/30"
            >
              <PoweroffOutlined />
              <span>Kết thúc buổi học</span>
            </button>
          </Popconfirm>
        )}
      </div>
    </div>
  );
}
