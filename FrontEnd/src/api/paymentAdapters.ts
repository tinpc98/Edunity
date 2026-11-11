import type {
  ApiPayment,
  Payment,
  ApiTransaction,
  Transaction,
  TeacherEarningsResponse,
  TeacherEarningItem,
  TeacherEarningsSummary,
} from "../types/payment";

/**
 * Safely parse numbers from possible Decimal128, string, or number values.
 */
function parseDecimal(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  if (typeof val === "object" && val.$numberDecimal) {
    return parseFloat(val.$numberDecimal) || 0;
  }
  return 0;
}

export function adaptPayment(raw: ApiPayment): Payment {
  const id = String(raw._id || raw.paymentId || (raw as any).id || "");
  const isDonation = raw.purpose === "DONATION" || Boolean(raw.contributionStatus);
  const purpose = isDonation ? "DONATION" : "TUITION";
  const channelKey = raw.channelKey === "DONATION" || isDonation ? "DONATION" : "TUITION";
  const amount = parseDecimal(raw.amount);
  const tuitionAmount =
    raw.tuitionAmount !== undefined ? parseDecimal(raw.tuitionAmount) : amount;
  const scholarshipAmount =
    raw.scholarshipAmount !== undefined
      ? parseDecimal(raw.scholarshipAmount)
      : Math.max(0, tuitionAmount - amount);

  const enrollmentId =
    typeof raw.enrollmentId === "object" && raw.enrollmentId !== null
      ? String(raw.enrollmentId._id || raw.enrollmentId.id || "")
      : String(raw.enrollmentId || "");

  const campaignId =
    typeof raw.campaignId === "object" && raw.campaignId !== null
      ? String(raw.campaignId._id || raw.campaignId.id || "")
      : raw.campaignId
      ? String(raw.campaignId)
      : null;

  const contributionId =
    typeof raw.contributionId === "object" && raw.contributionId !== null
      ? String(raw.contributionId._id || raw.contributionId.id || "")
      : raw.contributionId
      ? String(raw.contributionId)
      : isDonation
      ? id
      : null;

  const payerUserId =
    typeof raw.payerUserId === "object" && raw.payerUserId !== null
      ? String(raw.payerUserId._id || raw.payerUserId.id || "")
      : raw.payerUserId
      ? String(raw.payerUserId)
      : typeof raw.sponsorId === "object" && raw.sponsorId !== null
      ? String(raw.sponsorId._id || raw.sponsorId.id || "")
      : String(raw.sponsorId || "");

  const holdExpiresAt = raw.holdExpiresAt ?? raw.expiredAt ?? null;
  const expiredAt = raw.expiredAt ?? holdExpiresAt ?? null;

  return {
    id,
    paymentId: String(raw.paymentId || id),
    purpose,
    channelKey,
    provider: raw.provider || (raw.gateway === "PAYOS" ? "PAYOS" : "SANDBOX"),
    enrollmentId,
    campaignId,
    contributionId,
    payerUserId,
    gateway: raw.gateway || "SANDBOX",
    gatewayReference: raw.gatewayReference || raw.paymentReference || "",
    orderCode: typeof raw.orderCode === "number" ? raw.orderCode : null,
    paymentLinkId: raw.paymentLinkId || null,
    qrCode: raw.qrCode || null,
    checkoutUrl: raw.checkoutUrl || null,
    currency: raw.currency || "VND",
    amount,
    tuitionAmount,
    scholarshipAmount,
    paymentStatus: (raw.paymentStatus || raw.contributionStatus || "PENDING") as Payment["paymentStatus"],
    contributionStatus: raw.contributionStatus,
    providerStatus: raw.providerStatus || raw.paymentStatus || "PENDING",
    paidAt: raw.paidAt || raw.contributedAt,
    createdAt: raw.createdAt || raw.contributedAt || new Date().toISOString(),
    updatedAt: raw.updatedAt,
    enrollmentStatus: raw.enrollmentStatus ?? null,
    paymentSource: raw.paymentSource ?? null,
    holdExpiresAt,
    expiredAt,
    remainingSeconds:
      typeof raw.remainingSeconds === "number" ? Math.max(0, raw.remainingSeconds) : undefined,
    classId: raw.classId ? String(raw.classId) : null,
    className: raw.className,
    campaignTitle: raw.campaignTitle ?? null,
    campaignStatus: raw.campaignStatus ?? null,
    isAnonymous: Boolean(raw.isAnonymous),
    donorDisplayName: raw.donorDisplayName ?? null,
    reconciliationRequired: Boolean(raw.reconciliationRequired),
    reconciliationReason: raw.reconciliationReason ?? null,
    reconciliationStatus: raw.reconciliationStatus ?? null,
  };
}

