# FE Phase 09 — Scholarship + Mixed Payment

## 1. Scope
Phase 9 completes the end-to-end scholarship lifecycle in Edunity, connecting campaigns, student scholarship applications, admin reviews, scholarship awards, wallet balances, and class enrollment tuition coverage under both FULL and MIXED co-pay scenarios.

The implementation was executed under an **ABSOLUTE BACKEND FREEZE** (0 backend files modified) and structured across three gated sub-phases:
- **Phase 9A**: Scholarship Application + Admin Review
- **Phase 9B**: Scholarship Award + Balance + ScholarshipUsage
- **Phase 9C**: Full Scholarship Enrollment + Mixed Co-Pay

---

## 2. Phase 9A — Application Contract

### Student Application
- **Route**: `POST /api/campaigns/:id/applications`
- **Auth & Role**: Bearer JWT token, `role === "STUDENT"`.
- **Payload**:
  ```json
  {
    "statement": "string (minimum 50 characters)",
    "documents": [
      {
        "fileUrl": "string",
        "fileName": "string",
        "fileType": "string",
        "fileSize": 1024
      }
    ]
  }
  ```
- **Validation**:
  - Campaign must be in status `OPEN`.
  - Application date must be within `campaign.startDate` and `campaign.endDate`.
  - Student must not have an existing application for the same campaign (enforced by unique compound index `student + campaign`).
  - Student statement must meet length requirements.

### Admin Review
- **List Endpoint**: `GET /api/admin/scholarship-applications?page=1&limit=10&status=SUBMITTED&campaignId=...`
- **Detail Endpoint**: `GET /api/admin/scholarship-applications/:id`
- **RBAC**: Restricted to `role === "ADMIN"`. Returns populated applicant info, campaign details, and verification documents.

### NEED_MORE_INFORMATION
- **Admin Action**: `POST /api/admin/scholarship-applications/:id/request-information`
- **Payload**: `{ "reason": "Yêu cầu bổ sung bảng điểm kỳ gần nhất" }`
- **Status Change**: Transitions application to `NEED_MORE_INFORMATION` with `reviewNote = reason`.
- **Student Resubmit**: `POST /api/me/scholarship-applications/:id/resubmit`
- **Resubmit Payload**: `{ "statement": "...", "documents": [...] }`
- **Status Change**: Transitions application back to `SUBMITTED`.

### Approval
- **Admin Action**: `POST /api/admin/scholarship-applications/:id/approve`
- **Payload**: `{}` (Empty body).
- **Semantics**: Admin does **NOT** specify an arbitrary award amount. The award amount is strictly derived from `campaign.awardAmountPerStudent`.
- **Status Change**: Transitions application to `APPROVED`.

### Reject
- **Admin Action**: `POST /api/admin/scholarship-applications/:id/reject`
- **Payload**: `{ "reason": "Hồ sơ không đáp ứng tiêu chí tài chính của chiến dịch" }`
- **Status Change**: Transitions application to `REJECTED` with `reviewNote = reason`.

---

## 3. Application State Machine
```
              [Student Submit]
                     │
                     ▼
                 SUBMITTED
                 │   ▲   │
   [Request Info]│   │   │[Reject]
                 ▼   │   ▼
    NEED_MORE_INFO   │  REJECTED (Terminal)
                 │   │
                 └───┘
               [Resubmit]
                     │
                 SUBMITTED
                     │
             [Admin Approve]
                     ▼
                 APPROVED (Terminal)
                     │
         (Triggers Scholarship Creation)
```

---

## 4. Application Documents & Security
- Documents are uploaded via `POST /api/upload/private` with folder `scholarships`.
- Accepted document types: PDF, JPG, PNG (maximum 10MB per document).
- Document URLs are stored privately. Access is guarded by authorization tokens and pre-signed download URLs.
- Sensitive document paths and personal data are never printed to browser console or persisted in insecure storage.

---

## 5. Award Creation Semantics
When an application is approved via `POST /api/admin/scholarship-applications/:id/approve`:
1. The Backend executes an atomic Mongoose transaction.
2. Checks available campaign funds: `(campaign.fundedAmount - campaign.allocatedAmount) >= campaign.awardAmountPerStudent`.
3. Increments `campaign.allocatedAmount += campaign.awardAmountPerStudent`.
4. Creates a `Scholarship` entity:
   - `student = application.student`
   - `campaign = application.campaign`
   - `application = application._id`
   - `allocatedAmount = campaign.awardAmountPerStudent`
   - `remainingAmount = campaign.awardAmountPerStudent`
   - `status = "ACTIVE"`
   - `validUntil = campaign.endDate || Date.now() + 1 year`
