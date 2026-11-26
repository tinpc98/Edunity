# Scholarship application form update

## Intent

Update the student scholarship application form with applicant identity and contact details, required school details, and a structured hardship declaration. Keep the existing guardian section and remove only its free-text family-circumstances field. Remove the form's safe-storage information banner.

## Goals and constraints

- Applicant fields: full name, CCCD, phone, email, and permanent address. CCCD is exactly 12 digits; phone is exactly 10 digits, with no spaces. Only CCCD and phone are newly marked required unless the existing form already requires a field.
- School fields: academic year, province, and commune/ward are required; add required principal full name and title, homeroom teacher full name, and phone. Keep the existing school name, grade, class, and student code fields.
- Add a hardship checkbox. When selected, show the four options: poor household, near-poor household, remote area, and orphaned (both parents). Require at least one option when hardship is selected.
- Preserve draft, resubmit, and submit behavior. Validate the rules in the API as well as the browser.
- Store applicant CCCD using the existing encrypted student CCCD fields. Store the other applicant fields in a distinct `applicantInfo` group. Keep the guardian data model and existing applications readable.
- Reuse the existing `schoolInfo` group for the new school contact and hardship fields. Keep the existing `district` storage key for the new commune/ward label to avoid breaking older records.

## Approaches

- Reuse guardian fields for the applicant: rejected because guardian and applicant are different people and existing minors' guardian information must remain intact.
- Put applicant identity into the student's account profile: rejected because a campaign dossier needs a point-in-time snapshot and a separate address/contact may be specific to this application.
- Add `applicantInfo`, keep CCCD in the existing encrypted student CCCD fields, and extend `schoolInfo`: recommended because it preserves guardian data, fits the current privacy model, and keeps dossier-specific details together.

## Implementation calls

- The current form's existing required guardian, school, grade, and class fields remain required.
- Applicant full name, email, and permanent address remain optional because the request explicitly marks only CCCD and phone as required among applicant fields.
- Hardship choices are stored as a fixed list of codes, with `isDisadvantaged` controlling whether the list is applicable.
- The current reviewer detail response should expose the new applicant and school fields to authorized admins, while student-facing responses continue to redact encrypted CCCD unless the existing privacy behavior already permits display.
