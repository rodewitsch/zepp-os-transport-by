// ===========================================================
// Google Analytics 4 (Measurement Protocol) — device analytics
//
// Sends anonymized usage events from the device app to the
// GA4 property "Bus Stop" (G-B72992K91T).
//
// The watch side has no network access on real devices, so payloads
// are relayed through the app-side service (method SEND_ANALYTICS),
// which POSTs them to the GA4 Measurement Protocol endpoint.
//
// Every page must call setupPageAnalytics(this.request) first: Zeus bundles
// this module into each page separately, so every page has its own bridge,
// queue and screen state — and Zepp OS destroys the previous page on push().
// A bridge injected on the home page therefore does not exist on any other
// screen, and without a per-page bridge those events never leave the watch.
//
// Events are batched (debounced) and sent best-effort:
// network failures are silently ignored — analytics must
// never break the app.
//
// Opt-out: Settings App → «Анонимная статистика».
// ===========================================================

import { LocalStorage } from '@zos/storage'
import { getDeviceInfo } from '@zos/device'
import { loadAnalyticsEnabled } from './storage'

// GA4 stream credentials
const GA_MEASUREMENT_ID = 'G-B72992K91T'
const GA_API_SECRET = 'zbK1rzJtTye8LN8m_PtQ7Q'
const GA_COLLECT_URL =
  'https://www.google-analytics.com/mp/collect' +
  '?measurement_id=' + encodeURIComponent(GA_MEASUREMENT_ID) +
  '&api_secret=' + encodeURIComponent(GA_API_SECRET)

// Local storage keys
const CID_STORAGE_KEY = 'transport_by_ga_cid'
const FIRST_OPEN_STORAGE_KEY = 'transport_by_ga_first_open'

// Flag on the app's globalData — memory that lives as long as the app process.
const LAUNCH_FLAG_KEY = '__gaLaunchReported'

// deviceSource → model, mirroring the `targets` table in app.json. Zepp OS does
// not always report a readable device name, and the screen size alone is
// ambiguous (480×480 is shared by three models), so the numeric source is the
// only reliable key. Keep in sync with app.json when a device is added.
const DEVICE_MODELS = {
  // Amazfit Bip 6 — 390×450, square
  9765120: 'Amazfit Bip 6',
  9765121: 'Amazfit Bip 6',
  10158337: 'Amazfit Bip 6',
  // Amazfit Balance 2 — 480×480, round
  9568512: 'Amazfit Balance 2',
  9568513: 'Amazfit Balance 2',
  9568515: 'Amazfit Balance 2',
  // Amazfit T-Rex 3 — 480×480, round
  8716544: 'Amazfit T-Rex 3',
  8716545: 'Amazfit T-Rex 3',
  8716547: 'Amazfit T-Rex 3',
  // Amazfit T-Rex 3 Pro — 480×480, round
  10551552: 'Amazfit T-Rex 3 Pro',
  10551553: 'Amazfit T-Rex 3 Pro',
  10551555: 'Amazfit T-Rex 3 Pro',
  // Amazfit Active 2 — 466×466, round
  8913152: 'Amazfit Active 2',
  8913153: 'Amazfit Active 2',
  8913155: 'Amazfit Active 2',
  8913159: 'Amazfit Active 2',
  10092800: 'Amazfit Active 2',
  10092801: 'Amazfit Active 2',
  10092803: 'Amazfit Active 2',
  10092807: 'Amazfit Active 2',
  // Amazfit Bip Max — 432×514, square
  11206915: 'Amazfit Bip Max',
}

const MAX_QUEUE_LEN = 20
const MAX_FLUSH_RETRIES = 3
const FLUSH_DELAY_MS = 1500

const storage = new LocalStorage()

let clientId = ''
let deviceContext = null
let cachedUserProps = null
let enabledCache = null
let sessionStarted = false
let queue = []
let flushTimer = null
let flushing = false
let failedFlushes = 0
let bridgeRequest = null
let currentScreen = ''

