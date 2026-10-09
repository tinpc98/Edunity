import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import ClassroomHeader from "./ClassroomHeader";
import type { ClassroomRole } from "../../../types/session";

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
}: Omit<LiveKitClassroomProps, "serverUrl" | "token" | "initialVideoEnabled" | "initialAudioEnabled">) {
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
      />
      <div className="flex-1 overflow-hidden relative">
        <VideoConference />
        <RoomAudioRenderer />
      </div>
    </div>
  );
}

export default function LiveKitClassroom(props: LiveKitClassroomProps) {
  return (
    <LiveKitRoom
      serverUrl={props.serverUrl}
      token={props.token}
      connect={true}
      video={props.initialVideoEnabled}
      audio={props.initialAudioEnabled}
      onDisconnected={props.onLeaveRoom}
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
      />
    </LiveKitRoom>
  );
}
