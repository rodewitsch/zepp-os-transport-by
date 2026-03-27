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
  COLOR_TEXT,
  COLOR_TEXT_DIM,
  COLOR_CARD_BG,
  COLOR_ERROR,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
} from '../../utils/constants'
import { loadFavorites, saveFavorites, loadSettings, saveSettings } from '../../utils/storage'

const logger = Logger.getLogger('settings')

const HEADER_H = 56
const ROW_H = 56
const ROW_GAP = 4

Page(
  BasePage({
    state: {
      settings: null,
      favorites: [],
    },

    onInit() {
      logger.log('Settings page init')
    },

    build() {
      this.state.settings = loadSettings()
      this.state.favorites = loadFavorites()
      this.renderPage()
    },

    renderPage() {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })

      this.renderHeader()
      this.renderFavoriteManager()
      this.renderAbout()
    },

    renderHeader() {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: HEADER_H,
        color: COLOR_CARD_BG,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 4,
        y: 0,
        w: 44,
        h: HEADER_H,
        text: '‹',
        text_size: 32,
        color: COLOR_TEXT,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        click_func: () => back(),
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 48,
        y: 0,
        w: SCREEN_W - 48,
        h: HEADER_H,
        text: 'Settings',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderFavoriteManager() {
      const favSection = HEADER_H + 12

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: favSection,
        w: CONTENT_W,
        h: 24,
        text: `Favourite stops (${this.state.favorites.length})`,
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
      })

      const listTop = favSection + 28
      const maxVisible = 4

      this.state.favorites.slice(0, maxVisible).forEach((stop, i) => {
        const rowY = listTop + i * (ROW_H + ROW_GAP)
        this.renderFavoriteRow(stop, i, rowY)
      })

      // Clear all button
      if (this.state.favorites.length > 0) {
        const clearY = listTop + maxVisible * (ROW_H + ROW_GAP) + 8
        this.renderClearAllButton(clearY)
      }
    },

    renderFavoriteRow(stop, index, rowY) {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: rowY,
        w: CONTENT_W,
        h: ROW_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN + 10,
        y: rowY,
        w: CONTENT_W - 56,
        h: ROW_H,
        text: stop.name,
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Delete
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN + CONTENT_W - 44,
        y: rowY,
        w: 40,
        h: ROW_H,
        text: '✕',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_ERROR,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        click_func: () => {
          const updated = [...this.state.favorites]
          updated.splice(index, 1)
          saveFavorites(updated)
          this.state.favorites = updated
          this.renderPage()
        },
      })
    },

    renderClearAllButton(btnY) {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: btnY,
        w: CONTENT_W,
        h: 44,
        color: 0x2a0000,
        radius: 8,
        click_func: () => {
          saveFavorites([])
          this.state.favorites = []
          this.renderPage()
        },
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: btnY,
        w: CONTENT_W,
        h: 44,
        text: 'Clear all favourites',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_ERROR,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,        click_func: () => {
          saveFavorites([])
          this.state.favorites = []
          this.renderPage()
        },      })
    },

    renderAbout() {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: SCREEN_H - 40,
        w: SCREEN_W,
        h: 36,
        text: 'Transport BY v1.0  •  transport-by.app',
        text_size: FONT_SIZE_TINY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    onDestroy() {
      logger.log('Settings page destroyed')
    },
  })
)
