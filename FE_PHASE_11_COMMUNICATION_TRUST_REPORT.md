# FE Phase 11 — Communication + Trust

## 1. Scope
Implementation of the real communication and trust layer for Edunity against the read-only Node.js/Express/MongoDB backend:
- **Phase 11A — Notifications**: Real notification feed, canonical unread count, single item read mark, batch read-all, interactive notification center popover, and full `/notifications` history page.
- **Phase 11B — Messaging**: 1-1 Student ↔ Teacher messaging, conversation listing, chronological message stream, cursor pagination, message send with 2000-char limit, sender message recall (soft-delete), participant security guards, and `/messages` hub.
- **Phase 11C — Reviews**: Student review submission on completed/running classes, rating & comment validation, one-review per enrollment guard, class & teacher reviews display, teacher reviews page at `/teacher/reviews`, and aggregate rating calculation directly from backend canonical values.
- **Phase 11D — Complaints / Reports**: Student/Teacher/Sponsor reporting mechanism, personal reports history at `/reports`, Admin complaints queue at `/admin/reports`, detail inspection, and status state machine (`OPEN` → `IN_REVIEW` → `RESOLVED` / `REJECTED` with required `reviewNote`).

---

## 2. Backend Discovery
Thorough discovery was conducted across `BackEnd/src/`:
- `routes/accountRoutes.js` & `controllers/accountController.js`:
  - `GET /api/me/notifications`: Paged notifications with canonical `unreadCount`.
  - `POST /api/me/notifications/:id/read`: Mark single notification as read.
  - `POST /api/me/notifications/read-all`: Mark all notifications as read.
  - `POST /api/classes/:id/reviews`: Student submits class review (1-5 rating, comment).
  - `GET /api/classes/:id/reviews`: Public class review listing with `ratingAverage` and `ratingCount`.
  - `GET /api/teachers/:id/reviews`: Public teacher review listing with `ratingAverage` and `ratingCount`.
- `routes/communityRoutes.js` & `controllers/communityController.js`:
  - `GET /api/conversations`: Paged conversation list with populated participant summary and preview.
  - `POST /api/conversations`: Open/return conversation between Student and Teacher.
  - `GET /api/conversations/:id/messages`: Chronological message list with cursor pagination (`before`).
  - `POST /api/conversations/:id/messages`: Send message (max 2000 chars, sender derives from JWT).
  - `DELETE /api/messages/:id`: Recall own message (soft delete, updates conversation preview).
  - `POST /api/reports`: File report against user and/or class (`REPORT_TYPES`).
  - `GET /api/me/reports`: User lists own reports.
  - `GET /api/admin/reports`: Admin lists reports with status & type filters.
  - `GET /api/admin/reports/:id`: Admin retrieves detailed report.
  - `PATCH /api/admin/reports/:id`: Admin updates status (`IN_REVIEW`, `RESOLVED`, `REJECTED`).
- Realtime audit: Checked `BackEnd/package.json` and codebase. No `socket.io` or WebSocket server exists. Backend uses database-persisted events with REST queries.

---

## 3. Notification Contract
### List
- **Endpoint**: `GET /api/me/notifications?page=1&pageSize=20&unread=true`
- **Auth**: Authenticated user.
- **Response**: `{ items: ApiNotification[], total: number, page: number, pageSize: number, totalPages: number, unreadCount: number }`

### Unread Count
- Derived canonically from server response: `unreadCount` returned directly in `GET /api/me/notifications`.
- Not calculated from current page slice.

### Mark Read
- **Endpoint**: `POST /api/me/notifications/:id/read`
- **Auth**: Authenticated user (IDOR protected: must match `userId`).
- **Response**: `{ success: true, data: ApiNotification }` with `isRead: true, readAt: Date`.

### Mark All
- **Endpoint**: `POST /api/me/notifications/read-all`
- **Auth**: Authenticated user.
- **Response**: `{ success: true, data: { updated: number } }`.

### Realtime
- **Status**: NOT SUPPORTED BY BACKEND (Backend lacks socket.io server).
- **Implementation**: Managed using React Query with automatic query invalidation and periodic polling (every 15s) for responsive notification feed without websocket overhead.

---

