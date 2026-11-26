# EDUNITY Scholarship Sponsorship Program Design

## Intent

Deliver the complete scholarship sponsorship lifecycle in EDUNITY, from campaign setup and verified funding through student applications, paper dossier receipt, screening, independent verification, approval, learning-benefit issuance, and public campaign reporting. Extend the existing scholarship and contribution systems so every award is backed by eligible campaign funds, follows the published campaign rules, and remains auditable.

## Goals

- Let campaign admins configure the fundraising target, initial slot target, reference value per slot, funding and application windows, paper-submission policy, learning-benefit package, surplus rules, and published terms.
- Distinguish received, pending, failed, duplicate, refunded, restricted, and allocatable contributions. Count only verified and eligible contributions toward projected slots.
- Show projected slots during fundraising, then reconcile and snapshot official slots when fundraising closes. Preserve initial targets and every approved adjustment. Permit above-target growth only under the campaign's published policy and available delivery capacity.
- Collect one student application per campaign with separate student, guardian, school, residence, hardship, consent, and document data. Permit edits and document replacement during the published application window; lock on close, with audited admin reopening for exceptions.
- Accept separate PDF uploads for student ID, guardian ID, and transcript; conditionally request an optional poverty/near-poverty certificate; support campaign-specific documents. Track each document independently, allow secure preview/replacement, validate type, size, and page limits, and record review state.
- Track the student's paper-mail declaration and tracking evidence separately from admin receipt and paper-document reconciliation. Do not treat student declaration as receipt.
- Keep intake, eligibility screening, priority ranking, verification, approval, and award issuance as distinct decisions. Only applications satisfying required documents and the campaign's paper policy enter formal review. Ranking assists a human panel and never makes the award decision.
- Support versioned, campaign-applicable priority criteria and geographic catalogs with effective dates and source references. Preserve the rule version and score/rank snapshot used for each decision.
- Require independent verification and separated roles for intake, verification, finance reconciliation, and final approval. Keep a complete audit trail with actor, time, before/after values, reason, and any second approver.
- Issue a unique, non-withdrawable EDUNITY scholarship credit balance attached to the student's account. Each award starts with the campaign's per-student amount (2,000,000 VND in the example), can pay for all EDUNITY courses, has no expiry, and retains any unspent balance. Actual course payments deduct from the remaining balance; a student pays any amount above the available balance.
- Publish campaign outcomes and recipient information only within recorded disclosure consent. Never publish CCCD, contact/home address, guardian details, or document scans; allow eligible students to receive awards without public identification.
- Report funding, reconciliation, projected/official/issued/remaining slots, unused allocatable balance, and benefit usage without silently moving surplus between campaigns.

## Non-goals

- Provide a cash wallet, cash withdrawal, transferable award, or promise that a reference value is cash paid to the student.
- Automatically approve or reject a student from a score, hardship declaration, funding total, or geographic classification.
- Treat legal or accounting recommendations in the source document as a substitute for review by EDUNITY's qualified counsel and accountant.
- Build a public donor identity list when a donor has not opted in.

## Existing system and constraints

- `ScholarshipCampaign` already holds target/funded/allocated/used/refunded amounts, expected slots, per-student reference amount, funding/application date windows, checklist, dossier policy, and draft/open/closed state. `campaignService` calculates available funds and a live slot count, but there is no explicit reconciliation-close operation or immutable official slot snapshot.
- `SponsorContribution` already distinguishes payment states and partial refunds; successful contributions update campaign funded totals. Campaign reporting currently derives from aggregate fields, so the lifecycle must preserve financial invariants and reconcile with existing payment/refund services.
- `ScholarshipApplication` already stores applicant/guardian/school data, hardship flags, consent, a single-application-per-student-and-campaign uniqueness rule, dossier review, assigned verifier and verifier result. Existing `studentCccd` fields are the encrypted/hash-backed student CCCD storage. Guardian CCCD fields also have encrypted/hash-backed storage. Keep these privacy mechanisms and backward compatibility with existing records.
- `VerificationDocument` supports document type, checklist code, private files, and review statuses. `evaluateChecklistProgress` combines uploaded documents with reconciled `PaperDossierReceipt` checklist items. The current checklist supports ONLINE/PAPER/EITHER/BOTH modes and generic campaign-defined items.
- `PaperDossierReceipt` already records admin intake, postal metadata, tracking number, reconciliation items, and history. It does not represent the student's prior declaration as a separate event.
- Existing admin workflows support screening, verifier assignment/result, final approval permission checks, four-eyes separation, paper receipt reconciliation, audit records, and `Scholarship`/`ScholarshipUsage` issuance. `Scholarship` currently stores a non-transferable amount-style EDUNITY benefit allowance and expiry, not a named bundle of courses/services.
- The previously approved application-form design and its in-progress code changes are part of this work's baseline. This broader specification supersedes that form design where it differs: applicant full name is required here; guardian name, relationship, phone, address, occupation, and CCCD are required; and all required data must be enforced by every create/submit/resubmit API path regardless of optional campaign checklist settings. Preserve the ongoing changes and extend them with structured residence needed for geographic prioritization.
- Use Vietnam local time (UTC+7) for campaign deadlines and explicitly store/compare timestamps; keep the project's current MongoDB/Mongoose and React/TypeScript conventions. Do not replace established schemas or payment flows without a demonstrated need.

