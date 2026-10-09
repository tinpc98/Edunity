# Backend Actual API Contract

This document summarizes the actual backend API contract based on the existing Express routes and Mongoose models.

**Base URL**: `http://localhost:3000/api`
**Global Response Format**:
```json
{
  "success": true,
  "data": { ... },
  "message": "...",
  "error": "..."
}
```

## 1. Auth (`/api/auth`)
- `POST /register`: Registers user.
- `POST /login`: Logs user in, returns tokens.
- `POST /refresh`: Refresh access token.
- `POST /logout`: Logout user.
- `GET /me`: Get current user.

## 2. Account & Profile (`/api/me`, `/api/teacher`, `/api/admin`)
- `GET /me/profile`, `PATCH /me/profile`
- `POST /me/avatar`, `POST /me/password`
- `POST /teacher/verification` (Teacher submits docs)
- `GET /admin/teacher-verifications` (Admin approval flow)

## 3. Catalog & Courses (`/api/catalog`, `/api/classes`, `/api/courses`)
- `GET /catalog/categories`, `GET /catalog/filters`
- `GET /classes`, `GET /classes/:id`, `GET /classes/:id/sessions`
- `GET /teachers`, `GET /teachers/:id`
- `GET /courses`, `GET /courses/:id`
- Admin routes: `POST /admin/categories`, `POST /admin/courses`, etc.
- Teacher routes: `POST /teacher/course-proposals`

## 4. Enrollment & Classes (`/api/classes/:classId/enrollments`, `/api/enrollments/:id`)
- `GET /classes/:classId/availability`
- `GET /me/enrollments`
- `GET /enrollments/:id`
- `POST /classes/:classId/enrollments`
- `POST /enrollments/:id/cancel`

## 5. Payments (`/api/payments`)
- `POST /enrollments/:id/payments`: Sandbox payment initiation.
- `GET /enrollments/:id/payments`: History.
- `POST /payments/sandbox/webhook`
- `POST /payments/webhook`

## 6. Teaching & Sessions (`/api/teacher/classes`, `/api/sessions`)
- `GET /teacher/classes`
- `POST /teacher/classes`
- `POST /teacher/classes/:classId/sessions`
- `POST /sessions/:id/join` (LiveKit)

## 7. Scholarships & Campaigns (`/api/campaigns`, `/api/admin/scholarship-applications`)
- `GET /campaigns`
- `POST /campaigns/:id/contributions` (Sponsor)
- `POST /campaigns/:id/applications` (Student)
- Admin flows for applications (`/approve`, `/reject`)

## 8. Community & Communication (`/api/conversations`, `/api/reports`)
- `GET /conversations`, `POST /conversations/:id/messages`
- `POST /reports`
- `GET /me/notifications`

*Note: All endpoints expect `Authorization: Bearer <token>` for protected routes.*