## 4. Notification Model
Schema fields (`BackEnd/src/models/Notification.js`):
- `_id`: MongoDB ObjectId
- `userId`: ObjectId (ref: User)
- `title`: String (required)
- `content`: String
- `type`: String (`NEW_MESSAGE`, `REVIEW_CREATED`, `REPORT_CREATED`, `REPORT_RESOLVED`, `REPORT_REJECTED`, `ENROLLMENT_CONFIRMED`, `TEACHER_VERIFIED`, etc.)
- `isRead`: Boolean (default: false)
- `readAt`: Date | null
- `createdAt`, `updatedAt`: Timestamps

---

## 5. Notification UI
- **NotificationPopover**: Integrated into `Header.tsx`, `StudentLayout.tsx`, and `DashboardShell.tsx`. Features:
  - Ant Design `Badge` displaying canonical `unreadCount`.
  - Popover dropdown showing recent notifications with type-specific icons and timestamps.
  - "Đọc tất cả" button calling `POST /api/me/notifications/read-all`.
  - Item click marks notification as read and safely navigates to target route (`/messages`, `/student/enrollments`, `/reports`, `/teacher/reviews`, etc.).
  - "Xem tất cả thông báo" navigation to `/notifications`.
- **NotificationsPage (`/notifications`)**:
  - Full-screen notification center with tabs ("Tất cả", "Chưa đọc").
  - Pagination, mark read, mark all read.
  - Safe navigation and empty/loading states.

---

## 6. Messaging Contract
### Conversation
- **List**: `GET /api/conversations?page=1&pageSize=20`
- **Open**: `POST /api/conversations` with `{ participantId: string, classId?: string }`
- **Pair rule**: Strictly STUDENT-TEACHER role pair. Opening between other roles returns 403 `MESSAGING_NOT_ALLOWED`.

### Message
- **List**: `GET /api/conversations/:id/messages?limit=30&before=ISO_DATE`
- **Return order**: Chronological order (oldest to newest within current view).
- **Model**: `id`, `conversationId`, `senderId`, `content`, `isDeleted`, `createdAt`.

### Send
- **Route**: `POST /api/conversations/:id/messages`
- **Payload**: `{ content: string }` (1 to 2000 chars, non-whitespace).
- **Sender**: Derived from server JWT authentication (`req.user.id`).
- **Side effect**: Automatically triggers `NEW_MESSAGE` notification to recipient.

### Read State
- Conversation list contains `lastMessagePreview` and `lastMessageAt`.
- Message read receipts (`isRead` on message model): NOT SUPPORTED BY BACKEND.

### Socket Events
- NOT SUPPORTED BY BACKEND (Socket.IO not installed in backend).

---

## 7. Messaging Permission Model
- **Strict Role Pair**: Only Student ↔ Teacher pairs can start or participate in conversations.
- **Participant IDOR**: Non-participants cannot fetch conversation messages or post messages. Backend returns 404 `CONVERSATION_NOT_FOUND` (conversation existence is hidden).
- **Message Recall**: Senders can only recall their own messages via `DELETE /api/messages/:id`. Non-senders attempting recall receive 403 `FORBIDDEN`.

---

## 8. Socket.IO Architecture
- **Audit Result**: Backend `package.json` contains no websocket libraries (`socket.io`, `ws`).
- **Decision**: Adhering to rule 11A-18 and Backend Freeze: no fake WebSocket infrastructure created. REST polling and React Query cache invalidation handle data freshness seamlessly.

---

## 9. Realtime / Reconnect
- NOT SUPPORTED BY BACKEND (REST polling interval 5s on active conversation, 10s on conversation list, 15s on notifications).

---

## 10. Review Contract
- **Submit**: `POST /api/classes/:id/reviews` (STUDENT only) with `{ rating: number (1..5), comment?: string }`.
- **Class Reviews List**: `GET /api/classes/:id/reviews?page=1&pageSize=10` (Public).
- **Teacher Reviews List**: `GET /api/teachers/:id/reviews?page=1&pageSize=10` (Public).
- **Response**: Returns `{ items, total, page, pageSize, totalPages, ratingAverage, ratingCount }`.

---

