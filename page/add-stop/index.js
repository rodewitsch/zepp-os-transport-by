import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { back } from '@zos/router'
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
  COLOR_ERROR,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
} from '../../utils/constants'
import { addFavorite, loadFavorites } from '../../utils/storage'
import { createSpinner } from '../../utils/spinner'

const logger = Logger.getLogger('add-stop')

// Layout
const HEADER_H = 10
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
      error: null,
      selectedCity: 'minsk',
      spinner: null,
    },

    build() {
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
    },

    renderSearchSection() {
      // Two rows of city selector (3 cities each)
      const sectionY = HEADER_H + 24;

      // Text input widget
      const inputY = sectionY;
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: inputY,
        w: CONTENT_W,
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
        } catch (e) {
          logger.log('Keyboard open failed:', e)
          hmUI.showToast({ text: 'Keyboard unavailable' })
        }
      }

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN + 4,
        y: inputY,
        w: CONTENT_W - 8,
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
        const centerY = inputY + INPUT_H + (SCREEN_H - inputY - INPUT_H) / 2
        if (this.state.spinner) this.state.spinner.stop()
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
          align_h: hmUI.align.CENTER,
          align_v: hmUI.align.CENTER_V,
        })
      }
    },

    renderResults() {
      if (this.state.results.length === 0) return

      const headerOffset = HEADER_H + INPUT_H + 10
      let curY = headerOffset

      this.state.results.forEach((stop) => {
        const rowH = this.renderResultRow(stop, curY)
        curY += rowH + RESULT_GAP
      })
    },

    getRouteLines(stop) {
      if (!stop.Routes || !Array.isArray(stop.Routes)) return []
      const seen = new Set()
      const lines = []
      for (const item of stop.Routes) {
        const r = item.result || item
        if (r.Number && r.FinishStopName && !seen.has(r.Number)) {
          seen.add(r.Number)
          lines.push(r.Number + ' → ' + r.FinishStopName)
        }
      }
      return lines
    },

    renderResultRow(stop, rowY) {
      const routeLines = this.getRouteLines(stop)
      const rowH = RESULT_BASE_H + routeLines.length * ROUTE_LINE_H + 8

      const addStop = () => {
        addFavorite(stop)
        // Sync to settingsStorage so Settings App sees the change
        this.request({
          method: 'SAVE_FAVORITES',
          params: { favorites: loadFavorites() },
        }).catch(() => {})
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
