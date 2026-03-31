import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { push, back } from '@zos/router'
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
  COLOR_BG,
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_TEXT,
  COLOR_TEXT_DIM,
  COLOR_CARD_BG,
  COLOR_WARNING,
  COLOR_ERROR,
  COLOR_SEPARATOR,
  FONT_SIZE_TITLE,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  MAX_ARRIVALS_SHOWN,
} from '../../utils/constants'
import { removeFavorite } from '../../utils/storage'

const logger = Logger.getLogger('arrivals')

// Layout
const HEADER_H = 56
const ROW_H = 72
const ROW_GAP = 4
const FOOTER_INFO_H = 28
const UPDATE_INTERVAL_MS = 10000
const BRIGHT_TIME_MS = 60 * 60 * 1000

// Route type color map
const TYPE_COLORS = {
  bus: 0x00c853,
  trolleybus: 0x2196f3,
  tram: 0xf44336,
  minibus: 0xff9800,
  metro: 0x9c27b0,
}

function getRouteColor(type) {
  return TYPE_COLORS[(type || 'bus').toLowerCase()] || TYPE_COLORS.bus
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatUpdatedTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

Page(
  BasePage({
    state: {
      stop: null,
      index: -1,
      loading: false,
      error: null,
      arrivals: [],
      stopName: '',
      lastUpdated: null,
      arrivalsTimer: null,
      footerTimeText: null,
    },

    onInit(paramsStr) {
      logger.log('Arrivals page init, params:', paramsStr)
      try {
        setPageBrightTime({ brightTime: BRIGHT_TIME_MS })
      } catch (e) {
        logger.log('Failed to set bright screen:', e)
      }
      try {
        pausePalmScreenOff({ duration: 0 })
      } catch (e) {
        logger.log('Failed to pause palm screen off:', e)
      }
      try {
        pauseDropWristScreenOff({ duration: 0 })
      } catch (e) {
        logger.log('Failed to pause drop wrist screen off:', e)
      }

      try {
        const params = JSON.parse(paramsStr || '{}')
        this.state.stop = params.stop || null
        this.state.index = params.index != null ? params.index : -1
      } catch (e) {
        logger.log('Failed to parse params:', e)
      }
    },

    build() {
      this.renderSkeleton()

      if (this.state.stop) {
        this.fetchArrivals(false)
        this.startAutoRefresh()
      } else {
        this.state.error = 'No stop selected'
        this.renderContent()
      }
    },

    startAutoRefresh() {
      this.stopAutoRefresh()
      this.state.arrivalsTimer = setInterval(() => {
        this.fetchArrivals(true)
      }, UPDATE_INTERVAL_MS)
    },

    stopAutoRefresh() {
      if (this.state.arrivalsTimer) {
        clearInterval(this.state.arrivalsTimer)
        this.state.arrivalsTimer = null
      }
    },

    renderSkeleton() {
      // Background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })

      this.renderHeader()
      this.renderFooterTimeWidget()
    },

    renderFooterTimeWidget() {
      if (this.state.footerTimeText) return

      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: SCREEN_H - FOOTER_INFO_H,
        w: SCREEN_W,
        h: FOOTER_INFO_H,
        color: COLOR_BG,
      })

      this.state.footerTimeText = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: SCREEN_H - FOOTER_INFO_H,
        w: SCREEN_W,
        h: 20,
        text: 'Updated: --:--:--',
        text_size: FONT_SIZE_TINY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderHeader() {
      const stop = this.state.stop
      const stopName =
        this.state.stopName ||
        (stop && (stop.name || stop.stopName || stop.StopName || stop.title)) ||
        'Stop'

      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: HEADER_H,
        color: COLOR_CARD_BG,
      })

      // Back button
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 4,
        y: 0,
        w: 40,
        h: HEADER_H,
        text: '‹',
        text_size: 32,
        color: COLOR_TEXT,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
        click_func: () => back(),
      })

      // Stop name
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 44,
        y: 0,
        w: SCREEN_W - 88,
        h: HEADER_H,
        text: stopName,
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Delete / remove favourite button
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: SCREEN_W - 44,
        y: 0,
        w: 44,
        h: HEADER_H,
        text: '🗑',
        text_size: 20,
        color: COLOR_ERROR,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
        click_func: () => {
          if (this.state.index >= 0) {
            removeFavorite(this.state.index)
          }
          back()
        },
      })
    },

    renderContent() {
      // Clear below header
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: HEADER_H,
        w: SCREEN_W,
        h: SCREEN_H - HEADER_H - FOOTER_INFO_H,
        color: COLOR_BG,
      })

      if (this.state.loading) {
        this.renderLoading()
      } else if (this.state.error) {
        this.renderError()
      } else if (this.state.arrivals.length === 0) {
        this.renderNoArrivals()
      } else {
        this.renderArrivalsRows()
      }

      this.renderLastUpdated()
    },

    renderLoading() {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 80,
        w: CONTENT_W,
        h: 40,
        text: 'Loading...',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 130,
        w: CONTENT_W,
        h: 28,
        text: 'Connecting to transport-by.app',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderError() {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 60,
        w: CONTENT_W,
        h: 40,
        text: '⚠ Failed to load',
        text_size: FONT_SIZE_BODY,
        color: COLOR_WARNING,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 110,
        w: CONTENT_W,
        h: 60,
        text: this.state.error,
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP,
      })
    },

    renderNoArrivals() {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 70,
        w: CONTENT_W,
        h: 40,
        text: 'No buses coming',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 118,
        w: CONTENT_W,
        h: 28,
        text: 'Service may not run now',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderArrivalsRows() {
      const startY = HEADER_H + 8
      const arrivals = this.state.arrivals.slice(0, MAX_ARRIVALS_SHOWN)

      arrivals.forEach((arrival, i) => {
        const rowY = startY + i * (ROW_H + ROW_GAP)
        if (rowY + ROW_H > SCREEN_H - FOOTER_INFO_H - 24) return

        this.renderArrivalRow(arrival, rowY)
      })
    },

    renderArrivalRow(arrival, rowY) {
      
      const routeColor = getRouteColor(arrival.type)

      // Row background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: rowY,
        w: CONTENT_W,
        h: ROW_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      // Route number badge
      const badgeW = 60
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN + 8,
        y: rowY + (ROW_H - 36) / 2,
        w: badgeW,
        h: 36,
        color: routeColor,
        radius: 6,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
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
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN + 8 + badgeW + 8,
        y: rowY + 10,
        w: CONTENT_W - badgeW - 80,
        h: 24,
        text: arrival.direction || 'via this stop',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Minutes remaining
      const minText =
        arrival.minutes === 0
          ? 'Now'
          : arrival.minutes === 1
          ? '1 min'
          : `${arrival.minutes} min`

      const minColor =
        arrival.minutes === 0
          ? COLOR_PRIMARY
          : arrival.minutes <= 2
          ? COLOR_WARNING
          : COLOR_TEXT

      hmUI.createWidget(hmUI.widget.TEXT, {
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
    },

    renderLastUpdated() {
      const text = this.state.lastUpdated
        ? `Updated: ${formatUpdatedTime(this.state.lastUpdated)}`
        : 'Updated: --:--:--'

      if (!this.state.footerTimeText) {
        this.renderFooterTimeWidget()
      }

      if (this.state.footerTimeText) {
        this.state.footerTimeText.setProperty(hmUI.prop.MORE, { text })
      }
    },

    fetchArrivals(silent = false) {
      const stop = this.state.stop
      if (!stop) return
      const stopId = String(
        stop.id || stop.stopId || stop.StopId || stop.stop_id || ''
      )

      if (!stopId) {
        this.state.loading = false
        this.state.error = 'Stop ID is missing. Re-add this stop.'
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
            city: stop.city || 'minsk',
            lang: 'ru',
          },
        })
      } catch (err) {
        console.error('Arrivals request setup error:', err)
        logger.log('Arrivals request setup error:', err)
        this.state.loading = false
        this.state.error = 'Failed to start request. Try again.'
        this.state.arrivals = []
        this.state.lastUpdated = new Date()
        this.renderContent()
        return
      }

      requestPromise
        .then((data) => {
          logger.log('Arrivals received:', JSON.stringify(data))
          this.state.loading = false

          if (data.error) {
            this.state.error = data.error
            this.state.arrivals = []
          } else {
            this.state.arrivals = data.arrivals || []
            this.state.stopName =
              data.stopName ||
              (stop && (stop.name || stop.stopName || stop.StopName || stop.title)) ||
              ''
            this.state.error = null
          }

          this.state.lastUpdated = new Date()
          this.renderContent()
        })
        .catch((err) => {
          console.error('Arrivals error:', err)
          logger.log('Arrivals error:', err)
          this.state.loading = false
          this.state.error = 'Connection failed. Check phone internet.'
          this.state.arrivals = []
          this.state.lastUpdated = new Date()
          this.renderContent()
        })
    },

    onDestroy() {
      this.stopAutoRefresh()

      try {
        resetPageBrightTime()
      } catch (e) {
        logger.log('Failed to cancel bright screen:', e)
      }
      try {
        resetPalmScreenOff()
      } catch (e) {
        logger.log('Failed to reset palm screen off:', e)
      }
      try {
        resetDropWristScreenOff()
      } catch (e) {
        logger.log('Failed to reset drop wrist screen off:', e)
      }

      logger.log('Arrivals page destroyed')
    },
  })
)