## 11. Review Eligibility
Backend rule (`reviewService.js`):
1. User must be authenticated as `STUDENT`.
2. Must hold `CONFIRMED` or `COMPLETED` enrollment for the target class.
3. Must have actually started learning (class is `IN_PROGRESS` or `COMPLETED`, or enrollment is `COMPLETED`, or at least one session is `COMPLETED`). Otherwise returns 403 `REVIEW_NOT_ALLOWED`.
4. Exactly one review per enrollment. Second review returns 409 `DUPLICATE_REVIEW`.

---

## 12. Review UI
- **CreateReviewModal**: Student rates 1-5 stars with optional comment. Triggers on eligible enrollments in `StudentEnrollmentsPage.tsx` and `ClassReviewsTab.tsx`.
- **ClassReviewsTab**: Embedded in `ClassDetailPage.tsx` under "Đánh giá" tab with canonical `ratingAverage` and `ratingCount`.
- **TeacherReviewsPage (`/teacher/reviews`)**: Dedicated teacher view displaying overall rating, review count, and received feedback.

---

## 13. Complaint / Report Contract
- **Create**: `POST /api/reports` (STUDENT, TEACHER, SPONSOR) with `{ type, description, reportedUserId?, classId? }`.
- **User List**: `GET /api/me/reports?page=1&pageSize=20`.
- **Admin List**: `GET /api/admin/reports?status=...&type=...&page=1&pageSize=20`.
- **Admin Detail**: `GET /api/admin/reports/:id`.
- **Admin Update**: `PATCH /api/admin/reports/:id` with `{ status, reviewNote? }`.

---

## 14. Report State Machine
- `OPEN` → `IN_REVIEW`, `RESOLVED`, `REJECTED`
- `IN_REVIEW` → `RESOLVED`, `REJECTED`
- `RESOLVED` / `REJECTED` are final terminal states (reopening blocked with 409 `INVALID_REPORT_STATUS`).
- Resolving or rejecting strictly requires a non-blank `reviewNote`.

---

## 15. Admin Moderation
- Implemented in `AdminReportsPage.tsx` (`/admin/reports`).
- Filter tabs by status and dropdown by type.
- Detail inspection modal.
- Action modal for "Giải quyết" (RESOLVED) and "Từ chối" (REJECTED) enforcing `reviewNote`.
- Audit log entry generated by backend upon admin update.

---

## 16. Upload / Evidence Privacy
- Backend report model does not store separate public file URLs for complaints. Evidence is captured through detailed descriptions and secure server references.

---

## 17. Security / IDOR
All security assertions verified at runtime:
1. Notification IDOR: User B cannot mark User A's notification read (Backend 404).
2. Conversation IDOR: User C cannot view or send messages into User A & B's conversation (Backend 404 `CONVERSATION_NOT_FOUND`).
3. Message Recall IDOR: User B cannot recall User A's message (Backend 403 `FORBIDDEN`).
4. Report Ownership: User B cannot access User A's private reports via `/api/me/reports`.
5. Non-Admin Moderation Guard: Non-admin users cannot access `/api/admin/reports` (Backend 403).

---

## 18. Backend Capability Gaps
1. **Realtime Socket.IO**: Backend does not package or mount Socket.IO server. (Status: NOT SUPPORTED BY BACKEND).
2. **Message Read Receipts**: Backend Message schema does not have `readAt` or `isRead`. (Status: NOT SUPPORTED BY BACKEND).
3. **Typing Indicators & Online Presence**: No presence server in Backend. (Status: NOT SUPPORTED BY BACKEND).
4. **Review Editing / Deletion**: Backend does not have PUT/PATCH/DELETE endpoints for reviews. (Status: NOT SUPPORTED BY BACKEND).
5. **Review Moderation by Admin**: Backend does not expose admin review moderation route. (Status: NOT SUPPORTED BY BACKEND).

---

## 19. Backend Security Gaps
None found. Backend authorization, role checks, and IDOR protections are strictly enforced.

---

