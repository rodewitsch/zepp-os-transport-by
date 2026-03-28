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
//   POST https://transport-by.app/api/Search
//   POST https://transport-by.app/api/GetScoreboard
// ===========================================================

const API_BASE = 'https://transport-by.app/api'
const DEFAULT_LANG = 'ru'

function isJSON(data) {
  try {
    JSON.parse(data);
    return true;
  } catch (e) {
    return false;
  }
}

function ndjsonToJson(ndjsonString) {
  // Split the input by newlines and filter out empty lines
  const lines = ndjsonString.trim().split('\n').filter(line => line.trim());

  // Parse each line as JSON and collect in an array
  const jsonArray = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.error('Error parsing line:', line);
      return null;
    }
  }).filter(item => item !== null);

  return jsonArray;
}


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

  // Zepp OS fetch responses vary by runtime version.


  let body;

  if (isJSON(await response.text())) {
    body = await response.json();
  } else {
    body = await response.text();
    // If the response looks like NDJSON, try to parse it.
    if (body && body.includes('\n') && body.trim().startsWith('{')) {
      const parsed = ndjsonToJson(body)
      if (parsed.length > 0) {
        body = parsed
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
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  };

  return fetchJson(url, {
    method: 'POST',
    headers: browserHeaders,
    body,
  })
}

/**
 * Search for bus stops by name or address.
 */
async function searchStops(query, city, lang) {

  const response = await fetchJson(`${API_BASE}/Search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Text: query,
      BoundaryCircle: {
        Latitude: 53.706462,
        Longitude: 28.943481,
        Radius: 99999,
      },
      AdditionalParams: `layers=venue,address&lang=${lang || DEFAULT_LANG}`,
    }),
  });

  return response.Stops;
}

/**
 * Get arrival predictions for a specific stop.
 */
async function getArrivals(stopId, city, lang) {
  console.log(`Fetching arrivals for stopId=${stopId}, city=${city}, lang=${lang}`)
  const newBody = await fetchJson(`${API_BASE}/GetScoreboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      StopId: String(stopId),
    }),
  })

  console.log('Raw arrivals response:', newBody)

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

  // Return up to 50 results to include multiple stops with same name (opposite road sides)
  return items.slice(0, 50).map((s) => ({
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
    const lines = raw.split('\n').map(function (l) { return l.trim() }).filter(Boolean)
    const parsed = []
    for (let i = 0; i < lines.length; i += 1) {
      try { parsed.push(JSON.parse(lines[i])) } catch (_e) { }
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
          console.log(stops);
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

    onRun() { },

    onDestroy() {
      console.log('Transport BY side service destroyed')
    },
  })
)