## Approaches

1. **One end-to-end release with domain boundaries (selected).** Build the connected funding, dossier, review, award, and disclosure lifecycle as one coherent product change, reusing current models/services and adding narrowly scoped records where needed. This matches the request for a complete sponsorship program and prevents intermediate screens from promising states the backend cannot enforce. It has a larger integration surface and requires careful staged implementation and review.
2. **Independent vertical slices delivered over several releases.** Ship funding and slot close, then applications, then review and award, with each usable on its own. This reduces per-release risk, but delays the complete policy workflow the user asked for and can leave inconsistent interim behavior.
3. **Replace the scholarship subsystem with a new module.** Rejected because current campaign/payment/refund, dossier, paper receipt, audit, verification, and award foundations already cover substantial requirements; replacement would duplicate data and increase migration and financial-integrity risk.

The selected approach is one end-to-end release, implemented and reviewed through internally ordered components while maintaining one consistent workflow.

## End-to-end behavior

### 1. Campaign setup and published rules

Campaign setup captures initial fundraising target, initial slot target, per-student scholarship credit amount, all-course scope, no-expiry policy, fundraising and application windows, exact local cutoff times, checklist and PDF limits, paper receipt policy and address, whether excess funding can expand slots, how unused surplus is handled, priority-rule version, and public terms. Initial values remain immutable snapshots even if later approved decisions alter projected or official values. The public campaign explains that the scholarship is a non-withdrawable course-payment balance and that official count depends on eligible reconciled funds. At 2,000,000 VND per student, 50,000,000 VND of eligible funding yields 25 funded slots.

### 2. Funding and reconciliation

The funding ledger distinguishes pending, actually received/verified, failed/cancelled/duplicate, refunded, restricted, and eligible-for-campaign-allocation amounts. Projected slots equal the floor of eligible allocatable funds divided by the per-student scholarship credit; if expansion is disabled, apply the published cap. A remainder stays as campaign surplus and is not silently deducted, transferred, or repurposed. At the funding close, an authorized finance role reconciles contributions and refunds, records evidence and adjustments, then a separately authorized close action snapshots eligible funds and official slots with actor, timestamp, reason, and source records. Later corrections require a new audited adjustment; they do not overwrite the original snapshot. Admin dashboards show pending, returned, eligible, projected, official, issued, remaining, and surplus amounts/counts.

### 3. Student application and documents

The student enters required applicant name, phone (10 digits), permanent address, and CCCD (12 digits); required guardian name, relationship, phone, permanent address, occupation, and CCCD (12 digits); and required school name, principal name/title, grade, class, homeroom teacher name/phone, academic year, province, and commune/ward. Capture residence geography separately from school geography so hardship rules do not infer a student's residence from the school; residence province and commune/ward are required, while district remains optional for legacy addresses. Keep the already approved hardship checkbox/options and do not restore free-text family-circumstance fields. Enforce required fields and digit lengths consistently in first submission and resubmission APIs, even for legacy campaigns with no dossier checklist; do not condition applicant/guardian identity validation on campaign-specific document policy.

The student uploads individual documents: student CCCD PDF, guardian CCCD PDF, transcript PDF, and—only when selected—poor/near-poor certificate PDF. Campaign-specific checklist items may add documents. Every item has its own private storage key, required/optional and online/paper requirements, size/page limits, and status (not uploaded, uploaded, needs supplement, verified). Validate at upload and submission, provide secure preview and replacement, and prevent submit if required online items are missing. Existing applications remain readable, with legacy generic documents mapped where safe and unresolved files visibly marked for review rather than silently lost.

The student can save drafts and edit/replace files up to the configured close time. On close, submissions lock; an authorized admin can reopen a specific application with reason, expiry if applicable, and audit history. Duplicate prevention remains keyed by student and campaign, with CCCD hash used as a privacy-preserving cross-account duplicate signal for review rather than an automatic rejection.

### 4. Paper dossier flow

Show the configured recipient, postal address and phone, required-paper checklist, and instructions. The student separately records that the package was sent, sent date, carrier and tracking number/proof where available. Admin records actual receipt, intake condition, and received date; an authorized intake reviewer reconciles each paper checklist item and its validity. A student declaration never changes the admin receipt state. EDUNITY accepts paper dossiers arriving after the online deadline because of postal delivery: each campaign configures a 3–5 business-day delivery grace period after online close, and the student must provide evidence of dispatch by the online cutoff. Applications wait for required online documents, timely dispatch evidence, physical receipt within the grace period, and paper reconciliation before formal screening.

### 5. Screening, ranking, and verification

