import type { 
  ApiSession, 
  Session, 
  SessionContent, 
  ScheduleItem 
} from '../types/session';

/**
 * Normalizes raw Backend ApiSession DTO to frontend clean Session domain entity.
 * Hides raw MongoDB `_id` behind `id`.
 */
export function adaptSession(api: ApiSession, index?: number): Session {
  const classId = typeof api.classId === 'object' && api.classId !== null
    ? String(api.classId._id || '')
    : String(api.classId || '');

  const teacherId = typeof api.teacherId === 'object' && api.teacherId !== null
    ? String(api.teacherId._id || '')
    : String(api.teacherId || '');

  const contents: SessionContent[] = Array.isArray(api.contents)
    ? api.contents.map((c, cIdx) => ({
        id: String(c._id || c.id || `content_${cIdx}`),
        title: c.title,
        type: c.type,
        description: c.description || undefined,
        storageKey: c.storageKey || null,
        order: c.order || cIdx + 1,
      }))
    : [];

  return {
    id: String(api._id || api.id || ''),
    classId,
    className: api.className || '',
    teacherId,
    title: api.title || '',
    description: api.description || undefined,
    contents,
    startDatetime: api.startDatetime,
    endDatetime: api.endDatetime,
    meetingRoomId: api.meetingRoomId,
    status: api.status,
    recording: api.recording || null,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    canJoin: api.canJoin,
    sessionNumber: typeof index === 'number' ? index + 1 : undefined,
  };
}

/**
 * Normalizes an array of ApiSessions, sorting chronologically by startDatetime ASC.
 */
export function adaptSessions(list: ApiSession[] = []): Session[] {
  if (!Array.isArray(list)) return [];
  const sorted = [...list].sort((a, b) => {
    const timeA = new Date(a.startDatetime).getTime();
    const timeB = new Date(b.startDatetime).getTime();
    return timeA - timeB;
  });
  return sorted.map((item, idx) => adaptSession(item, idx));
}

/**
 * Derives FE-only ScheduleItem read models from an array of Session models.
 * Note: Schedule is derived purely on client and is not persisted.
 */
export function deriveScheduleItemsFromSessions(
  sessions: Session[],
  roleContext: 'TEACHER' | 'STUDENT'
): ScheduleItem[] {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .filter((s) => s.status !== 'CANCELLED')
    .map((s) => ({
      id: `schedule_${s.id}`,
      sessionId: s.id,
      classId: s.classId,
      className: s.className,
      title: s.title,
      startDatetime: s.startDatetime,
      endDatetime: s.endDatetime,
      status: s.status,
      canJoin: s.canJoin,
      roleContext,
    }))
    .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime());
}

/**
 * Formats time range "19:00 - 21:00" from ISO datetime strings.
 */
export function formatSessionTimeRange(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
    const startStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    return `${startStr} - ${endStr}`;
  } catch {
    return '';
  }
}
