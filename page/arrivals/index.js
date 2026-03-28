import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { push, back } from '@zos/router'
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
const REFRESH_BTN_H = 48

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
    },

    onInit(paramsStr) {
      logger.log('Arrivals page init, params:', paramsStr)
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
        this.fetchArrivals()
      } else {
        this.state.error = 'No stop selected'
        this.renderContent()
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
        h: SCREEN_H - HEADER_H,
        color: COLOR_BG,
      })

      if (this.state.loading) {
        this.renderLoading()
        return
      }

      if (this.state.error) {
        this.renderError()
      } else if (this.state.arrivals.length === 0) {
        this.renderNoArrivals()
      } else {
        this.renderArrivalsRows()
      }

      this.renderRefreshButton()
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
        if (rowY + ROW_H > SCREEN_H - REFRESH_BTN_H - 84) return

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
        align_h: hmUI.align.CENTER,
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
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })

      // Type label (bus / tram / etc.)
      if (arrival.type && arrival.type !== 'bus') {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: MARGIN + 8 + badgeW + 8,
          y: rowY + 38,
          w: CONTENT_W - badgeW - 80,
          h: 20,
          text: arrival.type,
          text_size: FONT_SIZE_TINY,
          color: COLOR_TEXT_DIM,
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V,
        })
      }
    },

    renderRefreshButton() {
      const btnY = SCREEN_H - REFRESH_BTN_H - 48

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN,
        y: btnY,
        w: CONTENT_W,
        h: REFRESH_BTN_H,
        normal_color: 0x1e3a5f,
        press_color: 0x2a5080,
        text: '↻  Refresh',
        text_size: FONT_SIZE_BODY,
        normal_text_color: COLOR_ACCENT,
        press_text_color: COLOR_ACCENT,
        radius: 24,
        click_func: () => this.fetchArrivals(),
      })
    },

    renderLastUpdated() {
      if (!this.state.lastUpdated) return

      const now = new Date()
      const diff = Math.floor((now - this.state.lastUpdated) / 1000)
      const text = diff < 10 ? 'Just updated' : `Updated ${diff}s ago`

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: SCREEN_H - REFRESH_BTN_H - 76,
        w: SCREEN_W,
        h: 20,
        text,
        text_size: FONT_SIZE_TINY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER,
        align_v: hmUI.align.CENTER_V,
      })
    },

    fetchArrivals() {
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

      this.state.loading = true
      this.state.error = null
      this.renderContent()

      this.request({
        method: 'GET_ARRIVALS',
        params: {
          stopId,
          city: stop.city || 'minsk',
          lang: 'ru',
        },
      })
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
          logger.log('Arrivals error:', err)
          this.state.loading = false
          this.state.error = 'Connection failed. Check phone internet.'
          this.state.arrivals = []
          this.state.lastUpdated = new Date()
          this.renderContent()
        })
    },

    onDestroy() {
      logger.log('Arrivals page destroyed')
    },
  })
)
