import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import {
  setPageBrightTime,
  resetPageBrightTime,
  pausePalmScreenOff,
  resetPalmScreenOff,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from '@zos/display'
import { BasePage } from '@zeppos/zml/base-page'
import {
  SCREEN_W,
  SCREEN_H,
  MARGIN,
  CONTENT_W,
  HEADER_TOP,
  BOTTOM_PAD,
  COLOR_PRIMARY,
  COLOR_TEXT,
  COLOR_TEXT_DIM,
  COLOR_CARD_BG,
  COLOR_WARNING,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  IS_ROUND,
} from '../../utils/constants'
import { createSpinner } from '../../utils/spinner'
import { loadRefreshInterval, loadArrivalsCache, saveArrivalsCache } from '../../utils/storage'
import { screenView, track } from '../../utils/analytics'

const logger = Logger.getLogger('arrivals')

// Layout
const ROW_H = 72
const ROW_GAP = 4
const FOOTER_INFO_H = 28
const DEFAULT_UPDATE_INTERVAL_MS = 30000
const BRIGHT_TIME_MS = 60 * 60 * 1000

const TRANSPORT_TYPES = {
  bus: 0,
  trolleybus: 1,
  tram: 2,
  minibus: 3,
  metro: 4,
}

// Route type color map
const TYPE_COLORS = {
  [TRANSPORT_TYPES.bus]: 0x00c853,
  [TRANSPORT_TYPES.trolleybus]: 0x2196f3,
  [TRANSPORT_TYPES.tram]: 0xf44336,
  [TRANSPORT_TYPES.minibus]: 0xff9800,
  [TRANSPORT_TYPES.metro]: 0x9c27b0,
}

/**
 * Get the color associated with a transport type.
 * @param {number} type - Transport type identifier
 * @returns {number} Color in hex format (e.g. 0x00c853)
 */
function getRouteColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS[TRANSPORT_TYPES.bus]
}

/**
 * Pad a number with leading zeros to ensure it has at least 2 digits.
 * @param {number} value
 * @returns {string} Padded string
 */
function pad2(value) {
  return String(value).padStart(2, '0')
}

/**
 * Format a Date object into a time string "HH:MM:SS".
 * @param {Date} date
 * @returns {string} Formatted time string
 */
function formatUpdatedTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

