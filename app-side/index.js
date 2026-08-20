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

// ── Performance helpers ──
// App-side service runs while the phone is connected, so in-memory
// caches here absorb duplicate/back-to-back requests from the watch.
const REQUEST_TIMEOUT_MS = 15000
const ARRIVALS_TTL_MS = 10000 // scoreboard data is fresh enough for ~10s
const SEARCH_TTL_MS = 30000 // repeated identical searches hit the cache
const ROUTE_FETCH_LIMIT = 10 // fetch route details only for first N hits
const ROUTE_CONCURRENCY = 4 // parallel GetStopRouts requests

/** @type {Map<string, { ts: number, data: any }>} */
const arrivalsCache = new Map()
/** @type {Map<string, { ts: number, stops: any[] }>} */
const searchCache = new Map()
/** @type {Map<string, { items: any[], parts: string[] }>} */
const routesCache = new Map()

/**
 * Race a promise against a timeout. The underlying request keeps running
 * in the background, but the caller fails fast instead of hanging.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Compact a stop for the bridge: strip full route objects down to the
 * few fields the watch/Settings UI actually need. Cuts payload size a lot.
 * @param {any} stop
 * @returns {any}
 */
function compactStopForBridge(stop) {
  if (!stop) return stop
  const out = Object.assign({}, stop)
  if (Array.isArray(stop.Routes)) {
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
    out.Routes = routes
  }
  return out
}

/**
 * Fetch and compact routes for a stop. Cached forever in memory —
 * route sets change rarely, and this avoids refetching on every search.
 * @param {string} stopId
 * @returns {Promise<{ items: any[], parts: string[] }>}
 */
async function getStopRoutesCached(stopId) {
  const sid = String(stopId)
  const hit = routesCache.get(sid)
  if (hit) return hit

  const routesRaw = await postWithFallback(`${API_BASE}/GetStopRouts`, {
    StopId: sid,
    Types: [0, 1, 2, 4],
  })

  const allItems = Array.isArray(routesRaw) ? routesRaw : []
  const seen = new Set()
  const items = []
  const parts = []
  for (const item of allItems) {
    const r = item.result || item
    if (!r || !r.Number || r.Type === 3) continue
    const num = String(r.Number)
    if (seen.has(num)) continue
    seen.add(num)
    items.push({
      Number: r.Number,
      Type: r.Type != null ? r.Type : 0,
      FinishStopName: r.FinishStopName || '',
    })
    if (r.FinishStopName) parts.push(r.Number + '→' + r.FinishStopName)
  }

  const entry = { items, parts }
  routesCache.set(sid, entry)
  return entry
}

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

  const response = await withTimeout(fetch(req), REQUEST_TIMEOUT_MS)
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
 * Route details are fetched in parallel (bounded concurrency) and only
 * for the first ROUTE_FETCH_LIMIT hits — the old sequential version took
 * seconds per result.
 */
async function searchStops(query, lang) {
  const cacheKey = `${lang || DEFAULT_LANG}:${query}`
  const cached = searchCache.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.ts < SEARCH_TTL_MS) return cached.stops

  const response = await postWithFallback(`${API_BASE}/Search`, {
    Text: query,
    BoundaryCircle: {
      Latitude: 53.706462,
      Longitude: 28.943481,
      Radius: 99999,
    },
    AdditionalParams: `layers=venue,address&lang=${lang || DEFAULT_LANG}`,
  })

  const stopsRaw = response != null && typeof response === 'object' ? response.Stops : null
  const processedStops = Array.isArray(stopsRaw) ? stopsRaw : [];

  // Default empty route data (keeps bridge payload small for long results)
  for (const stop of processedStops) {
    stop.RoutesSummary = []
    stop.Routes = []
  }

  // Fetch route details for the top hits only, in parallel
  const targets = processedStops.slice(0, ROUTE_FETCH_LIMIT)
  let cursor = 0
  const workerCount = Math.min(ROUTE_CONCURRENCY, targets.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < targets.length) {
      const stop = targets[cursor++]
      try {
        const { items, parts } = await getStopRoutesCached(String(stop.StopId))
        stop.RoutesSummary = parts
        stop.Routes = items
      } catch (e) {
        console.log('GetStopRouts failed for', stop.StopId, e)
        stop.RoutesSummary = []
        stop.Routes = []
      }
    }
  })
  await Promise.all(workers)

  searchCache.set(cacheKey, { ts: Date.now(), stops: processedStops })
  return processedStops;
}

/**
 * Get arrival predictions for a specific stop.
 * Short TTL cache absorbs duplicate refresh bursts from the watch.
 */
async function getArrivals(stopId, lang) {
  const sid = String(stopId)
  const cached = arrivalsCache.get(sid)
  const now = Date.now()
  if (cached && now - cached.ts < ARRIVALS_TTL_MS) return cached.data

  const newBody = await postWithFallback(`${API_BASE}/GetScoreboard`, {
    StopId: sid,
    Types: [0, 1, 2, 4],
  })

  const data = normalizeArrivals(newBody, sid)
  arrivalsCache.set(sid, { ts: Date.now(), data })
  return data;
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
    .filter((a) => a.route && a.minutes != null && a.minutes < 60 && a.type !== 3)

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

        // Handle route summary requests from the Settings App
        if (key === 'routeSummaryRequest' && newValue) {
          try {
            const { stopId, favIndex } = JSON.parse(newValue)
            const { parts } = await getStopRoutesCached(String(stopId))

            // Update the favorite's RoutesSummary and re-save
            const raw = settings.settingsStorage.getItem('favorites')
            const favs = raw ? JSON.parse(raw) : []
            if (favs[favIndex]) {
              favs[favIndex].RoutesSummary = parts
              settings.settingsStorage.setItem('favorites', JSON.stringify(favs))
            }
          } catch (e) {
            console.log('Route summary fetch error:', e)
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
            const favorites = (raw ? JSON.parse(raw) : []).map(compactStopForBridge)
            const refreshInterval = parseInt(settings.settingsStorage.getItem('refreshInterval') || '30', 10) || 30
            const aeRaw = settings.settingsStorage.getItem('analyticsEnabled')
            const analyticsEnabled = aeRaw === null ? true : aeRaw === 'true'
            res(null, { favorites, refreshInterval, analyticsEnabled })
          } catch (e) {
            res(null, { favorites: [], refreshInterval: 30 })
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
