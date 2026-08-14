/** Longest wait before capture proceeds without a confirmed paint. */
const PAINT_DEADLINE_MS = 100;

/**
 * Resolves once the browser has had the opportunity to paint pending DOM
 * changes.
 *
 * Screen capture must not begin while hidden UI is still on screen, and a
 * single animation frame only guarantees that the callback runs *before* the
 * next paint, so two are needed to land after it. Backgrounded tabs may never
 * run an animation frame at all, so the wait is bounded rather than open-ended:
 * a late screenshot is better than a capture action that never returns.
 */
export function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve();
    };

    const deadline = setTimeout(finish, PAINT_DEADLINE_MS);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
}