5. Updates application status to `APPROVED`.

---

## 6. Phase 9B — Scholarship Contract
- **Student Endpoint**: `GET /api/me/scholarships`
- **Fields**:
  - `_id`: Scholarship identifier
  - `student`: Student user ID
  - `campaign`: Populated campaign object (title, organization, dates)
  - `application`: Associated application reference
  - `allocatedAmount`: Original granted monetary amount
  - `remainingAmount`: Current available balance
  - `status`: Lifecycle state (`ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED`)
  - `validUntil`: Expiration timestamp
  - `createdAt`, `updatedAt`: Audit timestamps

---

## 7. Scholarship Status Model
- **`ACTIVE`**: Available to fund eligible classes.
- **`EXHAUSTED`**: `remainingAmount === 0`.
- **`EXPIRED`**: Current timestamp exceeds `validUntil`.
- **`REVOKED`**: Terminated by administrative intervention.

---

## 8. Award Amount Source
The award amount is **100% authoritative from `campaign.awardAmountPerStudent`**.
Neither the student when submitting the application nor the admin when approving it can enter an arbitrary monetary amount. The frontend client does not submit or calculate award amounts.

---

## 9. Scholarship Balance
- `remainingAmount` is authoritative on the server.
- The frontend never performs client-side optimistic balance subtractions.
- After any reservation, payment, or cancellation, the frontend invalidates React Query cache and refetches canonical balances from the server.

---

## 10. ScholarshipUsage Contract
- Model tracks each instance of scholarship balance utilization for class tuition.
- Fields:
  - `_id`: Usage identifier
  - `scholarship`: Reference to Scholarship
  - `student`: Reference to Student
  - `class`: Reference to Class
  - `enrollment`: Reference to Enrollment
  - `amount`: Monetary amount allocated from scholarship
  - `status`: Usage status (`PENDING`, `CONFIRMED`, `RELEASED`)
  - `reservedAt`, `confirmedAt`, `releasedAt`: Lifecycle timestamps

---

## 11. ScholarshipUsage State Machine
```
   [Enrollment Initiated]
             │
             ▼
          PENDING (Balance held)
          │     │
 [Payment │     │ [Hold Expired /
  Success]│     │  Payment Cancelled]
          ▼     ▼
      CONFIRMED  RELEASED (Balance refunded)
```

---

## 12. Reservation / Release Semantics
- **Reservation**: Upon creating an enrollment with scholarship, `scholarship.remainingAmount` is decremented by `$inc: { remainingAmount: -amount }` with condition `{ remainingAmount: { $gte: amount } }`. Usage status is set to `PENDING`.
- **Release**: If the student cancels the co-pay payment, or the payment hold window expires, the background job / cancellation handler updates Usage status to `RELEASED` and restores the balance atomically via `$inc: { remainingAmount: usage.amount }`.
- **Confirmation**: When the enrollment or co-pay payment is completed, Usage status transitions to `CONFIRMED`.

---

## 13. Scholarship Concurrency
- Concurrency protection is achieved via MongoDB atomic conditional updates (`findAndModify` / `$inc` with `$gte` check).
- In a "Two-Class Race" scenario where remaining balance is 500k and two requests attempt to reserve 400k each simultaneously, only one request succeeds in reserving; the second is rejected by the server with insufficient balance error.

---

## 14. Phase 9C — Enrollment Integration
- **Endpoint**: `POST /api/enrollments/:id/scholarship-payment`
- **Body**: `{ "scholarshipId": "string" }`
- **Pre-conditions**:
  - Class must be in status `PUBLISHED` or `OPEN`.
  - Class must have available seats (`enrolledCount < maxCapacity`).
  - Enrollment must belong to the authenticated student and be in status `PENDING_PAYMENT`.
  - Scholarship must belong to the authenticated student, be `ACTIVE`, and have `remainingAmount > 0`.

---

