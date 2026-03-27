import { BaseSideService } from '@zeppos/zml/base-side'

// ===========================================================
// Transport BY – App-Side Service (companion on phone)
//
// This service runs on the paired phone and makes HTTP
// requests to the transport-by.app API. Results are
// forwarded to the device app via the message bridge.
//
// API reverse-engineered from the web app at
// https://transport-by.app/maps
//
// Known endpoint patterns:
//   GET https://transport-by.app/api/v1/stops/search
//        ?q={query}&city={city}&lang={lang}
//   GET https://transport-by.app/api/v1/stops/{stopId}/arrivals
//        ?city={city}&lang={lang}
// ===========================================================

const API_BASE = 'https://transport-by.app/api'
const API_LEGACY_BASE = 'https://transport-by.app/api/v1'
const DEFAULT_LANG = 'ru'

async function fetchJson(url, options = {}) {
  const req = {
    url,
    method: options.method || 'GET',
  }

  if (options.headers) {
    req.headers = options.headers
  }

  if (options.body != null && req.method !== 'GET') {
    req.body = options.body
  }

  const response = await fetch(req)
  const status = response.status || response.statusCode || 200
  // Zepp OS may expose the body under different field names depending on the runtime version.
  const rawBody = response.body != null ? response.body
    : response.text != null ? response.text
    : response.data

  let body = rawBody
  if (typeof rawBody === 'string') {
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      // Some endpoints return newline-delimited JSON objects instead of one JSON document.
      const lines = rawBody
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length > 0) {
        const parsed = []
        for (let i = 0; i < lines.length; i += 1) {
          try {
            parsed.push(JSON.parse(lines[i]))
          } catch (lineErr) {
            // Keep line as-is when parsing fails, so caller can still inspect payload.
            parsed.push(lines[i])
          }
        }
        body = parsed
      } else {
        body = rawBody
      }
    }
  }

  // status 0 means the connection failed at network level (Zepp OS convention).
  if (status === 0 || status >= 400) {
    const errMsg = typeof body === 'string' ? body.slice(0, 120) : `HTTP ${status}`
    throw new Error(`HTTP ${status}: ${errMsg}`)
  }

  return body
}

async function postWithFallback(url, payload) {
  const body = JSON.stringify(payload)
  const browserHeaders = {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://transport-by.app',
    Referer: 'https://transport-by.app/maps',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  }
  const attempts = [
    {
      headers: { ...browserHeaders, 'Content-Type': 'application/json' },
      body,
    },
    {
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      body,
    },
    {
      headers: { ...browserHeaders, 'Content-Type': 'text/plain' },
      body,
    },
    {
      headers: browserHeaders,
      body,
    },
  ]

  let lastError = null
  const errorMessages = []
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      return await fetchJson(url, {
        method: 'POST',
        headers: attempts[i].headers,
        body: attempts[i].body,
      })
    } catch (err) {
      lastError = err
      errorMessages.push(`attempt${i + 1}: ${err && err.message ? err.message : String(err)}`)
      console.log(`POST attempt ${i + 1} failed for ${url}:`, err)
    }
  }

  if (errorMessages.length > 0) {
    throw new Error(`All POST attempts failed (${url}): ${errorMessages.join(' | ')}`)
  }

  throw lastError || new Error(`All POST attempts failed (${url})`)
}

/**
 * Search for bus stops by name or address.
 */
async function searchStops(query, city, lang) {
  const legacyUrl =
    `${API_LEGACY_BASE}/stops/search` +
    `?q=${encodeURIComponent(query)}` +
    `&city=${encodeURIComponent(city || 'minsk')}` +
    `&lang=${lang || DEFAULT_LANG}`

  try {
    const legacyBody = await fetchJson(legacyUrl, { method: 'GET' })
    const legacyStops = normalizeStops(legacyBody)
    if (legacyStops.length > 0) return legacyStops
  } catch (e) {
    console.log('Legacy search endpoint failed:', e)
  }

  const newBody = await postWithFallback(`${API_BASE}/Search`, {
    Text: query,
    BoundaryCircle: {
      Latitude: 53.706462,
      Longitude: 28.943481,
      Radius: 350,
    },
    AdditionalParams: `layers=venue,address&lang=${lang || DEFAULT_LANG}`,
  })

  return normalizeStops(newBody)
}

/**
 * Get arrival predictions for a specific stop.
 */
async function getArrivals(stopId, city, lang) {
  const legacyUrl =
    `${API_LEGACY_BASE}/stops/${encodeURIComponent(stopId)}/arrivals` +
    `?city=${encodeURIComponent(city || 'minsk')}` +
    `&lang=${lang || DEFAULT_LANG}`

  try {
    const legacyBody = await fetchJson(legacyUrl, { method: 'GET' })
    const legacyArrivals = normalizeArrivals(legacyBody, stopId)
    if (legacyArrivals.arrivals.length > 0) return legacyArrivals
  } catch (e) {
    console.log('Legacy arrivals endpoint failed:', e)
  }

  const newBody = await postWithFallback(`${API_BASE}/GetScoreboard`, {
    StopId: String(stopId),
    Types: [1, 2, 3, 4, 5],
  })

  return normalizeArrivals(newBody, stopId)
}

