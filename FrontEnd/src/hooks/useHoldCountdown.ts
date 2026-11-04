import { useEffect, useRef, useState } from "react";

/**
 * Seconds left on an enrollment seat hold. onExpire fires once when the hold runs out, then the timer stops.
 * The remaining time is derived from a ticking clock, so no state is reset synchronously inside the effect.
 */
export function useHoldCountdown(holdExpiresAt: string | null | undefined, onExpire?: () => void) {
  const target = holdExpiresAt ? new Date(holdExpiresAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (target === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target) {
        clearInterval(timer);
        onExpireRef.current?.();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const timeLeft = target === null ? 0 : Math.max(0, Math.floor((target - now) / 1000));
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  return {
    timeLeft,
    formatted: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    isExpired: target !== null && timeLeft <= 0,
  };
}
