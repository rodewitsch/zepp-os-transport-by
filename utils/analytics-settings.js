// ===========================================================
// Google Analytics 4 — phone Settings App analytics
//
// The Settings App runs on the phone inside the Zepp app and has no
// bridge to the app-side service, so events are written to
// settingsStorage and relayed to GA4 by app-side/index.js.
//
// The app-side attributes them to the same client_id as the watch
// (it remembers it from the watch payloads), so watch and phone usage
// of one installation count as one user.
//
// Opt-out: Settings → «Анонимная статистика» — nothing is queued while
// the flag is off.
// ===========================================================

/** settingsStorage key the app-side service listens on. */
export const SETTINGS_EVENTS_KEY = 'analyticsEvents'

/** Settings key holding the analytics opt-in flag (shared with the watch). */
const ENABLED_KEY = 'analyticsEnabled'

/** @type {any} */
let settingsStorageRef = null
let currentScreen = ''
let lastScreen = ''
let phoneContext = null

/**
 * Params describing the phone the Settings App runs in. The webview user agent
 * is the only source available here (the watch's device info is not), so the
 * model/platform are parsed out of it once and reused.
 * @returns {Record<string, string>}
 */
function readPhoneContext() {
  if (phoneContext) return phoneContext
  const ctx = {}
  try {
    const ua = typeof navigator !== 'undefined' && navigator.userAgent ? String(navigator.userAgent) : ''
    if (ua) {
      ctx.phone_ua = ua.slice(0, 100)
      const android = /Android[ /]([\d.]+)/.exec(ua)
      if (android) {
        ctx.phone_platform = 'Android ' + android[1]
        const model = /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/.exec(ua)
        if (model) ctx.phone_model = model[1].trim()
      } else if (/iPhone|iPad|iPod/.test(ua)) {
        const ios = /OS (\d+)[._](\d+)/.exec(ua)
        ctx.phone_platform = 'iOS' + (ios ? ' ' + ios[1] + '.' + ios[2] : '')
        ctx.phone_model = /iPad/.test(ua) ? 'iPad' : /iPod/.test(ua) ? 'iPod' : 'iPhone'
      } else if (/Windows/.test(ua)) {
        ctx.phone_platform = 'Windows'
      } else if (/Macintosh/.test(ua)) {
        ctx.phone_platform = 'macOS'
      }
    }
  } catch (_e) { }
  phoneContext = ctx
  return ctx
}

/**
 * Bind the Settings App storage (`props.settingsStorage`).
 * Safe to call on every `build()`.
 * @param {any} settingsStorage
 */
export function initSettingsAnalytics(settingsStorage) {
  settingsStorageRef = settingsStorage || null
}

/**
 * @returns {boolean} false when the user turned anonymous stats off
 */
function isEnabled() {
  if (!settingsStorageRef) return false
  try {
    const raw = settingsStorageRef.getItem(ENABLED_KEY)
    return raw === null ? true : raw === 'true'
  } catch (_e) {
    return true
  }
}

/**
 * Attach the current screen to an event's params. An explicit `screen_name`
 * always wins.
 * @param {Record<string, any>} [params]
 * @returns {Record<string, any>}
 */
function withScreen(params) {
  const merged = Object.assign({}, params || {})
  if (currentScreen && merged.screen_name == null) merged.screen_name = currentScreen
  return merged
}

/**
 * Queue one event for the app-side relay. Never throws.
 * @param {string} eventName
 * @param {Record<string, any>} [params]
 */
export function trackSettingsEvent(eventName, params) {
  try {
    if (!isEnabled()) return
    writeBatch([{ name: eventName, params: withScreen(params) }])
  } catch (_e) { }
}

/**
 * Screen view for a Settings App view. The page re-renders on every storage
 * change, so repeated builds of the same view are not logged again. The phone
 * model/platform ride along with the screen view only.
 * @param {string} screenName
 * @param {Record<string, any>} [params]
 */
export function settingsScreenView(screenName, params) {
  if (!screenName || screenName === lastScreen) return
  lastScreen = screenName
  currentScreen = screenName
  trackSettingsEvent('screen_view', Object.assign(
    { screen_name: screenName },
    readPhoneContext(),
    params || {}
  ))
}

/**
 * Hand a batch of events to the app-side service. Every write carries a fresh
 * id, so the storage `change` listener fires even for identical payloads, and
 * the service can skip batches it has already sent.
 * @param {Array<{ name: string, params: Record<string, any> }>} events
 */
function writeBatch(events) {
  if (!settingsStorageRef || events.length === 0) return
  const batch = {
    id: Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 8),
    events,
  }
  settingsStorageRef.setItem(SETTINGS_EVENTS_KEY, JSON.stringify(batch))
}
