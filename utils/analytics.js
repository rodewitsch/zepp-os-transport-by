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

const MAX_QUEUE_LEN = 20
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
let bridgeRequest = null

/**
 * Inject the device → app-side bridge (the page's `this.request`).
 * Must be called once from a page before analytics init, e.g. from
 * the home page build():
 *   setAnalyticsBridge((method, params) => this.request({ method, params }))
 * @param {(method: string, params: any) => Promise<any>} requestFn
 */
export function setAnalyticsBridge(requestFn) {
  if (typeof requestFn === 'function') bridgeRequest = requestFn
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
 * Queue a GA4 event. Never throws.
 * @param {string} eventName
 * @param {Record<string, any>} [params]
 */
export function track(eventName, params) {
  try {
    if (!isEnabled()) return
    queue.push({ name: eventName, params: params || {} })
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
  track('screen_view', Object.assign({ screen_name: screenName }, params || {}))
}

/**
 * Initialize analytics for the current app process:
 * fires `app_first_open` once per install and `app_launch`
 * on every app launch. Safe to call multiple times.
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

  const appVersion = (getDeviceContext().app_version || '').toString()

  if (isFirstOpen) {
    track('app_first_open', { app_version: appVersion })
    try {
      storage.setItem(FIRST_OPEN_STORAGE_KEY, '1')
    } catch (_e) { }
  }

  track('app_launch', { app_version: appVersion })

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

  send(payload).finally(() => {
    flushing = false
  })
}

/**
 * @param {any} payload
 * @returns {Promise<any>}
 */
function send(payload) {
  // Primary transport: relay through the app-side service, which does the
  // HTTP POST. The watch side itself has no network access on real devices.
  if (bridgeRequest) {
    try {
      const result = bridgeRequest('SEND_ANALYTICS', { payload })
      if (result && typeof result.catch === 'function') result.catch(() => {})
      return Promise.resolve()
    } catch (_e) { }
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

  if (!fetcher) return Promise.resolve()

  return Promise.resolve()
    .then(() =>
      fetcher(GA_COLLECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    )
    .catch(() => { /* analytics is best-effort */ })
}
