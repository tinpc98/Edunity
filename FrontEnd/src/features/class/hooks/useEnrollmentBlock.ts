import { useEffect, useState } from "react";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { getEnrollmentBlock } from "../../../utils/classEnrollmentWindow";

export function useEnrollmentBlock(item: ClassDiscoveryItem, isFull = item.isFull): string | null {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const start = item.enrollmentStart ? Date.parse(item.enrollmentStart) : NaN;
    const end = item.enrollmentEnd ? Date.parse(item.enrollmentEnd) + 1 : NaN;
    const current = Date.now();
    // Recheck as soon as a cached card mounts, and wake up at its next boundary.
    const next = Math.min(...[start, end].filter((value) => value > current));
    const delay = (start > now && start <= current) || (end > now && end <= current)
      ? 0
      : next - current;
    if (!Number.isFinite(delay)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [item.enrollmentStart, item.enrollmentEnd, now]);

  return getEnrollmentBlock({ ...item, isFull }, now);
}
