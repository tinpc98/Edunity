# Edunity Deep Completion Audit

## 1. Executive Summary

This document establishes the **definitive, source-verified truth** of the Edunity platform as of October 2026. Prior phase reports (Phase 1–12) served as milestone integration checkpoints, but this audit evaluates the platform with zero assumptions of completeness, verifying every claim directly against the live Backend and Frontend source codes and runtime executions.

### Key Audit Conclusions:
1. **Overall Platform Status**: `PORTALS PARTIALLY COMPLETE — FE + BE GAPS`.
2. **Backend Architecture**: The Backend exposes **124 registered API endpoints** across 11 mounted route files plus static public file serving (`/uploads`).
3. **Teacher Portal**: Out of 20 SRS requirements (`FR-TEA-01` → `FR-TEA-20`), **15 are Complete**, **1 is Partial**, **1 is Broken** (Verification submission under specific states), and **3 are Missing** (Enrollment View, Student Management Surface, and Teacher Transactions).
4. **Admin Portal**: Out of 22 SRS requirements (`FR-ADM-01` → `FR-ADM-22`), **16 are Complete**, **0 are Partial**, **3 are Broken** (Dashboard uses 100% mock data instead of real API; Teacher Verification and Scholarship Document previews fail due to PDF-in-img tag and `signedUrl` property mismatch), and **3 are Missing** (User Management missing from FE; Session Monitoring and PlatformSettings missing from BE).
5. **Teacher Avatar Update**: The Backend contract strictly mandates multipart form data with field name `"file"` (not `"avatar"`), max 5MB, and enforces strict binary magic-byte inspection (`matchesSignature`). Uploads fail with HTTP 400 `UNSUPPORTED_FILE_TYPE` for unsupported formats (AVIF, HEIC, SVG) or non-matching magic bytes, and HTTP 400 `PROFILE_NOT_EDITABLE` if `user.teacherProfile` is not initialized.
6. **Teacher Verification Upload**: The Backend enforces a two-step upload protocol: private files must first be uploaded via `POST /api/uploads/private` (requiring magic-byte validation and purpose `"IDENTITY"` / `"QUALIFICATION"`), followed by `POST /api/teacher/verification`. Submissions by existing seed accounts fail with HTTP 409 `ALREADY_VERIFIED` or `VERIFICATION_PENDING`. Furthermore, the Admin side attempts to render uploaded PDFs using HTML `<img>` tags, resulting in broken document previews.
7. **Unused Backend Capabilities**: Major production-ready Backend capabilities are completely unused by the Frontend, including Admin User Management (`/admin/users`), Teacher Class Students (`/teacher/classes/:id/students`), Public Teacher Search (`/teachers`), and the real Admin Dashboard aggregation API (`/admin/dashboard`).

---

## 2. Repository Baseline

- **Repository Root**: `D:/Dự Án/Edunity`
- **Active Git Branch**: `feature/teacher-admin`
- **Current Head Commit**: `948e9aa` (*"tính năng mới: Hoàn thiện các thông báo và báo cáo về đánh giá trao đổi thông tin."*)
- **Backend Clean State**: `BackEnd` directory is 100% clean with zero uncommitted modifications.
- **Frontend Working Tree**: Preserved uncommitted changes from release readiness testing (`router.tsx`, `AdminLayout.tsx`, `TeacherLayout.tsx`, `auth.store.ts`, `main.tsx`, `.gitignore`, `NotFoundPage.tsx`, `queryClient.ts`, `FE_PHASE_12_FINAL_RELEASE_READINESS_REPORT.md`).
- **Runtime Environment**:
  - Node.js runtime: `v22.16.0` on Windows
  - Backend process: Express server active on port 3000 (`http://localhost:3000/api`)
  - Frontend process: Vite dev server active on port 5173 (`http://localhost:5173`)
  - Database: MongoDB local instance (`mongodb://127.0.0.1:27017/edunity`)

---

## 3. Current Architecture

Edunity operates as a decoupled single-page application (SPA) client and REST API server:
- **Frontend Architecture**:
  - Framework: React 18 with TypeScript, Vite bundler.
  - State Management: Zustand with `persist` middleware for session authentication (`edunity-auth` in localStorage).
  - Server State: `@tanstack/react-query` v5 for remote data caching, refetching, and mutations.
  - UI Library: Ant Design 5 (Antd) combined with Tailwind CSS utility classes.
  - HTTP Transport: Custom `apiClient` wrapper over browser native `fetch` handling JWT injection, 401 interceptor, and refresh token rotation.
- **Backend Architecture**:
  - Framework: Node.js with Express 4.
  - Database ODM: Mongoose 8 connecting to MongoDB.
  - Authentication: JWT access tokens (15m expiry) and refresh tokens (7d expiry, stored in `RefreshToken` collection with family revocation).
  - Storage Subsystem: Local disk adapter in `BackEnd/storage`, segregated into `public/` (avatars, covers) and `private/` (identity, qualifications, scholarship proofs).
  - Video Subsystem: LiveKit Server SDK with token signing fallback (`EDUNITY_DEV`).
  - Scheduling: `node-cron` running in-process for enrollment hold expiration (`expireEnrollmentsJob`).
  - Realtime: HTTP REST with client-side polling. *No WebSocket/Socket.IO server is attached to the Express HTTP listener.*

---

## 4. Full Backend Module Inventory

| Module Path | Primary Responsibility | Key Files |
|---|---|---|
| `BackEnd/src/config/` | Database connection and environment defaults | [db.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/config/db.js) |
| `BackEnd/src/controllers/` | Request parsing, HTTP status envelopes, delegating to services | `authController.js`, `accountController.js`, `communityController.js`, `catalogController.js`, `courseCatalogController.js`, `teachingController.js`, `enrollmentController.js`, `paymentController.js`, `financeController.js`, `studentController.js`, `scholarshipController.js`, `fileController.js` |
| `BackEnd/src/services/` | Core domain business logic, transactions, state machines | `adminService.js`, `teacherVerificationService.js`, `teacherClassService.js`, `sessionService.js`, `adminClassService.js`, `courseCatalogService.js`, `catalogService.js`, `enrollmentService.js`, `paymentService.js`, `financeService.js`, `scholarshipService.js`, `campaignService.js`, `contributionService.js`, `reportService.js`, `reviewService.js`, `messagingService.js`, `notificationService.js`, `storageService.js`, `profileService.js`, `videoProvider.js`, `auditService.js`, `authTokenService.js`, `reservationService.js`, `settlementService.js`, `studentService.js` |
| `BackEnd/src/models/` | Mongoose schemas, enums, indexes, and plugins | `User.js`, `Class.js`, `Course.js`, `CourseProposal.js`, `Category.js`, `Subject.js`, `Enrollment.js`, `Session.js`, `SessionAttendance.js`, `Payment.js`, `Payout.js`, `Transaction.js`, `TeacherEarning.js`, `ScholarshipCampaign.js`, `SponsorContribution.js`, `ScholarshipApplication.js`, `Scholarship.js`, `ScholarshipUsage.js`, `VerificationDocument.js`, `Report.js`, `Review.js`, `Conversation.js`, `Message.js`, `Notification.js`, `AuditLog.js`, `RefreshToken.js` |
| `BackEnd/src/middlewares/` | Authentication, RBAC role guard, upload streaming | `authMiddleware.js`, `requireRole.js`, `upload.js` |
| `BackEnd/src/jobs/` | Background cron runners | `expireEnrollmentsJob.js` |
| `BackEnd/src/utils/` | Shared utilities, crypto, formatting, JWT, error handling | `errors.js`, `http.js`, `jwt.js`, `money.js`, `password.js`, `roomToken.js`, `serialize.js`, `settings.js`, `slug.js`, `userProfile.js` |

---

## 5. Full Backend Route Inventory

Total Registered Routes: **124 REST Endpoints + 1 Static Route**.

### 5.1. Authentication Routes (`/api/auth`)
- `POST /api/auth/register` | Auth: Public | Role: Any | Controller: `authController.register` | Registers Student, Teacher, or Sponsor.
- `POST /api/auth/login` | Auth: Public | Role: Any | Controller: `authController.loginWithRefreshToken` | Issues access token + refresh token.
- `POST /api/auth/refresh` | Auth: Public | Role: Any | Controller: `authController.refresh` | Rotates refresh token and returns new access token.
- `POST /api/auth/logout` | Auth: Public | Role: Any | Controller: `authController.logout` | Revokes refresh token family.
- `GET /api/auth/me` | Auth: Bearer | Role: Any | Controller: `authController.getMe` | Returns active user session identity.
- `POST /api/auth/dev-login` | Auth: Non-prod | Role: Any | Controller: `authController.login` | Development-only quick token issuer.

### 5.2. Account & Community Routes (`/api`)
- `POST /api/uploads/private` | Auth: Bearer | Role: Any | Controller: `fileController.uploadPrivate` | Uploads private document with purpose validation.
- `POST /api/uploads/public` | Auth: Bearer | Role: Any | Controller: `fileController.uploadPublic` | Uploads public image (avatar, cover).
- `POST /api/files/signed-url` | Auth: Bearer | Role: Owner/Admin | Controller: `fileController.createSignedUrl` | Creates signed download URL.
- `GET /api/files/download` | Auth: Signed Query | Role: Public with valid signature | Controller: `fileController.download` | Streams private file inline.
- `GET /api/me/profile` | Auth: Bearer | Role: Any | Controller: `communityController.getMyProfile` | Role-specific profile presentation.
- `PATCH /api/me/profile` | Auth: Bearer | Role: Any | Controller: `communityController.updateMyProfile` | Updates editable profile fields.
- `POST /api/me/avatar` | Auth: Bearer | Role: Any | Controller: `communityController.updateMyAvatar` | Uploads and binds avatar image.
- `POST /api/me/password` | Auth: Bearer | Role: Any | Controller: `communityController.changeMyPassword` | Changes password and revokes tokens.
- `GET /api/conversations` | Auth: Bearer | Role: Any | Controller: `communityController.listMyConversations` | Paged conversation list.
- `POST /api/conversations` | Auth: Bearer | Role: Any | Controller: `communityController.openConversation` | Initiates or returns existing dialog.
- `GET /api/conversations/:id/messages` | Auth: Bearer | Role: Participant | Controller: `communityController.listMessages` | Fetches message thread.
- `POST /api/conversations/:id/messages` | Auth: Bearer | Role: Participant | Controller: `communityController.sendMessage` | Appends message to conversation.
- `DELETE /api/messages/:id` | Auth: Bearer | Role: Author | Controller: `communityController.deleteMessage` | Soft-deletes a message.
- `POST /api/reports` | Auth: Bearer | Role: STUDENT, TEACHER, SPONSOR | Controller: `communityController.createReport` | Submits complaint/report.
- `GET /api/me/reports` | Auth: Bearer | Role: Any | Controller: `communityController.getMyReports` | Lists reports submitted by current user.
- `GET /api/admin/reports` | Auth: Bearer | Role: ADMIN | Controller: `communityController.adminListReports` | Paged admin complaint list.
- `GET /api/admin/reports/:id` | Auth: Bearer | Role: ADMIN | Controller: `communityController.adminGetReport` | Single complaint detail.
- `PATCH /api/admin/reports/:id` | Auth: Bearer | Role: ADMIN | Controller: `communityController.adminUpdateReport` | Updates report status and note.
- `GET /api/admin/dashboard` | Auth: Bearer | Role: ADMIN | Controller: `communityController.getDashboard` | Complete system aggregate metrics.
- `GET /api/admin/users` | Auth: Bearer | Role: ADMIN | Controller: `communityController.listUsers` | Paged user list with role/status filters.
- `GET /api/admin/users/:id` | Auth: Bearer | Role: ADMIN | Controller: `communityController.getUser` | Full user detail and activity statistics.
- `PATCH /api/admin/users/:id/status` | Auth: Bearer | Role: ADMIN | Controller: `communityController.updateUserStatus` | Suspends, bans, or activates user.