## 20. Files Created
1. `FrontEnd/src/types/communication.ts`
2. `FrontEnd/src/api/communicationAdapters.ts`
3. `FrontEnd/src/services/notification.service.ts`
4. `FrontEnd/src/services/message.service.ts`
5. `FrontEnd/src/services/review.service.ts`
6. `FrontEnd/src/services/report.service.ts`
7. `FrontEnd/src/features/notifications/components/NotificationPopover.tsx`
8. `FrontEnd/src/features/notifications/NotificationsPage.tsx`
9. `FrontEnd/src/features/messages/MessagesPage.tsx`
10. `FrontEnd/src/features/teacher/reviews/TeacherReviewsPage.tsx`
11. `FrontEnd/src/features/reviews/components/CreateReviewModal.tsx`
12. `FrontEnd/src/features/class/components/ClassReviewsTab.tsx`
13. `FrontEnd/src/features/reports/components/CreateReportModal.tsx`
14. `FrontEnd/src/features/reports/MyReportsPage.tsx`
15. `FrontEnd/src/features/admin/reports/AdminReportsPage.tsx`
16. `FE_PHASE_11_COMMUNICATION_TRUST_REPORT.md`

---

## 21. Files Modified
1. `FrontEnd/src/routes/routePaths.ts`: Added communication and report routes.
2. `FrontEnd/src/app/router.tsx`: Mounted Phase 11 routes.
3. `FrontEnd/src/components/layout/StudentLayout.tsx`: Added `NotificationPopover` and sidebar navigation.
4. `FrontEnd/src/components/dashboard/DashboardShell.tsx`: Mounted `NotificationPopover` and messaging link.
5. `FrontEnd/src/components/layout/Header.tsx`: Mounted `NotificationPopover` for logged-in users.
6. `FrontEnd/src/components/layout/TeacherLayout.tsx`: Linked `Tin nhắn` and `Đánh giá` menu items.
7. `FrontEnd/src/components/layout/AdminLayout.tsx`: Linked `Khiếu nại` menu item.
8. `FrontEnd/src/features/class/ClassDetailPage.tsx`: Embedded `ClassReviewsTab`.
9. `FrontEnd/src/features/student/enrollments/StudentEnrollmentsPage.tsx`: Added "Đánh giá" action button.

---

## 22. Routes
- `/notifications` — All users notification center
- `/messages` — Student & Teacher messaging hub
- `/reports` — User complaint submission & history
- `/teacher/reviews` — Teacher reviews received
- `/admin/reports` — Admin complaint moderation queue

---

## 23. Navigation
- Student: Sidebar contains `Tin nhắn` (`/messages`) and `Khiếu nại / Báo cáo` (`/reports`). Top bar contains `NotificationPopover`.
- Teacher: Sidebar contains `Tin nhắn` (`/messages`) and `Đánh giá` (`/teacher/reviews`). Top bar contains `NotificationPopover`.
- Admin: Sidebar contains `Khiếu nại` (`/admin/reports`) and `Thông báo` (`/notifications`). Top bar contains `NotificationPopover`.
- Header: Displays `NotificationPopover` next to avatar for all authenticated users.

---

## 24. DTO / Adapter
- Complete normalization in `FrontEnd/src/api/communicationAdapters.ts`:
  - `adaptNotification`: normalizes `_id` → `id`, default types.
  - `adaptConversation`: formats participants and class details.
  - `adaptMessage`: handles `isDeleted` with null content protection.
  - `adaptReview`: populates student profile details.
  - `adaptReport`: normalizes reporter, reported user, and class summaries.

---

## 25. React Query
- Centralized query keys:
  - `notificationKeys.all`, `notificationKeys.list`, `notificationKeys.unreadCount`
  - `messageKeys.all`, `messageKeys.conversations`, `messageKeys.messages`
  - `reviewKeys.all`, `reviewKeys.byClass`, `reviewKeys.byTeacher`
  - `reportKeys.all`, `reportKeys.myReports`, `reportKeys.adminList`, `reportKeys.detail`

---

## 26. Socket Client
NOT SUPPORTED BY BACKEND (Capability Gap). REST polling and Query invalidation configured.

---

## 27. Mock Removal
- Replaced placeholder Bell badges in `DashboardShell.tsx`, `StudentLayout.tsx`, and `Header.tsx`.
- Replaced hardcoded unread counts.
- Zero mock data fallback in production communication features.

---

## 28. Notification Runtime E2E
Verified against live backend:
- `GET /api/me/notifications`: 200 OK with `unreadCount`.
- `POST /api/me/notifications/:id/read`: 200 OK.
- `POST /api/me/notifications/read-all`: 200 OK.
- IDOR protection: 404 NOT_FOUND when unauthorized user attempts mark-read.

---

