# EDUNITY Scholarship Sponsorship Program Implementation Plan

Implementation notes: Work through these tasks in order, preserving existing workspace changes. Do not add or run tests unless the user explicitly asks for verification.

**Goal:** Implement the approved end-to-end EDUNITY scholarship sponsorship lifecycle, from verified contributions through application, paper intake, review, awards, learning access, and public closeout.

**Architecture:** Extend the existing Mongoose/Express scholarship, contribution, paper-receipt, audit, and award flows. Add explicit records for funding reconciliation and student paper dispatch where an existing record represents a different actor/action. Keep student application, paper receipt, eligibility, verification, decision, and benefit as separate workflow facts. Extend the React/TypeScript campaign, admin, sponsor, and student surfaces to use those server-enforced rules.

**Tech Stack:** Node.js, Express 5, Mongoose 9, MongoDB transactions, React, TypeScript, Ant Design, existing private document storage and payment/refund integration.

**Spec:** `docs/superpowers/specs/2026-11-25-scholarship-sponsorship-program-design.md`

## Global Constraints

- Preserve all existing user changes in the scholarship-related files; do not reset or overwrite them.
- A student is limited to one application per campaign. Keep old applications readable and preserve encrypted CCCD handling.
- Only received, verified, allocatable campaign funding can create official slots. Preserve initial targets and official snapshots; record later corrections as audited adjustments.
- Each award starts with the configured scholarship credit amount (2,000,000 VND in the example), usable toward all EDUNITY courses with no expiry. Course payments deduct from the remaining balance; unused balance remains, and the student pays any amount above it.
- Paper proof of dispatch must be on or before the online cutoff; physical paper delivery is accepted for a campaign-configured 3–5 business-day grace period, followed by admin reconciliation.
- A scholarship grants all EDUNITY courses and does not expire. It is non-cash, non-transferable, and cannot be withdrawn.
- Every required field and invariant is checked server-side, including draft submission and resubmission; campaign checklist configuration cannot bypass required applicant/guardian identity fields.
- Ranking is advisory. Do not apply the illustrative score table as policy, auto-reject by score, or auto-issue an award.
- Use Vietnam time (UTC+7) for campaign cutoffs. Keep private files private and keep consent to public disclosure independent from eligibility.
- Do not add or run tests as part of this work unless the user explicitly asks for verification.
- Do not introduce a new dependency without confirming that the current stack cannot meet a required behavior.

## Review Focus

- A contribution arrives late, is duplicated, refunded, restricted, or corrected after official slot close; it must not silently change the original snapshot or over-issue awards.
- A student submits through a legacy campaign without checklist settings, or resubmits an old dossier; required fields and close times must still be enforced.
- A student declares paper dispatch, but has no timely tracking evidence, the paper arrives after the grace period, or admin has not reconciled it; these conditions must remain distinct.
- A student has overlapping hardship and region categories, or no official score weights exist; ranking must be explainable and must not make the final decision.
- A lifetime all-course balance is used for a class whose tuition exceeds the remaining scholarship amount; only the remaining scholarship balance is applied and the existing mixed-payment flow collects the difference from the student.

---

### Task 1: Campaign financial policy, immutable slot snapshots, and funding reconciliation

**Files:**
- Modify: `BackEnd/src/models/ScholarshipCampaign.js`
- Create: `BackEnd/src/models/ScholarshipFundingReconciliation.js`
- Modify: `BackEnd/src/models/index.js`
- Modify: `BackEnd/src/services/campaignService.js`
- Modify: `BackEnd/src/services/contributionService.js`
- Modify: `BackEnd/src/services/refundService.js`
- Modify: campaign admin controller/routes discovered from the current route registration
- Modify: `FrontEnd/src/types/campaign.ts`
- Modify: `FrontEnd/src/api/campaignAdapters.ts`
- Modify: `FrontEnd/src/services/campaign.service.ts`
- Modify: `FrontEnd/src/features/admin/campaigns/CreateCampaignPage.tsx`
- Modify: `FrontEnd/src/features/admin/campaigns/CampaignDetailPage.tsx`

