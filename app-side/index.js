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

  // Read body only once; device runtimes can fail on multiple reads.
  let rawBody = ''
  try {
    rawBody = await response.text()
  } catch (_e) {
    rawBody = ''
  }

  let body = rawBody
  if (rawBody && isJSON(rawBody)) {
    body = JSON.parse(rawBody)
  } else if (rawBody && rawBody.includes('\n') && rawBody.trim().startsWith('{')) {
    // If the response looks like NDJSON, try to parse it.
    const parsed = ndjsonToJson(rawBody)
    if (parsed.length > 0) {
      body = parsed
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
async function searchStops(query, lang) {
  const response = await postWithFallback(`${API_BASE}/Search`, {
    Text: query,
    BoundaryCircle: {
      Latitude: 53.706462,
      Longitude: 28.943481,
      Radius: 99999,
    },
    AdditionalParams: `layers=venue,address&lang=${lang || DEFAULT_LANG}`,
  })

  const stops = response != null && typeof response === 'object' ? response.Stops : null
  const processedStops = Array.isArray(stops) ? stops : [];

  for (const stop of processedStops) {
    try {
      const routesRaw = await postWithFallback(`${API_BASE}/GetStopRouts`, {
        StopId: String(stop.StopId),
      });

      const items = Array.isArray(routesRaw) ? routesRaw : []
      // Build a compact summary: "91→Веснинка  100→Минск-Южный"
      const seen = new Set()
      const parts = []
      for (const item of items) {
        const r = item.result || item
        if (r.Number && r.FinishStopName && !seen.has(r.Number)) {
          seen.add(r.Number)
          parts.push(r.Number + '→' + r.FinishStopName)
        }
      }
      stop.RoutesSummary = parts.join('  ')
      stop.Routes = items
    } catch (e) {
      console.log('GetStopRouts failed for', stop.StopId, e)
      stop.RoutesSummary = ''
      stop.Routes = []
    }
  }

  return processedStops;
}

/**
 * Get arrival predictions for a specific stop.
 */
async function getArrivals(stopId, lang) {
  console.log(`Fetching arrivals for stopId=${stopId}, lang=${lang}`)
  const newBody = await postWithFallback(`${API_BASE}/GetScoreboard`, {
    StopId: String(stopId),
  })

  return normalizeArrivals(newBody, stopId);
}

/**
 * Normalize the arrivals response into a stable schema:
 * { stopId, arrivals: [{ route, minutes, direction }] }
 */
function normalizeArrivals(raw, stopId) {
  if (!raw) return { stopId, arrivals: [] }

  function normalizeArrivalText(value) {
    if (value == null) return ''

    return String(value)
      // Normalize different quote marks to plain apostrophe for font/layout safety.
      .replace(/["“”„‟«»]/g, "'")
      // Collapse duplicate apostrophes: Карастояновой'' -> Карастояновой'
      .replace(/'{2,}/g, "'")
      .trim()
  }

  // Handle case where fetchJson returned a raw string (e.g. NDJSON that bypassed the parser).
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      raw = ndjsonToJson(raw)
    } catch (e) {
      console.log('Error parsing NDJSON arrivals:', e)
      return { stopId, arrivals: [] }
    }
  }

  const arrivals = raw
    .map((a) => {
      return {
        route: normalizeArrivalText(a.result.Number),
        minutes: Number(a.result.InfoM[0]),
        direction: normalizeArrivalText(a.result.EndStop),
        type: a.result.Type,
      }
    })
    .sort((a, b) => a.minutes - b.minutes)
    .filter((a) => a.route && a.minutes != null && a.minutes < 60)

  console.log(`Normalized arrivals for stopId=${stopId}:`, arrivals)
  return { stopId, arrivals }
}

AppSideService(
  BaseSideService({
    onInit() {
      settings.settingsStorage.addListener('change', async ({ key, newValue }) => {
        // Handle search requests from the Settings App
        if (key === 'searchRequest' && newValue) {
          try {
            const { query } = JSON.parse(newValue)
            const stops = await searchStops(query, 'ru')
            settings.settingsStorage.setItem('searchResults', JSON.stringify(stops))
          } catch (e) {
            console.log('Settings search error:', e)
            settings.settingsStorage.setItem('searchResults', JSON.stringify([]))
          } finally {
            settings.settingsStorage.setItem('searching', 'false')
          }
        }
      })
    },

    async onRequest(req, res) {
      try {
        if (req.method === 'SEARCH_STOPS') {
          const { query, lang } = req.params || {}
          if (!query) {
            return res(null, { error: 'query is required', stops: [] })
          }
          const stops = await searchStops(query, lang)
          console.log(stops);
          res(null, { stops })

        } else if (req.method === 'GET_ARRIVALS') {
          const { stopId, lang } = req.params || {}
          if (!stopId) {
            return res(null, { error: 'stopId is required', arrivals: [] })
          }
          const data = await getArrivals(stopId, lang)
          res(null, data)

        } else if (req.method === 'GET_FAVORITES') {
          // Return favorites from settingsStorage (set by Settings App)
          try {
            const raw = settings.settingsStorage.getItem('favorites')
            const favorites = raw ? JSON.parse(raw) : []
            res(null, { favorites })
          } catch (e) {
            res(null, { favorites: [] })
          }

        } else if (req.method === 'SAVE_FAVORITES') {
          // Device → settingsStorage sync (so Settings App sees device changes)
          const { favorites } = req.params || {}
          settings.settingsStorage.setItem('favorites', JSON.stringify(favorites || []))
          res(null, { ok: true })

        } else {
          res(null, { error: `Unknown method: ${req.method}` })
        }
      } catch (err) {
        const message = err && err.message ? err.message : String(err)
        res(null, { error: `side:${req && req.method ? req.method : 'UNKNOWN'}: ${message}` })
      }
    },
  })
)