### 5.3. Teacher Verification & Reviews & Notifications (`/api`)
- `POST /api/classes/:id/reviews` | Auth: Bearer | Role: STUDENT | Controller: `accountController.createReview` | Reviews completed class.
- `GET /api/classes/:id/reviews` | Auth: Public | Role: Any | Controller: `accountController.getClassReviews` | Lists class reviews.
- `GET /api/teachers/:id/reviews` | Auth: Public | Role: Any | Controller: `accountController.getTeacherReviews` | Lists teacher reviews.
- `POST /api/teacher/verification` | Auth: Bearer | Role: TEACHER | Controller: `accountController.submitVerification` | Submits verification dossier.
- `GET /api/teacher/verification` | Auth: Bearer | Role: TEACHER | Controller: `accountController.getMyVerification` | Current verification status & docs.
- `GET /api/admin/teacher-verifications` | Auth: Bearer | Role: ADMIN | Controller: `accountController.adminListVerifications` | Lists teacher verifications.
- `GET /api/admin/teacher-verifications/:teacherId` | Auth: Bearer | Role: ADMIN | Controller: `accountController.adminGetVerification` | Verification dossier detail.
- `POST /api/admin/teacher-verifications/:teacherId/approve` | Auth: Bearer | Role: ADMIN | Controller: `accountController.approveVerification` | Approves teacher verification.
- `POST /api/admin/teacher-verifications/:teacherId/reject` | Auth: Bearer | Role: ADMIN | Controller: `accountController.rejectVerification` | Rejects teacher verification.
- `GET /api/me/notifications` | Auth: Bearer | Role: Any | Controller: `accountController.getMyNotifications` | Paged notifications list.
- `POST /api/me/notifications/read-all` | Auth: Bearer | Role: Any | Controller: `accountController.markAllNotificationsAsRead` | Marks all as read.
- `POST /api/me/notifications/:id/read` | Auth: Bearer | Role: Any | Controller: `accountController.markNotificationAsRead` | Marks single as read.

### 5.4. Catalog & Courses & Proposals (`/api`)
- `GET /api/catalog/categories` | Auth: Public | Role: Any | Controller: `catalogController.getCategories` | Public category tree.
- `GET /api/catalog/filters` | Auth: Public | Role: Any | Controller: `catalogController.getFilters` | Filter options for class search.
- `GET /api/classes` | Auth: Public | Role: Any | Controller: `catalogController.getClasses` | Search and filter public classes.
- `GET /api/classes/:id` | Auth: Public | Role: Any | Controller: `catalogController.getClassById` | Public class details.
- `GET /api/classes/:id/sessions` | Auth: Public | Role: Any | Controller: `catalogController.getClassSessions` | Public class sessions.
- `GET /api/teachers` | Auth: Public | Role: Any | Controller: `catalogController.getTeachers` | Search and list teachers.
- `GET /api/teachers/:id` | Auth: Public | Role: Any | Controller: `catalogController.getTeacherById` | Public teacher profile.
- `GET /api/categories` | Auth: Public | Role: Any | Controller: `courseCatalogController.listCategories` | Standard category list.
- `POST /api/admin/categories` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.createCategory` | Creates category.
- `PATCH /api/admin/categories/:id` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.updateCategory` | Updates category.
- `GET /api/categories/:id/subjects` | Auth: Public | Role: Any | Controller: `courseCatalogController.listSubjectsByCategory` | Subjects in category.
- `GET /api/subjects/:id` | Auth: Public | Role: Any | Controller: `courseCatalogController.getSubject` | Subject details.
- `POST /api/admin/subjects` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.createSubject` | Creates subject.
- `PATCH /api/admin/subjects/:id` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.updateSubject` | Updates subject.
- `GET /api/courses` | Auth: Public | Role: Any | Controller: `courseCatalogController.searchCourses` | Search standard courses.
- `GET /api/courses/:id` | Auth: Public | Role: Any | Controller: `courseCatalogController.getCourse` | Course details.
- `GET /api/courses/:id/classes` | Auth: Public | Role: Any | Controller: `courseCatalogController.getCourseClasses` | Classes belonging to course.
- `POST /api/admin/courses` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.createCourse` | Creates standard course.
- `PATCH /api/admin/courses/:id` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.updateCourse` | Updates standard course.
- `POST /api/teacher/course-proposals` | Auth: Bearer | Role: TEACHER | Controller: `courseCatalogController.createProposal` | Teacher proposes course.
- `GET /api/teacher/course-proposals` | Auth: Bearer | Role: TEACHER | Controller: `courseCatalogController.listMyProposals` | Teacher's proposals list.
- `PATCH /api/teacher/course-proposals/:id` | Auth: Bearer | Role: TEACHER | Controller: `courseCatalogController.updateMyProposal` | Updates draft proposal.
- `GET /api/admin/course-proposals` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.adminListProposals` | Admin lists proposals.
- `GET /api/admin/course-proposals/:id` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.adminGetProposal` | Proposal details.
- `POST /api/admin/course-proposals/:id/approve` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.approveProposal` | Approves proposal.
- `POST /api/admin/course-proposals/:id/reject` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.rejectProposal` | Rejects proposal.
- `POST /api/admin/course-proposals/:id/request-changes` | Auth: Bearer | Role: ADMIN | Controller: `courseCatalogController.requestProposalChanges` | Requests changes.

### 5.5. Teaching & Sessions (`/api`)
- `GET /api/teacher/classes` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.listMyClasses` | Teacher's own classes.
- `POST /api/teacher/classes` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.createClass` | Creates class (DRAFT).
- `GET /api/teacher/classes/:id` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.getMyClass` | Class detail with sessions.
- `PATCH /api/teacher/classes/:id` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.updateClass` | Updates class in DRAFT/REJECTED.
- `POST /api/teacher/classes/:id/submit` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.submitClass` | Submits class for approval.
- `GET /api/teacher/classes/:id/students` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.getClassStudents` | Enrolled students list.
- `GET /api/teacher/classes/:id/planned-sessions` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.getPlannedSessions` | Planned recurring dates.
- `POST /api/teacher/classes/:classId/sessions` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.createSessions` | Batch or single session creation.
- `PATCH /api/teacher/sessions/:id` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.updateSession` | Updates scheduled session.
- `DELETE /api/teacher/sessions/:id` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.deleteSession` | Deletes scheduled session.
- `POST /api/teacher/sessions/:id/end` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.endSession` | Ends live session.
- `GET /api/teacher/sessions/:id/attendance` | Auth: Bearer | Role: TEACHER | Controller: `teachingController.getSessionAttendance` | Attendance roster.
- `POST /api/sessions/:id/join` | Auth: Bearer | Role: STUDENT, TEACHER | Controller: `teachingController.joinSession` | Obtains LiveKit credentials.
- `POST /api/sessions/livekit-webhook` | Auth: Public | Role: Any | Controller: `teachingController.livekitWebhook` | LiveKit recording egress event.
- `GET /api/admin/classes/pending` | Auth: Bearer | Role: ADMIN | Controller: `teachingController.listPendingClasses` | Pending class approval list.
- `GET /api/admin/classes/:id` | Auth: Bearer | Role: ADMIN | Controller: `teachingController.getClassForReview` | Class review details.
- `POST /api/admin/classes/:id/approve` | Auth: Bearer | Role: ADMIN | Controller: `teachingController.approveClass` | Approves class to OPEN.
- `POST /api/admin/classes/:id/reject` | Auth: Bearer | Role: ADMIN | Controller: `teachingController.rejectClass` | Rejects class with note.

### 5.6. Enrollment, Student, Payment & Finance (`/api`)
- `GET /api/classes/:classId/availability` | Auth: Public | Role: Any | Controller: `enrollmentController.getClassAvailability` | Real-time seat availability.
- `GET /api/me/enrollments` | Auth: Bearer | Role: STUDENT | Controller: `enrollmentController.getMyEnrollments` | Student's enrollments.
- `GET /api/enrollments/:id` | Auth: Bearer | Role: STUDENT | Controller: `enrollmentController.getEnrollmentById` | Enrollment details.
- `POST /api/enrollments/:id/cancel` | Auth: Bearer | Role: STUDENT | Controller: `enrollmentController.cancelEnrollment` | Cancels pending reservation.
- `POST /api/classes/:classId/enrollments` | Auth: Bearer | Role: STUDENT | Controller: `enrollmentController.createEnrollment` | Creates 15m seat reservation.
- `POST /api/enrollments/:id/payments` | Auth: Bearer | Role: STUDENT | Controller: `paymentController.createSandboxPayment` | Creates payment transaction.
- `GET /api/enrollments/:id/payments` | Auth: Bearer | Role: STUDENT | Controller: `paymentController.getPaymentHistory` | Payment history for enrollment.
- `POST /api/payments/sandbox/webhook` | Auth: Public | Role: Any | Controller: `paymentController.processWebhook` | Sandbox mock payment trigger.
- `POST /api/payments/webhook` | Auth: Public | Role: Any | Controller: `paymentController.processGatewayWebhook` | Production gateway webhook.
- `GET /api/payments/:id` | Auth: Bearer | Role: Any | Controller: `paymentController.getPaymentById` | Payment details.
- `GET /api/teacher/earnings` | Auth: Bearer | Role: TEACHER | Controller: `financeController.getTeacherEarnings` | Teacher earnings and payouts.
- `GET /api/admin/payments` | Auth: Bearer | Role: ADMIN | Controller: `financeController.getAdminPayments` | Global payments list.
- `GET /api/admin/transactions` | Auth: Bearer | Role: ADMIN | Controller: `financeController.getAdminTransactions` | Global ledger transactions.
- `GET /api/me/sessions` | Auth: Bearer | Role: STUDENT | Controller: `studentController.getMySessions` | Student's upcoming sessions.
- `GET /api/sessions/:id/join` | Auth: Bearer | Role: STUDENT | Controller: `studentController.joinSession` | Alternative GET join endpoint.
- `GET /api/me/payments` | Auth: Bearer | Role: STUDENT | Controller: `studentController.getMyPayments` | Student payment history.
- `GET /api/sessions/:id/recording` | Auth: Bearer | Role: STUDENT | Controller: `studentController.getRecording` | Session recording URL.

### 5.7. Campaigns & Scholarships (`/api`)
- `GET /api/campaigns` | Auth: Public | Role: Any | Controller: `scholarshipController.listCampaigns` | Public campaigns.
- `GET /api/campaigns/:id` | Auth: Public | Role: Any | Controller: `scholarshipController.getCampaign` | Public campaign details.
- `GET /api/admin/campaigns` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.adminListCampaigns` | Admin campaigns list.
- `POST /api/admin/campaigns` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.createCampaign` | Creates campaign (DRAFT).
- `GET /api/admin/campaigns/:id` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.adminGetCampaign` | Admin campaign details.
- `PATCH /api/admin/campaigns/:id` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.updateCampaign` | Updates campaign in DRAFT.
- `POST /api/admin/campaigns/:id/publish` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.publishCampaign` | Publishes campaign.
- `POST /api/admin/campaigns/:id/close` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.closeCampaign` | Closes campaign.
- `GET /api/admin/campaigns/:id/contributions` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.adminListContributions` | Campaign contributions.
- `POST /api/campaigns/:id/contributions` | Auth: Bearer | Role: SPONSOR | Controller: `scholarshipController.createContribution` | Sponsor funds campaign.
- `GET /api/sponsor/contributions` | Auth: Bearer | Role: SPONSOR | Controller: `scholarshipController.getMyContributions` | Sponsor's contributions.
- `GET /api/sponsor/campaigns/:id/impact` | Auth: Bearer | Role: SPONSOR | Controller: `scholarshipController.getCampaignImpact` | Sponsor impact report.
- `POST /api/campaigns/:id/applications` | Auth: Bearer | Role: STUDENT | Controller: `scholarshipController.applyForScholarship` | Student applies for scholarship.
- `GET /api/me/scholarship-applications` | Auth: Bearer | Role: STUDENT | Controller: `scholarshipController.getMyApplications` | Student's applications.
- `POST /api/me/scholarship-applications/:id/resubmit` | Auth: Bearer | Role: STUDENT | Controller: `scholarshipController.resubmitApplication` | Student resubmits application.
- `GET /api/me/scholarships` | Auth: Bearer | Role: STUDENT | Controller: `scholarshipController.getMyScholarships` | Student's awarded scholarships.
- `POST /api/enrollments/:id/scholarship-payment` | Auth: Bearer | Role: STUDENT | Controller: `scholarshipController.payWithScholarship` | Pays tuition with scholarship.
- `GET /api/admin/scholarship-applications` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.adminListApplications` | Lists scholarship applications.
- `GET /api/admin/scholarship-applications/:id` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.adminGetApplication` | Application dossier detail.
- `POST /api/admin/scholarship-applications/:id/approve` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.approveApplication` | Approves scholarship grant.
- `POST /api/admin/scholarship-applications/:id/reject` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.rejectApplication` | Rejects scholarship.
- `POST /api/admin/scholarship-applications/:id/request-information` | Auth: Bearer | Role: ADMIN | Controller: `scholarshipController.requestInformation` | Requests additional proof.

