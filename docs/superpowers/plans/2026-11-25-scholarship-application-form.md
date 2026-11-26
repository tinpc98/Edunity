# Scholarship Application Form Update Implementation Plan

> **For agentic workers:** Use the `superpowers:executing-plans` skill and implement each task in order.

**Goal:** Update student scholarship dossier collection with applicant identity, required school contacts/location fields, and conditional hardship categories while preserving guardian information.

**Architecture:** Keep guardian details in `guardianInfo`; add applicant fields in `applicantInfo` and extend `schoolInfo`. Keep applicant CCCD in the existing encrypted `studentCccd` fields. Enforce required and format rules in the frontend and backend.

**Tech Stack:** React, TypeScript, Ant Design, Express, Mongoose.

**Spec:** `docs/superpowers/specs/2026-11-25-scholarship-application-form-design.md`

## Global Constraints

- Preserve existing guardian fields except `householdCircumstance`.
- Applicant CCCD must be exactly 12 digits; phone must be exactly 10 digits with no spaces.
- Required school additions: academic year, province, commune/ward, principal full name and title, homeroom teacher full name and phone.
- If hardship is selected, at least one of the four specified hardship categories is required.
- Keep existing applications readable and preserve draft/resubmit/submit flows.

## Review Focus

- Missing or malformed applicant CCCD and phone must be rejected by both client and API.
- Missing academic year, province, commune, principal, or homeroom contact must prevent submission.
- Hardship categories must be hidden/cleared when unchecked and required when checked.
- Existing drafts and legacy records without new fields must still load and remain editable.
- CCCD must remain encrypted in storage and available only through existing authorized redaction/decryption paths.

---

### Task 1: Extend dossier data model and API validation

**Files:**
- Modify: `BackEnd/src/models/ScholarshipApplication.js`
- Modify: `BackEnd/src/services/scholarshipDossierGateService.js`
- Modify: `BackEnd/src/services/scholarshipService.js`
- Modify: `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationReviewPage.tsx`

**Interfaces:**
- Add `applicantInfo` fields: `fullName`, `phone`, `email`, `permanentAddress`.
- Extend `schoolInfo` with `principalName`, `principalTitle`, `homeroomTeacherName`, `homeroomTeacherPhone`, `isDisadvantaged`, `hardshipCategories`; continue using `district` for commune/ward.
- Reuse `studentCccd` / `studentCccdEnc` / `studentCccdHash` for applicant CCCD.

- [x] Parse and validate applicant, school, and hardship inputs on create, draft update, submit, and resubmit; expose them in admin review.
- [x] Encrypt and redact applicant CCCD using the existing student CCCD mechanism.
- [x] Preserve old school records and allow legacy drafts to load before completion.

### Task 2: Extend frontend dossier contracts and payload construction

**Files:**
- Modify: `FrontEnd/src/types/scholarship.ts`
- Modify: `FrontEnd/src/features/campaign/components/ApplyScholarshipModal.tsx`
- Modify: `FrontEnd/src/features/student/scholarships/StudentScholarshipApplicationsPage.tsx` (resubmission form)

**Interfaces:**
- Add `applicantInfo` and extended `schoolInfo` to API, domain, and create/update payload types.
- Send applicant CCCD through existing top-level `studentCccd` API field.

- [x] Populate new form fields when opening an existing draft and include them in save/submit payloads.
- [x] Remove only the safe-storage banner and guardian `householdCircumstance` control.

### Task 3: Update student application form

**Files:**
- Modify: `FrontEnd/src/features/campaign/components/ApplyScholarshipModal.tsx`

- [x] Add applicant full name, CCCD, phone, email, permanent address with exact CCCD/phone validation.
- [x] Make academic year, province, commune/ward, principal name/title, homeroom teacher name/phone required.
- [x] Add conditional hardship checkbox and four categories; require at least one category when enabled.
- [x] Include applicant and school contact details in the review-before-submit step and admin review screen.

### Task 4: Verify frontend and backend integration

**Files:**
- No additional files expected.

- [x] Run `npm run build` in `FrontEnd` and resolve TypeScript or bundler failures.
- [x] Inspect the final diff to confirm the form and data contract changes are integrated.
