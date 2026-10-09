import { apiClient } from "../api/apiClient";
import type {
  ApiConversation,
  ConversationItem,
  ApiMessage,
  MessageItem,
  MessageListResponse,
  OpenConversationPayload,
  SendMessagePayload,
} from "../types/communication";
import { adaptConversation, adaptMessage } from "../api/communicationAdapters";

export const messageKeys = {
  all: ["messaging"] as const,
  conversations: (params?: { page?: number; pageSize?: number }) =>
    ["messaging", "conversations", params] as const,
  messages: (conversationId: string, params?: { limit?: number; before?: string }) =>
    ["messaging", "messages", conversationId, params] as const,
};

interface BackendConversationPaged {
  items: ApiConversation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BackendMessagePaged {
  items: ApiMessage[];
  hasMore: boolean;
  nextBefore: string | null;
}

export const messageService = {
  /**
   * GET /api/conversations
   * Lists conversations for the current user (Student or Teacher).
   */
  async listMyConversations(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ConversationItem[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const endpoint = `/conversations${query.toString() ? `?${query.toString()}` : ""}`;
    const data = await apiClient<BackendConversationPaged>(endpoint);

    return {
      items: (data.items || []).map(adaptConversation),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * POST /api/conversations
   * Opens or returns the 1-1 conversation between Student and Teacher.
   */
  async openConversation(payload: OpenConversationPayload): Promise<ConversationItem> {
    const data = await apiClient<ApiConversation>("/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptConversation(data);
  },

  /**
   * GET /api/conversations/:id/messages
   * Returns paginated messages ordered chronologically for display.
   */
  async listMessages(
    conversationId: string,
    params?: { limit?: number; before?: string }
  ): Promise<MessageListResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.before) query.set("before", params.before);

    const endpoint = `/conversations/${conversationId}/messages${
      query.toString() ? `?${query.toString()}` : ""
    }`;
    const data = await apiClient<BackendMessagePaged>(endpoint);

    return {
      items: (data.items || []).map(adaptMessage),
      hasMore: Boolean(data.hasMore),
      nextBefore: data.nextBefore || null,
    };
  },

  /**
   * POST /api/conversations/:id/messages
   * Sends a new message in the conversation.
   */
  async sendMessage(conversationId: string, payload: SendMessagePayload): Promise<MessageItem> {
    const data = await apiClient<ApiMessage>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptMessage(data);
  },

  /**
   * DELETE /api/messages/:id
   * Recalls (soft-deletes) sender's own message.
   */
  async deleteMessage(messageId: string): Promise<MessageItem> {
    const data = await apiClient<ApiMessage>(`/messages/${messageId}`, {
      method: "DELETE",
    });
    return adaptMessage(data);
  },
};
