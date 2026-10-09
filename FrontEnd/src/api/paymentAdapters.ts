import type {
  ApiPayment,
  Payment,
  ApiTransaction,
  Transaction,
  TeacherEarningItem,
  TeacherEarningsResponse,
} from "../types/payment";

function parseDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  if (typeof value === "object" && "$numberDecimal" in (value as any)) {
    return parseFloat((value as any).$numberDecimal) || 0;
  }
  return 0;
}

function resolveId(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object") {
    return (ref as any)._id?.toString() || (ref as any).id?.toString() || "";
  }
  return "";
}

export function adaptPayment(api: ApiPayment): Payment {
  return {
    id: api._id || (api as any).id || "",
    enrollmentId: resolveId(api.enrollmentId),
    payerUserId: resolveId(api.payerUserId),
    gateway: api.gateway || "",
    gatewayReference: api.gatewayReference || "",
    amount: parseDecimal(api.amount),
    paymentStatus: api.paymentStatus,
    paidAt: api.paidAt,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    enrollmentStatus: api.enrollmentStatus,
    paymentSource: api.paymentSource,
    holdExpiresAt: api.holdExpiresAt || null,
    classId: resolveId(api.classId),
    className: api.className,
  };
}

export function adaptPayments(apis: ApiPayment[]): Payment[] {
  if (!Array.isArray(apis)) return [];
  return apis.map(adaptPayment);
}

export function adaptTransaction(api: ApiTransaction): Transaction {
  return {
    id: api._id || (api as any).id || "",
    transactionType: api.transactionType,
    sourceUserId: resolveId(api.sourceUserId),
    destinationUserId: api.destinationUserId ? resolveId(api.destinationUserId) : undefined,
    relatedEnrollmentId: resolveId(api.relatedEnrollmentId),
    relatedPaymentId: resolveId(api.relatedPaymentId),
    amount: parseDecimal(api.amount),
    status: api.status,
    createdAt: api.createdAt,
  };
}

export function adaptTransactions(apis: ApiTransaction[]): Transaction[] {
  if (!Array.isArray(apis)) return [];
  return apis.map(adaptTransaction);
}

export function adaptTeacherEarnings(raw: any): TeacherEarningsResponse {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const rawSummary = raw?.summary || {};

  const items: TeacherEarningItem[] = rawItems.map((e: any) => ({
    id: e.id || e._id?.toString() || "",
    classId: e.classId || "",
    className: e.className || "",
    enrollmentId: e.enrollmentId || "",
    grossAmount: parseDecimal(e.grossAmount),
    commissionRate: e.commissionRate ? Number(e.commissionRate) : 0.1,
    commissionAmount: parseDecimal(e.commissionAmount),
    netAmount: parseDecimal(e.netAmount),
    status: e.status,
    createdAt: e.createdAt,
  }));

  const summary = {
    totalGross: parseDecimal(rawSummary.totalGross),
    totalCommission: parseDecimal(rawSummary.totalCommission),
    totalNet: parseDecimal(rawSummary.totalNet),
    pending: parseDecimal(rawSummary.pending),
    available: parseDecimal(rawSummary.available),
    paidOut: parseDecimal(rawSummary.paidOut),
  };

  return { items, summary };
}