/**
 * Normalize the stops search response into a stable schema:
 * [{ id, name, city, routes: [routeNumber, ...] }]
 */
function normalizeStops(raw) {
  if (!raw) return []

  // Handle array at top level
  const items = Array.isArray(raw)
    ? raw
    : raw.stops || raw.Stops || raw.data || raw.items || []

  return items.slice(0, 20).map((s) => ({
    id: String(s.id || s.Id || s.stopId || s.StopId || s.stop_id || ''),
    name:
      s.name ||
      s.Name ||
      s.stopName ||
      s.StopName ||
      s.stop_name ||
      s.title ||
      s.Title ||
      'Unknown',
    city: s.city || s.cityId || 'minsk',
    routes: Array.isArray(s.routes)
      ? s.routes.map((r) => String(r.number || r.routeNumber || r))
      : Array.isArray(s.Routes)
      ? s.Routes.map((r) => String(r.Number || r.RouteNumber || r))
      : [],
    lat: s.lat || s.latitude || null,
    lon: s.lon || s.lng || s.longitude || null,
  }))
}

/**
 * Normalize the arrivals response into a stable schema:
 * { stopId, stopName, arrivals: [{ route, minutes, direction }] }
 */
function normalizeArrivals(raw, stopId) {
  if (!raw) return { stopId, stopName: '', arrivals: [] }

  // Handle case where fetchJson returned a raw string (e.g. NDJSON that bypassed the parser).
  if (typeof raw === 'string' && raw.length > 0) {
    const lines = raw.split('\n').map(function(l) { return l.trim() }).filter(Boolean)
    const parsed = []
    for (let i = 0; i < lines.length; i += 1) {
      try { parsed.push(JSON.parse(lines[i])) } catch (_e) {}
    }
    if (parsed.length > 0) raw = parsed
  }

  const stopName =
    raw.stopName || raw.StopName || raw.name || raw.Name || raw.stop_name || raw.title || ''

  const baseItems = Array.isArray(raw)
    ? raw
    // Single GetScoreboard entry wrapped in {result:{...}}
    : raw.result ? [raw]
    : raw.arrivals || raw.Arrivals || raw.data || raw.items || raw.vehicles || raw.Scoreboard || []

  // GetScoreboard can return NDJSON lines like {"result": {...}}.
  const items = baseItems
    .map((entry) => (entry && entry.result ? entry.result : entry))
    .filter(Boolean)

  const arrivals = items
    .map((a) => {
      const minutes =
        a.minutes != null
          ? Number(a.minutes)
          : a.minutesLeft != null
          ? Number(a.minutesLeft)
          : a.InfoM && Array.isArray(a.InfoM) && a.InfoM.length > 0
          ? Number(a.InfoM[0])
          : a.Info && Array.isArray(a.Info) && a.Info.length > 0
          ? Math.round(Number(a.Info[0]) / 60)
          : a.eta != null
          ? Math.round(Number(a.eta) / 60)
          : a.time != null
          ? computeMinutesFromTime(a.time)
          : null

      return {
        route: String(
          a.routeNumber ||
            a.RouteNumber ||
            a.route_number ||
            a.number ||
            a.Number ||
            a.route ||
            a.lineNumber ||
            a.LineNumber ||
            ''
        ),
        direction:
          a.direction ||
          a.Direction ||
          a.endStopName ||
          a.EndStop ||
          a.end_stop_name ||
          a.destination ||
          a.Destination ||
          '',
        minutes,
        type:
          a.type ||
          a.Type ||
          a.vehicleType ||
          (a.Type === 1 ? 'bus' : a.Type === 2 ? 'trolleybus' : a.Type === 3 ? 'tram' : 'bus'),
      }
    })
    .filter((a) => a.route && a.minutes != null && a.minutes >= 0)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 5)

  return { stopId, stopName, arrivals }
}

/**
 * Parse a time string like "14:32" into minutes from now.
 */
function computeMinutesFromTime(timeStr) {
  if (!timeStr) return null
  const now = new Date()
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  const targetMinutes = h * 60 + m
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let diff = targetMinutes - nowMinutes
  if (diff < 0) diff += 24 * 60
  return diff
}

AppSideService(
  BaseSideService({
    onInit() {
      console.log('Transport BY side service init')
    },

    async onRequest(req, res) {
      console.log('Transport BY side service request:', req.method)

      try {
        if (req.method === 'SEARCH_STOPS') {
          const { query, city, lang } = req.params || {}
          if (!query) {
            return res(null, { error: 'query is required', stops: [] })
          }
          const stops = await searchStops(query, city, lang)
          res(null, { stops })

        } else if (req.method === 'GET_ARRIVALS') {
          const { stopId, city, lang } = req.params || {}
          if (!stopId) {
            return res(null, { error: 'stopId is required', arrivals: [] })
          }
          const data = await getArrivals(stopId, city, lang)
          res(null, data)

        } else {
          res(null, { error: `Unknown method: ${req.method}` })
        }
      } catch (err) {
        console.log('Transport BY side service error:', err)
        const message = err && err.message ? err.message : String(err)
        res(null, { error: `side:${req && req.method ? req.method : 'UNKNOWN'}: ${message}` })
      }
    },

    onRun() {},

    onDestroy() {
      console.log('Transport BY side service destroyed')
    },
  })
)