### 5.8. Static Route
- `GET /uploads/*` | Auth: Public | Static serving from `storage/public` directory (avatars, cover images).

---

## 6. Backend Capability Matrix

| Domain | Capability | SRS Spec | Backend Implemented? | Route / Endpoint | Runtime Status | Notes |
|---|---|---|---|---|---|---|
| **Auth** | Register Account | FR-STU-01, FR-TEA-01, FR-SPO-01 | IMPLEMENTED | `POST /api/auth/register` | VERIFIED | Self-registration for Student, Teacher, Sponsor |
| **Auth** | Login with Refresh | BR-02 | IMPLEMENTED | `POST /api/auth/login`, `POST /api/auth/refresh` | VERIFIED | JWT 15m + Refresh Token 7d |
| **Profile** | Role Profile Management | FR-STU-03, FR-TEA-04, FR-SPO-02 | IMPLEMENTED | `GET /api/me/profile`, `PATCH /api/me/profile` | VERIFIED | Role-specific profile presentation |
| **Profile** | Upload Avatar | NFR-14 | IMPLEMENTED | `POST /api/me/avatar` | VERIFIED | Multipart field `"file"`, image signature enforced |
| **Teacher** | Verification Submission | FR-TEA-02, FR-TEA-03 | IMPLEMENTED | `POST /api/uploads/private`, `POST /api/teacher/verification` | VERIFIED | Requires both IDENTITY and QUALIFICATION docs |
| **Teacher** | Class Management | FR-TEA-07 → FR-TEA-11 | IMPLEMENTED | `POST /api/teacher/classes`, `PATCH ...` | VERIFIED | DRAFT -> PENDING_APPROVAL lifecycle |
| **Teacher** | Enrolled Students View | FR-TEA-13, FR-TEA-14 | IMPLEMENTED | `GET /api/teacher/classes/:id/students` | VERIFIED | Unused by Frontend Class Detail page |
| **Teacher** | Session Management | FR-TEA-12 | IMPLEMENTED | `POST /api/teacher/classes/:id/sessions` | VERIFIED | Single or bulk planned sessions |
| **Teacher** | Live Classroom | FR-TEA-15 | IMPLEMENTED | `POST /api/sessions/:id/join`, `POST .../end` | VERIFIED | Host role token, live attendance recording |
| **Teacher** | View Revenue | FR-TEA-17 | IMPLEMENTED | `GET /api/teacher/earnings` | VERIFIED | Gross, commission, net, status breakdown |
| **Teacher** | View Transactions | FR-TEA-18 | ABSENT | *None* | NOT SUPPORTED | Backend has no Teacher Transactions API |
| **Admin** | User Management | FR-ADM-01 | IMPLEMENTED | `GET /api/admin/users`, `PATCH .../status` | VERIFIED | Unused by Frontend (no UI page exists) |
| **Admin** | Teacher Verification | FR-ADM-02 | IMPLEMENTED | `GET /api/admin/teacher-verifications`, `POST .../approve` | VERIFIED | Working API; FE has PDF preview bug |
| **Admin** | Catalog Management | FR-ADM-03 → FR-ADM-05 | IMPLEMENTED | `/api/admin/categories`, `.../subjects`, `.../courses` | VERIFIED | Full CRUD capabilities |
| **Admin** | Course Proposals | FR-ADM-06 | IMPLEMENTED | `/api/admin/course-proposals` | VERIFIED | Review, approve, reject, request-changes |
| **Admin** | Class Monitoring | FR-ADM-07 | IMPLEMENTED | `GET /api/admin/classes/pending`, `GET .../:id` | VERIFIED | Approve / reject pending classes |
| **Admin** | Session Monitoring | FR-ADM-08 | ABSENT | *None* | NOT SUPPORTED | No global `/api/admin/sessions` endpoint exists |
| **Admin** | Finance & Ledger | FR-ADM-09, FR-ADM-10 | IMPLEMENTED | `GET /api/admin/payments`, `GET .../transactions` | VERIFIED | Global payments and transaction ledger |
| **Admin** | Campaigns | FR-ADM-11 → FR-ADM-15 | IMPLEMENTED | `/api/admin/campaigns` | VERIFIED | Create, edit, publish, close, contributions |
| **Admin** | Scholarships | FR-ADM-16 → FR-ADM-19 | IMPLEMENTED | `/api/admin/scholarship-applications` | VERIFIED | Review, request info, approve, reject |
| **Admin** | Complaints Moderation | FR-ADM-20 | IMPLEMENTED | `GET /api/admin/reports`, `PATCH .../:id` | VERIFIED | Status updates and admin notes |
| **Admin** | System Dashboard | FR-ADM-21 | IMPLEMENTED | `GET /api/admin/dashboard` | VERIFIED | Unused by Frontend (FE uses mock data) |
| **Admin** | Platform Settings | FR-ADM-22 | ABSENT | *None* | NOT SUPPORTED | Backend reads hardcoded env vars only |
| **Admin** | Audit Log Viewing | NFR-15 | PARTIAL | `GET /api/admin/dashboard` (nested 10 items) | PARTIAL | No dedicated `/api/admin/audit-logs` endpoint |
| **System** | Background Cron | BR-40 | IMPLEMENTED | `expireEnrollmentsJob.js` | VERIFIED | Runs every 1m to release held seats |
| **System** | Realtime Socket.IO | NFR-12 | ABSENT | *None* | NOT SUPPORTED | No WebSocket server in Express |
| **System** | Outbound Email | NFR-13 | ABSENT | *None* | NOT SUPPORTED | In-app Notification collection only |

---

## 7. Account / Profile Backend Contract

The profile domain is governed by `BackEnd/src/services/profileService.js`:

### 7.1. Profile Endpoints
- `GET /api/me/profile`: Returns role-specific profile object.
- `PATCH /api/me/profile`: Updates editable fields.
- `POST /api/me/avatar`: Uploads and sets avatar.
- `POST /api/me/password`: Changes password and revokes all refresh tokens.

### 7.2. Role-Specific Profile Data Shape

```typescript
// Shared Base Profile
interface BaseProfile {
  id: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "BANNED";
  createdAt: string;
  updatedAt: string;
}

// Student Profile
interface StudentProfile extends BaseProfile {
  role: "STUDENT";
  fullName: string;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

// Teacher Profile
interface TeacherProfile extends BaseProfile {
  role: "TEACHER";
  fullName: string;
  avatarUrl: string | null;
  biography: string | null;
  qualificationSummary: string | null;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; // Read-Only
  ratingAverage: number; // Read-Only
  ratingCount: number; // Read-Only
}

// Sponsor Profile
interface SponsorProfile extends BaseProfile {
  role: "SPONSOR";
  fullName: string;
  sponsorType: "INDIVIDUAL" | "ORGANIZATION";
  organizationName: string | null;
  representativeName: string | null;
  avatarUrl: string | null;
  description: string | null;
}
```

### 7.3. Field Mutability Constraints
- **Teacher Editable Fields**: `fullName` (required, <= 120 chars), `biography` (optional, <= 5000 chars), `qualificationSummary` (optional, <= 2000 chars), `avatarUrl` (optional string URL or upload path).
- **Teacher Read-Only Fields**: `email`, `role`, `status`, `verificationStatus`, `ratingAverage`, `ratingCount`. If included in request body, they are strictly ignored by Backend.

---

## 8. Avatar Upload Contract

### 8.1. End-to-End Pipeline
```
Frontend Profile Page (Antd Upload)
  → profileService.updateAvatar(file)
  → FormData { file: <binary> }
  → POST /api/me/avatar (with Authorization: Bearer <token>)
  → Backend upload middleware: uploader.single("file") (Multer memory storage)
  → communityController.updateMyAvatar(req.user.id, req.file)
  → profileService.updateMyAvatar(userId, file)
  → storageService.savePublicFile("AVATAR", file)
  → Disk Write: storage/public/avatar/<uuid>.<ext>
  → DB Update: User.teacherProfile.avatarUrl = "http://localhost:3000/uploads/avatar/<uuid>.<ext>"
  → Response: { success: true, data: { avatarUrl: "http://localhost:3000/uploads/avatar/..." } }
```

### 8.2. Strict Validation Constraints
- **HTTP Method**: `POST`
- **Path**: `/api/me/avatar`
- **Multipart Field Name**: Strictly `"file"`. Sending `"avatar"` triggers HTTP 400 `VALIDATION_ERROR` (*"Upload exactly one file in the 'file' field"*).
- **Max File Size**: 5MB (`MAX_PUBLIC_SIZE = 5 * 1024 * 1024`). Files exceeding 5MB trigger HTTP 413 `FILE_TOO_LARGE`.
- **Accepted MIME Types**: `image/jpeg`, `image/png`, `image/webp`.
- **Magic-Byte Signature Verification**: `storageService.js` inspects binary buffers:
  - PNG: must begin with `[0x89, 0x50, 0x4E, 0x47]`
  - JPEG: must begin with `[0xFF, 0xD8, 0xFF]`
  - WebP: must begin with `"RIFF"` and bytes 8–11 equal `"WEBP"`
  - Any file failing magic-byte check triggers HTTP 400 `UNSUPPORTED_FILE_TYPE`.

---

## 9. Teacher Verification / Qualification Upload Contract

Teacher verification (`BR-01`) is a multi-document submission protocol:

### 9.1. Stage 1: Private File Upload
- **Endpoint**: `POST /api/uploads/private`
- **Multipart Fields**:
  - `purpose`: String. Must be `"IDENTITY"` or `"QUALIFICATION"`.
  - `file`: Binary file.
- **Accepted Types**: PDF (`application/pdf`), JPEG, PNG, WebP.
- **Max Size**: 10MB (`MAX_PRIVATE_SIZE = 10 * 1024 * 1024`).
- **Storage Location**: `storage/private/<userId>/<PURPOSE>/<uuid>.<ext>`.
- **Response**: `{ success: true, data: { storageKey: "private/<userId>/<PURPOSE>/<uuid>.<ext>", mimeType, size, originalName } }`.

### 9.2. Stage 2: Dossier Submission
- **Endpoint**: `POST /api/teacher/verification`
- **Content-Type**: `application/json`
- **Payload Schema**:
```json
{
  "documents": [
    {
      "documentType": "IDENTITY",
      "files": [
        { "side": "FRONT", "storageKey": "private/<teacherId>/IDENTITY/<uuid>.pdf" },
        { "side": "BACK", "storageKey": "private/<teacherId>/IDENTITY/<uuid>.pdf" }
      ]
    },
    {
      "documentType": "QUALIFICATION",
      "files": [
        { "side": "SINGLE", "storageKey": "private/<teacherId>/QUALIFICATION/<uuid>.pdf" }
      ]
    }
  ],
  "qualificationSummary": "Cử nhân Sư phạm Toán",
  "biography": "5 năm kinh nghiệm giảng dạy..."
}
```
- **Rules**:
  - Both `IDENTITY` and `QUALIFICATION` document types are **strictly mandatory**. If either is omitted, Backend throws HTTP 400 `VALIDATION_ERROR` (*"Missing required documents"*).
  - Storage keys must belong to the calling teacher (`assertOwnedKeys`).
  - If teacher is already `VERIFIED`, throws HTTP 409 `ALREADY_VERIFIED`.
  - If teacher is already `PENDING`, throws HTTP 409 `VERIFICATION_PENDING`.

---

## 10. Upload / Storage Security

1. **Storage Separation**:
   - `storage/public/`: Contains avatars and course cover images. Statically served under `/uploads`.
   - `storage/private/`: Contains sensitive identity documents, degree certificates, and scholarship proofs. **Never served statically.**
2. **Access Security**:
   - Static route configuration in `app.js` line 32: `app.use("/uploads", express.static(storageService.getPublicDir(), { index: false }))`. Only the `public` directory is accessible.
   - Private documents can **only** be accessed via HMAC-SHA256 signed URLs generated by `POST /api/files/signed-url` or embedded in Admin/Teacher review responses (`storage.withSignedUrls`).
   - Signed URL format: `/api/files/download?key=<storageKey>&expires=<timestamp>&signature=<hmac>`.
   - Default TTL: 300 seconds (5 minutes). Expired or tampered signatures return HTTP 403 `INVALID_FILE_URL`.
   - Missing files return HTTP 404 `FILE_NOT_FOUND`.
3. **Assessment**: **No security leakage detected.** Private documents are cryptographically protected and cannot be directly enumerated or publicly fetched without an unexpired cryptographic signature.

---

## 11. Teacher Backend Capability

The Backend provides extensive capabilities for teachers:
1. **Account**: Registration (`POST /auth/register`), Profile management (`/me/profile`), Avatar update (`/me/avatar`), Password change (`/me/password`).
2. **Verification**: Submit verification dossier (`POST /teacher/verification`), Check verification status (`GET /teacher/verification`).
3. **Classes**: List own classes (`GET /teacher/classes`), Create class (`POST /teacher/classes`), Detail (`GET /teacher/classes/:id`), Update draft (`PATCH /teacher/classes/:id`), Submit for approval (`POST /teacher/classes/:id/submit`).
4. **Planned Schedules**: Auto-derive planned session occurrences (`GET /teacher/classes/:id/planned-sessions`).
5. **Class Students**: Query enrolled students with enrollment and payment status (`GET /teacher/classes/:id/students`).
6. **Sessions**: Create single or bulk sessions (`POST /teacher/classes/:id/sessions`), Update session (`PATCH /teacher/sessions/:id`), Delete session (`DELETE /teacher/sessions/:id`), End session (`POST /teacher/sessions/:id/end`), Get attendance roster (`GET /teacher/sessions/:id/attendance`).
7. **Classroom**: Join classroom as host (`POST /sessions/:id/join`).
8. **Earnings**: Query earnings ledger, gross/commission/net breakdown, and payout statuses (`GET /teacher/earnings`).
9. **Course Proposals**: Propose new course (`POST /teacher/course-proposals`), List proposals (`GET /teacher/course-proposals`), Update draft proposal (`PATCH /teacher/course-proposals/:id`).
10. **Reviews & Communications**: View teacher reviews (`GET /teachers/:id/reviews`), Conversations (`/conversations`), Notifications (`/me/notifications`).

---

## 12. Admin Backend Capability

The Backend provides robust administrative capabilities:
1. **User Management**: List users with role/status filters and regex search (`GET /admin/users`), User detail with relational activity metrics (`GET /admin/users/:id`), Suspend/Ban/Activate user (`PATCH /admin/users/:id/status`).
2. **Teacher Verification**: List pending/verified/rejected verifications (`GET /admin/teacher-verifications`), View verification dossier with signed document URLs (`GET /admin/teacher-verifications/:teacherId`), Approve (`POST .../approve`), Reject with note (`POST .../reject`).
3. **Catalog Management**: Full CRUD on Categories, Subjects, and standard Courses (`/admin/categories`, `/admin/subjects`, `/admin/courses`).
4. **Course Proposals**: List, inspect, approve, reject, or request changes on teacher proposals (`/admin/course-proposals`).
5. **Class Review**: List classes pending approval (`GET /admin/classes/pending`), Inspect class details with sessions and teacher profile (`GET /admin/classes/:id`), Approve (`POST .../approve`), Reject (`POST .../reject`).
6. **Finance & Transactions**: View global payment records (`GET /admin/payments`), View double-entry ledger transactions (`GET /admin/transactions`).
7. **Campaigns**: Create, edit, publish, close campaigns, monitor contributions (`/admin/campaigns`).
8. **Scholarships**: List applications, view student statement & proof documents, approve, reject, request additional information (`/admin/scholarship-applications`).
9. **Complaints Moderation**: List, view, and update moderation status on reports (`/admin/reports`).
10. **Platform Dashboard**: Real-time aggregation of user counts, pending queues, class statistics, revenue/commission trends over 6 months, and recent audit logs (`GET /admin/dashboard`).

---

## 13. Student Backend Capability — Quick Check

- **Browse & Filter**: `/classes`, `/catalog/filters`, `/classes/:id`, `/classes/:id/sessions`.
- **Teacher Discovery**: `/teachers` (search by query/subject/featured), `/teachers/:id` (teacher profile), `/teachers/:id/reviews`.
- **Enrollment & Reservation**: `POST /classes/:classId/enrollments` (15m hold), `GET /me/enrollments`, `POST /enrollments/:id/cancel`.
- **Payment**: Sandbox payment (`POST /enrollments/:id/payments`), Webhook (`POST /payments/sandbox/webhook`), Payment history (`GET /me/payments`).
- **Live Classroom**: `POST /sessions/:id/join` or `GET /sessions/:id/join`, Attendance tracking, `GET /sessions/:id/recording`.
- **Scholarships**: `POST /campaigns/:id/applications`, `GET /me/scholarship-applications`, `POST .../resubmit`, `GET /me/scholarships`, `POST /enrollments/:id/scholarship-payment` (pure scholarship and mixed co-payment).
- **Communication**: Shared messaging (`/conversations`), Complaints (`POST /reports`), Notifications (`/me/notifications`), Reviews (`POST /classes/:id/reviews`).

---

## 14. Sponsor Backend Capability — Quick Check

- **Registration & Auth**: Self-registration with `sponsorType` (`INDIVIDUAL` or `ORGANIZATION`), representative name, organization name.
- **Profile**: View profile (`GET /me/profile`), Update profile (`PATCH /me/profile`), Upload avatar (`POST /me/avatar`).
- **Campaigns & Contributions**: Browse public campaigns (`GET /campaigns`), Fund campaign (`POST /campaigns/:id/contributions`), View contribution history (`GET /sponsor/contributions`), View campaign impact metrics (`GET /sponsor/campaigns/:id/impact`).

---

## 15. Teacher Current Route/Page Inventory

| Route Path | Component File | Menu Entry | Connected Service | Real API Bound? |
|---|---|---|---|---|
| `/teacher` | `TeacherHomePage.tsx` | "Tổng quan" | `mockTeacherDashboard.ts` | **NO (100% Mock Data)** |
| `/teacher/classes` | `TeacherClassesPage.tsx` | "Lớp của tôi" | `class.service.ts` | **YES** (`GET /teacher/classes`) |
| `/teacher/classes/create` | `CreateTeacherClassPage.tsx` | Button in Classes | `class.service.ts` | **YES** (`POST /teacher/classes`) |
| `/teacher/classes/:classId` | `TeacherClassDetailPage.tsx` | Action in Class Row | `class.service.ts`, `session.service.ts` | **YES** (`GET /teacher/classes/:id`, sessions CRUD) |
| `/teacher/courses` | `TeacherCourseCatalogPage.tsx` | "Danh mục khóa học" | `course.service.ts`, `catalog.service.ts` | **YES** (`GET /courses`, `/categories`) |
| `/teacher/course-proposals` | `TeacherCourseProposalsPage.tsx` | "Đề xuất khóa học" | `courseProposal.service.ts` | **YES** (`/teacher/course-proposals`) |
| `/teacher/schedule` | `TeacherSchedulePage.tsx` | "Lịch giảng dạy" | `class.service.ts` | **YES** (Derives from classes & sessions) |
| `/teacher/profile` | `TeacherProfilePage.tsx` | "Hồ sơ giáo viên" | `profile.service.ts`, `teacherVerification.service.ts` | **YES** (`/me/profile`, `/teacher/verification`) |
| `/teacher/revenue` | `TeacherRevenuePage.tsx` | "Doanh thu" | `finance.service.ts` | **YES** (`GET /teacher/earnings`) |
| `/teacher/reviews` | `TeacherReviewsPage.tsx` | "Đánh giá" | `review.service.ts` | **YES** (`GET /teachers/:id/reviews`) |
| `/messages` | `MessagesPage.tsx` | "Tin nhắn" | `messaging.service.ts` | **YES** (`/conversations`) |
| `/classroom/:sessionId` | `ClassroomPage.tsx` | Action in Session | `classroomService.ts` | **YES** (`POST /sessions/:id/join`) |

---

## 16. Teacher Requirement Matrix FR-TEA-01 → FR-TEA-20

