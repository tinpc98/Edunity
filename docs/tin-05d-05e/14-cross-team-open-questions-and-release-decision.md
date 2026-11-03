# 14 — Cross-Team Open Questions and Release Decision (TIN-05D + TIN-05E)

## 1. Unresolved Business, Legal & Financial Questions (Safe Review Workflow Applied)
In accordance with mission constraints, no penalty amounts, reputation point numbers, or unapproved gateway refund rules were invented. Instead, safe Admin/Payment review workflows (`TeacherDisciplineCase` with `autoExecutionBlocked: true` and `SessionRefundReview` with `status: "NEEDS_FINANCIAL_REVIEW"`) were implemented for the following cross-team policy items:

1. **Exact Teacher Reputation Score Formula (`TeacherDisciplineCase`):**
   - *Question for Product/Admin:* What is the initial reputation score scale (e.g., 100 points) and how many points should be deducted per confirmed `3 YELLOW` or `1 RED` violation?
   - *Current Safe Handling:* Stored as `OPEN_ADMIN_REVIEW` in `TeacherDisciplineCase` with `autoExecutionBlocked: true`.
2. **Exact Teacher Remuneration Deduction Percentage (`Châu — TeacherEarning / Payout`):**
   - *Question for Châu & Finance:* What percentage or fixed amount of `TeacherEarning` is deducted when `3 YELLOW` or `1 RED` is confirmed, and how is a single cancelled session valued inside a multi-session `Class` enrollment?
   - *Current Safe Handling:* `SessionRefundReview` sets `earningReconciliationStatus = "HOLD_RECOMMENDED"` without mutating `TeacherEarning` or `Payout`.
3. **Single-Session vs Course-Level Refund Calculation (`Châu — Payment / Enrollment`):**
   - *Question for Châu & Product:* Enrollment payments in Edunity are currently made per `Class` (`Enrollment.paidAmount`), not per individual `Session`. When a single session is cancelled (`TEACHER_NO_SHOW`) or a student cannot attend a makeup session (`RESCHEDULE_DECLINED_BY_STUDENT`), should the student receive a pro-rata partial refund (`paidAmount / totalSessions`), a voucher/credit, or a full refund?
   - *Current Safe Handling:* `SessionRefundReview` records `paidAmountSnapshot` and `scholarshipAppliedSnapshot` with `status = "NEEDS_FINANCIAL_REVIEW"` so Admin & Payment Team can review and execute via Châu's approved payment flow.
4. **Contract Termination Legal Workflow (`3 Confirmed NO_SHOW`):**
   - *Question for Legal/Admin:* Does contract termination suspend the teacher's `User.status`, reassign active classes to another teacher, or freeze pending payouts?
   - *Current Safe Handling:* Opens `TeacherDisciplineCase` with `triggerRule = "THREE_NO_SHOW_VIOLATIONS"`, `recommendedAction = "CONTRACT_TERMINATION_REVIEW"`, `autoExecutionBlocked = true`.

## 2. Final Release Decision
- **READY FOR MERGE AFTER CHAU/BAO REVIEW**