**Interfaces:**
- Add campaign policy fields for immutable initial targets/reference value, expansion permission, paper grace window, application/funding cutoff timestamps, and official funding snapshot reference.
- Add an admin action to reconcile/close campaign fundraising. It accepts reconciled contribution IDs or documented adjustment entries, reason, and evidence metadata; returns the immutable official eligible amount, official slot count, remainder, actor, and close time.
- Projected slots are `floor(current eligible allocatable funding / per-student scholarship credit amount)`, optionally capped by published policy. For example, 50,000,000 VND at 2,000,000 VND per award yields 25 slots. Official slots are snapshotted at close and can change only through a separately audited adjustment.

- [ ] Preserve the original target and expected slot target separately from live projected and official values.
- [ ] Add reconciliation records and enforce idempotency and campaign-level concurrency in the close/update operations.
- [ ] Count only verified eligible contributions; exclude pending/failed/duplicate and reflect partial/full refunds and restricted funds.
- [ ] Record over-target slot growth only when campaign expansion is enabled; retain remainder as campaign surplus without silent transfer.
- [ ] Add admin views for received, pending, returned, allocatable amounts; projected/official/issued/remaining slots; and surplus.
- [ ] Keep the public campaign progress wording clear about projected versus officially reconciled counts.

### Task 2: Application contract, required data, and state dimensions

**Files:**
- Modify: `BackEnd/src/models/ScholarshipApplication.js`
- Modify: `BackEnd/src/models/constants.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/services/scholarshipDossierGateService.js`
- Modify: `BackEnd/src/services/auditService.js`
- Modify: `FrontEnd/src/types/scholarship.ts`
- Modify: `FrontEnd/src/api/scholarshipAdapters.ts`
- Modify: `FrontEnd/src/services/scholarshipApplication.service.ts`
- Modify: `FrontEnd/src/features/campaign/components/ApplyScholarshipModal.tsx`
- Modify: `FrontEnd/src/features/student/scholarships/StudentScholarshipApplicationsPage.tsx`

**Interfaces:**
- Keep the legacy `status` readable during migration and expose normalized `intakeStatus`, `eligibilityStatus`, `verificationStatus`, `decisionStatus`, and `benefitStatus` in API responses.
- Validate applicant name/phone/address/12-digit CCCD, guardian name/relationship/phone/address/occupation/12-digit CCCD, and all required school fields on create, submit, and resubmit.
- Store residence province and commune/ward separately from school province and commune/ward. Residence district is optional for legacy address compatibility.

- [ ] Reconcile the already-edited form code with the approved full-field requirements; do not reintroduce family circumstances or the safe-storage banner.
- [ ] Require a 10-digit phone without spaces and exactly 12 CCCD digits on both client and server.
- [ ] Make required validation unconditional for all campaign configurations and legacy resubmission paths.
- [ ] Extend hard/soft status transitions without conflating paper receipt, eligibility, verification, approval, and entitlement issuance.
- [ ] Lock student edits at the configured deadline; implement admin reopening with reason, actor, window, and audit record.
- [ ] Keep one application per student/campaign and surface CCCD-hash duplicate signals for authorized review without auto-rejection.

### Task 3: Per-type document storage and student paper-dispatch declaration

