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
  MAX_FAVORITES,
} from '../../utils/constants'
import { addFavorite, loadFavorites } from '../../utils/storage'

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
    },

    onInit() {
      logger.log('Add-stop page init')
    },

    build() {
      this.renderPage()
    },

    renderPage() {
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
      const sectionY = HEADER_H;

      // Text input widget
      const inputY = sectionY;
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: inputY,
        w: CONTENT_W - 64,
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
              this.renderPage()
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
        w: CONTENT_W - 64 - 8,
        h: INPUT_H,
        normal_color: COLOR_CARD_BG,
        press_color: 0x2a2a2a,
        text: this.state.query || 'Tap to enter stop name',
        text_size: FONT_SIZE_SMALL,
        color: this.state.query ? COLOR_TEXT : COLOR_TEXT_DIM,
        radius: 8,
        click_func: openKeyboard,
      })

      // Search button
      const searchBtnX = SCREEN_W - MARGIN - 56
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: searchBtnX,
        y: inputY,
        w: 56,
        h: INPUT_H,
        normal_color: COLOR_ACCENT,
        press_color: 0x1565c0,
        text: 'Go',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        radius: 8,
        click_func: () => {
          // todo: remove after testing
          this.state.query = this.state.query || 'оперный театр';
          if (!this.state.query.trim()) {
            openKeyboard()
            return
          }
          this.performSearch()
        },
      })

      // Status / searching indicator
      if (this.state.searching) {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: MARGIN,
          y: inputY + INPUT_H + 8,
          w: CONTENT_W,
          h: 24,
          text: 'Searching...',
          text_size: FONT_SIZE_SMALL,
          color: COLOR_TEXT_DIM,
          align_h: hmUI.align.CENTER,
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
        const favorites = loadFavorites()
        if (favorites.length >= MAX_FAVORITES) {
          this.state.error = `Max ${MAX_FAVORITES} stops reached`
          this.renderPage()
          return
        }
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
        this.state.error = 'Enter at least 2 characters'
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
              this.state.error = 'No stops found'
            }
          }

          this.renderPage()
        })
        .catch((err) => {
          logger.log('Search error:', err)
          this.state.searching = false
          this.state.error = err && err.message ? err.message : 'Connection failed'
          this.state.results = []
          this.renderPage()
        })
    },

    onDestroy() {
      logger.log('Add-stop page destroyed')
    },
  })
)
