import { useEffect, useState } from "react";

/**
 * Current time as state, refreshed every `intervalMs`. Reading Date.now() directly while rendering gives
 * unstable output; components that show relative times or "expired" flags read this instead.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