/**
 * Inject the device → app-side bridge (the page's `this.request`).
 *
 * IMPORTANT: every page must inject its own bridge. Zeus bundles this module
 * into every page separately and Zepp OS destroys the previous page as soon as
 * a new one is pushed, so a bridge injected on the home page does not exist on
 * the arrivals / add-stop pages — their events would be silently dropped on a
 * real watch (the device side has no network access).
 *
 * Prefer {@link setupPageAnalytics}, which also sets the screen name and
 * fires the screen view in one call.
 * @param {(method: string, params: any) => Promise<any>} requestFn
 */
export function setAnalyticsBridge(requestFn) {
  if (typeof requestFn === 'function') bridgeRequest = requestFn
}

/**
 * Remember the screen all subsequent events belong to, so that non screen_view
 * events (arrivals_viewed, stop_added, search, …) can also be broken down by
 * `screen_name` in GA4 instead of landing in "(not set)".
 * @param {string} screenName
 */
export function setCurrentScreen(screenName) {
  currentScreen = screenName || ''
}

/**
 * One-call analytics setup for a page: inject the bridge, remember the screen
 * and fire the screen view. Call it as the first thing in `onInit`/`build`.
 * @param {(method: string, params: any) => Promise<any>} requestFn
 * @param {string} screenName
 * @param {Record<string, any>} [params]
 */
export function setupPageAnalytics(requestFn, screenName, params) {
  setAnalyticsBridge(requestFn)
  screenView(screenName, params)
}

/**
 * Stable pseudo-random client id, persisted in LocalStorage.
 * GA4 uses it to identify unique users across sessions.
 * @returns {string}
 */
function getClientId() {
  if (clientId) return clientId
  try {
    // @ts-ignore
    clientId = storage.getItem(CID_STORAGE_KEY, '') || ''
  } catch (_e) {
    clientId = ''
  }
  if (!clientId) {
    clientId = 'w.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10)
    try {
      storage.setItem(CID_STORAGE_KEY, clientId)
    } catch (_e) { }
  }
  return clientId
}

/**
 * Device / install context, sent as GA4 user properties.
 * @returns {Record<string, any>}
 */
function getDeviceContext() {
  if (deviceContext) return deviceContext
  const ctx = {}

  try {
    const info = getDeviceInfo()
    if (info) {
      if (info.deviceName) ctx.device_name = info.deviceName
      if (info.deviceSource != null) ctx.device_source = String(info.deviceSource)
      if (info.width) ctx.screen_width = info.width
      if (info.height) ctx.screen_height = info.height
      if (info.language) ctx.language = info.language
      if (info.region) ctx.region = info.region
    }
  } catch (_e) { }

  try {
    if (typeof hmSetting !== 'undefined' && typeof hmSetting.getDeviceInfo === 'function') {
      const info = hmSetting.getDeviceInfo()
      if (info) {
        if (!ctx.device_name && info.deviceName) ctx.device_name = info.deviceName
        if (!ctx.device_source && info.deviceSource != null) ctx.device_source = String(info.deviceSource)
        if (!ctx.language && info.language) ctx.language = info.language
        if (!ctx.region && info.region) ctx.region = info.region
      }
    }
  } catch (_e) { }

  try {
    if (typeof hmSetting !== 'undefined' && typeof hmSetting.getLanguage === 'function') {
      ctx.language = ctx.language || hmSetting.getLanguage()
    }
  } catch (_e) { }

  // Country is not directly exposed by Zepp OS; the timezone is the
  // closest proxy. GA4 additionally derives geo from the request IP.
  try {
    if (typeof hmSetting !== 'undefined') {
      if (typeof hmSetting.getTimezone === 'function') {
        ctx.timezone = hmSetting.getTimezone()
      } else if (typeof hmSetting.getTimeZone === 'function') {
        ctx.timezone = hmSetting.getTimeZone()
      }
    }
  } catch (_e) { }

  try {
    if (typeof hmApp !== 'undefined' && typeof hmApp.getPackageInfo === 'function') {
      const pkg = hmApp.getPackageInfo()
      if (pkg && pkg.version && pkg.version.name) ctx.app_version = pkg.version.name
    }
  } catch (_e) { }

  // Distribution channel (see app.json) — community mini program.
  ctx.vender = 'community'

  // Readable model. `deviceSource` is the reliable key (see DEVICE_MODELS); the
  // OS-reported name is not always present, so `device_name` falls back to the
  // mapped model to keep the existing user-scoped GA4 dimension populated.
  const mappedModel = (ctx.device_source && DEVICE_MODELS[ctx.device_source]) || ''
  ctx.device_name = ctx.device_name || mappedModel
  ctx.watch_model = mappedModel || ctx.device_name || ''

  deviceContext = ctx
  return ctx
}

