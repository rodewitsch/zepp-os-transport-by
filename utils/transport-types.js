// ===========================================================
// Transport types (shared model)
//
// Pure module: no @zos imports, so it can be used from any page
// or utility. The app-side service keeps its own copy of the two
// type lists because it is bundled separately from device code.
// ===========================================================

/**
 * Transport type identifiers used by the transport-by.app API.
 * @type {{ bus: number, trolleybus: number, tram: number, minibus: number, metro: number }}
 */
export const TRANSPORT_TYPES = {
  bus: 0,
  trolleybus: 1,
  tram: 2,
  minibus: 3,
  metro: 4,
}

/** All known transport types, in ascending order. */
export const ALL_TRANSPORT_TYPES = [
  TRANSPORT_TYPES.bus,
  TRANSPORT_TYPES.trolleybus,
  TRANSPORT_TYPES.tram,
  TRANSPORT_TYPES.minibus,
  TRANSPORT_TYPES.metro,
]

/**
 * Types shown by default: every type except minibus (historic behaviour).
 * @type {number[]}
 */
export const DEFAULT_TRANSPORT_TYPES = [
  TRANSPORT_TYPES.bus,
  TRANSPORT_TYPES.trolleybus,
  TRANSPORT_TYPES.tram,
  TRANSPORT_TYPES.metro,
]

/** Human-readable names (Russian) — used by the phone Settings App. */
export const TRANSPORT_TYPE_LABELS = {
  [TRANSPORT_TYPES.bus]: 'Автобус',
  [TRANSPORT_TYPES.trolleybus]: 'Троллейбус',
  [TRANSPORT_TYPES.tram]: 'Трамвай',
  [TRANSPORT_TYPES.minibus]: 'Маршрутка',
  [TRANSPORT_TYPES.metro]: 'Метро',
}

/** Route badge colours as device hex integers (watch side). */
export const TRANSPORT_TYPE_COLORS = {
  [TRANSPORT_TYPES.bus]: 0x00c853,
  [TRANSPORT_TYPES.trolleybus]: 0x2196f3,
  [TRANSPORT_TYPES.tram]: 0xf44336,
  [TRANSPORT_TYPES.minibus]: 0xff9800,
  [TRANSPORT_TYPES.metro]: 0x9c27b0,
}

/** Route badge colours as CSS strings (Settings App side). */
export const TRANSPORT_TYPE_COLORS_CSS = {
  [TRANSPORT_TYPES.bus]: '#00c853',
  [TRANSPORT_TYPES.trolleybus]: '#2196f3',
  [TRANSPORT_TYPES.tram]: '#f44336',
  [TRANSPORT_TYPES.minibus]: '#ff9800',
  [TRANSPORT_TYPES.metro]: '#9c27b0',
}

/**
 * Sanitize a stored transport-type selection.
 * Accepts an array of numbers (or numeric strings) and returns the
 * known types in ascending order. An empty/invalid value falls back
 * to DEFAULT_TRANSPORT_TYPES so the UI is never left without types.
 * @param {any} raw
 * @returns {number[]}
 */
export function normalizeTransportTypes(raw) {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch (_e) {
      value = null
    }
  }
  if (!Array.isArray(value)) return DEFAULT_TRANSPORT_TYPES.slice()

  const seen = new Set()
  for (const item of value) {
    const t = Number(item)
    if (ALL_TRANSPORT_TYPES.indexOf(t) !== -1) seen.add(t)
  }
  if (seen.size === 0) return DEFAULT_TRANSPORT_TYPES.slice()

  return ALL_TRANSPORT_TYPES.filter((t) => seen.has(t))
}

/**
 * Whether a transport type is currently enabled.
 * @param {number} type
 * @param {number[]} enabledTypes
 * @returns {boolean}
 */
export function isTransportTypeEnabled(type, enabledTypes) {
  const list = Array.isArray(enabledTypes) ? enabledTypes : DEFAULT_TRANSPORT_TYPES
  const t = type != null ? Number(type) : TRANSPORT_TYPES.bus
  return list.indexOf(t) !== -1
}

/**
 * Build the deduplicated `{ num, type }` badge list for a stop, keeping
 * only the currently enabled transport types.
 * @param {any[]} routeItems - Raw stop.Routes array (items may be wrapped in .result)
 * @param {number[]} enabledTypes
 * @returns {Array<{ num: string, type: number }>}
 */
export function filterRouteItems(routeItems, enabledTypes) {
  if (!Array.isArray(routeItems)) return []
  const seen = new Set()
  const routes = []
  for (const item of routeItems) {
    const r = item && item.result ? item.result : item
    if (!r) continue
    const num = r.Number || ''
    const type = r.Type != null ? Number(r.Type) : TRANSPORT_TYPES.bus
    if (!num || seen.has(num)) continue
    if (!isTransportTypeEnabled(type, enabledTypes)) continue
    seen.add(num)
    routes.push({ num: String(num), type })
  }
  return routes
}
