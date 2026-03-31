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
  COLOR_WARNING,
  FONT_SIZE_TITLE,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  MAX_FAVORITES,
} from '../../utils/constants'
import { addFavorite, loadFavorites } from '../../utils/storage'

const logger = Logger.getLogger('add-stop')

// Layout
const HEADER_H = 56
const INPUT_H = 52
const RESULT_ROW_H = 62
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
      // Background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })

      this.renderHeader()
      this.renderCitySelector()
      this.renderSearchSection()
      this.renderResults()
    },

    renderHeader() {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: HEADER_H,
        color: COLOR_CARD_BG,
      })

      // Back
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: 4,
        y: 0,
        w: 44,
        h: HEADER_H,
        text: '‹',
        text_size: 32,
        normal_color: COLOR_CARD_BG,
        press_color: 0x2a2a2a,
        color: COLOR_TEXT,
        radius: 8,
        click_func: () => back(),
      })

      // Title
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 48,
        y: 0,
        w: SCREEN_W - 48,
        h: HEADER_H,
        text: 'Add favourite stop',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderCitySelector() {
      const sectionY = HEADER_H + 8
      const cities = [
        { id: 'minsk', label: 'Minsk' },
        { id: 'brest', label: 'Brest' },
        { id: 'grodno', label: 'Grodno' },
        { id: 'gomel', label: 'Gomel' },
        { id: 'vitebsk', label: 'Vitebsk' },
        { id: 'mogilev', label: 'Mogilev' },
      ]

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: sectionY,
        w: CONTENT_W,
        h: 22,
        text: 'City:',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
      })

      // City buttons row
      const btnW = 80
      const btnH = 32
      const startY = sectionY + 26
      cities.forEach((city, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        const btnX = MARGIN + col * (btnW + 4)
        const btnY = startY + row * (btnH + 4)
        const active = this.state.selectedCity === city.id

        hmUI.createWidget(hmUI.widget.BUTTON, {
          x: btnX,
          y: btnY,
          w: btnW,
          h: btnH,
          normal_color: active ? COLOR_PRIMARY : COLOR_CARD_BG,
          press_color: active ? 0x00a884 : 0x2a2a2a,
          text: city.label,
          text_size: FONT_SIZE_TINY,
          color: active ? 0x000000 : COLOR_TEXT,
          radius: 6,
          click_func: () => {
            this.state.selectedCity = city.id
            this.renderPage()
          },
        })
      })
    },

    renderSearchSection() {
      // Two rows of city selector (3 cities each)
      const sectionY = HEADER_H + 8 + 22 + 26 + 32 + 4 + 32 + 12

      // Search label
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: sectionY,
        w: CONTENT_W,
        h: 22,
        text: 'Stop name:',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
      })

      // Text input widget
      const inputY = sectionY + 26
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

      // Two rows of city selector + search section height
      const headerOffset =
        HEADER_H + 8 + 22 + 26 + 32 + 4 + 32 + 12 + 22 + 26 + INPUT_H + 36

      const maxRows = Math.floor(
        (SCREEN_H - headerOffset - 8) / (RESULT_ROW_H + RESULT_GAP)
      )

      this.state.results.slice(0, maxRows).forEach((stop, i) => {
        const rowY = headerOffset + i * (RESULT_ROW_H + RESULT_GAP)
        this.renderResultRow(stop, rowY)
      })
    },

    renderResultRow(stop, rowY) {
      const addStop = () => {
        const favorites = loadFavorites()
        if (favorites.length >= MAX_FAVORITES) {
          this.state.error = `Max ${MAX_FAVORITES} stops reached`
          this.renderPage()
          return
        }
        addFavorite(stop)
        back()
      }

      // Row bg
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: rowY,
        w: CONTENT_W,
        h: RESULT_ROW_H,
        color: COLOR_CARD_BG,
        radius: 8,
        click_func: addStop,
      })

      console.log(stop);

      // Stop name
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN + 10,
        y: rowY + 8,
        w: CONTENT_W - 60,
        h: 26,
        text: stop.StopName,
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
        click_func: addStop,
      })

      // Routes
      const routeStr = (stop.routes || []).slice(0, 5).join('  ')
      if (routeStr) {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: MARGIN + 10,
          y: rowY + 38,
          w: CONTENT_W - 60,
          h: 18,
          text: routeStr,
          text_size: FONT_SIZE_TINY,
          color: COLOR_ACCENT,
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V,
          click_func: addStop,
        })
      }

      // Add button (+)
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN + CONTENT_W - 50,
        y: rowY + 8,
        w: 42,
        h: RESULT_ROW_H - 16,
        normal_color: 0x15351d,
        press_color: 0x1f4d2b,
        text: '+',
        text_size: FONT_SIZE_BODY,
        color: COLOR_PRIMARY,
        radius: 8,
        click_func: addStop,
      })
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