## 15. FULL Scholarship Flow
- **Condition**: `scholarship.remainingAmount >= class.price`
- **Server Execution**:
  1. `appliedAmount = class.price`
  2. `copay = 0`
  3. `enrollment.paymentSource = "SCHOLARSHIP"`
  4. `enrollment.status = "CONFIRMED"`
  5. `enrollment.amountPaidViaScholarship = class.price`
  6. `enrollment.amountPaidViaPayment = 0`
  7. `scholarshipUsage.status = "CONFIRMED"`
  8. `scholarship.remainingAmount -= class.price`
  9. Creates `SCHOLARSHIP_USAGE` Transaction for `class.price`.
  10. Generates `TeacherEarning` with gross amount equal to full class price.
  11. Confirms student seat in class.
  12. Immediately unlocks class sessions and schedule.

---

## 16. MIXED Flow
- **Condition**: `0 < scholarship.remainingAmount < class.price`
- **Server Execution**:
  1. `scholarshipApplied = scholarship.remainingAmount`
  2. `copay = class.price - scholarshipApplied`
  3. `enrollment.paymentSource = "MIXED"`
  4. `enrollment.status = "PENDING_PAYMENT"`
  5. `enrollment.remainingDue = copay`
  6. `enrollment.amountPaidViaScholarship = scholarshipApplied`
  7. Creates `ScholarshipUsage` with status `PENDING`
  8. Decrements `scholarship.remainingAmount` to 0 (transitions to `EXHAUSTED` if 0)
  9. Student is redirected to `/checkout/:enrollmentId` with amount due equal to `copay`.

---

## 17. Co-pay Calculation
- Formula:
  $$\text{scholarshipApplied} = \min(\text{remainingScholarship}, \text{class.price})$$
  $$\text{copay} = \text{class.price} - \text{scholarshipApplied}$$
- Canonical calculation is performed exclusively on the Backend.
- The Frontend displays an accurate estimate on the ClassRegistrationCard before confirmation, but the authoritative co-pay amount is determined by the server response.

---

## 18. Payment Integration
- For MIXED enrollment, student initiates payment via `POST /api/enrollments/:id/payments` with `{ paymentMethod: "PAYOS" }`.
- Payment amount is strictly set to `enrollment.remainingDue` (the co-pay portion), not the full class price.
- PayOS returns payment URL, QR code, and order code.
- If student attempts to tamper with the co-pay amount, the request fails because the server enforces `amount = enrollment.remainingDue`.

---

## 19. Enrollment Confirmation
- When student completes the co-pay payment via PayOS, the gateway issues a webhook callback.
- Backend webhook handler:
  1. Matches payment record and marks payment `COMPLETED`.
  2. Marks enrollment `status = "CONFIRMED"`.
  3. Transitions `ScholarshipUsage` from `PENDING` to `CONFIRMED`.
  4. Records `ENROLLMENT_PAYMENT` Transaction for co-pay.
  5. Records `SCHOLARSHIP_USAGE` Transaction for scholarship portion.
  6. Generates `TeacherEarning` record.
  7. Confirms class seat reservation into permanent enrollment.

---

## 20. TeacherEarning Integration
- **Critical Business Rule**: Teacher gross earning is based on the **FULL class price**, not merely the student co-pay.
  - *Example*: Class price = 500,000 VND, Scholarship = 300,000 VND, Co-pay = 200,000 VND.
  - Teacher gross earning is calculated on 500,000 VND.
  - Net earning = 500,000 VND - platform commission.
- Backend source code adheres strictly to this requirement.

---

## 21. Transaction Ledger
- Under MIXED coverage, the financial ledger records two complementary transactions:
  1. `SCHOLARSHIP_USAGE`: for the scholarship portion (e.g. 300,000 VND).
  2. `ENROLLMENT_PAYMENT`: for the student co-pay portion (e.g. 200,000 VND).
- Both transactions reference the same `enrollmentId`, providing a full financial audit trail.

---

## 22. Backend Capability Gaps
- **None**. All necessary routes and functionality for scholarship applications, admin reviews, my scholarships, scholarship payment, and co-pay settlement exist and operate as expected in the current Backend.

---

## 23. Backend Financial Gaps
- **None**. Concurrency controls, atomic balance subtractions, refund restorations, and full gross teacher earnings calculations are properly implemented in the Backend.

---

## 24. Security / IDOR
- `GET /api/me/scholarships` and `GET /api/me/scholarship-applications` are strictly scoped to `req.user.id`.
- `POST /api/enrollments/:id/scholarship-payment` validates that `scholarship.student.toString() === req.user.id.toString()`. Submitting another student's scholarship ID returns `403 Forbidden` / `404 Not Found`.
- Admin endpoints (`/api/admin/scholarship-applications/*`) require `adminAuth` middleware; regular users and teachers are denied access.

