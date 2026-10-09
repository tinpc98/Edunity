import type {
  ApiNotification,
  NotificationItem,
  ApiConversation,
  ConversationItem,
  ApiMessage,
  MessageItem,
  ApiReview,
  ReviewItem,
  ApiReport,
  ReportItem,
  ReportType,
} from "../types/communication";

export function adaptNotification(api: ApiNotification): NotificationItem {
  return {
    id: api._id,
    userId: api.userId,
    title: api.title || "",
    content: api.content || "",
    type: api.type || "SYSTEM",
    isRead: Boolean(api.isRead),
    readAt: api.readAt || null,
    createdAt: api.createdAt,
  };
}

export function adaptConversation(api: ApiConversation): ConversationItem {
  return {
    id: api.id,
    classId: api.classId || null,
    className: api.className || null,
    participant: api.participant
      ? {
          id: api.participant.id,
          fullName: api.participant.fullName || "Người dùng",
          avatarUrl: api.participant.avatarUrl || null,
          role: api.participant.role,
          email: api.participant.email,
        }
      : null,
    lastMessagePreview: api.lastMessagePreview || null,
    lastMessageAt: api.lastMessageAt || null,
    createdAt: api.createdAt,
  };
}

export function adaptMessage(api: ApiMessage): MessageItem {
  return {
    id: api.id,
    conversationId: api.conversationId,
    senderId: api.senderId,
    content: api.isDeleted ? null : api.content,
    isDeleted: Boolean(api.isDeleted),
    createdAt: api.createdAt,
  };
}

export function adaptReview(api: ApiReview): ReviewItem {
  return {
    id: api._id,
    rating: api.rating,
    comment: api.comment || "",
    classId: api.classId || null,
    className: api.className || null,
    student: {
      id: api.student?.id || null,
      fullName: api.student?.fullName || "Học viên ẩn danh",
      avatarUrl: api.student?.avatarUrl || null,
    },
    createdAt: api.createdAt,
  };
}

export function adaptReport(api: ApiReport): ReportItem {
  return {
    id: (api.id || api._id || "") as string,
    type: api.type as ReportType,
    description: api.description || "",
    status: api.status,
    reviewNote: api.reviewNote || null,
    reviewedAt: api.reviewedAt || null,
    reporter: api.reporter || null,
    reportedUser: api.reportedUser || null,
    handledBy: api.handledBy || null,
    classSummary: api.class || null,
    createdAt: api.createdAt,
  };
}
