# Backend Enums and State Machine Map

## 1. Enums Directory

| Field | Model | Backend Actual Value | Note |
|---|---|---|---|
| **User Role** | User | `STUDENT`, `TEACHER`, `SPONSOR`, `ADMIN` |
| **User Status** | User | `ACTIVE`, `PENDING`, `SUSPENDED`, `BANNED` |
| **Sponsor Type** | User | `INDIVIDUAL`, `ORGANIZATION` |
| **Teacher Verification** | User | `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED` |
| **Category/Subject Status** | Category/Subject | `ACTIVE`, `INACTIVE` |
| **Course Level** | Course | Custom array in `constants.js` |
| **Grade Level** | Course/Class | Custom array in `constants.js` |
| **Class Type** | Class | `FREE`, `PAID` |
| **Class Status** | Class | `DRAFT`, `PENDING_APPROVAL`, `OPEN`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| **Course Proposal Status** | CourseProposal | `PENDING_REVIEW`, `NEED_CHANGES`, `APPROVED`, `REJECTED` |
| **Session Type** | Session | `LESSON`, `MATERIAL`, `ASSIGNMENT` |
| **Session State** | Session | `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| **Session Video Status** | Session | `PROCESSING`, `AVAILABLE`, `FAILED` |
| **Attendance Status** | SessionAttendance | `PRESENT`, `ABSENT`, `LATE` |
| **Document Type** | VerificationDocument | `IDENTITY`, `QUALIFICATION`, `SCHOLARSHIP_PROOF` |
| **Document Side** | VerificationDocument | `FRONT`, `BACK`, `SINGLE` |
| **Document Status** | VerificationDocument | `PENDING`, `APPROVED`, `REJECTED` |

## 2. Financial Enums

| Field | Model | Backend Actual Value |
|---|---|---|
| **Enrollment Status** | Enrollment | `PENDING_PAYMENT`, `CONFIRMED`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED` |
| **Payment Source** | Enrollment | `FREE`, `DIRECT_PAYMENT`, `SCHOLARSHIP`, `MIXED` |
| **Payment Status** | Payment | `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED` |
| **Payout Status** | Payout | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REJECTED` |
| **Payout Method** | Payout | `BANK_TRANSFER` |
| **Scholarship Status** | Scholarship | `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED` |
| **Application Status** | ScholarshipApp | `SUBMITTED`, `NEED_MORE_INFORMATION`, `APPROVED`, `REJECTED` |
| **Campaign Status** | ScholarshipCampaign | `DRAFT`, `OPEN_FOR_FUNDING`, `CLOSED` |
| **Scholarship Usage** | ScholarshipUsage | `PENDING`, `CONFIRMED`, `RELEASED` |
| **Sponsor Contribution** | SponsorContribution | `PENDING`, `COMPLETED`, `FAILED` |
| **Teacher Earning** | TeacherEarning | `PENDING`, `AVAILABLE`, `PAID_OUT` |
| **Transaction Type** | Transaction | `ENROLLMENT_PAYMENT`, `SCHOLARSHIP_USAGE`, `SPONSOR_CONTRIBUTION`, `TEACHER_PAYOUT`, `REFUND` |
| **Transaction Status** | Transaction | `PENDING`, `COMPLETED`, `FAILED` |
| **Report Status** | Report | `OPEN`, `IN_REVIEW`, `RESOLVED`, `REJECTED` |

## 3. State Machines

### Enrollment State Machine
`PENDING_PAYMENT` -> `CONFIRMED` (upon payment success)
`PENDING_PAYMENT` -> `EXPIRED` (cron job cleanup)
`CONFIRMED` -> `COMPLETED` (class ends)
`CONFIRMED` -> `CANCELLED` (user cancels)

### Session State Machine
`SCHEDULED` -> `IN_PROGRESS` (teacher joins LiveKit)
`IN_PROGRESS` -> `COMPLETED` (teacher ends session)
`SCHEDULED` -> `CANCELLED`

### Scholarship Application State Machine
`SUBMITTED` -> `APPROVED` | `REJECTED` | `NEED_MORE_INFORMATION`
`NEED_MORE_INFORMATION` -> `SUBMITTED` (user resubmits)