/**
 * @returns {Record<string, { value: any }>} GA4 user_properties object
 */
function buildUserProperties() {
  if (cachedUserProps) return cachedUserProps
  const ctx = getDeviceContext()
  const props = {}
  for (const key in ctx) {
    const value = ctx[key]
    if (value !== '' && value != null) props[key] = { value }
  }
  cachedUserProps = props
  return props
}

/**
 * Cached opt-in flag — avoids a LocalStorage read + JSON parse on every
 * track() call. Refresh explicitly after settings are synced.
 * @returns {boolean}
 */
function isEnabled() {
  if (enabledCache !== null) return enabledCache
  try {
    enabledCache = loadAnalyticsEnabled()
  } catch (_e) {
    enabledCache = true
  }
  return enabledCache
}

/**
 * Re-read the opt-in flag after it may have changed (Settings App sync).
 */
export function refreshAnalyticsEnabled() {
  try {
    enabledCache = loadAnalyticsEnabled()
  } catch (_e) {
    enabledCache = true
  }
}

/**
 * Attach the current screen to the params of an event. An explicit
 * `screen_name` in params always wins.
 * @param {Record<string, any>} [params]
 * @returns {Record<string, any>}
 */
function withScreen(params) {
  const merged = Object.assign({}, params || {})
  if (currentScreen && merged.screen_name == null) merged.screen_name = currentScreen
  return merged
}

/**
 * Queue a GA4 event. Never throws.
 * @param {string} eventName
 * @param {Record<string, any>} [params]
 */
export function track(eventName, params) {
  try {
    if (!isEnabled()) return
    queue.push({ name: eventName, params: withScreen(params) })
    if (queue.length > MAX_QUEUE_LEN) {
      queue.splice(0, queue.length - MAX_QUEUE_LEN)
    }
    scheduleFlush()
  } catch (_e) { }
}

/**
 * Track a screen view.
 * @param {string} screenName
 * @param {Record<string, any>} [params]
 */
export function screenView(screenName, params) {
  setCurrentScreen(screenName)
  track('screen_view', Object.assign({ screen_name: screenName }, params || {}))
}

/**
 * Whether this app process has not reported its launch yet.
 *
 * `initAnalytics()` runs on every home build, and Zepp OS re-builds the home
 * page on every back-navigation (each page also gets its own bundled copy of
 * this module), so a flag inside this module cannot tell a real launch from a
 * page re-build. The app's `globalData` lives exactly as long as the process,
 * so it is the marker: set on the first init, still set when the user comes
 * back from another screen.
 * @returns {boolean}
 */
function isNewLaunch() {
  try {
    const app = getApp()
    const globalData = app && app._options ? app._options.globalData : null
    if (globalData) {
      if (globalData[LAUNCH_FLAG_KEY]) return false
      globalData[LAUNCH_FLAG_KEY] = true
      return true
    }
  } catch (_e) { }

  // No process-wide memory (unexpected) — report the launch as before.
  return true
}

