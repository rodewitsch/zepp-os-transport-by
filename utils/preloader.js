import * as hmUI from '@zos/ui'
import {
  SCREEN_W,
  SCREEN_H,
  COLOR_BG,
  COLOR_TEXT_DIM,
  FONT_SIZE_SMALL,
} from './constants'

// Zepp OS plays a ~300 ms native transition animation when the app launches or
// a page is pushed. Building the full widget tree inside `build()` runs on the
// same JS/UI thread and competes with that animation, which is what makes heavy
// screens (favourites list, arrivals board) stutter on entry. We paint a plain
// black preloader (with a centered "Загрузка" — no image) instead and build the
// real UI once the animation has settled.
// Tunable: raise it if content still pops in mid-animation on slower devices.
export const TRANSITION_MS = 350

/**
 * Paint a plain black full-screen preloader (just the word "Загрузка", no icon)
 * immediately, then run `render` once the page transition animation has settled.
 * The real content is created after the preloader, so it lands on top; the
 * preloader is then torn down in the same synchronous tick, meaning the swap is
 * batched into a single repaint and never flashes.
 *
 * @param {() => void} render - Builds the heavy UI. Called once, after `delay`.
 * @param {{ delay?: number, label?: string }} [options]
 *   - `delay` ms to wait before rendering (defaults to TRANSITION_MS)
 *   - `label` text shown on the black screen (defaults to "Загрузка")
 * @returns {{ cancel: () => void, finished: boolean }} Call `cancel()` from the
 *   page's `onDestroy` so a fast back-navigation doesn't fire `render` on a
 *   destroyed page. `cancel()` is a no-op once rendering has finished.
 */
export function deferRender(render, options = {}) {
  const delay = options.delay != null ? options.delay : TRANSITION_MS
  const label = options.label != null ? options.label : 'Загрузка'
  const widgets = []

  // Opaque black background so the deferred content never composites over the
  // outgoing page mid-transition.
  const bg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: SCREEN_W,
    h: SCREEN_H,
    color: COLOR_BG,
  })
  widgets.push(bg)

  // Centered caption only (no image).
  widgets.push(hmUI.createWidget(hmUI.widget.TEXT, {
    x: 0,
    y: Math.round((SCREEN_H - FONT_SIZE_SMALL) / 2),
    w: SCREEN_W,
    h: FONT_SIZE_SMALL + 4,
    text: label,
    text_size: FONT_SIZE_SMALL,
    color: COLOR_TEXT_DIM,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
  }))

  let finished = false

  const teardown = () => {
    widgets.forEach((w) => {
      try {
        hmUI.deleteWidget(w)
      } catch (_e) {
        // already gone
      }
    })
    widgets.length = 0
  }

  const finish = () => {
    if (finished) return
    finished = true
    handle.finished = true
    // Content is created after the preloader widgets, so it paints on top; then
    // we drop the preloader underneath it. All in one tick → one repaint.
    // `finally` guarantees the overlay is removed even if `render` throws, so a
    // build error can never leave a full-screen spinner stuck on top.
    try {
      render()
    } finally {
      teardown()
    }
  }

  const timer = setTimeout(finish, delay)

  const handle = {
    finished: false,
    cancel() {
      clearTimeout(timer)
      if (finished) return
      finished = true
      handle.finished = true
      teardown()
    },
  }

  return handle
}
