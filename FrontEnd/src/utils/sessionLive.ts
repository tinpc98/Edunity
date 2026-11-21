/**
 * A Session is LIVE only after the Teacher pressed "Bắt đầu buổi học" and the backend confirmed it
 * (status IN_PROGRESS + roomState LIVE). Same rule as the backend join gate; never derived from the schedule clock.
 * The clock is used only the safe way round: the backend refuses Students after endDatetime, so a Session still
 * reported LIVE past it (its automatic end has not run yet) is not shown as LIVE / joinable.
 */
export const isSessionLive = (
  session?: { status?: string; roomState?: string; endDatetime?: string | Date } | null
): boolean =>
  session?.status === "IN_PROGRESS" &&
  session?.roomState === "LIVE" &&
  (!session.endDatetime || Date.now() <= new Date(session.endDatetime).getTime());
