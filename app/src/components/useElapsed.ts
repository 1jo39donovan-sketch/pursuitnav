import { useEffect, useState } from "react";

/**
 * How long, in ms, `running` has been true (0 while it isn't), ticking twice a
 * second. A new `key` while running starts the count again.
 */
export function useElapsed(running: boolean, key?: unknown): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    // Reset from a callback, not the effect body, so it doesn't render twice.
    const reset = setTimeout(() => setElapsed(0), 0);
    const tick = running ? setInterval(() => setElapsed(Date.now() - start), 500) : undefined;
    return () => {
      clearTimeout(reset);
      clearInterval(tick);
    };
  }, [running, key]);
  return running ? elapsed : 0;
}
