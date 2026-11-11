import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gatewayPaymentService, paymentKeys } from "../services/gatewayPayment.service";
import { FetchError } from "../api/apiClient";
import type { Payment, PaymentUiState } from "../types/payment";

export const PAYMENT_POLL_INTERVAL_MS = 3000;

/**
 * Compute remaining seconds from an ISO expiration timestamp and current time.
 * Never returns a negative value; handles invalid dates safely.
 */
export function computeCountdownRemaining(
  expiredAt: string | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!expiredAt) return 0;
  const targetMs = new Date(expiredAt).getTime();
  if (Number.isNaN(targetMs)) return 0;
  return Math.max(0, Math.floor((targetMs - nowMs) / 1000));
}

/**
 * Format remaining seconds as MM:SS (e.g., 14:59 -> 00:00).
 */
export function formatCountdownMMSS(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Derive the unified Vietnamese UI state from a Backend Payment / SponsorContribution DTO.
 * Strictly enforces:
 * - TUITION is only COMPLETED when Payment is COMPLETED AND Enrollment is CONFIRMED/COMPLETED.
 * - Late payment after hold expiry (Payment COMPLETED + Enrollment EXPIRED/PENDING_PAYMENT or reconciliationRequired)
 *   maps to LATE_PAYMENT_REVIEW / RECONCILIATION_REQUIRED and NEVER grants classroom access.
 * - DONATION is only COMPLETED when contributionStatus/paymentStatus is COMPLETED and not flagged for reconciliation.
 */
export function derivePaymentUiState(
  payment: Partial<Payment> | null | undefined,
  isClientTimerZero = false
): PaymentUiState {
  if (!payment) return "PENDING";

  const purpose = payment.purpose || (payment.contributionStatus ? "DONATION" : "TUITION");
  const rawStatus = payment.paymentStatus || payment.contributionStatus || "PENDING";
  const enrollmentStatus = payment.enrollmentStatus || null;
  const reconciliationRequired = Boolean(payment.reconciliationRequired);
  const reconciliationReason = payment.reconciliationReason || null;

  if (rawStatus === "REFUNDED") {
    return "REFUND_PENDING";
  }

  if (purpose === "TUITION") {
    if (reconciliationRequired) {
      if (
        reconciliationReason === "LATE_PAYMENT_REVIEW" ||
        reconciliationReason === "EXPIRED_PAYMENT"
      ) {
        return "LATE_PAYMENT_REVIEW";
      }
      return "RECONCILIATION_REQUIRED";
    }

    if (rawStatus === "COMPLETED") {
      if (enrollmentStatus === "CONFIRMED" || enrollmentStatus === "COMPLETED") {
        return "COMPLETED";
      }
      if (
        enrollmentStatus === "EXPIRED" ||
        enrollmentStatus === "CANCELLED" ||
        enrollmentStatus === "PENDING_PAYMENT"
      ) {
        return "LATE_PAYMENT_REVIEW";
      }
      return "PROCESSING";
    }

    if (rawStatus === "FAILED") {
      if (enrollmentStatus === "EXPIRED" || enrollmentStatus === "CANCELLED") {
        return "EXPIRED";
      }
      return "FAILED";
    }

    // rawStatus === "PENDING"
    if (enrollmentStatus === "CONFIRMED" || enrollmentStatus === "COMPLETED") {
      return "COMPLETED";
    }
    if (enrollmentStatus === "EXPIRED" || enrollmentStatus === "CANCELLED") {
      return "EXPIRED";
    }
    if (
      isClientTimerZero &&
      typeof payment.remainingSeconds === "number" &&
      payment.remainingSeconds <= 0
    ) {
      return "EXPIRED";
    }
    return "PENDING";
  }

  // DONATION channel
  if (reconciliationRequired) {
    return "RECONCILIATION_REQUIRED";
  }

  if (rawStatus === "COMPLETED") {
    return "COMPLETED";
  }

  if (rawStatus === "FAILED") {
    if (
      isClientTimerZero &&
      typeof payment.remainingSeconds === "number" &&
      payment.remainingSeconds <= 0
    ) {
      return "EXPIRED";
    }
    return "FAILED";
  }

  // rawStatus === "PENDING" for DONATION
  if (payment.campaignStatus === "CLOSED") {
    return "EXPIRED";
  }
  if (
    isClientTimerZero &&
    typeof payment.remainingSeconds === "number" &&
    payment.remainingSeconds <= 0
  ) {
    return "EXPIRED";
  }

  return "PENDING";
}

/**
 * Determine whether a UI state is terminal (polling should stop).
 */
export function isTerminalPaymentUiState(uiState: PaymentUiState): boolean {
  return (
    uiState === "COMPLETED" ||
    uiState === "FAILED" ||
    uiState === "EXPIRED" ||
    uiState === "RECONCILIATION_REQUIRED" ||
    uiState === "LATE_PAYMENT_REVIEW" ||
    uiState === "REFUND_PENDING"
  );
}

/**
 * Decide whether TanStack Query should continue polling GET /api/payments/:id.
 */
export function shouldContinuePaymentPolling(
  payment: Partial<Payment> | null | undefined,
  isClientTimerZero = false
): boolean {
  if (!payment) return true;
  const uiState = derivePaymentUiState(payment, isClientTimerZero);
  if (isTerminalPaymentUiState(uiState)) {
    return false;
  }
  return uiState === "PENDING" || uiState === "PROCESSING";
}

export interface UsePaymentPollingOptions {
  paymentId: string | null | undefined;
  enabled?: boolean;
  isClientTimerZero?: boolean;
  pollIntervalMs?: number;
}

/**
 * Unified TanStack Query hook to poll GET /api/payments/:id every ~3 seconds
 * for both STUDENT (TUITION) and SPONSOR (DONATION) payment flows.
 * - Automatically stops polling on terminal or reconciliation states.
 * - Pauses polling when browser tab is hidden (`refetchIntervalInBackground: false`).
 * - Immediately refetches when user focuses window (`refetchOnWindowFocus: true`).
 * - Cleans up timers automatically on component unmount.
 */
export function usePaymentPolling({
  paymentId,
  enabled = true,
  isClientTimerZero = false,
  pollIntervalMs = PAYMENT_POLL_INTERVAL_MS,
}: UsePaymentPollingOptions) {
  const queryClient = useQueryClient();

  const query = useQuery<Payment, Error>({
    queryKey: paymentKeys.detail(paymentId || ""),
    queryFn: () => gatewayPaymentService.getPaymentById(paymentId!),
    enabled: Boolean(paymentId) && enabled,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (q.state.status === "error") {
        const err = q.state.error as any;
        if (err instanceof FetchError && [401, 403, 404].includes(err.status ?? 0)) {
          return false;
        }
      }
      if (!shouldContinuePaymentPolling(data, isClientTimerZero)) {
        return false;
      }
      return pollIntervalMs;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (error instanceof FetchError && [400, 401, 403, 404].includes(error.status ?? 0)) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(3000 * (attemptIndex + 1), 9000),
  });

  const uiState = derivePaymentUiState(query.data, isClientTimerZero);
  const isPolling =
    Boolean(paymentId) &&
    enabled &&
    !query.isError &&
    shouldContinuePaymentPolling(query.data, isClientTimerZero);

  const stopPolling = () => {
    if (paymentId) {
      queryClient.cancelQueries({ queryKey: paymentKeys.detail(paymentId) });
    }
  };

  return {
    ...query,
    payment: query.data ?? null,
    uiState,
    isPolling,
    isTerminal: isTerminalPaymentUiState(uiState),
    stopPolling,
  };
}

export const usePaymentIntent = usePaymentPolling;
