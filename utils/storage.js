import { LocalStorage } from '@zos/storage'
import { STORAGE_KEY_FAVORITES, STORAGE_KEY_SETTINGS } from './constants'

const storage = new LocalStorage()

/**
 * @typedef {Object} Stop
 * @property {string} StopId
 * @property {string} StopName
 * @property {string} [City]
 * @property {string} [Address]
 * @property {any[]} [Routes]
 */

/**
 * Load saved favorite stops from local storage.
 * @returns {Array<Stop>} Array of favorite stop objects
 */
export function loadFavorites() {
  // @ts-ignore
  return (storage.getItem(STORAGE_KEY_FAVORITES, []));
}

/**
 * Shrink a stop's Routes to the few fields the UI actually renders
 * ({Number, Type, FinishStopName}). Keeps LocalStorage and bridge
 * payloads small, which speeds up every save/load round-trip.
 * @param {Stop} stop
 * @returns {Stop}
 */
function compactStop(stop) {
  if (!stop || !Array.isArray(stop.Routes) || stop.Routes.length === 0) {
    return stop ? Object.assign({}, stop) : stop
  }
  const seen = new Set()
  const routes = []
  for (const item of stop.Routes) {
    const r = item && item.result ? item.result : item
    if (!r || !r.Number || r.Type === 3) continue
    const num = String(r.Number)
    if (seen.has(num)) continue
    seen.add(num)
    routes.push({
      Number: r.Number,
      Type: r.Type != null ? r.Type : 0,
      FinishStopName: r.FinishStopName || '',
    })
  }
  return Object.assign({}, stop, { Routes: routes })
}

/**
 * Save favorite stops to local storage.
 * @param {Array<Stop>} favorites
 */
export function saveFavorites(favorites) {
  storage.setItem(STORAGE_KEY_FAVORITES, (favorites || []).map(compactStop))
}

/**
 * Add a stop to favorites.
 * @param {Stop} stop - { StopId, StopName, City, Routes }
 * @returns {Array<Stop>} Updated favorites list
 */
export function addFavorite(stop) {
  const favorites = loadFavorites()
  const exists = favorites.some((f) => f.StopId === stop.StopId && f.StopName === stop.StopName)
  if (!exists) {
    favorites.push(compactStop(stop))
    saveFavorites(favorites)
  }
  return favorites
}

/**
 * Remove a stop from favorites by index.
 * @param {number} index
 * @returns {Array<Stop>} Updated favorites list
 */
export function removeFavorite(index) {
  const favorites = loadFavorites()
  favorites.splice(index, 1)
  saveFavorites(favorites)
  return favorites
}

/**
 * Load app settings.
 * @returns {{ language: string, darkMode: boolean, refreshInterval: number }} Settings object
 */
export function loadSettings() {
  // @ts-ignore
  return storage.getItem(STORAGE_KEY_SETTINGS, {
    language: 'ru',
    darkMode: true,
    refreshInterval: 30,
  });
}

/**
 * Save app settings.
 * @param {{ language: string, darkMode?: boolean, refreshInterval?: number }} settings
 */
export function saveSettings(settings) {
  storage.setItem(STORAGE_KEY_SETTINGS, settings)
}

/**
 * Load refresh interval (seconds) from settings.
 * @returns {number}
 */
export function loadRefreshInterval() {
  const s = loadSettings()
  return s.refreshInterval || 30
}

/**
 * Save refresh interval (seconds) to settings.
 * @param {number} seconds
 */
export function saveRefreshInterval(seconds) {
  const s = loadSettings()
  s.refreshInterval = seconds
  saveSettings(s)
}

/**
 * Load analytics opt-in flag. Enabled by default.
 * @returns {boolean}
 */
export function loadAnalyticsEnabled() {
  const s = loadSettings()
  return s.analyticsEnabled !== false
}

/**
 * Save analytics opt-in flag.
 * @param {boolean} enabled
 */
export function saveAnalyticsEnabled(enabled) {
  const s = loadSettings()
  s.analyticsEnabled = !!enabled
  saveSettings(s)
}

// ── Arrivals snapshot cache ──
// Persists the last known arrivals per stop so the arrivals page can
// paint instantly (no spinner) and refresh silently afterwards.
const STORAGE_KEY_ARRIVALS_CACHE = 'transport_by_arrivals_cache'
const ARRIVALS_CACHE_MAX_STOPS = 8

/**
 * Persist a snapshot of arrivals for instant display next time.
 * @param {string} stopId
 * @param {Array<any>} arrivals
 * @param {number} updatedAt
 */
export function saveArrivalsCache(stopId, arrivals, updatedAt) {
  const sid = String(stopId)
  let cache = {}
  try {
    // @ts-ignore
    cache = storage.getItem(STORAGE_KEY_ARRIVALS_CACHE, {}) || {}
  } catch (_e) {
    cache = {}
  }

  cache[sid] = { arrivals, ts: updatedAt || Date.now() }

  // Keep only the most recently updated stops to bound storage size
  const keys = Object.keys(cache)
  if (keys.length > ARRIVALS_CACHE_MAX_STOPS) {
    keys.sort((a, b) => (cache[b].ts || 0) - (cache[a].ts || 0))
    const trimmed = {}
    for (let i = 0; i < ARRIVALS_CACHE_MAX_STOPS; i++) {
      trimmed[keys[i]] = cache[keys[i]]
    }
    cache = trimmed
  }

  try {
    storage.setItem(STORAGE_KEY_ARRIVALS_CACHE, cache)
  } catch (_e) { }
}

/**
 * Load a fresh arrivals snapshot for a stop.
 * @param {string} stopId
 * @param {number} maxAgeMs - maximum age of the snapshot (ms)
 * @returns {{ arrivals: any[], updatedAt: number } | null}
 */
export function loadArrivalsCache(stopId, maxAgeMs) {
  try {
    // @ts-ignore
    const cache = storage.getItem(STORAGE_KEY_ARRIVALS_CACHE, {}) || {}
    const entry = cache[String(stopId)]
    if (!entry || !Array.isArray(entry.arrivals)) return null
    if (Date.now() - (entry.ts || 0) > (maxAgeMs || 60000)) return null
    return { arrivals: entry.arrivals, updatedAt: entry.ts }
  } catch (_e) {
    return null
  }
}
