import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useState } from "react";
import { DisconnectReason } from "livekit-client";
import ClassroomHeader from "./ClassroomHeader";
import type { ClassroomRole } from "../../../types/session";
import type { SessionControl } from "./ClassroomHeader";

interface LiveKitClassroomProps {
  serverUrl: string;
  token: string;
  sessionTitle: string;
  className?: string;
  role: ClassroomRole;
  startDatetime?: string;
  initialVideoEnabled: boolean;
  initialAudioEnabled: boolean;
  onOpenAttendance?: () => void;
  onLeaveRoom: () => void;
  onEndSession?: () => void;
  isEndingSession?: boolean;
  sessionControl?: SessionControl;
  /**
   * Asks the backend for a fresh token (it re-checks the Session is still running); the new token remounts the room.
   * Undefined once the parent's retry limit is reached.
   */
  onReconnect?: () => void;
  /** The media connection is up: the parent resets its retry counter */
  onConnected?: () => void;
  /** The room was closed server-side (Teacher ended the Session): refresh the live status */
  onRoomClosed?: () => void;
}

function ClassroomInner({
  sessionTitle,
  className,
  role,
  startDatetime,
  onOpenAttendance,
  onLeaveRoom,
  onEndSession,
  isEndingSession,
  sessionControl,
}: Omit<
  LiveKitClassroomProps,
  "serverUrl" | "token" | "initialVideoEnabled" | "initialAudioEnabled" | "onReconnect" | "onConnected" | "onRoomClosed"
>) {
  const participants = useParticipants();

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      <ClassroomHeader
        sessionTitle={sessionTitle}
        className={className}
        role={role}
        participantCount={participants.length}
        startDatetime={startDatetime}
        onOpenAttendance={onOpenAttendance}
        onLeaveRoom={onLeaveRoom}
        onEndSession={onEndSession}
        isEndingSession={isEndingSession}
        sessionControl={sessionControl}
      />
      <div className="flex-1 overflow-hidden relative">
        <VideoConference />
        <RoomAudioRenderer />
      </div>
    </div>
  );
}

const describeConnectionError = (reason?: DisconnectReason, error?: Error) => {
  if (error) return `Không kết nối được tới máy chủ LiveKit: ${error.message}`;
  switch (reason) {
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "Tài khoản này vừa vào lớp ở một tab hoặc thiết bị khác, nên phiên ở đây đã bị ngắt.";
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "Bạn đã bị đưa ra khỏi phòng học.";
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return "Phòng học đã đóng.";
    case DisconnectReason.JOIN_FAILURE:
      return "Không vào được phòng LiveKit. Kiểm tra LIVEKIT_URL / API key / secret trong BackEnd/.env.";
    default:
      return "Mất kết nối tới phòng học.";
  }
};

export default function LiveKitClassroom(props: LiveKitClassroomProps) {
  // A failed or dropped LiveKit connection used to call onLeaveRoom and silently send the user back to the schedule.
  // Only a disconnect the user asked for leaves; anything else shows the reason with a retry.
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const canRetry = Boolean(props.onReconnect);

  if (connectionError) {
    return (
      <div className="flex-1 flex h-screen w-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">Không thể kết nối phòng học</h2>
          <p className="text-sm text-slate-300 break-words">{connectionError}</p>
          {!canRetry && (
            <p className="text-xs text-slate-400">Đã thử kết nối lại nhiều lần. Vui lòng rời phòng và vào lại sau.</p>
          )}
          <div className="flex gap-3 justify-center">
            {canRetry && (
              <button
                type="button"
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                onClick={() => {
                  setConnectionError(null);
                  props.onReconnect?.();
                }}
              >
                Thử kết nối lại
              </button>
            )}
            <button
              type="button"
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              onClick={props.onLeaveRoom}
            >
              Rời phòng
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      key={props.token}
      serverUrl={props.serverUrl}
      token={props.token}
      connect={true}
      video={props.initialVideoEnabled}
      audio={props.initialAudioEnabled}
      onConnected={props.onConnected}
      onDisconnected={(reason) => {
        if (reason === DisconnectReason.CLIENT_INITIATED) return props.onLeaveRoom();
        if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED) props.onRoomClosed?.();
        setConnectionError(describeConnectionError(reason));
      }}
      onError={(error) => {
        console.error("[LiveKit] error:", error);
        // Camera/microphone failures are reported here too; they must not close the room.
        if (["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError"].includes(error.name)) return;
        setConnectionError(describeConnectionError(undefined, error));
      }}
      data-lk-theme="default"
      className="flex-1 flex flex-col h-screen w-screen bg-slate-950 overflow-hidden"
    >
      <ClassroomInner
        sessionTitle={props.sessionTitle}
        className={props.className}
        role={props.role}
        startDatetime={props.startDatetime}
        onOpenAttendance={props.onOpenAttendance}
        onLeaveRoom={props.onLeaveRoom}
        onEndSession={props.onEndSession}
        isEndingSession={props.isEndingSession}
        sessionControl={props.sessionControl}
      />
    </LiveKitRoom>
  );
}