The intake list shows application code, student, school/province/class, submitted time, online-document status, student-reported mailing status, admin paper-receipt status, poverty-certificate status, and current workflow state. Filters cover the campaign's configured region, school, grade, hardship evidence, priority area, score/rank, and status.

Screening has a hard eligibility gate followed by priority ordering. The gate checks open/closed timing, required fields, required documents, the published paper policy, duplicates or unresolved fraud indicators, and any campaign eligibility rules. Failures retain the application and a reason, with supplement/review routes where allowed. Ranking uses a versioned, configurable policy; geographically derived categories come from an effective-dated catalog with source reference, and overlapping categories follow explicit rule precedence/caps. Until official weights and evidence rules are approved, the system may show categories and a manual review queue but must not invent the illustrative point values from the proposal. Rank is advisory only.

An authorized admin assigns only selected applications to a third-party verifier with scope and deadline. The verifier sees only assigned dossiers and can submit matched, mismatch, unable-to-verify, or supplemental-check results with notes/evidence. Failed verification is not an automatic fraud finding. Final decision requires the independent verification result, eligibility, available official slots/funds, a final approver distinct from intake/screening/verifier, a reason, and an audit entry. Application, verification, decision, and award states remain separate.

### 6. Award, learning benefit, disclosure, and closeout

Approval atomically reserves an official slot and the corresponding per-student credit amount (2,000,000 VND in the example) under campaign-level concurrency control. It creates one unique award code and an account balance usable toward all EDUNITY courses, with no expiry and a usage history. Each payment deducts the amount covered from the remaining scholarship balance; unused credit remains available. If a course costs more than the current balance, the student pays the difference through the existing mixed-payment flow. No student can withdraw, transfer, or convert the balance to cash. Revoke/adjust requires elevated authority, reason, and audit. Benefit issuance cannot exceed reconciled funded slots.

The student gives a separate public-disclosure choice; guardian consent is captured where required for a minor. Consent to public disclosure is not a condition of application or award. Public results show only configured fields (name, school, province, class/year, approved achievement, program and benefit value if allowed) for recipients whose current consent is valid; otherwise show anonymous aggregate results. Campaign closeout reports goal, received/eligible/returned amounts, projected/official/issued/unused slots, unallocated surplus, and learning-benefit usage. Donor identities appear only with donor opt-in.

### 7. Workflow states and roles

Use separate state dimensions (intake/paper, eligibility, verification, decision, and benefit) rather than stretching the existing single application enum until “verified” and “awarded” become ambiguous. Provide a clear aggregate label in admin/student views and a migration/read mapping for legacy statuses. Required visible milestones include new submission, waiting for student paper dispatch, student says dispatched, paper received, needs supplement, preliminary eligible/ineligible, awaiting/under verification/verification complete, awaiting/approved/rejected decision, awaiting/issued/in-use/expired benefit, and cancelled.

Roles are separated across campaign administration, intake, screening, verifier, final approver, and finance reconciliation. Enforce least privilege: finance does not need CCCD/transcript access; verifiers see only assigned applications; public pages never receive private records. Sensitive state/funding/slot/benefit changes store actor, timestamp, subject, previous and next values, reason, and second approver where configured.

## Policy decisions still needed before implementation

1. **Priority policy:** confirm the initial official criteria, evidence requirements, precedence for overlapping hardship/region categories, and whether the first release ranks by ordering only or uses approved weights. The example point table is explicitly illustrative and is not an implementation default. The campaign can still be configured with an explicit manual order until the official scoring policy is supplied.
The approved paper policy is: dispatch evidence by the online cutoff and physical delivery within a campaign-configured 3–5 business-day grace period. The approved benefit is: an initial scholarship credit balance (2,000,000 VND in the example), usable toward all EDUNITY courses, with no expiry; payments deduct from the balance and unused amounts remain. Campaign dates, time zone, residence geography (province and commune/ward required, district optional), and current records can be handled in implementation. Specific legal, accounting, consent, retention, and public-terms language remains subject to EDUNITY counsel/accountant review.

## Acceptance outcomes

- A campaign can be configured and published with clear fundraising, application, paper, priority, surplus, package, and disclosure terms.
- Projected and official slots are visibly distinct and derive only from eligible verified funds; original targets and official snapshots remain auditable.
- A student can submit a complete application with individually tracked PDF documents and a separate paper-mail declaration; admin receipt and reconciliation are independently recorded.
- Every required identity, guardian, and school field is rejected server-side when missing or malformed on create, submit, and resubmit paths, independent of campaign checklist configuration.
- Incomplete, late, duplicate-flagged, or policy-ineligible dossiers cannot silently enter formal review; admins see specific reasons and permitted remediation paths.
- Priority rules are versioned and explainable; no sample score is applied as policy, and no automated rank issues a decision.
- Independent verification, role separation, eligible fund/slot caps, award issuance, consent-gated disclosure, and audit requirements are enforced by the server as well as represented in the UI.
- Campaign reports reconcile to contribution/refund records and awarded scholarship balances without treating awards as withdrawable cash or moving surplus silently; allocated, used, and remaining credit stay distinct.
