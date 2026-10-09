import React, { useState, useEffect, useRef } from "react";
import {
  Avatar,
  Input,
  Button,
  Empty,
  Spin,
  Tag,
  Tooltip,
  Modal,
  App as AntdApp,
} from "antd";
import {
  SendOutlined,
  UserOutlined,
  RollbackOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
  MessageOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../stores/auth.store";
import { messageService, messageKeys } from "../../services/message.service";
import type { ConversationItem, MessageItem } from "../../types/communication";

const { TextArea } = Input;

export const MessagesPage: React.FC = () => {
  const { user } = useAuthStore();
  const currentUserId = user?.userId || (user as any)?.id;
  const { message: antMessage } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected conversation ID (from URL param or state)
  const selectedConversationId = searchParams.get("id");

  const [searchQuery, setSearchQuery] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Conversations list (poll every 10 seconds for new messages)
  const { data: convData, isLoading: isLoadingConvs } = useQuery({
    queryKey: messageKeys.conversations(),
    queryFn: () => messageService.listMyConversations({ page: 1, pageSize: 50 }),
    refetchInterval: 10000,
  });

  const conversations = convData?.items || [];

  // Filter conversations by participant name or class name
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = c.participant?.fullName?.toLowerCase().includes(query);
    const classMatch = c.className?.toLowerCase().includes(query);
    return Boolean(nameMatch || classMatch);
  });

  // Current active conversation
  const activeConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );

  // 2. Fetch Messages for active conversation (poll every 5 seconds)
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: messageKeys.messages(selectedConversationId || ""),
    queryFn: () =>
      selectedConversationId
        ? messageService.listMessages(selectedConversationId, { limit: 50 })
        : Promise.resolve({ items: [], hasMore: false, nextBefore: null }),
    enabled: Boolean(selectedConversationId),
    refetchInterval: selectedConversationId ? 5000 : false,
  });

  const messages: MessageItem[] = messagesData?.items || [];

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, selectedConversationId]);

  // 3. Send Message Mutation
  const sendMutation = useMutation({
    mutationFn: (content: string) => {
      if (!selectedConversationId) throw new Error("No conversation selected");
      return messageService.sendMessage(selectedConversationId, { content });
    },
    onSuccess: () => {
      setDraftContent("");
      queryClient.invalidateQueries({
        queryKey: messageKeys.messages(selectedConversationId || ""),
      });
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversations(),
      });
    },
    onError: (err: any) => {
      antMessage.error(err.message || "Không thể gửi tin nhắn");
    },
  });

  // 4. Recall Message Mutation
  const recallMutation = useMutation({
    mutationFn: (messageId: string) => messageService.deleteMessage(messageId),
    onSuccess: () => {
      antMessage.success("Đã thu hồi tin nhắn");
      queryClient.invalidateQueries({
        queryKey: messageKeys.messages(selectedConversationId || ""),
      });
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversations(),
      });
    },
    onError: (err: any) => {
      antMessage.error(err.message || "Không thể thu hồi tin nhắn");
    },
  });

  const handleSendMessage = () => {
    const trimmed = draftContent.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      antMessage.warning("Tin nhắn không được vượt quá 2000 ký tự");
      return;
    }
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const confirmRecall = (msgId: string) => {
    Modal.confirm({
      title: "Thu hồi tin nhắn?",
      content: "Tin nhắn này sẽ được gỡ bỏ đối với cả hai bên.",
      okText: "Thu hồi",
      okType: "danger",
      cancelText: "Hủy",
      onOk: () => recallMutation.mutate(msgId),
    });
  };

  const selectConversation = (conv: ConversationItem) => {
    setSearchParams({ id: conv.id });
  };

  const clearSelectedConversation = () => {
    setSearchParams({});
  };

  return (
    <div className="h-[calc(100vh-4rem)] max-w-7xl mx-auto p-4 md:p-6 flex flex-col">
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
        {/* ================= LEFT SIDEBAR (CONVERSATIONS) ================= */}
        <div
          className={`w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50 ${
            selectedConversationId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <MessageOutlined className="text-indigo-600" />
                Hộp thư
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                {conversations.length} cuộc trò chuyện
              </span>
            </div>
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tìm theo tên hoặc lớp học..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
              className="rounded-xl bg-slate-50 border-slate-200"
            />
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingConvs ? (
              <div className="py-12 flex justify-center items-center">
                <Spin size="default" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    searchQuery
                      ? "Không tìm thấy cuộc trò chuyện"
                      : "Chưa có cuộc trò chuyện nào"
                  }
                />
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === selectedConversationId;
                const isTeacher = c.participant?.role === "TEACHER";
                return (
                  <div
                    key={c.id}
                    onClick={() => selectConversation(c)}
                    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-indigo-50/80 border-r-4 border-indigo-600"
                        : "hover:bg-slate-100/70 bg-white"
                    }`}
                  >
                    <Avatar
                      src={c.participant?.avatarUrl}
                      icon={<UserOutlined />}
                      size={44}
                      className={
                        isTeacher ? "bg-amber-500 shrink-0" : "bg-indigo-600 shrink-0"
                      }
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-sm text-slate-800 truncate">
                          {c.participant?.fullName || "Người dùng"}
                        </span>
                        {c.lastMessageAt && (
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {new Date(c.lastMessageAt).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Tag
                          color={isTeacher ? "gold" : "blue"}
                          className="text-[10px] py-0 px-1.5 leading-normal m-0 rounded"
                        >
                          {isTeacher ? "Giáo viên" : "Học viên"}
                        </Tag>
                        {c.className && (
                          <span className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                            <BookOutlined className="text-[10px]" />
                            {c.className}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 truncate mt-1">
                        {c.lastMessagePreview || "Chưa có tin nhắn"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT CHAT AREA ================= */}
        <div
          className={`flex-1 flex flex-col bg-white ${
            !selectedConversationId ? "hidden md:flex" : "flex"
          }`}
        >
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shadow-2xs">
                <div className="flex items-center gap-3">
                  <Button
                    type="text"
                    shape="circle"
                    icon={<ArrowLeftOutlined />}
                    onClick={clearSelectedConversation}
                    className="md:hidden"
                  />
                  <Avatar
                    src={activeConversation.participant?.avatarUrl}
                    icon={<UserOutlined />}
                    size={40}
                    className={
                      activeConversation.participant?.role === "TEACHER"
                        ? "bg-amber-500"
                        : "bg-indigo-600"
                    }
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-800">
                        {activeConversation.participant?.fullName || "Người dùng"}
                      </h3>
                      <Tag
                        color={
                          activeConversation.participant?.role === "TEACHER"
                            ? "gold"
                            : "blue"
                        }
                        className="text-[10px] py-0 px-1.5 rounded m-0"
                      >
                        {activeConversation.participant?.role === "TEACHER"
                          ? "Giáo viên"
                          : "Học viên"}
                      </Tag>
                    </div>
                    {activeConversation.className && (
                      <p className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5">
                        <BookOutlined />
                        Lớp: {activeConversation.className}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages Stream */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50/40"
              >
                {isLoadingMessages ? (
                  <div className="py-20 flex justify-center items-center">
                    <Spin size="default" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-20 text-center">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Hãy bắt đầu cuộc trò chuyện bằng tin nhắn đầu tiên."
                    />
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = Boolean(currentUserId && msg.senderId === currentUserId);
                    const isRecalled = msg.isDeleted;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col group ${isMine ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm transition-all shadow-2xs relative ${
                            isMine
                              ? isRecalled
                                ? "bg-slate-200/70 text-slate-500 border border-slate-300 italic"
                                : "bg-indigo-600 text-white rounded-br-xs"
                              : isRecalled
                              ? "bg-slate-100 text-slate-400 border border-slate-200 italic"
                              : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                          }`}
                        >
                          {isRecalled ? (
                            <span className="flex items-center gap-1.5 text-xs">
                              <RollbackOutlined />
                              Tin nhắn đã được thu hồi
                            </span>
                          ) : (
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.content}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 px-1">
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>

                          {/* Recall Button: Only for my messages and if not already recalled */}
                          {isMine && !isRecalled && (
                            <Tooltip title="Thu hồi tin nhắn">
                              <button
                                type="button"
                                onClick={() => confirmRecall(msg.id)}
                                className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-500 hover:text-rose-700 transition-opacity flex items-center gap-0.5 cursor-pointer"
                              >
                                <RollbackOutlined />
                                Thu hồi
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="p-3 md:p-4 border-t border-slate-200 bg-white">
                <div className="flex items-end gap-2">
                  <TextArea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nhập tin nhắn... (Nhấn Enter để gửi, Shift+Enter xuống dòng)"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    maxLength={2000}
                    className="rounded-xl border-slate-200 resize-none py-2 px-3 text-sm"
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSendMessage}
                    loading={sendMutation.isPending}
                    disabled={!draftContent.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 h-10 px-5 rounded-xl shrink-0"
                  >
                    Gửi
                  </Button>
                </div>
                <div className="flex justify-between items-center mt-1 px-1 text-[11px] text-slate-400">
                  <span>Tối đa 2000 ký tự</span>
                  <span>{draftContent.length}/2000</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center p-8 text-center bg-slate-50/30">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                <MessageOutlined className="text-2xl" />
              </div>
              <h3 className="text-base font-bold text-slate-700">
                Chọn một cuộc trò chuyện
              </h3>
              <p className="text-sm text-slate-400 max-w-sm mt-1">
                Chọn một cuộc trò chuyện từ danh sách bên trái hoặc bắt đầu nhắn tin với giáo viên / học viên.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
