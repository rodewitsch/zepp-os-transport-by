// Minimum amount of time a loading state should remain visible. If a request
// resolves faster than this, we still hold the "Загрузка" screen for the rest
// of the window so it never flashes for a few ms.
export const MIN_LOAD_MS = 600

/**
 * Resolve a promise that guarantees `MIN_LOAD_MS` elapsed since `startedAtMs`.
 * If enough time already passed (slow request) it resolves immediately.
 * @param {number} startedAtMs - timestamp when the loading state was shown.
 * @param {number} [minMs] - minimum visible time (defaults to MIN_LOAD_MS).
 * @returns {Promise<void>}
 */
export function minHoldMs(startedAtMs, minMs = MIN_LOAD_MS) {
  const wait = Math.max(0, minMs - (Date.now() - startedAtMs))
  return new Promise((resolve) => {
    if (wait > 0) {
      setTimeout(resolve, wait)
    } else {
      resolve()
    }
  })
}