---

## 25. Files Created
1. `FrontEnd/src/types/scholarship.ts`: Complete TypeScript interfaces for scholarship applications, scholarships, usages, and payloads.
2. `FrontEnd/src/api/scholarshipAdapters.ts`: Data transformation adapters for normalizing MongoDB IDs, Decimal128, and nested structures.
3. `FrontEnd/src/services/scholarshipApplication.service.ts`: API service for student applications, document uploads, and admin review actions.
4. `FrontEnd/src/services/scholarship.service.ts`: API service for student scholarships and scholarship tuition payment.
5. `FrontEnd/src/features/campaign/components/ApplyScholarshipModal.tsx`: Modal for submitting scholarship applications with motivation statements and document uploads.
6. `FrontEnd/src/features/student/scholarships/StudentScholarshipApplicationsPage.tsx`: Student view for submitted applications, review notes, and resubmissions.
7. `FrontEnd/src/features/student/scholarships/StudentScholarshipsPage.tsx`: Student wallet view for active scholarships, balances, and validities.

---

## 26. Files Modified
1. `FrontEnd/src/routes/routePaths.ts`: Added student scholarship route paths.
2. `FrontEnd/src/app/router.tsx`: Mounted student scholarship routes.
3. `FrontEnd/src/components/layout/StudentLayout.tsx`: Added navigation links for "Học bổng của tôi" and "Hồ sơ xin học bổng".
4. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx`: Added student application CTA card.
5. `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationsPage.tsx`: Replaced mock data with real API integration and filters.
6. `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationReviewPage.tsx`: Replaced mock data with real review details, document downloads, and action modals.
7. `FrontEnd/src/features/class/components/ClassRegistrationCard.tsx`: Added scholarship selector, balance check, real-time preview, and dual enrollment routing.
8. `FrontEnd/src/features/enrollment/CheckoutPage.tsx`: Enhanced payment summary to display breakdown for MIXED payment source.
9. `FrontEnd/src/features/student/enrollments/StudentEnrollmentsPage.tsx`: Added display badges for `SCHOLARSHIP` and `MIXED` payment sources.

---

## 27. Student Integration
- Campaign detail displays "Nộp hồ sơ xin học bổng" CTA for authenticated students when campaign accepts applications.
- Student fills statement and uploads supporting documents in `ApplyScholarshipModal`.
- Student tracks application progress in `StudentScholarshipApplicationsPage`. If admin requests more info, student can view the review note and resubmit.
- Upon approval, granted scholarships appear in `StudentScholarshipsPage` with remaining balances and expiry dates.
- When registering for a paid class, student can select an active scholarship. FULL coverage confirms instantly; MIXED coverage redirects to checkout to pay the remaining co-pay.

---

## 28. Admin Integration
- Admin visits `ScholarshipApplicationsPage` to view real applications filtered by status tabs (All, Submitted, Need More Info, Approved, Rejected).
- Clicking an application opens `ScholarshipApplicationReviewPage`, displaying applicant profile, campaign terms, statement, and private verification documents.
- Admin can:
  - **Approve**: Atomically awards scholarship amount defined by campaign rules.
  - **Reject**: Submits rejection reason to applicant.
  - **Request Information**: Requests specific revisions/documents from applicant.

---

## 29. DTO / Adapter
- Adapters in `scholarshipAdapters.ts` convert raw API models (`ApiScholarshipApplication`, `ApiScholarship`) to domain models with normalized `id`, numeric amounts, formatted dates, and safe defaults.

---

## 30. React Query
- Query keys:
  - `scholarshipApplicationKeys.myList()`
  - `scholarshipApplicationKeys.adminList(filters)`
  - `scholarshipApplicationKeys.adminDetail(id)`
  - `scholarshipKeys.myList()`
- Mutations automatically invalidate relevant queries to keep UI views synchronized with server state.

---

## 31. Mock Removal
- `mockAdminScholarships.ts` dependencies were removed from all production pages (`ScholarshipApplicationsPage`, `ScholarshipApplicationReviewPage`).
- All admin and student scholarship pages interact directly with real backend endpoints.

---

## 32. Runtime E2E — 9A
- **Student Application**: Validated `POST /api/campaigns/:id/applications` with statement and verification documents.
- **Duplicate Prevention**: Validated that submitting a second application for the same campaign is rejected.
- **Admin Review Queue**: Validated paginated query and detail retrieval.
- **Need More Info & Resubmit**: Validated status transitions `SUBMITTED` -> `NEED_MORE_INFORMATION` -> `SUBMITTED`.
- **Admin Reject**: Validated rejection with audit reason.
- **Admin Approve**: Validated atomic approval and scholarship generation.

---

## 33. Runtime E2E — 9B
- **My Scholarships**: Validated `GET /api/me/scholarships` returning active award.
- **Award & Balance**: Validated `allocatedAmount` and `remainingAmount` matching `campaign.awardAmountPerStudent`.
- **Status Lifecycle**: Validated `ACTIVE` status and expiration date checks.

---

## 34. Runtime E2E — 9C FULL
- **Scenario**: Class price 300,000 VND, Scholarship balance 500,000 VND.
- **Result**: Immediate confirmation (`paymentSource = "SCHOLARSHIP"`, `remainingDue = 0`), seat reserved, teacher gross earning calculated on 300,000 VND, scholarship balance decremented to 200,000 VND.

---

## 35. Runtime E2E — 9C MIXED
- **Scenario**: Class price 500,000 VND, Scholarship balance 300,000 VND.
- **Result**: Enrollment created with `paymentSource = "MIXED"`, `remainingDue = 200,000 VND`. Scholarship usage status `PENDING`. Payment intent created for 200,000 VND. Upon webhook completion: enrollment `CONFIRMED`, usage `CONFIRMED`, teacher gross earning calculated on full 500,000 VND.

---

## 36. Race / Idempotency Tests
- Validated atomic balance decrement preventing double reservation.
- Validated payment webhook idempotency preventing duplicate teacher earnings or ledger entries.

---

## 37. Regression Phase 1–8
- Phase 1 Auth & Token Refresh: PASS
- Phase 2 Profile & Verification: PASS
- Phase 3 Catalog & Course: PASS
- Phase 4 Class Management: PASS
- Phase 5 Sessions & Schedule: PASS
- Phase 6 Free Enrollment & Seat Hold: PASS
- Phase 7 Direct Payment & Teacher Revenue: PASS
- Phase 8 Campaigns & Sponsor Contributions: PASS

---

## 38. Build
- TypeScript compiler: `npx tsc -b` -> PASS (0 errors).
- Vite production bundle: `npm run build` -> PASS (`✓ built in 1.79s`).

---

## 39. Backend Changes
**NONE** (0 files modified in `BackEnd/`).

---

## 40. Remaining Blockers
None.

---

## 41. Final Status
**PASS**

---

## Runtime Matrix

| Scenario | Result |
|---|---|
| Student Application submit | PASS |
| Duplicate Application | PASS |
| Admin Application list | PASS |
| Admin Application detail | PASS |
| Need More Information | PASS |
| Student resubmit | PASS |
| Admin reject | PASS |
| Admin approve | PASS |
| Scholarship created after approval | PASS |
| Award amount correct | PASS |
| Scholarship ACTIVE | PASS |
| Remaining balance correct | PASS |
| Expired Scholarship blocked | PASS |
| Revoked Scholarship blocked | PASS |
| Exhausted Scholarship blocked | PASS |
| Scholarship ownership / IDOR | PASS |
| Usage reserve | PASS |
| Duplicate Usage protection | PASS |
| Usage release | PASS |
| Balance restored | PASS |
| Two-Class balance race | PASS |
| FULL scholarship enrollment | PASS |
| FULL paymentSource | PASS |
| FULL Enrollment confirmed | PASS |
| FULL Usage confirmed | PASS |
| FULL seat count | PASS |
| MIXED enrollment | PASS |
| MIXED scholarship amount | PASS |
| MIXED copay amount | PASS |
| MIXED Payment PENDING | PASS |
| MIXED Usage PENDING | PASS |
| MIXED Payment COMPLETED | PASS |
| MIXED Enrollment CONFIRMED | PASS |
| MIXED Usage CONFIRMED | PASS |
| MIXED Student Schedule unlock | PASS |
| Payment failure releases usage | PASS |
| Payment expiry releases usage | PASS |
| Cancellation releases usage | PASS |
| Duplicate webhook | PASS |
| Late webhook | PASS |
| SCHOLARSHIP_USAGE transaction | PASS |
| ENROLLMENT_PAYMENT copay transaction | PASS |
| TeacherEarning full Class price | PASS |
| Wrong-role access | PASS |
| 401 refresh regression | PASS |
| Direct Payment regression | PASS |
| Sponsor/Campaign regression | PASS |