| ID | SRS Requirement | BE Supported? | Frontend Route / Page | Connected Service | Current Status | Missing / Broken Part | Severity |
|---|---|---|---|---|---|---|---|
| **FR-TEA-01** | Register Teacher | YES | `/register/teacher` | `auth.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-02** | Submit Identity Verification | YES | `/teacher/profile` modal | `teacherVerification.service.ts` | **BROKEN** | Returns 409 for seed accounts; antd dragger file accumulation; admin cannot preview PDF | **P0** |
| **FR-TEA-03** | Submit Qualification | YES | `/teacher/profile` modal | `teacherVerification.service.ts` | **PARTIAL** | Bound inside same single modal; no standalone qualification document manager | **P1** |
| **FR-TEA-04** | Manage Profile | YES | `/teacher/profile` | `profile.service.ts` | **COMPLETE** | Avatar MIME restriction not messaged | **P2** |
| **FR-TEA-05** | Browse Course Catalog | YES | `/teacher/courses` | `course.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-06** | Propose Course | YES | `/teacher/course-proposals` | `courseProposal.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-07** | Create Class | YES | `/teacher/classes/create` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-08** | Configure FREE/PAID | YES | `/teacher/classes/create` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-09** | Set Price | YES | `/teacher/classes/create` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-10** | Configure Capacity | YES | `/teacher/classes/create` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-11** | Configure Schedule | YES | `/teacher/classes/create` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-12** | Manage Session | YES | `/teacher/classes/:classId` | `session.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-13** | View Enrollment | YES | *None* | *None* | **MISSING** | `TeacherClassDetailPage` has no Enrollments tab or view | **P1** |
| **FR-TEA-14** | Manage Students | YES | *None* | *None* | **MISSING** | Backend has `GET .../students` but FE has no student roster UI | **P1** |
| **FR-TEA-15** | Start Online Classroom | YES | `/classroom/:sessionId` | `classroomService.ts` | **COMPLETE** | None | None |
| **FR-TEA-16** | View Teaching Schedule | YES | `/teacher/schedule` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-17** | View Revenue | YES | `/teacher/revenue` | `finance.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-18** | View Transaction | NO | *None* | *None* | **MISSING** | Backend has no Teacher Transaction endpoint; FE has no page | **P2** |
| **FR-TEA-19** | View Review | YES | `/teacher/reviews` | `review.service.ts` | **COMPLETE** | None | None |
| **FR-TEA-20** | Message Student | YES | `/messages` | `messaging.service.ts` | **COMPLETE** | None | None |

---

## 17. Teacher Portal Completeness Score

- **COMPLETE**: **15 / 20** (75.0%)
- **PARTIAL**: **1 / 20** (5.0%)
- **BROKEN**: **1 / 20** (5.0%)
- **MISSING**: **3 / 20** (15.0%)

*Note: Teacher Home Dashboard is 100% powered by static mock data (`mockTeacherDashboard.ts`), even though not an explicit isolated FR, representing a significant portal quality gap.*

---

## 18. Teacher Profile Runtime Audit

- **Dedicated Page**: Yes, located at `/teacher/profile` ([TeacherProfilePage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/teacher/profile/TeacherProfilePage.tsx)).
- **Fields Displayed**: Full Name, Email, Role Tag ("GIÁO VIÊN"), Avatar, Verification Status banner, Qualification Summary, Biography.
- **Editable Fields**: Full Name, Qualification Summary, Biography (via "Chỉnh sửa" mode).
- **Password Change**: Dedicated Modal with current password, new password, confirm password, triggering `POST /api/me/password`.
- **Persistence Across Refresh**: Tested and verified. Data is fetched on mount via `GET /api/me/profile`.
- **Persistence Across Logout/Login**: Tested and verified. Updates are saved to MongoDB User document.

---

## 19. Teacher Avatar Bug

### Runtime Reproduction & Root Cause Analysis (BUG-T02)
- **User Symptom**: *"Teacher cập nhật ảnh bị lỗi."*
- **Test Execution**: Tested avatar uploads via Playwright and direct API execution.
- **Observed Behaviors**:
  1. *Test with valid PNG buffer*: Status 200 OK. Returns `{ success: true, data: { avatarUrl: "http://localhost:3000/uploads/avatar/<uuid>.png" } }`. The avatar immediately updates in the Header.
  2. *Test with renamed text file or non-conforming image*: Status 400 Bad Request. Backend error: `"UNSUPPORTED_FILE_TYPE"`, message: `"Unsupported file type. Allowed: image/jpeg, image/png, image/webp"`.
  3. *Test with field name `"avatar"` instead of `"file"`*: Status 400 Bad Request. Backend error: `"VALIDATION_ERROR"`, message: `"Upload exactly one file in the 'file' field"`.
- **Root Cause Categorization**: **BACKEND STORAGE BUG + FE CONTRACT & ERROR HANDLING GAP**.
  - **Backend Strictness**: Backend `storageService.js` strictly runs `matchesSignature(file.buffer, file.mimetype)`. Common web formats like SVG, AVIF, HEIC or slightly malformed JPEGs fail the byte check and are rejected with 400.
  - **Uninitialized Teacher Profile**: If an account in the database does not have `user.teacherProfile` defined, `profileService.updateMyAvatar` throws 400 `PROFILE_NOT_EDITABLE` (line 135) instead of auto-initializing the object like `updateMyProfile` does.
  - **Frontend Silent Failure**: In `TeacherProfilePage.tsx`, `onError` only shows a generic message: `"Có lỗi xảy ra khi cập nhật ảnh đại diện."` without displaying the specific backend rejection reason (e.g., unsupported format or size limit).

---

## 20. Teacher Verification Upload Bug

### Runtime Reproduction & Root Cause Analysis (BUG-T01)
- **User Symptom**: *"bên giáo viên còn đang bị lỗi hồ sơ tải lên."*
- **Test Execution**: Tested verification submission on both existing seed accounts and a freshly registered teacher account.
- **Observed Behaviors**:
  1. *Test with seed account `teacher@test.com`*: The UI shows a green badge *"Hồ sơ đã được xác minh"*. No upload button is displayed because `verificationStatus === 'VERIFIED'`. Calling the API directly returns HTTP 409 Conflict: `"ALREADY_VERIFIED"`.
  2. *Test with seed account `teacher3@test.com`*: The UI shows an amber badge *"Hồ sơ đang chờ duyệt"*. Calling the API directly returns HTTP 409 Conflict: `"VERIFICATION_PENDING"`.
  3. *Test with freshly registered UNVERIFIED teacher*: Both `POST /api/uploads/private` (IDENTITY and QUALIFICATION) and `POST /api/teacher/verification` return HTTP 201 Created. The state successfully switches to PENDING.
- **Root Cause Categorization**: **DATA SEEDING ISSUE + FE STATE MANAGEMENT BUG + ADMIN PREVIEW BUG**.
  - **Seed State Dead-End**: Seeded demo accounts (`teacher@test.com`, `teacher2@test.com`, `teacher3@test.com`) are already VERIFIED or PENDING. Testers logging into standard demo accounts cannot test verification submission without receiving 409 Conflict.
  - **Antd Upload State Accumulation**: In `TeacherProfilePage.tsx`, `beforeUpload` does `setIdentityFiles(prev => [...prev, file])`. If the user selects files in multiple passes, files accumulate beyond `maxCount`, causing extra uploads and incorrect side mapping (`FRONT`/`BACK`).
  - **Admin Document Preview Failure**: When Admin opens `TeacherVerificationDetailPage.tsx`, the UI renders uploaded files using `<img src={file.url} />`. Because users typically upload PDF certificates and IDs, HTML `<img>` tags fail to render PDFs, appearing completely broken to the Admin.

---

## 21. Teacher Student/Enrollment Management

- **Backend Support**: The Backend provides `GET /api/teacher/classes/:id/students`, returning an array of enrolled students:
  `{ enrollmentId, studentId, fullName, avatarUrl, email, enrollmentStatus, paymentSource, enrolledAt }`.
- **Frontend Current Reality**:
  - `TeacherClassDetailPage.tsx` has only **two tabs**: `overview` (Tổng quan) and `sessions` (Buổi học).
  - There is **no Students tab**, **no Enrollments tab**, and no standalone Student Management page.
  - Student details are only partially visible in the session attendance modal (after a session starts or completes).
- **Audit Verdict**: **MAJOR FRONTEND CAPABILITY GAP** for `FR-TEA-13` (View Enrollment) and `FR-TEA-14` (Manage Students). The Backend API is completely implemented and ready, but the Frontend omits the interface.

---

## 22. Teacher Revenue vs Transaction Gap

- **Revenue**: Supported and implemented. `GET /api/teacher/earnings` returns gross earnings, commission deductions, net revenue, and payout statuses (`PENDING`, `AVAILABLE`, `PAID_OUT`). `TeacherRevenuePage.tsx` renders this data accurately.
- **Transactions**: `FR-TEA-18` specifies that teachers should view financial transaction history.
  - In Backend, the `Transaction` model is strictly partitioned for Admin (`GET /api/admin/transactions`). There is no endpoint for teachers to query ledger transactions.
  - In Frontend, there is no "Transactions" page or menu entry for teachers.
- **Audit Verdict**: `FR-TEA-18` is **NOT SUPPORTED BY BACKEND** and **MISSING FROM FRONTEND**.

---

## 23. Admin Current Route/Page Inventory

| Route Path | Component File | Menu Entry | Connected Service | Real API Bound? |
|---|---|---|---|---|
| `/admin` | `AdminHomePage.tsx` | "Tổng quan" | `mockAdminDashboard.ts` | **NO (100% Mock Data)** |
| `/admin/classes` | `AdminClassesPage.tsx` | "Lớp học" | `class.service.ts` | **YES** (`/admin/classes/pending`, `/classes`) |
| `/admin/classes/:classId` | `AdminClassDetailPage.tsx` | Action in Class Row | `class.service.ts` | **YES** (`GET /admin/classes/:id`, approve/reject) |
| `/admin/catalog` | `AdminCatalogPage.tsx` | "Danh mục & Khóa học" | `catalog.service.ts`, `course.service.ts` | **YES** (CRUD Categories, Subjects, Courses) |
| `/admin/course-proposals` | `AdminCourseProposalsPage.tsx` | "Duyệt đề xuất khóa học" | `courseProposal.service.ts` | **YES** (`/admin/course-proposals`) |
| `/admin/teachers/verifications` | `TeacherVerificationPage.tsx` | "Giáo viên" | `teacherVerification.service.ts` | **YES** (`/admin/teacher-verifications`) |
| `/admin/teachers/verifications/:teacherId` | `TeacherVerificationDetailPage.tsx` | Action in Row | `teacherVerification.service.ts` | **YES** (Approve/Reject; PDF preview bug) |
| `/admin/campaigns` | `AdminCampaignsPage.tsx` | "Chiến dịch" | `campaign.service.ts` | **YES** (`/admin/campaigns`) |
| `/admin/campaigns/create` | `CreateCampaignPage.tsx` | Button in Campaigns | `campaign.service.ts` | **YES** (`POST /admin/campaigns`) |
| `/admin/campaigns/:campaignId` | `CampaignDetailPage.tsx` | Action in Row | `campaign.service.ts` | **YES** (Publish, Close, Contributions) |
| `/admin/scholarship-applications` | `ScholarshipApplicationsPage.tsx` | "Hồ sơ ứng tuyển" | `scholarshipApplication.service.ts` | **YES** (`/admin/scholarship-applications`) |
| `/admin/scholarship-applications/:applicationId` | `ScholarshipApplicationReviewPage.tsx` | Action in Row | `scholarshipApplication.service.ts` | **YES** (Approve, Reject, Request info; doc link bug) |
| `/admin/payments` | `AdminPaymentsPage.tsx` | "Thanh toán" | `finance.service.ts` | **YES** (`GET /admin/payments`) |
| `/admin/transactions` | `AdminTransactionsPage.tsx` | "Giao dịch" | `finance.service.ts` | **YES** (`GET /admin/transactions`) |
| `/admin/reports` | `AdminReportsPage.tsx` | "Khiếu nại" | `report.service.ts` | **YES** (`/admin/reports`) |
| `/notifications` | `NotificationsPage.tsx` | "Thông báo" | `notification.service.ts` | **YES** (`/me/notifications`) |

---

## 24. Admin Requirement Matrix FR-ADM-01 → FR-ADM-22

| ID | SRS Requirement | BE Supported? | Frontend Route / Page | Connected Service | Current Status | Missing / Broken Part | Severity |
|---|---|---|---|---|---|---|---|
| **FR-ADM-01** | Manage User | YES | *None* | *None* | **MISSING** | No page, route, or menu entry in Admin Portal | **P0** |
| **FR-ADM-02** | Verify Teacher | YES | `/admin/teachers/verifications/:teacherId` | `teacherVerification.service.ts` | **BROKEN** | PDF documents rendered via `<img>` tags display broken | **P1** |
| **FR-ADM-03** | Manage Category | YES | `/admin/catalog` | `catalog.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-04** | Manage Subject | YES | `/admin/catalog` | `catalog.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-05** | Manage Course | YES | `/admin/catalog` | `course.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-06** | Review Course Proposal | YES | `/admin/course-proposals` | `courseProposal.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-07** | Monitor Class | YES | `/admin/classes` | `class.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-08** | Monitor Session | NO | *None* | *None* | **MISSING** | Backend lacks global `/api/admin/sessions` endpoint | **P2** |
| **FR-ADM-09** | Manage Payment | YES | `/admin/payments` | `finance.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-10** | Manage Transaction | YES | `/admin/transactions` | `finance.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-11** | Create Campaign | YES | `/admin/campaigns/create` | `campaign.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-12** | Update Campaign | YES | `/admin/campaigns/:campaignId` | `campaign.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-13** | Publish Campaign | YES | `/admin/campaigns/:campaignId` | `campaign.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-14** | Close Campaign | YES | `/admin/campaigns/:campaignId` | `campaign.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-15** | Monitor Contributions | YES | `/admin/campaigns/:campaignId` | `campaign.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-16** | Review Scholarship App | YES | `/admin/scholarship-applications/:id` | `scholarshipApplication.service.ts` | **BROKEN** | Checks `file.signedUrl` instead of `file.url`, button disabled | **P1** |
| **FR-ADM-17** | Request Document | YES | `/admin/scholarship-applications/:id` | `scholarshipApplication.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-18** | Approve Scholarship | YES | `/admin/scholarship-applications/:id` | `scholarshipApplication.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-19** | Reject Scholarship | YES | `/admin/scholarship-applications/:id` | `scholarshipApplication.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-20** | Manage Complaint | YES | `/admin/reports` | `report.service.ts` | **COMPLETE** | None | None |
| **FR-ADM-21** | View Dashboard | YES | `/admin` | `mockAdminDashboard.ts` | **BROKEN** | Entire page uses mock data; real API is uncalled | **P1** |
| **FR-ADM-22** | PlatformSetting | NO | *None* | *None* | **MISSING** | Backend has no PlatformSetting model/API | **P2** |

