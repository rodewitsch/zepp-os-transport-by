import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { back } from '@zos/router'
import { BasePage } from '@zeppos/zml/base-page'
import {
  SCREEN_W,
  SCREEN_H,
  MARGIN,
  CONTENT_W,
  HEADER_TOP,
  BOTTOM_PAD,
  COLOR_BG,
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_TEXT,
  COLOR_TEXT_DIM,
  COLOR_CARD_BG,
  COLOR_ERROR,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  IS_ROUND,
} from '../../utils/constants'
import { addFavorite, loadFavorites } from '../../utils/storage'
import { createSpinner } from '../../utils/spinner'
import { screenView, track } from '../../utils/analytics'

const logger = Logger.getLogger('add-stop')

// Donation: QR content + popup layout
const DONATE_URL = 'https://boosty.to/rodevich/donate?qr=true'
const DONATE_BTN_SIZE = 56
const QR_SIZE = IS_ROUND ? 240 : 250

// Layout
const INPUT_H = 52
const ROUTE_LINE_H = 18
const RESULT_BASE_H = 52  // name + address
const RESULT_GAP = 4

Page(
  BasePage({
    state: {
      query: '',
      searching: false,
      results: [],
      /** @type {string | null} */
      error: null,
      selectedCity: 'minsk',
      /** @type {{ stop: () => void } | null} */
      spinner: null,
      /** @type {boolean} Whether the donate QR overlay is open */
      showDonate: false,
      /** @type {any[]} Widgets of the donate overlay */
      donateWidgets: [],
    },

    build() {
      screenView('add_stop')
      this.renderPage()
    },

    renderPage() {
      if (this.state.spinner) {
        this.state.spinner.stop()
        this.state.spinner = null
      }

      hmUI.setStatusBarVisible(false);

      // Background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })

      this.renderSearchSection()
      this.renderResults()

      // Floating donate button (hidden while the QR overlay is open)
      if (!this.state.showDonate) {
        this.renderDonateButton()
      }
    },

    renderDonateButton() {
      const size = DONATE_BTN_SIZE
      // Safe inset on round screens (bottom content gets clipped by bezel)
      const pad = IS_ROUND ? 28 : 0
      const x = SCREEN_W - size - MARGIN - pad
      const y = SCREEN_H - size - BOTTOM_PAD - pad

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x,
        y,
        w: size,
        h: size,
        normal_color: COLOR_PRIMARY,
        press_color: 0x00a884,
        text: '$',
        color: COLOR_BG,
        text_size: FONT_SIZE_BODY,
        radius: size / 2,
        click_func: () => this.showDonate(),
      })
    },

    showDonate() {
      if (this.state.showDonate) return
      this.state.showDonate = true

      this.renderDonateOverlay()
      track('donate_qr_open')
    },

    hideDonate() {
      if (!this.state.showDonate) return
      this.state.showDonate = false
      this.state.donateWidgets.forEach((w) => {
        try {
          hmUI.deleteWidget(w)
        } catch (_e) { }
      })
      this.state.donateWidgets = []
      this.renderDonateButton()
    },

    renderDonateOverlay() {
      const widgets = this.state.donateWidgets
      const add = (type, props) => {
        const w = hmUI.createWidget(type, props)
        widgets.push(w)
        return w
      }

      const close = () => this.hideDonate()

      // Dim background — tapping it dismisses the overlay
      add(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: 0x000000,
        alpha: 200,
        click_func: close,
      })

      // Card
      // Title + gaps + QR + hint are stacked vertically with comfortable spacing.
      const TITLE_H = 26
      const TITLE_TOP = 16
      const GAP_AFTER_TITLE = 22
      const QR_BG_INSET = 18
      const GAP_AFTER_QR = 20
      const HINT_H = 24

      const qrBgSize = QR_SIZE + QR_BG_INSET * 2
      const cardW = QR_SIZE + 88
      const cardH = TITLE_TOP + TITLE_H + GAP_AFTER_TITLE + qrBgSize + GAP_AFTER_QR + HINT_H + 20
      const cardX = (SCREEN_W - cardW) / 2
      const cardY = Math.max(HEADER_TOP, (SCREEN_H - cardH) / 2)
      add(hmUI.widget.FILL_RECT, {
        x: cardX,
        y: cardY,
        w: cardW,
        h: cardH,
        color: COLOR_CARD_BG,
        radius: 12,
      })

      // Title
      add(hmUI.widget.TEXT, {
        x: cardX,
        y: cardY + TITLE_TOP,
        w: cardW,
        h: TITLE_H,
        text: 'Поддержите проект',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // QR code with white background (needed for reliable scanning)
      const qrX = cardX + (cardW - QR_SIZE) / 2
      const qrY = cardY + TITLE_TOP + TITLE_H + GAP_AFTER_TITLE + QR_BG_INSET
      add(hmUI.widget.FILL_RECT, {
        x: qrX - QR_BG_INSET,
        y: qrY - QR_BG_INSET,
        w: qrBgSize,
        h: qrBgSize,
        color: 0xffffff,
        radius: 8,
      })
      add(hmUI.widget.QRCODE, {
        x: qrX,
        y: qrY,
        w: QR_SIZE,
        h: QR_SIZE,
        bg_x: qrX - QR_BG_INSET,
        bg_y: qrY - QR_BG_INSET,
        bg_w: qrBgSize,
        bg_h: qrBgSize,
        content: DONATE_URL,
      })

      // Hint — placed just below the QR code (after its white background)
      add(hmUI.widget.TEXT, {
        x: cardX,
        y: qrY + QR_SIZE + GAP_AFTER_QR,
        w: cardW,
        h: HINT_H,
        text: 'Отсканируйте QR-код',
        text_size: FONT_SIZE_TINY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Close button (plain Latin X — the ✕ glyph is missing from the watch font
      // and would render as a tofu box)
      add(hmUI.widget.BUTTON, {
        x: cardX + cardW - 44,
        y: cardY + 8,
        w: 36,
        h: 36,
        normal_color: 0x2a2a2a,
        press_color: 0x3a3a3a,
        text: 'X',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        radius: 18,
        click_func: close,
      })
    },

    renderSearchSection() {
      const sectionY = HEADER_TOP + 32;
      const INPUT_W = IS_ROUND ? CONTENT_W - 64 : CONTENT_W;

      // Text input widget
      const inputY = sectionY;
      const inputX = MARGIN + (CONTENT_W - INPUT_W) / 2;
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: inputX,
        y: inputY,
        w: INPUT_W,
        h: INPUT_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      const openKeyboard = () => {
        try {
          hmUI.deleteKeyboard()
          hmUI.createKeyboard({
            inputType: hmUI.inputType.CHAR,
            text: this.state.query || '',
            onComplete: (_widget, result) => {
              this.state.query = (result && result.data) || ''
              hmUI.deleteKeyboard()
              if (this.state.query.trim()) {
                this.performSearch()
              } else {
                this.renderPage()
              }
            },
            onCancel: () => {
              hmUI.deleteKeyboard()
            },
          })
        } catch (/** @type {any} */ e) {
          logger.log('Keyboard open failed:', e)
          hmUI.showToast({ text: 'Keyboard unavailable' })
        }
      }

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: inputX + 4,
        y: inputY,
        w: INPUT_W - 8,
        h: INPUT_H,
        normal_color: COLOR_CARD_BG,
        press_color: 0x2a2a2a,
        text: this.state.query || 'Введите название остановки',
        text_size: FONT_SIZE_SMALL,
        color: this.state.query ? COLOR_TEXT : COLOR_TEXT_DIM,
        radius: 8,
        click_func: openKeyboard,
      })

      // Status / searching indicator
      if (this.state.searching) {
        const centerY = Math.floor(SCREEN_H / 2)
        if (this.state.spinner && this.state.spinner.stop) this.state.spinner.stop()
        this.state.spinner = createSpinner(
          SCREEN_W / 2, centerY - 20,
          16, 3, COLOR_TEXT
        )
        hmUI.createWidget(hmUI.widget.TEXT, {
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
      } else if (this.state.error) {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: MARGIN,
          y: inputY + INPUT_H + 8,
          w: CONTENT_W,
          h: 24,
          text: this.state.error,
          text_size: FONT_SIZE_SMALL,
          color: COLOR_ERROR,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
        })
      }
    },

    renderResults() {
      if (this.state.results.length === 0) return

      const headerOffset = HEADER_TOP + 32 + INPUT_H + 10
      let curY = headerOffset

      this.state.results.forEach((stop) => {
        const rowH = this.renderResultRow(stop, curY)
        curY += rowH + RESULT_GAP
      })
    },

    /**
     * @param {import('../../utils/storage').Stop} stop
     * @returns {string[]}
     */
    getRouteLines(stop) {
      if (!stop.Routes || !Array.isArray(stop.Routes)) return []
      const seen = new Set()
      const lines = []
      for (const item of stop.Routes) {
        const r = item.result || item
        if (r.Number && r.FinishStopName && !seen.has(r.Number) && r.Type !== 3) {
          seen.add(r.Number)
          lines.push(r.Number + ' → ' + r.FinishStopName)
        }
      }
      return lines
    },

    /**
     * @param {import('../../utils/storage').Stop} stop
     * @param {number} rowY
     * @returns {number}
     */
    renderResultRow(stop, rowY) {
      const routeLines = this.getRouteLines(stop)
      const rowH = RESULT_BASE_H + routeLines.length * ROUTE_LINE_H + 8

      const addStop = () => {
        addFavorite(stop)
        track('stop_added', {
          stop_id: String(stop.StopId || ''),
          stop_name: stop.StopName || '',
        })
        // Sync to settingsStorage so Settings App sees the change
        this.request({
          method: 'SAVE_FAVORITES',
          params: { favorites: loadFavorites() },
        }).catch(() => { })
        back()
      }

      // Row bg
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: rowY,
        w: CONTENT_W,
        h: rowH,
        color: COLOR_CARD_BG,
        radius: 8,
        click_func: addStop,
      })

      // Stop name
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN + 10,
        y: rowY + 6,
        w: CONTENT_W - 60,
        h: 22,
        text: stop.StopName,
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
        click_func: addStop,
      })

      // Address
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN + 10,
        y: rowY + 28,
        w: CONTENT_W - 60,
        h: 22,
        text: stop.Address,
        text_size: FONT_SIZE_TINY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
        click_func: addStop,
      })

      // Route lines (one per row)
      routeLines.forEach((line, i) => {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: MARGIN + 10,
          y: rowY + RESULT_BASE_H + i * ROUTE_LINE_H,
          w: CONTENT_W - 60,
          h: ROUTE_LINE_H,
          text: line,
          text_size: FONT_SIZE_TINY,
          color: COLOR_ACCENT,
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.ELLIPSIS,
          click_func: addStop,
        })
      })

      // Add button (+)
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN + CONTENT_W - 50,
        y: rowY + 8,
        w: 42,
        h: rowH - 16,
        normal_color: 0x15351d,
        press_color: 0x1f4d2b,
        text: '+',
        text_size: FONT_SIZE_BODY,
        color: COLOR_PRIMARY,
        radius: 8,
        click_func: addStop,
      })

      return rowH
    },

    performSearch() {
      const query = this.state.query.trim()
      if (!query || query.length < 2) {
        this.state.error = 'Введите как минимум 2 символа'
        this.renderPage()
        return
      }

      this.state.searching = true
      this.state.error = null
      this.state.results = []
      this.renderPage()

      this.request({
        method: 'SEARCH_STOPS',
        params: {
          query,
          city: this.state.selectedCity,
          lang: 'ru',
        },
      })
        .then((data) => {
          logger.log('Search results:', JSON.stringify(data))
          this.state.searching = false

          if (data.error) {
            this.state.error = data.error
            this.state.results = []
          } else {
            this.state.results = data.stops || []
            if (this.state.results.length === 0) {
              this.state.error = 'Остановки не найдены'
            }
          }

          track('search', {
            search_term: query,
            city: this.state.selectedCity,
            results_count: this.state.results.length,
          })

          this.renderPage()
        })
        .catch((err) => {
          logger.log('Search error:', err)
          this.state.searching = false
          this.state.error = err && err.message ? err.message : 'Подключение не удалось. Попробуйте снова.' // 'Connection failed. Try again.'
          this.state.results = []
          this.renderPage()
        })
    },

    onDestroy() {
      if (this.state.spinner) this.state.spinner.stop()
      logger.log('Add-stop page destroyed')
    },
  })
)