**Files:**
- Modify: `BackEnd/src/models/VerificationDocument.js`
- Modify: `BackEnd/src/models/ScholarshipApplication.js`
- Create: `BackEnd/src/models/ScholarshipPaperDispatch.js`
- Modify: `BackEnd/src/models/index.js`
- Modify: `BackEnd/src/controllers/fileController.js`
- Modify: `BackEnd/src/services/storageService.js` only if current signature validation cannot enforce scholarship-only PDFs
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/services/paperDossierService.js`
- Modify: `BackEnd/src/services/scholarshipDossierGateService.js`
- Modify: `FrontEnd/src/utils/fileValidation.ts`
- Modify: `FrontEnd/src/services/scholarshipApplication.service.ts`
- Modify: `FrontEnd/src/features/campaign/components/ApplyScholarshipModal.tsx`
- Modify: `FrontEnd/src/features/student/scholarships/StudentScholarshipApplicationsPage.tsx`

**Interfaces:**
- Keep one `VerificationDocument` per checklist category with private storage references and per-document status: `NOT_UPLOADED`, `UPLOADED`, `NEEDS_SUPPLEMENT`, `VERIFIED`.
- Add separate codes/categories for student CCCD, guardian CCCD, transcript, poverty/near-poverty certificate, and campaign-defined documents.
- Add a student dispatch record containing sent date, carrier, tracking number/proof, declaration timestamp, and history; it does not create or update a `PaperDossierReceipt`.

- [ ] Enforce PDF-only uploads for scholarship documents on the server while leaving unrelated private document types unchanged.
- [ ] Enforce campaign-configured byte and page limits; preserve the current 10 MB bound unless the campaign sets a lower bound. Use existing installed packages only; if reliable page counting requires a new dependency, pause for an explicit decision.
- [ ] Require student and guardian ID plus transcript categories; conditionally show and require poverty-certificate upload only when declared available.
- [ ] Preserve private preview/download authorization and allow replacement without discarding version/audit history.
- [ ] Capture student paper dispatch before the online cutoff and compute the campaign-configured grace deadline in Vietnam time.
- [ ] Keep intake receipt and reconciliation as admin-only actions and gate formal eligibility on arrival and reconciliation.
- [ ] Provide the configured recipient/contact/address and paper checklist in the student submission and confirmation views.

### Task 4: Intake queue, paper reconciliation, and preliminary eligibility

**Files:**
- Modify: `BackEnd/src/services/paperDossierService.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/controllers/scholarshipController.js`
- Modify: `BackEnd/src/routes/scholarshipRoutes.js`
- Modify: `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationsPage.tsx`
- Modify: `FrontEnd/src/features/admin/scholarships/PaperDossierIntakePage.tsx`
- Modify: `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationReviewPage.tsx`

- [ ] Show application code, applicant, school, province, grade/class, submission time, online document state, student dispatch declaration, admin receipt state, hardship evidence state, and review state.
- [ ] Add filters for province, school, grade, hardship certificate, region priority, document state, paper state, and application state.
- [ ] Gate preliminary eligibility on deadline, required fields/documents, paper policy, reconciled paper checklist, and cleared duplicate/fraud review flags.
- [ ] Retain ineligible and incomplete applications with clear reasons and supplementation routes; never silently delete them.
- [ ] Enforce which roles can intake, reconcile, or screen each dossier and preserve four-eyes separation for final approval.

### Task 5: Versioned priority policies and effective-dated region catalog

**Files:**
- Create: `BackEnd/src/models/ScholarshipPriorityPolicy.js`
- Create: `BackEnd/src/models/ScholarshipPriorityRegion.js`
- Modify: `BackEnd/src/models/ScholarshipApplication.js`
- Modify: `BackEnd/src/models/index.js`
- Create: `BackEnd/src/services/scholarshipPriorityService.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/controllers/scholarshipController.js`
- Modify: `BackEnd/src/routes/scholarshipRoutes.js`
- Create: `FrontEnd/src/features/admin/scholarships/ScholarshipPriorityPolicyPage.tsx`
- Modify: `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationsPage.tsx`
- Modify: `FrontEnd/src/services/scholarshipApplication.service.ts`

- [ ] Support campaign-assigned policy versions with criteria, evidence requirements, category precedence/score weights, effective dates, and basis/source records.
- [ ] Support admin-maintained geographic regions with province/commune keys, classification, effective dates, and official source reference; do not hard-code a permanent location list.
- [ ] Calculate and snapshot explainable categories/rank against student residence geography, not school location alone.
- [ ] Provide a manual ordering mode when no official weights are configured and expose the applicable policy version and score breakdown.
- [ ] Use the proposal's poverty, near-poverty, hardship/region, and academic-supporting criteria as configurable categories; never apply the illustrative numeric point values by default.
- [ ] Keep ranking advisory and prevent automatic approval/rejection.

### Task 6: Verification assignment, decision audit, and role separation

**Files:**
- Modify: `BackEnd/src/models/ScholarshipApplication.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/services/auditService.js`
- Modify: `BackEnd/src/controllers/scholarshipController.js`
- Modify: `BackEnd/src/routes/scholarshipRoutes.js`
- Modify: `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationReviewPage.tsx`
- Modify: `FrontEnd/src/features/admin/scholarships/GuardianConsentReviewCard.tsx`

- [ ] Preserve and expose the independent verifier assignment, deadline, scoped application access, result, and supplemental verification route.
- [ ] Keep unable-to-verify/mismatch separate from an automatic fraud finding.
- [ ] Require final approver to differ from intake, screening, and verifier actors; require decision reason and store before/after audit detail.
- [ ] Ensure financial reconciliation roles do not receive CCCD/transcript access by default.
- [ ] Keep guardian/minor public-disclosure consent separate from application eligibility and award decision.

### Task 7: All-course, no-expiry award entitlement and enrollment integration

**Files:**
- Modify: `BackEnd/src/models/Scholarship.js`
- Modify: `BackEnd/src/models/ScholarshipUsage.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/services/scholarshipPaymentService.js`
- Modify: `BackEnd/src/services/settlementService.js`
- Modify: `BackEnd/src/services/refundService.js`
- Modify: `BackEnd/src/services/financialDispatchService.js`
- Modify: `BackEnd/src/services/scholarshipExpiryService.js`
- Modify: `FrontEnd/src/types/scholarship.ts`
- Modify: `FrontEnd/src/api/scholarshipAdapters.ts`
- Modify: `FrontEnd/src/features/student/scholarships/StudentScholarshipsPage.tsx`
- Modify: `FrontEnd/src/features/student/scholarships/StudentScholarshipDetailPage.tsx`
- Modify: `FrontEnd/src/features/student/enrollments/StudentEnrollmentsPage.tsx`

**Interfaces:**
- Award includes one unique code, `benefitScope=ALL_COURSES`, a non-expiring balance equal to the configured campaign award amount, activation date, recipient, campaign, decision, and revocation audit.
- The campaign reserves the full per-student award amount when issuing the scholarship. Each actual tuition payment consumes at most the student's remaining balance; mixed payment collects tuition above that balance from the student. Unused balance stays allocated until consumed or formally revoked.

- [ ] Issue an all-course/no-expiry scholarship balance atomically with an official funded slot and preserve unique award codes.
- [ ] Replace student UI's “remaining money,” balance usage percentage, and expiration display with all-course/no-expiry benefit language.
- [ ] Remove expiry-job revocation for new no-expiry awards while preserving legacy scholarship expiry behavior.
- [ ] Keep per-course usage history, refunds, teacher earnings, and campaign funding records consistent with balance deductions; restore valid reverted usage to the non-expiring scholarship balance.
- [ ] Enforce award slot count from the official snapshot; record any post-close slot expansion as an approved audited adjustment.
- [ ] Preserve legacy amount-based scholarships and usage/refund paths until migrated or expired; never reinterpret existing balances as unlimited awards.

### Task 8: Public transparency, consent, and campaign closeout

**Files:**
- Modify: `BackEnd/src/services/campaignService.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `BackEnd/src/controllers/scholarshipController.js`
- Modify: `BackEnd/src/routes/scholarshipRoutes.js`
- Modify: `FrontEnd/src/features/campaign/CampaignDetailPage.tsx`
- Modify: `FrontEnd/src/features/admin/campaigns/CampaignDetailPage.tsx`
- Modify: `FrontEnd/src/features/student/scholarships/components/PublicConsentControl.tsx`
- Modify: `FrontEnd/src/features/student/scholarships/components/PublicStoryControl.tsx`

