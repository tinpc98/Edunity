import { test, expect } from '@playwright/test';
import { getNotificationRoute } from '../src/features/notifications/notificationRoute';

// Pure mapping, no browser: [recipient, type, page that handles it]
const CASES = [
  ['ADMIN', 'TEACHER_SUBJECT_AUTH_REQUESTED', '/admin/subject-authorizations'],
  ['ADMIN', 'TEACHER_CONTRACT_DECLINED', '/admin/teachers/verifications?status=VERIFIED'],
  ['ADMIN', 'TEACHER_BANK_ACCOUNT_SUBMITTED', '/admin/payouts?tab=bank-accounts'],
  ['ADMIN', 'GUARDIAN_CONSENT_SUBMITTED', '/admin/scholarship-applications'],
  ['TEACHER', 'TEACHER_SUBJECT_AUTH_APPROVED', '/teacher/profile'],
  ['TEACHER', 'TEACHER_SUBJECT_AUTH_SUSPENDED', '/teacher/profile'],
  ['TEACHER', 'TEACHER_CONTRACT_SENT', '/teacher/profile'],
  ['TEACHER', 'TEACHER_CONTRACT_SIGNED', '/teacher/profile'],
  ['TEACHER', 'TEACHER_CONTRACT_CANCELLED', '/teacher/profile'],
  ['TEACHER', 'TEACHER_CONTRACT_TERMINATED', '/teacher/profile'],
  ['TEACHER', 'TEACHER_REVERIFICATION_DUE', '/teacher/profile'],
  ['TEACHER', 'TEACHER_REVERIFICATION_EXPIRED', '/teacher/profile'],
  ['TEACHER', 'TEACHER_BANK_ACCOUNT_CHANGED', '/teacher/revenue'],
  ['TEACHER', 'TEACHER_BANK_ACCOUNT_REJECTED', '/teacher/revenue'],
  ['TEACHER', 'TEACHER_BANK_ACCOUNT_VERIFIED', '/teacher/revenue'],
  // unchanged: what the fallbacks were written for
  ['ADMIN', 'TEACHER_INCIDENT_REPORT_SUBMITTED', '/admin/reports'],
  ['ADMIN', 'TEACHER_INCIDENT_APPEAL_SUBMITTED', '/admin/reports'],
  ['ADMIN', 'ADMIN_TEACHER_NO_SHOW', '/admin/reports'],
  ['ADMIN', 'TEACHER_VERIFICATION_SUBMITTED', '/admin/teachers/verifications'],
  ['ADMIN', 'TEACHER_SOMETHING_NEW', '/admin/notifications'],
  ['TEACHER', 'TEACHER_WARNING_YELLOW', '/teacher/schedule'],
  ['TEACHER', 'TEACHER_VERIFIED', '/teacher/profile'],
];

for (const [role, type, page] of CASES) {
  test(`${role}: ${type} opens ${page}`, () => {
    expect(getNotificationRoute(type, role)).toBe(page);
  });
}