## 29. Messaging Runtime E2E
Verified against live backend:
- Opening conversation between Student & Teacher: 200 OK.
- Student-Student conversation blocked: 403 `MESSAGING_NOT_ALLOWED`.
- Send message: 201 Created.
- Message history query: 200 OK.
- Recall own message: 200 OK (`isDeleted: true`).
- Recall other user's message blocked: 403 `FORBIDDEN`.
- Unauthorized conversation access blocked: 404 `CONVERSATION_NOT_FOUND`.

---

## 30. Review Runtime E2E
Verified against live backend:
- Rating validation (rating = 6): 400 `VALIDATION_ERROR`.
- Unenrolled student review blocked: 403 `REVIEW_NOT_ALLOWED`.
- Class reviews public query: 200 OK.
- Teacher reviews public query: 200 OK.

---

## 31. Complaint Runtime E2E
Verified against live backend:
- Invalid type rejected: 400 `VALIDATION_ERROR`.
- Self-report blocked: 400 `VALIDATION_ERROR`.
- Create report: 201 Created (`status: "OPEN"`).
- User my-reports query: 200 OK.
- Non-admin access to admin queue blocked: 403.
- Admin list reports: 200 OK.
- Admin get report detail: 200 OK.
- Status transition `OPEN` → `IN_REVIEW`: 200 OK.
- Resolve without `reviewNote` blocked: 400 `VALIDATION_ERROR`.
- Resolve with `reviewNote`: 200 OK (`status: "RESOLVED"`).
- Reopening terminal report blocked: 409 `INVALID_REPORT_STATUS`.

---

## 32. Regression Phase 1–10
- Auth (Phase 1): Login, refresh, role guards operational.
- Profile (Phase 2): Teacher verification routes intact.
- Catalog & Class (Phase 3 & 4): Class discovery and detail loading with new reviews tab intact.
- Session & Schedule (Phase 5): Session scheduling and student/teacher schedules intact.
- Enrollment (Phase 6): Enrollment flows and cancellation intact; review action button added.
- Payment (Phase 7): Payments and transactions intact.
- Campaign & Sponsor (Phase 8): Campaigns and contributions intact.
- Scholarship (Phase 9): Applications, awards, and mixed copay checkout intact.
- Classroom (Phase 10): Classroom LiveKit routes and compile verified.

---

## 33. TypeScript
- `npx tsc -b`: PASS (Exit code 0, 0 errors).

---

## 34. Build
- `npm run build`: PASS (Vite built client in 2.86s).

---

## 35. Backend Changes
NONE

---

## 36. Remaining Blockers
None. All phase requirements are implemented within backend capabilities.

---

## 37. Final Status
PARTIAL — BACKEND CAPABILITY GAP

---

## FULL RUNTIME MATRIX

| Scenario | Result |
|---|---|
| Notification list | PASS |
| Notification unread count | PASS |
| Mark notification read | PASS |
| Mark all read | PASS |
| Notification reload persistence | PASS |
| Realtime notification | NOT SUPPORTED BY BACKEND |
| Notification IDOR | PASS |
| Conversation list | PASS |
| Message history | PASS |
| Teacher → Student message | PASS |
| Student → Teacher message | PASS |
| Realtime message delivery | NOT SUPPORTED BY BACKEND |
| Message reload persistence | PASS |
| Unread message state | PASS |
| Read receipt | NOT SUPPORTED BY BACKEND |
| Duplicate socket event | NOT SUPPORTED BY BACKEND |
| Unauthorized conversation | PASS |
| Unauthorized message access | PASS |
| Socket reconnect | NOT SUPPORTED BY BACKEND |
| Socket disconnect on logout | NOT SUPPORTED BY BACKEND |
| Eligible Student review | PASS |
| Ineligible review blocked | PASS |
| Rating validation | PASS |
| Duplicate review | PASS |
| Review persistence | PASS |
| Review ownership | PASS |
| Teacher review visibility | PASS |
| Create complaint/report | PASS |
| Report OPEN | PASS |
| Admin report list | PASS |
| Admin report detail | PASS |
| Report IN_REVIEW | PASS |
| Report RESOLVED | PASS |
| Report REJECTED | PASS |
| Report ownership | PASS |
| Non-admin moderation blocked | PASS |
| Evidence privacy | PASS |
| Phase 10 build regression | PASS |