- [ ] Publish only approved recipient fields for currently consented recipients; keep anonymous aggregate counts for all others.
- [ ] Ensure public APIs never serialize CCCD, private addresses, guardian data, scans, or unconsented names.
- [ ] Show campaign goal, received/eligible/refunded funds, projected/official/issued/remaining slots, surplus, and learning-benefit usage.
- [ ] Respect donor anonymity on both contribution lists and campaign reports.
- [ ] Keep consent revocation effective for future public responses and never make consent a condition of award eligibility.

### Task 9: Compatibility, controlled migration, and operational handover

**Files:**
- Modify only the affected models/services/pages from Tasks 1–8.
- Create: a scoped migration script under `BackEnd/scripts/` only where old records need a deterministic mapping.
- Update: `docs/superpowers/specs/2026-11-25-scholarship-sponsorship-program-design.md` with any policy answers and final implementation decisions.

- [ ] Map existing application statuses into separate response dimensions without changing the original record history.
- [ ] Keep old verified documents and paper receipt records readable; mark ambiguous legacy checklist records for admin review.
- [ ] Keep existing amount/expiry Scholarships operable and distinct from new all-course/no-expiry awards.
- [ ] Provide a preview/report mode for any data migration before applying changes; do not modify historical financial amounts automatically.
- [ ] Update operational documentation for slot close, grace-period receipt, role ownership, policy versioning, entitlement revocation, and public closeout.
- [ ] Preserve existing amount-based legacy awards and their expiry semantics; new grants use configured amount, all-course scope, and no expiry.