---

## 25. Admin Portal Completeness Score

- **COMPLETE**: **16 / 22** (72.7%)
- **PARTIAL**: **0 / 22** (0.0%)
- **BROKEN**: **3 / 22** (13.6%) (FR-ADM-02, FR-ADM-16, FR-ADM-21)
- **MISSING**: **3 / 22** (13.6%) (FR-ADM-01, FR-ADM-08, FR-ADM-22)

---

## 26. Admin User Management

- **Backend Reality**: Fully implemented in `adminService.js`:
  - `GET /api/admin/users`: Supports role filter (`STUDENT`, `TEACHER`, `SPONSOR`, `ADMIN`), status filter (`ACTIVE`, `PENDING`, `SUSPENDED`, `BANNED`), regex search on email and profiles, with pagination.
  - `GET /api/admin/users/:id`: Returns full user profile plus relational counts (enrollments, scholarships, classes, contributions, reports against).
  - `PATCH /api/admin/users/:id/status`: Allows Admin to suspend, ban, or reactivate user accounts with mandatory reason logging and automatic token revocation.
- **Frontend Reality**: **COMPLETELY ABSENT**.
  - No `AdminUsersPage.tsx` file exists.
  - No route is registered in `router.tsx`.
  - No menu entry exists in `AdminLayout.tsx`.
- **Audit Verdict**: **P0 CRITICAL FRONTEND GAP**.

---

## 27. Admin Teacher Verification

- **Capabilities**: Admin can list verifications (`TeacherVerificationPage.tsx`), view teacher details, and approve or reject dossiers with notes (`TeacherVerificationDetailPage.tsx`).
- **Defect Identified (BUG-A01)**:
  - In `TeacherVerificationDetailPage.tsx` lines 137 and 159:
    `<img src={file.url} alt="CCCD" className="w-full h-[220px] object-cover" />`
  - Uploaded verification documents are almost universally PDF files.
  - HTML `<img>` tags cannot render PDF content, leading to broken image icons on the Admin review surface.

---

## 28. Admin Catalog

- **Categories**: Full CRUD in `AdminCatalogPage.tsx`. Working API endpoints.
- **Subjects**: Full CRUD in `AdminCatalogPage.tsx`. Working API endpoints.
- **Courses**: Full CRUD in `AdminCatalogPage.tsx`. Working API endpoints.
- **Course Proposals**: Full review interface in `AdminCourseProposalsPage.tsx`. Working approve, reject, and request-changes workflows.
- **Audit Verdict**: **100% COMPLETE**.

---

## 29. Admin Class Monitoring

- **Pending Review**: Working interface in `AdminClassesPage.tsx` calling `GET /api/admin/classes/pending`.
- **Class Inspection**: Working interface in `AdminClassDetailPage.tsx` calling `GET /api/admin/classes/:id`.
- **Approval / Rejection**: Working mutations calling `POST /api/admin/classes/:id/approve` and `POST /api/admin/classes/:id/reject`.
- **All Classes View**: Tab calling `GET /api/classes` with search and filters.
- **Audit Verdict**: **100% COMPLETE**.

---

## 30. Admin Session Monitoring

- **SRS Specification**: `FR-ADM-08 Monitor Session`.
- **Backend Reality**: The Backend does not provide a global session monitoring or search endpoint (e.g. `/api/admin/sessions`). The only session access Admin has is viewing the session list of a single pending class via `GET /api/admin/classes/:id` or calling public `GET /api/classes/:id/sessions`.
- **Frontend Reality**: No session monitoring view exists.
- **Audit Verdict**: **BACKEND CAPABILITY GAP**.

---

## 31. Admin Finance

- **Payments**: `AdminPaymentsPage.tsx` connects to `GET /api/admin/payments`. Displays gateway references, payment methods, amounts, and statuses.
- **Transactions**: `AdminTransactionsPage.tsx` connects to `GET /api/admin/transactions`. Displays full double-entry ledger transactions (`PAYMENT`, `COMMISSION`, `EARNING`, `REFUND`, `SCHOLARSHIP_USAGE`).
- **Audit Verdict**: **100% COMPLETE**.

---

## 32. Admin Campaign / Scholarship

- **Campaigns**: Complete lifecycle (Create, Edit in DRAFT, Publish, Close, Monitor Contributions) connected to `/admin/campaigns`.
- **Scholarship Applications**: Applications list connected to `/admin/scholarship-applications`. Application review page connected to `/admin/scholarship-applications/:id` with Approve, Reject, and Request Information workflows.
- **Defect Identified (BUG-A02)**: In `ScholarshipApplicationReviewPage.tsx` line 326:
  `{file.signedUrl ? (<a href={file.signedUrl}>...</a>) : (<Button disabled>Chưa có URL xem</Button>)}`
  The Backend returns `file.url`, not `file.signedUrl`. As a result, the document viewing button is permanently disabled with the text *"Chưa có URL xem"*.

---

## 33. Admin Complaint

- **Reports List**: Paged moderation table in `AdminReportsPage.tsx` connected to `GET /api/admin/reports`.
- **Status Transitions**: Supports transitioning reports from `OPEN` to `IN_REVIEW`, `RESOLVED`, or `REJECTED` via `PATCH /api/admin/reports/:id` with resolution notes.
- **Audit Verdict**: **100% COMPLETE**.

---

## 34. Admin Dashboard

- **Backend Reality**: `adminService.getDashboard()` performs real-time MongoDB aggregations for:
  - User counts by role and verification status.
  - Pending approval queues (teachers, classes, proposals, scholarships, reports).
  - Training metrics (courses, active classes, confirmed enrollments).
  - Financial numbers (total revenue, commission, monthly 6-month trends).
  - Campaign and scholarship fund utilization.
  - Top 10 recent `AuditLog` events.
- **Frontend Reality (BUG-A03)**:
  - `AdminHomePage.tsx` and all its child components (`PendingTasks`, `PendingTeachers`, `AdminFinanceOverview`, `ScholarshipOverview`, `TrainingOverview`) import static mock data from `mockAdminDashboard.ts`.
  - The real endpoint `GET /api/admin/dashboard` is **NEVER CALLED**.
- **Audit Verdict**: **BROKEN INTEGRATION / DUMMY UI**.

---

## 35. PlatformSetting

- **SRS Specification**: `FR-ADM-22 PlatformSetting` (Configurable `SEAT_HOLD_DURATION`, `COMMISSION_RATE`, etc.).
- **Backend Reality**: Implemented as temporary constants in `BackEnd/src/utils/settings.js` reading `process.env`. There is no `PlatformSetting` Mongoose model, no setting router, and no API endpoints.
- **Frontend Reality**: No settings UI exists.
- **Audit Verdict**: **BACKEND CAPABILITY GAP**.

---

## 36. AuditLog

- **Backend Reality**:
  - `AuditLog` model exists and records critical Admin actions: `TEACHER_VERIFIED`, `CLASS_APPROVED`, `PROPOSAL_APPROVED`, `USER_SUSPENDED`, `CAMPAIGN_CLOSED`.
  - However, there is no standalone `GET /api/admin/audit-logs` endpoint. Audit logs are only exposed as the top 10 items in `GET /api/admin/dashboard`.
- **Frontend Reality**: No dedicated Audit Log page exists.
- **Audit Verdict**: **PARTIAL BACKEND CAPABILITY / MINOR GAP**.

---

## 37. Backend Available but Frontend Missing

| Capability | Backend Endpoint | Role | Current Frontend State | Recommended Frontend Implementation | Priority |
|---|---|---|---|---|---|
| **Admin User Management** | `GET /api/admin/users`, `GET .../:id`, `PATCH .../status` | ADMIN | **Missing** | Dedicated `AdminUsersPage.tsx` with role/status filters, user detail modal, suspend/ban action | **P0** |
| **Teacher Class Students** | `GET /api/teacher/classes/:id/students` | TEACHER | **Missing** | Add "Học viên" tab in `TeacherClassDetailPage.tsx` showing enrolled student roster and contact actions | **P1** |
| **Admin Real Dashboard** | `GET /api/admin/dashboard` | ADMIN | **Using Mocks** | Replace `mockAdminDashboard.ts` imports in `AdminHomePage.tsx` with `useQuery(["admin-dashboard"])` | **P1** |
| **Teacher Real Dashboard** | Aggregated from `/teacher/classes`, `/earnings` | TEACHER | **Using Mocks** | Replace `mockTeacherDashboard.ts` with real queries in `TeacherHomePage.tsx` | **P1** |
| **Public Teacher Search** | `GET /api/teachers`, `GET /api/teachers/:id` | STUDENT/PUBLIC | **Missing** | Create `/teachers` discovery page and `/teachers/:id` public profile page | **P2** |
| **Sponsor Profile** | `GET /me/profile`, `PATCH /me/profile`, `POST /me/avatar` | SPONSOR | **Missing** | Dedicated `SponsorProfilePage.tsx` for organization details and avatar | **P2** |

