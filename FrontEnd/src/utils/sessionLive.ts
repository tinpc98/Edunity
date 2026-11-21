/**
 * A Session is LIVE only after the Teacher pressed "Bắt đầu buổi học" and the backend confirmed it
 * (status IN_PROGRESS + roomState LIVE). Same rule as the backend join gate; never derived from the schedule clock.
 */
export const isSessionLive = (session?: { status?: string; roomState?: string } | null): boolean =>
  session?.status === "IN_PROGRESS" && session?.roomState === "LIVE";
