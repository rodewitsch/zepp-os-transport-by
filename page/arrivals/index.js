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
  COLOR_TEXT,
  COLOR_TEXT_DIM,
  COLOR_CARD_BG,
  COLOR_WARNING,
  COLOR_ERROR,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  MAX_ARRIVALS_SHOWN,
} from '../../utils/constants'
import { removeFavorite } from '../../utils/storage'
import { createSpinner } from '../../utils/spinner'

const logger = Logger.getLogger('arrivals')

// Layout
const HEADER_H = 10
const ROW_H = 72
const ROW_GAP = 4
const FOOTER_INFO_H = 28
const UPDATE_INTERVAL_MS = 30000
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

function getRouteColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS[TRANSPORT_TYPES.bus]
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
      spinner: null,
      contentWidgets: [],
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
      hmUI.setStatusBarVisible(false);

      if (this.state.stop) {
        this.fetchArrivals(false)
        this.startAutoRefresh()
      } else {
        this.state.error = 'No stop selected'
        this.renderContent()
      }
    },

    addWidget(type, props) {
      const w = hmUI.createWidget(type, props)
      this.state.contentWidgets.push(w)
      return w
    },

    clearContentWidgets() {
      this.state.contentWidgets.forEach(w => {
        try { hmUI.deleteWidget(w) } catch (e) {}
      })
      this.state.contentWidgets = []
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

    renderFooterTimeWidget() {
      if (this.state.footerTimeText) return

      this.state.footerTimeText = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: HEADER_H,
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
      this.state.spinner = createSpinner(
        SCREEN_W / 2, HEADER_H + 100,
        16, 3, COLOR_TEXT
      )

      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 130,
        w: CONTENT_W,
        h: 28,
        text: 'Подключение к transport-by.app',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderError() {
      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 60,
        w: CONTENT_W,
        h: 40,
        text: '⚠ Failed to load',
        text_size: FONT_SIZE_BODY,
        color: COLOR_WARNING,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: HEADER_H + 110,
        w: CONTENT_W,
        h: 60,
        text: this.state.error,
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
        y: HEADER_H + 70,
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
        y: HEADER_H + 118,
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

      const startY = HEADER_H + FOOTER_INFO_H + 4
      const arrivals = this.state.arrivals;

      arrivals.forEach((arrival, i) => {
        const rowY = startY + i * (ROW_H + ROW_GAP);
        logger.log('Rendering arrival:', arrival);
        this.renderArrivalRow(arrival, rowY);
      });
    },

    renderArrivalRow(arrival, rowY) {

      const routeColor = getRouteColor(arrival.type)

      // Row background
      this.addWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: rowY,
        w: CONTENT_W,
        h: ROW_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      // Route number badge
      const badgeW = 60
      this.addWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN + 8,
        y: rowY + (ROW_H - 36) / 2,
        w: badgeW,
        h: 36,
        color: routeColor,
        radius: 6,
      })

      this.addWidget(hmUI.widget.TEXT, {
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
      this.addWidget(hmUI.widget.TEXT, {
        x: MARGIN + 8 + badgeW + 8,
        y: rowY,
        w: CONTENT_W - badgeW - 80,
        h: ROW_H,
        text: arrival.direction || 'via this stop',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Minutes remaining
      const minText =
        arrival.minutes < 1
          ? 'Now'
          : `${arrival.minutes} min`

      const minColor =
        arrival.minutes < 1
          ? COLOR_PRIMARY
          : arrival.minutes <= 2
            ? COLOR_WARNING
            : COLOR_TEXT

      this.addWidget(hmUI.widget.TEXT, {
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
        ? `Обновлено: ${formatUpdatedTime(this.state.lastUpdated)}`
        : 'Обновлено: --:--:--'

      if (!this.state.footerTimeText) {
        this.renderFooterTimeWidget()
      }

      if (this.state.footerTimeText) {
        this.state.footerTimeText.setProperty(hmUI.prop.MORE, { text })
      }
    },

    fetchArrivals(silent = false) {
      const stop = this.state.stop;
      if (!stop) return;

      logger.log('Fetching arrivals for stop:', JSON.stringify(stop))

      const stopId = String(
        stop.id || stop.stopId || stop.StopId || stop.stop_id || ''
      )

      logger.log('Fetching arrivals for stop ID:', stopId)

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
          this.state.loading = false

          if (data.error) {
            this.state.error = data.error
            this.state.arrivals = []
          } else {
            this.state.arrivals = data.arrivals || []
            this.state.stopName = stop.StopName || '';
            this.state.error = null
          }

          this.state.lastUpdated = new Date()
          logger.log('Start rendering')
          this.renderContent();
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