Page(
  BasePage({
    state: {
      /** @type {import('../../utils/storage').Stop | null} */
      stop: null,
      index: -1,
      loading: false,
      /** @type {string | null} */
      error: null,
      /** @type {Array<any>} */
      arrivals: [],
      stopName: '',
      /** @type {Date | null} */
      lastUpdated: null,
      /** @type {number | null} */
      arrivalsTimer: null,
      /** @type {any | null} */
      footerTimeText: null,
      /** @type {any | null} */
      spinner: null,
      /** @type {any[]} */
      contentWidgets: [],
      /** @type {any[]} Row widget refs for in-place updates */
      rows: [],
      /** @type {string | null} Snapshot of last rendered arrivals */
      lastSnapshot: null,
      /** @type {number} Timestamp of last cache write (throttle storage writes) */
      lastCacheSave: 0,
    },

    onInit(paramsStr) {
      logger.log('Arrivals page init, params:', paramsStr)
      try {
        setPageBrightTime({ brightTime: BRIGHT_TIME_MS })
      } catch (/** @type {any} */ e) {
        logger.log('Failed to set bright screen:', e)
      }
      try {
        pausePalmScreenOff({ duration: 0 })
      } catch (/** @type {any} */ e) {
        logger.log('Failed to pause palm screen off:', e)
      }
      try {
        pauseDropWristScreenOff({ duration: 0 })
      } catch (/** @type {any} */ e) {
        logger.log('Failed to pause drop wrist screen off:', e)
      }

      try {
        const params = JSON.parse(paramsStr || '{}')
        this.state.stop = params.stop || null
        this.state.index = params.index != null ? params.index : -1
      } catch (/** @type {any} */ e) {
        logger.log('Failed to parse params:', e)
      }

      if (this.state.stop) {
        screenView('arrivals', {
          stop_id: String(this.state.stop.StopId || ''),
          stop_name: this.state.stop.StopName || '',
        })
      }
    },

    build() {
      hmUI.setStatusBarVisible(false);

      if (this.state.stop) {
        // Instant first paint from a fresh snapshot (≤60s), then silent refresh
        const cached = loadArrivalsCache(String(this.state.stop.StopId || ''), 60000)
        if (cached && cached.arrivals.length > 0) {
          this.state.arrivals = cached.arrivals
          this.state.lastUpdated = new Date(cached.updatedAt)
          this.state.loading = false
          this.state.error = null
          this.state.lastSnapshot = 'OK|' + this.arrivalsSnapshot()
          this.renderContent()
          track('arrivals_viewed', {
            stop_id: String(this.state.stop.StopId || ''),
            stop_name: this.state.stop.StopName || '',
            arrivals_count: this.state.arrivals.length,
          })
          this.fetchArrivals(true)
        } else {
          this.fetchArrivals(false)
        }
        this.startAutoRefresh()
      } else {
        this.state.error = 'No stop selected'
        this.renderContent()
      }
    },

    /**
     * @param {number} type
     * @param {any} props
     * @returns {any}
     */
    addWidget(type, props) {
      const w = hmUI.createWidget(type, props)
      this.state.contentWidgets.push(w)
      return w
    },

    deleteRowWidgets(row) {
      try { hmUI.deleteWidget(row.bg) } catch (e) { }
      try { hmUI.deleteWidget(row.badgeRect) } catch (e) { }
      try { hmUI.deleteWidget(row.routeText) } catch (e) { }
      try { hmUI.deleteWidget(row.dirText) } catch (e) { }
      try { hmUI.deleteWidget(row.minText) } catch (e) { }
    },

    clearContentWidgets() {
      this.state.rows.forEach(r => this.deleteRowWidgets(r))
      this.state.rows = []
      this.state.contentWidgets.forEach(w => {
        try { hmUI.deleteWidget(w) } catch (e) { }
      })
      this.state.contentWidgets = []
    },

    startAutoRefresh() {
      this.stopAutoRefresh()
      const intervalMs = (loadRefreshInterval() || 30) * 1000
      this.state.arrivalsTimer = setInterval(() => {
        this.fetchArrivals(true)
      }, intervalMs || DEFAULT_UPDATE_INTERVAL_MS)
    },

    stopAutoRefresh() {
      if (this.state.arrivalsTimer) {
        clearInterval(this.state.arrivalsTimer)
        this.state.arrivalsTimer = null
      }
    },

    renderFooterTimeWidget() {
      if (this.state.footerTimeText) return

      this.state.footerTimeText = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: HEADER_TOP,
        w: SCREEN_W,
        h: FOOTER_INFO_H,
        text: 'Обновлено: --:--:--',
        text_size: FONT_SIZE_TINY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderContent() {
      // Stop any active spinner
      if (this.state.spinner) {
        this.state.spinner.stop()
        this.state.spinner = null
      }

      // Delete all previously created content widgets
      this.clearContentWidgets()

      if (this.state.loading) {
        this.renderLoading()
      } else if (this.state.error) {
        this.renderError()
      } else if (this.state.arrivals.length === 0) {
        this.renderNoArrivals()
      } else {
        this.renderArrivalsRows()
      }
    },

    renderLoading() {
      if (this.state.spinner) this.state.spinner.stop()
      const centerY = Math.floor(SCREEN_H / 2)
      this.state.spinner = createSpinner(
        SCREEN_W / 2, centerY - 20,
        16, 3, COLOR_TEXT
      )

      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: centerY + 6,
        w: CONTENT_W,
        h: 24,
        text: 'Подключение к transport-by.app',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderError() {
      const blockH = 110 // total height of error block
      const centerY = Math.floor((SCREEN_H - blockH) / 2)

      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: centerY,
        w: CONTENT_W,
        h: 40,
        text: '⚠ Ошибка загрузки',
        text_size: FONT_SIZE_BODY,
        color: COLOR_WARNING,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: centerY + 50,
        w: CONTENT_W,
        h: 60,
        text: 'Повторите попытку',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP,
      })
    },

    renderNoArrivals() {
      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_TOP + 70,
        w: CONTENT_W,
        h: 40,
        text: 'No buses coming',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_TOP + 118,
        w: CONTENT_W,
        h: 28,
        text: 'Service may not run now',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderArrivalsRows() {
      // Updated time at top
      this.renderLastUpdated()

      const startY = HEADER_TOP + FOOTER_INFO_H + (IS_ROUND ? 14 : 4)
      const arrivals = this.state.arrivals;
      const count = arrivals.length

      // Fast path: same number of rows → update widgets in place instead of
      // tearing down and rebuilding the whole list (no flicker, no churn).
      if (this.state.rows.length === count) {
        this.state.rows.forEach((row, i) => this.updateArrivalRow(row, arrivals[i]))
        return
      }

      // Available height for the scroll container (leave bottom padding for round screens)
      const availH = SCREEN_H - startY - BOTTOM_PAD
      // Total height of all rows plus extra bottom spacing so the last row can scroll
      // fully into the visible safe area above the round-screen bezel.
      const totalContentH = count * (ROW_H + ROW_GAP) + BOTTOM_PAD + availH
      const needsScroll = totalContentH > availH

      // Scrollable container fills remaining screen height
      const scrollContainer = this.addWidget(hmUI.widget.VIEW_CONTAINER, {
        x: 0,
        y: startY,
        w: SCREEN_W,
        h: availH,
        scroll_enable: needsScroll ? 1 : 0,
      })

      arrivals.forEach((arrival, i) => {
        const rowY = i * (ROW_H + ROW_GAP)
        this.state.rows.push(this.renderArrivalRow(arrival, rowY, scrollContainer))
      });
    },

    /**
     * Render a single arrival row.
     * @param {any} arrival - Arrival data object
     * @param {number} rowY - Y-coordinate for the row
     * @param {any} parent - Parent scroll container for widget creation
     */
    renderArrivalRow(arrival, rowY, parent) {
      const cw = (type, props) => parent.createWidget(type, props)

      const routeColor = getRouteColor(arrival.type)
      const direction = arrival.direction || 'via this stop'
      const minText = arrival.minutes < 1 ? 'Now' : `${arrival.minutes} min`
      const minColor =
        arrival.minutes < 1
          ? COLOR_PRIMARY
          : arrival.minutes <= 2
            ? COLOR_WARNING
            : COLOR_TEXT

      // Row background
      const bg = cw(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: rowY,
        w: CONTENT_W,
        h: ROW_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      // Route number badge
      const badgeW = 60
      const badgeRect = cw(hmUI.widget.FILL_RECT, {
        x: MARGIN + 8,
        y: rowY + (ROW_H - 36) / 2,
        w: badgeW,
        h: 36,
        color: routeColor,
        radius: 6,
      })

      const routeText = cw(hmUI.widget.TEXT, {
        x: MARGIN + 8,
        y: rowY + (ROW_H - 36) / 2,
        w: badgeW,
        h: 36,
        text: arrival.route,
        text_size: FONT_SIZE_BODY,
        color: 0x000000,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      // Direction text
      const dirText = cw(hmUI.widget.TEXT, {
        x: MARGIN + 8 + badgeW + 8,
        y: rowY,
        w: CONTENT_W - badgeW - 80,
        h: ROW_H,
        text: direction,
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Minutes remaining
      const minTextW = cw(hmUI.widget.TEXT, {
        x: MARGIN + CONTENT_W - 70,
        y: rowY,
        w: 66,
        h: ROW_H,
        text: minText,
        text_size: FONT_SIZE_SMALL,
        color: minColor,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      // Keep refs + rendered values so refreshes can patch widgets in place
      return {
        bg, badgeRect, routeText, dirText, minText: minTextW,
        route: arrival.route, direction, minutes: arrival.minutes, type: arrival.type,
      }
    },

    renderLastUpdated() {
      const text = this.state.lastUpdated
        ? `Обновлено: ${formatUpdatedTime(this.state.lastUpdated)}`
        : 'Обновлено: --:--:--'

      if (!this.state.footerTimeText) {
        this.renderFooterTimeWidget()
      }

      if (this.state.footerTimeText) {
        this.state.footerTimeText.setProperty(hmUI.prop.MORE, { text })
      }
    },

    /**
     * Patch a single row's widgets in place. Only touches widgets whose
     * values actually changed — minimal native setProperty calls.
     * @param {any} row
     * @param {any} arrival
     */
    updateArrivalRow(row, arrival) {
      if (!row || !arrival) return

      const direction = arrival.direction || 'via this stop'
      const minText = arrival.minutes < 1 ? 'Now' : `${arrival.minutes} min`
      const minColor =
        arrival.minutes < 1
          ? COLOR_PRIMARY
          : arrival.minutes <= 2
            ? COLOR_WARNING
            : COLOR_TEXT

      if (row.type !== arrival.type) {
        row.badgeRect.setProperty(hmUI.prop.MORE, { color: getRouteColor(arrival.type) })
        row.type = arrival.type
      }
      if (row.route !== arrival.route) {
        row.routeText.setProperty(hmUI.prop.MORE, { text: arrival.route })
        row.route = arrival.route
      }
      if (row.direction !== direction) {
        row.dirText.setProperty(hmUI.prop.MORE, { text: direction })
        row.direction = direction
      }
      if (row.minutes !== arrival.minutes) {
        row.minText.setProperty(hmUI.prop.MORE, { text: minText, color: minColor })
        row.minutes = arrival.minutes
      }
    },

    /** @returns {string} Compact snapshot of current arrivals for change detection */
    arrivalsSnapshot() {
      return this.state.arrivals.map(a => `${a.route}|${a.minutes}|${a.direction}|${a.type}`).join(';')
    },

    fetchArrivals(silent = false) {
      const stop = this.state.stop;
      if (!stop) return;

      const stopId = String(stop.StopId)

      logger.log('Fetching arrivals for stop ID:', stopId)

      if (!stopId) {
        this.state.loading = false
        this.state.error = 'Ошибка данных остановки. Добавьте остановку снова.' // 'Stop data error'
        this.state.arrivals = []
        this.state.lastUpdated = new Date()
        this.renderContent()
        return
      }

      // Stamp every refresh attempt so footer never gets stuck on placeholder.
      this.state.lastUpdated = new Date()

      this.state.loading = !silent
      this.state.error = null
      if (!silent) {
        this.renderContent()
      } else {
        this.renderLastUpdated()
      }

      let requestPromise
      try {
        requestPromise = this.request({
          method: 'GET_ARRIVALS',
          params: {
            stopId,
            lang: 'ru',
          },
        })
      } catch (/** @type {any} */ err) {
        logger.log('Arrivals request setup error:', err)
        this.state.loading = false
        this.state.error = 'Не удалось получить данные. Попробуйте снова.' // 'Failed to start request. Try again.'
        this.state.arrivals = []
        this.state.lastUpdated = new Date()
        this.renderContent()
        return
      }

      requestPromise
        .then((data) => {
          this.state.loading = false

          if (data.error) {
            this.state.error = data.error
            this.state.arrivals = []
          } else {
            this.state.arrivals = data.arrivals || []
            this.state.stopName = stop.StopName || '';
            this.state.error = null
          }

          // Track only the initial (non-silent) load; auto-refresh is silent
          if (!silent) {
            track('arrivals_viewed', {
              stop_id: stopId,
              stop_name: this.state.stopName || (stop.StopName || ''),
              arrivals_count: this.state.arrivals.length,
            })
          }

          this.state.lastUpdated = new Date()

          // Skip the full re-render when nothing changed — just refresh the
          // timestamp. This makes silent auto-refresh nearly free.
          const snap = (this.state.error ? 'ERR:' + this.state.error : 'OK') + '|' + this.arrivalsSnapshot()
          if (snap === this.state.lastSnapshot) {
            this.renderLastUpdated()
            return
          }
          this.state.lastSnapshot = snap

          // Persist a fresh snapshot so the next visit opens instantly.
          // Throttled to at most one write per 20s to protect flash storage.
          if (!this.state.error && this.state.arrivals.length > 0) {
            const nowMs = Date.now()
            if (!this.state.lastCacheSave || nowMs - this.state.lastCacheSave > 20000) {
              this.state.lastCacheSave = nowMs
              saveArrivalsCache(stopId, this.state.arrivals, nowMs)
            }
          }

          // In-place patch when rows are already rendered with the same
          // count — no teardown/rebuild, no flicker.
          if (!this.state.error && this.state.rows.length > 0 && this.state.rows.length === this.state.arrivals.length) {
            this.renderArrivalsRows()
          } else {
            this.renderContent()
          }
        })
        .catch((err) => {
          logger.log('Arrivals error:', err)
          this.state.loading = false
          this.state.error = 'Подключение не удалось. Попробуйте снова.' // 'Connection failed. Try again.'
          this.state.arrivals = []
          this.state.lastUpdated = new Date()
          this.renderContent()
        })
    },

    onDestroy() {
      this.stopAutoRefresh()
      if (this.state.spinner) this.state.spinner.stop()

      try {
        resetPageBrightTime()
      } catch (/** @type {any} */ e) {
        logger.log('Failed to cancel bright screen:', e)
      }
      try {
        resetPalmScreenOff()
      } catch (/** @type {any} */ e) {
        logger.log('Failed to reset palm screen off:', e)
      }
      try {
        resetDropWristScreenOff()
      } catch (/** @type {any} */ e) {
        logger.log('Failed to reset drop wrist screen off:', e)
      }

      logger.log('Arrivals page destroyed')
    },
  })
)