/**
 * Initialize analytics for the current app process:
 * fires `app_first_open` once per install and `app_launch` once per
 * app launch. Safe to call multiple times.
 *
 * NOTE: GA4 rejects `first_open` / `session_start` via Measurement
 * Protocol (NAME_RESERVED), so custom event names are used; GA4 still
 * derives sessions and the first_open metric automatically.
 */
export function initAnalytics() {
  try {
    if (!isEnabled()) return
  } catch (_e) {
    return
  }

  if (sessionStarted) return
  sessionStarted = true

  let isFirstOpen = true
  try {
    // @ts-ignore
    isFirstOpen = storage.getItem(FIRST_OPEN_STORAGE_KEY, '0') !== '1'
  } catch (_e) { }

  const device = getDeviceContext()
  const appVersion = (device.app_version || '').toString()
  // The watch model rides along with the launch events (and with the payload's
  // user properties) — one value per payload instead of a param on every event.
  const launchParams = { app_version: appVersion, watch_model: device.watch_model }

  if (isFirstOpen) {
    track('app_first_open', launchParams)
    try {
      storage.setItem(FIRST_OPEN_STORAGE_KEY, '1')
    } catch (_e) { }
  }

  // Once per process — coming back from the arrivals or add-stop screen
  // re-runs the home page's build() and must not count as a new launch.
  if (isNewLaunch()) {
    track('app_launch', launchParams)
  }

  // First events are the most valuable — send them right away.
  flush()
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flush()
  }, FLUSH_DELAY_MS)
}

/**
 * Send queued events to GA4. Best-effort, never throws.
 *
 * Events that could not be handed over to a transport are put back into the
 * queue instead of being dropped — a later flush of the same page (the
 * debounced one, or the one in the page's `onDestroy`) retries them.
 */
export function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (flushing || queue.length === 0) return
  flushing = true

  const events = queue
  queue = []

  const payload = {
    client_id: getClientId(),
    user_properties: buildUserProperties(),
    events,
  }

  /** @type {Promise<any> | null} */
  let request = null
  try {
    request = send(payload)
  } catch (_e) {
    request = null
  }

  if (!request) {
    requeue(events)
    flushing = false
    return
  }

  request
    .then(() => {
      failedFlushes = 0
    })
    .catch(() => {
      requeue(events)
    })
    .then(() => {
      flushing = false
    })
}

/**
 * Put events back at the head of the queue after a failed hand-off, so a later
 * flush of the same page can deliver them. Gives up after MAX_FLUSH_RETRIES
 * consecutive failures so a permanently broken transport cannot grow the queue
 * without bound.
 * @param {Array<{ name: string, params: Record<string, any> }>} events
 */
function requeue(events) {
  failedFlushes += 1
  if (failedFlushes > MAX_FLUSH_RETRIES) return
  queue = events.concat(queue)
  if (queue.length > MAX_QUEUE_LEN) {
    queue = queue.slice(queue.length - MAX_QUEUE_LEN)
  }
}

/**
 * Hand the payload over to a transport.
 * @param {any} payload
 * @returns {Promise<any> | null} null when no transport is available at all
 */
function send(payload) {
  // Primary transport: relay through the app-side service, which does the
  // HTTP POST. The watch side itself has no network access on real devices.
  if (bridgeRequest) {
    const result = bridgeRequest('SEND_ANALYTICS', { payload })
    if (result && typeof result.then === 'function') return result
    return Promise.resolve()
  }

  // Fallback (simulator without a side service): direct device-side fetch.
  let fetcher = null
  try {
    if (typeof fetch === 'function') {
      fetcher = fetch
    } else if (typeof hmFetch === 'function') {
      fetcher = hmFetch
    }
  } catch (_e) {
    fetcher = null
  }

  if (!fetcher) return null

  return Promise.resolve()
    .then(() =>
      fetcher(GA_COLLECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    )
    .then(() => null)
}