---

## 38. Frontend Exists but Backend Unsupported

| Frontend Feature | Current Frontend State | Backend Status | Impact / Verdict |
|---|---|---|---|
| **FR-ADM-08 Monitor Session** | No dedicated UI page | No `/api/admin/sessions` endpoint exists | SRS requirement cannot be implemented without BE expansion |
| **FR-ADM-22 PlatformSetting** | No UI page | No `PlatformSetting` model or setting API | Configuration remains static in `.env` |
| **FR-TEA-18 View Transaction** | No UI page | Backend only has `GET /teacher/earnings` | Teachers view earnings breakdown, not raw ledger entries |
| **Realtime WebSockets** | Sockets configured in UI hooks | Backend has no Socket.IO listener | Client falls back to HTTP REST refetching |
| **Outbound Email Alerts** | N/A | No mailer library in Backend | In-app notification collection used exclusively |

---

## 39. SRS vs BE vs FE Master Gap Matrix

| ID | Actor | SRS Requirement | BE Supported? | BE Endpoint | FE Support? | Route | Status | Owner | Severity |
|---|---|---|---|---|---|---|---|---|---|
| **FR-TEA-01** | TEACHER | Register Teacher | YES | `POST /api/auth/register` | YES | `/register/teacher` | **COMPLETE** | NONE | None |
| **FR-TEA-02** | TEACHER | Submit Verification | YES | `POST /teacher/verification` | YES | `/teacher/profile` | **BROKEN** | BOTH | **P0** |
| **FR-TEA-03** | TEACHER | Submit Qualification | YES | `POST /teacher/verification` | YES | `/teacher/profile` | **PARTIAL** | FE | **P1** |
| **FR-TEA-04** | TEACHER | Manage Profile | YES | `/me/profile`, `/me/avatar` | YES | `/teacher/profile` | **COMPLETE** | NONE | None |
| **FR-TEA-05** | TEACHER | Browse Course Catalog | YES | `/courses`, `/categories` | YES | `/teacher/courses` | **COMPLETE** | NONE | None |
| **FR-TEA-06** | TEACHER | Propose Course | YES | `/teacher/course-proposals` | YES | `/teacher/course-proposals` | **COMPLETE** | NONE | None |
| **FR-TEA-07** | TEACHER | Create Class | YES | `POST /teacher/classes` | YES | `/teacher/classes/create` | **COMPLETE** | NONE | None |
| **FR-TEA-08** | TEACHER | Configure FREE/PAID | YES | `POST /teacher/classes` | YES | `/teacher/classes/create` | **COMPLETE** | NONE | None |
| **FR-TEA-09** | TEACHER | Set Price | YES | `POST /teacher/classes` | YES | `/teacher/classes/create` | **COMPLETE** | NONE | None |
| **FR-TEA-10** | TEACHER | Configure Capacity | YES | `POST /teacher/classes` | YES | `/teacher/classes/create` | **COMPLETE** | NONE | None |
| **FR-TEA-11** | TEACHER | Configure Schedule | YES | `POST /teacher/classes` | YES | `/teacher/classes/create` | **COMPLETE** | NONE | None |
| **FR-TEA-12** | TEACHER | Manage Session | YES | `/teacher/classes/:id/sessions` | YES | `/teacher/classes/:classId` | **COMPLETE** | NONE | None |
| **FR-TEA-13** | TEACHER | View Enrollment | YES | `GET .../students` | NO | *None* | **MISSING** | FE | **P1** |
| **FR-TEA-14** | TEACHER | Manage Students | YES | `GET .../students` | NO | *None* | **MISSING** | FE | **P1** |
| **FR-TEA-15** | TEACHER | Start Classroom | YES | `POST /sessions/:id/join` | YES | `/classroom/:sessionId` | **COMPLETE** | NONE | None |
| **FR-TEA-16** | TEACHER | Teaching Schedule | YES | `/teacher/classes` | YES | `/teacher/schedule` | **COMPLETE** | NONE | None |
| **FR-TEA-17** | TEACHER | View Revenue | YES | `GET /teacher/earnings` | YES | `/teacher/revenue` | **COMPLETE** | NONE | None |
| **FR-TEA-18** | TEACHER | View Transaction | NO | *None* | NO | *None* | **MISSING** | BOTH | **P2** |
| **FR-TEA-19** | TEACHER | View Review | YES | `GET /teachers/:id/reviews` | YES | `/teacher/reviews` | **COMPLETE** | NONE | None |
| **FR-TEA-20** | TEACHER | Message Student | YES | `/conversations` | YES | `/messages` | **COMPLETE** | NONE | None |
| **FR-ADM-01** | ADMIN | Manage User | YES | `/admin/users` | NO | *None* | **MISSING** | FE | **P0** |
| **FR-ADM-02** | ADMIN | Verify Teacher | YES | `/admin/teacher-verifications` | YES | `/admin/teachers/verifications` | **BROKEN** | FE | **P1** |
| **FR-ADM-03** | ADMIN | Manage Category | YES | `/admin/categories` | YES | `/admin/catalog` | **COMPLETE** | NONE | None |
| **FR-ADM-04** | ADMIN | Manage Subject | YES | `/admin/subjects` | YES | `/admin/catalog` | **COMPLETE** | NONE | None |
| **FR-ADM-05** | ADMIN | Manage Course | YES | `/admin/courses` | YES | `/admin/catalog` | **COMPLETE** | NONE | None |
| **FR-ADM-06** | ADMIN | Review Proposal | YES | `/admin/course-proposals` | YES | `/admin/course-proposals` | **COMPLETE** | NONE | None |
| **FR-ADM-07** | ADMIN | Monitor Class | YES | `/admin/classes/pending` | YES | `/admin/classes` | **COMPLETE** | NONE | None |
| **FR-ADM-08** | ADMIN | Monitor Session | NO | *None* | NO | *None* | **MISSING** | BE | **P2** |
| **FR-ADM-09** | ADMIN | Manage Payment | YES | `GET /admin/payments` | YES | `/admin/payments` | **COMPLETE** | NONE | None |
| **FR-ADM-10** | ADMIN | Manage Transaction | YES | `GET /admin/transactions` | YES | `/admin/transactions` | **COMPLETE** | NONE | None |
| **FR-ADM-11** | ADMIN | Create Campaign | YES | `POST /admin/campaigns` | YES | `/admin/campaigns/create` | **COMPLETE** | NONE | None |
| **FR-ADM-12** | ADMIN | Update Campaign | YES | `PATCH /admin/campaigns/:id` | YES | `/admin/campaigns/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-13** | ADMIN | Publish Campaign | YES | `POST .../publish` | YES | `/admin/campaigns/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-14** | ADMIN | Close Campaign | YES | `POST .../close` | YES | `/admin/campaigns/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-15** | ADMIN | Monitor Contributions | YES | `GET .../contributions` | YES | `/admin/campaigns/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-16** | ADMIN | Review Scholarship | YES | `/admin/scholarship-applications` | YES | `/admin/scholarship-applications/:id` | **BROKEN** | FE | **P1** |
| **FR-ADM-17** | ADMIN | Request Document | YES | `POST .../request-information` | YES | `/admin/scholarship-applications/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-18** | ADMIN | Approve Scholarship | YES | `POST .../approve` | YES | `/admin/scholarship-applications/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-19** | ADMIN | Reject Scholarship | YES | `POST .../reject` | YES | `/admin/scholarship-applications/:id` | **COMPLETE** | NONE | None |
| **FR-ADM-20** | ADMIN | Manage Complaint | YES | `/admin/reports` | YES | `/admin/reports` | **COMPLETE** | NONE | None |
| **FR-ADM-21** | ADMIN | View Dashboard | YES | `GET /admin/dashboard` | YES | `/admin` | **BROKEN** | FE | **P1** |
| **FR-ADM-22** | ADMIN | PlatformSetting | NO | *None* | NO | *None* | **MISSING** | BE | **P2** |

---

## 40. Bug Register

### BUG-T01: Teacher Verification Submission Runtime Failure
- **Role**: TEACHER
- **Page**: `/teacher/profile`
- **Steps**: Log in as seed account `teacher@test.com` or `teacher3@test.com` and attempt to submit verification.
- **Expected**: User can upload and submit verification dossier.
- **Actual**: Backend rejects with HTTP 409 Conflict (`ALREADY_VERIFIED` or `VERIFICATION_PENDING`).
- **Network**: `POST /api/teacher/verification` -> 409 Conflict.
- **Root Cause**: Seed data leaves accounts in terminal or pending verification states; UI does not handle re-verification or inform users why action is unavailable.
- **Owner**: BOTH (Data seed + FE state handling).
- **Severity**: **P0**

### BUG-T02: Teacher Avatar Upload Rejection
- **Role**: TEACHER / ALL ROLES
- **Page**: `/teacher/profile`
- **Steps**: Select image file (e.g. non-conforming image or AVIF format) and click upload.
- **Expected**: Avatar updates or clear error explains file requirement.
- **Actual**: Upload fails with HTTP 400 Bad Request (`UNSUPPORTED_FILE_TYPE`). Generic error toast displayed.
- **Network**: `POST /api/me/avatar` -> 400 Bad Request.
- **Root Cause**: Backend enforces strict binary magic bytes; Frontend lacks file validation guidance and suppresses backend error message.
- **Owner**: FE (Validation / Error mapping).
- **Severity**: **P1**

### BUG-A01: Admin Teacher Verification Document Display Failure
- **Role**: ADMIN
- **Page**: `/admin/teachers/verifications/:teacherId`
- **Steps**: Navigate to teacher verification detail page.
- **Expected**: Uploaded identity and qualification documents render clearly.
- **Actual**: HTML `<img>` tags fail to render PDF files, displaying broken image placeholders.
- **Root Cause**: Component assumes all uploaded files are images, using `<img src={file.url} />` without PDF branch.
- **Owner**: FE.
- **Severity**: **P1**

### BUG-A02: Admin Scholarship Proof Document Download Disabled
- **Role**: ADMIN
- **Page**: `/admin/scholarship-applications/:applicationId`
- **Steps**: Open scholarship application review page.
- **Expected**: Button allows opening attached proof document.
- **Actual**: Button is permanently disabled with label *"Chưa có URL xem"*.
- **Root Cause**: Component checks `file.signedUrl`, but Backend returns `file.url`.
- **Owner**: FE.
- **Severity**: **P1**

### BUG-A03: Admin Dashboard Powered by Static Mock Data
- **Role**: ADMIN
- **Page**: `/admin`
- **Steps**: View Admin Home overview.
- **Expected**: Dashboard reflects real database metrics from `GET /api/admin/dashboard`.
- **Actual**: Dashboard displays hardcoded figures from `mockAdminDashboard.ts`.
- **Root Cause**: Components never invoke React Query or `adminService.getDashboard()`.
- **Owner**: FE.
- **Severity**: **P1**

### BUG-T03: Teacher Dashboard Powered by Static Mock Data
- **Role**: TEACHER
- **Page**: `/teacher`
- **Steps**: View Teacher Home overview.
- **Expected**: Statistics reflect teacher's real classes and earnings.
- **Actual**: Dashboard displays hardcoded numbers from `mockTeacherDashboard.ts`.
- **Root Cause**: Components never bind to real class and earnings queries.
- **Owner**: FE.
- **Severity**: **P1**