export function adaptPayments(rawList: ApiPayment[]): Payment[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(adaptPayment);
}

export function adaptTransaction(raw: ApiTransaction): Transaction {
  const sourceUser =
    typeof raw.sourceUserId === "object" && raw.sourceUserId !== null
      ? {
          email: raw.sourceUserId.email,
          fullName:
            raw.sourceUserId.studentProfile?.fullName ||
            raw.sourceUserId.teacherProfile?.fullName ||
            raw.sourceUserId.sponsorProfile?.representativeName ||
            raw.sourceUserId.email,
          role: raw.sourceUserId.role,
        }
      : undefined;

  const destinationUser =
    typeof raw.destinationUserId === "object" && raw.destinationUserId !== null
      ? {
          email: raw.destinationUserId.email,
          fullName:
            raw.destinationUserId.studentProfile?.fullName ||
            raw.destinationUserId.teacherProfile?.fullName ||
            raw.destinationUserId.sponsorProfile?.representativeName ||
            raw.destinationUserId.email,
          role: raw.destinationUserId.role,
        }
      : undefined;

  const orderCode =
    (raw as any).relatedPaymentId?.orderCode ??
    (raw as any).relatedBankEventId?.orderCode ??
    (raw as any).relatedContributionId?.orderCode ??
    null;

  return {
    id: raw._id || (raw as any).id,
    transactionType: raw.transactionType,
    sourceUserId: typeof raw.sourceUserId === "object" ? raw.sourceUserId?._id : String(raw.sourceUserId || ""),
    sourceUser,
    destinationUserId: typeof raw.destinationUserId === "object" ? raw.destinationUserId?._id : (raw.destinationUserId ? String(raw.destinationUserId) : undefined),
    destinationUser,
    relatedEnrollmentId: typeof raw.relatedEnrollmentId === "object" ? (raw.relatedEnrollmentId as any)?._id : raw.relatedEnrollmentId,
    relatedPaymentId: typeof raw.relatedPaymentId === "object" ? (raw.relatedPaymentId as any)?._id : raw.relatedPaymentId,
    relatedContributionId: typeof raw.relatedContributionId === "object" ? (raw.relatedContributionId as any)?._id : raw.relatedContributionId,
    relatedBankEventId: typeof raw.relatedBankEventId === "object" ? (raw.relatedBankEventId as any)?._id : raw.relatedBankEventId,
    orderCode,
    amount: parseDecimal(raw.amount),
    status: raw.status || "PENDING",
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

export function adaptTransactions(rawList: ApiTransaction[]): Transaction[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(adaptTransaction);
}

export function adaptTeacherEarnings(raw: any): TeacherEarningsResponse {
  const items: TeacherEarningItem[] = Array.isArray(raw?.items)
    ? raw.items.map((item: any) => ({
        id: item.id || item._id,
        classId: item.classId,
        className: item.className,
        enrollmentId: item.enrollmentId,
        grossAmount: parseDecimal(item.grossAmount),
        commissionRate: typeof item.commissionRate === "number" ? item.commissionRate : 0.1,
        commissionAmount: parseDecimal(item.commissionAmount),
        netAmount: parseDecimal(item.netAmount),
        status: item.status || "PENDING",
        createdAt: item.createdAt || new Date().toISOString(),
      }))
    : [];

  const summary: TeacherEarningsSummary = {
    totalGross: parseDecimal(raw?.summary?.totalGross),
    totalCommission: parseDecimal(raw?.summary?.totalCommission),
    totalNet: parseDecimal(raw?.summary?.totalNet),
    pending: parseDecimal(raw?.summary?.pending),
    available: parseDecimal(raw?.summary?.available),
    paidOut: parseDecimal(raw?.summary?.paidOut),
  };

  return { items, summary };
}
