import dayjs from 'dayjs';
import type {
  VerificationDocument,
  VerificationDocumentStatus,
} from "../types/teacherVerification";

/** One submission round = the IDENTITY + QUALIFICATION documents sent together and reviewed together. */
export interface VerificationSubmission {
  key: string;
  status: VerificationDocumentStatus | 'UNKNOWN';
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  documents: VerificationDocument[];
}

const timeOf = (value?: string | null) => (value ? dayjs(value).valueOf() : 0);
const submittedTimeOf = (doc: VerificationDocument) => doc.uploadedAt || doc.createdAt;

/**
 * Groups documents into submission rounds. Backend reviews all PENDING documents of a teacher at once
 * and stamps them with the same reviewedAt, so reviewedAt identifies a reviewed round; at most one
 * round can still be PENDING because a new submission is refused while one is pending.
 * Result is newest first.
 */
export function groupVerificationSubmissions(documents: VerificationDocument[]): VerificationSubmission[] {
  const groups = new Map<string, VerificationSubmission>();

  for (const doc of documents) {
    const submittedAt = submittedTimeOf(doc);
    let key: string;
    if (doc.status === 'PENDING') key = 'PENDING';
    else if (doc.reviewedAt) key = `REVIEWED:${doc.reviewedAt}`;
    else key = `SUBMITTED:${submittedAt ? dayjs(submittedAt).format('YYYY-MM-DDTHH:mm') : doc._id ?? 'unknown'}`;

    const group = groups.get(key);
    if (group) {
      group.documents.push(doc);
      if (submittedAt && timeOf(submittedAt) < timeOf(group.submittedAt)) group.submittedAt = submittedAt;
    } else {
      groups.set(key, {
        key,
        status: doc.status ?? 'UNKNOWN',
        submittedAt,
        reviewedAt: doc.reviewedAt,
        reviewNote: doc.reviewNote,
        documents: [doc],
      });
    }
  }

  return [...groups.values()].sort(
    (a, b) => Math.max(timeOf(b.submittedAt), timeOf(b.reviewedAt)) - Math.max(timeOf(a.submittedAt), timeOf(a.reviewedAt))
  );
}