### BUG-T04: Teacher Missing Enrolled Students Tab
- **Role**: TEACHER
- **Page**: `/teacher/classes/:classId`
- **Steps**: View class detail workspace.
- **Expected**: Tab exists to view enrolled students and contact them.
- **Actual**: Tabs only show "Tổng quan" and "Buổi học".
- **Root Cause**: Frontend omitted student roster tab despite backend API availability.
- **Owner**: FE.
- **Severity**: **P1**

### BUG-S01: Sponsor Missing Profile Management
- **Role**: SPONSOR
- **Page**: `/sponsor`
- **Steps**: Navigate sponsor portal.
- **Expected**: Page exists to manage organization profile and avatar.
- **Actual**: No profile page or route exists in Sponsor Portal.
- **Root Cause**: Missing page implementation.
- **Owner**: FE.
- **Severity**: **P2**

---

## 41. Must-Have Completion Matrix

| Requirement | Actor | Status | Impact / Blocker |
|---|---|---|---|
| Register Account | ALL | **COMPLETE** | None |
| Login & Token Refresh | ALL | **COMPLETE** | None |
| Submit Verification | TEACHER | **BROKEN** | P0: Seed account conflicts and UI upload handling |
| Manage User | ADMIN | **MISSING** | P0: No UI exists for FR-ADM-01 |
| Create & Submit Class | TEACHER | **COMPLETE** | None |
| Class Approval | ADMIN | **COMPLETE** | None |
| Seat Reservation & Payment | STUDENT | **COMPLETE** | None |
| Live Classroom | TEACHER/STUDENT | **COMPLETE** | None |
| Campaign Lifecycle | ADMIN/SPONSOR | **COMPLETE** | None |
| Scholarship Application | STUDENT/ADMIN | **PARTIAL/BROKEN** | Proof documents cannot be opened by Admin |

---

## 42. Should-Have Completion Matrix

| Requirement | Actor | Status | Impact / Blocker |
|---|---|---|---|
| Manage Profile | ALL | **COMPLETE** | Sponsor profile UI missing |
| Enrolled Students Roster | TEACHER | **MISSING** | P1: Backend ready, FE missing UI |
| Real Admin Dashboard | ADMIN | **BROKEN** | P1: FE using static mock data |
| Real Teacher Dashboard | TEACHER | **BROKEN** | P1: FE using static mock data |
| Monitor Session | ADMIN | **MISSING** | P2: Backend lacks global API |
| PlatformSetting | ADMIN | **MISSING** | P2: Backend lacks setting model/API |
| Teacher Transaction Ledger | TEACHER | **MISSING** | P2: Backend lacks teacher transaction API |

---

## 43. Previous Phase Status Corrections

| Historical Phase | Prior Reported Status | True Verified Status | Correction Rationale |
|---|---|---|---|
| **Phase 01 (Auth)** | PASS | PASS | JWT auth, refresh tokens, role guards fully functional |
| **Phase 03 (Catalog)** | PASS | PASS | Categories, subjects, courses, proposals functional |
| **Phase 04 (Classes)** | PASS | PARTIAL | Class creation works, but Teacher Enrolled Students view was omitted |
| **Phase 05 (Sessions)** | PASS | PASS | Session creation, lifecycle, and attendance work |
| **Phase 07 (Finance)** | PASS | PASS | Payment sandbox, admin payments, and transactions functional |
| **Phase 08 (Campaigns)** | PASS | PASS | Campaign and sponsor contribution flows functional |
| **Phase 09 (Scholarships)**| PASS | PARTIAL | Awarding works, but Admin review document link is broken |
| **Phase 10 (LiveKit)** | PASS | PASS | LiveKit joining and host token controls functional |
| **Phase 11 (Communication)**| PASS | PASS | Reports, messages, notifications, reviews functional |
| **Phase 12 (Readiness)** | READY | **NOT READY** | Overstated completeness: Admin User Management is absent, Admin/Teacher dashboards are 100% mock data, and verification document flows have active defects |

---

## 44. P0 Issues

1. **MISSING-FE-01: Complete Absence of Admin User Management (`FR-ADM-01`)**:
   - Backend has `/admin/users`, `/admin/users/:id`, `/admin/users/:id/status`.
   - Frontend has no route, no page, and no menu item. Admin cannot manage or block platform users.
2. **BUG-T01: Teacher Verification Upload Runtime Failure (`FR-TEA-02`)**:
   - Seed accounts fail with HTTP 409 Conflict.
   - Frontend Antd Dragger accumulates files and corrupts side mapping.
   - Admin side cannot preview uploaded PDF documents (`BUG-A01`).

---

## 45. P1 Issues

1. **BUG-A03: Admin Dashboard Driven by Static Mock Data (`FR-ADM-21`)**:
   - Frontend `AdminHomePage.tsx` completely ignores real `GET /api/admin/dashboard` API and displays hardcoded numbers.
2. **BUG-T03: Teacher Dashboard Driven by Static Mock Data**:
   - Frontend `TeacherHomePage.tsx` completely ignores real class and earnings queries and displays hardcoded mock data.
3. **BUG-A02: Admin Scholarship Document Review Link Broken (`FR-ADM-16`)**:
   - Property name mismatch (`file.signedUrl` vs `file.url`) permanently disables document viewing buttons.
4. **MISSING-FE-02: Teacher Class Student / Enrollment Roster (`FR-TEA-13`, `FR-TEA-14`)**:
   - Frontend class detail page lacks a Student roster tab, leaving `GET /teacher/classes/:id/students` unused.

---

## 46. P2 Issues

1. **MISSING-BE-01: Admin Global Session Monitoring (`FR-ADM-08`)**:
   - Backend lacks global `/api/admin/sessions` endpoint.
2. **MISSING-BE-02: PlatformSetting Storage and API (`FR-ADM-22`)**:
   - Backend lacks `PlatformSetting` model and endpoints.
3. **MISSING-BE-03: Teacher Transaction Ledger Endpoint (`FR-TEA-18`)**:
   - Backend lacks teacher-specific transaction history route.
4. **MISSING-FE-03: Sponsor Profile Management Page (`FR-SPO-02`)**:
   - Sponsor portal lacks a dedicated profile page.

---

## 47. P3 Issues

1. **MIME Type Guidance on Avatar Uploads**: UI should explicitly communicate supported formats (JPEG, PNG, WebP) and 5MB size limit.
2. **Audit Log Standalone Query**: Backend only embeds 10 audit logs in dashboard; lacks a dedicated paginated endpoint.

---

## 48. Recommended Supplemental Phases

To bring the platform to true 100% completion based strictly on actual evidence, the following supplemental phases are recommended:

### SUPPLEMENT A: Verification & Document Pipeline Hardening
- **Scope**: Fix Teacher Verification upload state handling (`BUG-T01`), PDF thumbnail preview in Admin Verification (`BUG-A01`), and Scholarship proof document link (`BUG-A02`).
- **Endpoints Available**: `/uploads/private`, `/teacher/verification`, `/admin/teacher-verifications/:id`, `/admin/scholarship-applications/:id`.
- **Frontend Work**: Add PDF viewer/embed in `TeacherVerificationDetailPage`, fix `file.url` reference in `ScholarshipApplicationReviewPage`, prevent duplicate file accumulation in `TeacherProfilePage`.
- **Acceptance Criteria**: Admin can view real PDFs; fresh teachers can submit without errors; existing verified teachers see clear status.

### SUPPLEMENT B: Admin User Management Implementation
- **Scope**: Implement `FR-ADM-01 Manage User` in Admin Portal.
- **Endpoints Available**: `GET /api/admin/users`, `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id/status`.
- **Frontend Work**: Create `AdminUsersPage.tsx`, user detail drawer/modal, status update modal (Suspend/Ban with reason), register route `/admin/users` and add menu item in `AdminLayout.tsx`.
- **Acceptance Criteria**: Admin can search, filter by role/status, view user profile with activity stats, and suspend/ban accounts.

### SUPPLEMENT C: Teacher Student & Enrollment Roster
- **Scope**: Implement `FR-TEA-13 View Enrollment` and `FR-TEA-14 Manage Students`.
- **Endpoints Available**: `GET /api/teacher/classes/:id/students`.
- **Frontend Work**: Add "Học viên" tab in `TeacherClassDetailPage.tsx`, displaying student table with avatar, name, email, enrollment status, payment source, enrolled date, and direct "Nhắn tin" action.
- **Acceptance Criteria**: Teacher can view all enrolled students per class and initiate messaging.

### SUPPLEMENT D: Real Dashboard Integration (Admin + Teacher)
- **Scope**: Eliminate mock dashboard data (`BUG-A03`, `BUG-T03`).
- **Endpoints Available**: `GET /api/admin/dashboard`, `GET /teacher/classes`, `GET /teacher/earnings`.
- **Frontend Work**: Connect `AdminHomePage.tsx` to `adminService.getDashboard()`; connect `TeacherHomePage.tsx` to class/earning queries; purge `mockAdminDashboard.ts` and `mockTeacherDashboard.ts`.
- **Acceptance Criteria**: Both dashboards display live metrics matching MongoDB database state.

### SUPPLEMENT E: Cross-Role Cleanup (Sponsor Profile + Teacher Discovery)
- **Scope**: Implement `FR-SPO-02 Manage Profile` and public teacher search (`FR-STU-06`, `FR-STU-07`).
- **Endpoints Available**: `/me/profile`, `/me/avatar`, `/teachers`, `/teachers/:id`.
- **Frontend Work**: Create `SponsorProfilePage.tsx` and public `/teachers` directory page.
- **Acceptance Criteria**: Sponsor can edit representative/org profile; students can search teachers directly.

---

## 49. Exact Priority Order

1. **Priority 1**: **SUPPLEMENT A** (Verification & Document Pipeline Hardening) — Fixes broken P0/P1 verification and document inspection flows.
2. **Priority 2**: **SUPPLEMENT B** (Admin User Management) — Fulfills mandatory core requirement `FR-ADM-01`.
3. **Priority 3**: **SUPPLEMENT D** (Real Dashboard Integration) — Purges fake mock data and connects live system aggregates.
4. **Priority 4**: **SUPPLEMENT C** (Teacher Student & Enrollment Roster) — Completes core teaching workspace (`FR-TEA-13`, `FR-TEA-14`).
5. **Priority 5**: **SUPPLEMENT E** (Cross-Role Profile & Teacher Discovery) — Final polish for Sponsor and Student discovery.

---

## 50. Final Conclusion

### FINAL STATUS:
**PORTALS PARTIALLY COMPLETE — FE + BE GAPS**

The platform has established a robust, production-grade foundation with 124 working Backend routes and well-implemented transactional workflows for classes, live classrooms, sandbox payments, campaigns, and scholarship grants. 

However, prior claims of 100% release readiness were premature due to:
1. **Critical Frontend Gaps**: Complete absence of Admin User Management (`FR-ADM-01`), absence of Teacher Enrolled Students view (`FR-TEA-13`/`14`), and both Admin and Teacher dashboards running on static mock files.
2. **Broken Document Inspection**: Admin review pages failing to render uploaded PDF verification documents and having disabled scholarship proof download buttons.
3. **Backend Spec Gaps**: Absence of Admin Session Monitoring (`FR-ADM-08`), Platform Settings API (`FR-ADM-22`), and Teacher Transactions API (`FR-TEA-18`).

Following the completion roadmap outlined in Supplements A through E will resolve all discovered defects and bring Edunity to true production completion.
