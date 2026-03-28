import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { push } from '@zos/router'
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
  COLOR_SEPARATOR,
  COLOR_ACCENT,
  FONT_SIZE_TITLE,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  MAX_FAVORITES,
} from '../../utils/constants'
import { loadFavorites, removeFavorite } from '../../utils/storage'

const logger = Logger.getLogger('home')

// Layout constants
const HEADER_H = 60
const CARD_H = 76
const CARD_GAP = 8
const ADD_BTN_H = 56
const EMPTY_ICON_SIZE = 64
const CARD_ACTION_W = 48

Page(
  BasePage({
    state: {
      favorites: [],
      scrollY: 0,
    },

    onInit() {
      logger.log('Home page init')
    },

    build() {
      this.state.favorites = loadFavorites()
      this.renderPage()
    },

    renderPage() {
      const favorites = this.state.favorites

      // Background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })

      // Header
      this.renderHeader()

      if (favorites.length === 0) {
        this.renderEmptyState()
      } else {
        this.renderFavoritesList(favorites)
      }

      // Add button at bottom
      this.renderAddButton(favorites.length)
    },

    renderHeader() {
      // Header background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: HEADER_H,
        color: COLOR_CARD_BG,
      })

      // App title
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: 0,
        w: SCREEN_W - MARGIN * 2 - 48,
        h: HEADER_H,
        text: 'Transport BY',
        text_size: FONT_SIZE_TITLE,
        color: COLOR_PRIMARY,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
      })

      // Settings button
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: SCREEN_W - MARGIN - 44,
        y: 0,
        w: 44,
        h: HEADER_H,
        text: '⚙',
        text_size: 24,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        click_func: () => {
          push({
            url: 'page/settings/index',
          })
        },
      })
    },

    renderEmptyState() {
      const centerY = SCREEN_H / 2

      // Bus icon (placeholder)
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: (SCREEN_W - EMPTY_ICON_SIZE) / 2,
        y: centerY - 80,
        w: EMPTY_ICON_SIZE,
        h: EMPTY_ICON_SIZE,
        text: '🚌',
        text_size: 48,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: centerY - 10,
        w: CONTENT_W,
        h: 30,
        text: 'No favorites yet',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: MARGIN,
        y: centerY + 28,
        w: CONTENT_W,
        h: 26,
        text: 'Tap + to add a stop',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    renderFavoritesList(favorites) {
      const listTop = HEADER_H + 8
      const maxVisible = Math.floor(
        (SCREEN_H - HEADER_H - ADD_BTN_H - 20) / (CARD_H + CARD_GAP)
      )

      // Scrollable list
      favorites.slice(0, MAX_FAVORITES).forEach((stop, index) => {
        const cardY = listTop + index * (CARD_H + CARD_GAP)
        if (cardY + CARD_H > SCREEN_H - ADD_BTN_H - 28) return
        this.renderStopCard(stop, index, cardY)
      })

      // Scroll hint if more items
      if (favorites.length > maxVisible) {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: 0,
          y: SCREEN_H - ADD_BTN_H - 36,
          w: SCREEN_W,
          h: 18,
          text: `${favorites.length} stops – scroll for more`,
          text_size: FONT_SIZE_SMALL - 2,
          color: COLOR_TEXT_DIM,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
        })
      }
    },

    renderStopCard(stop, index, cardY) {
      const cardNav = () =>
        push({
          url: 'page/arrivals/index',
          params: JSON.stringify({ stop, index }),
        })
      const removeStop = () => {
        this.state.favorites = removeFavorite(index)
        this.renderPage()
      }
      const contentW = CONTENT_W - CARD_ACTION_W - 12
      const stopName = stop.StopName || 'Unknown stop'
      const address = stop.Address || ''
      const routeStr = stop.Routes && stop.Routes.length > 0 ? stop.Routes.slice(0, 4).join('  ') : ''
      const lines = [stopName, address, routeStr].filter(Boolean)
      const buttonLabel = lines.join('\n')
      const hasExtra = address || routeStr

      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: cardY,
        w: CONTENT_W,
        h: CARD_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN + 12,
        y: cardY + 6,
        w: contentW,
        h: CARD_H - 12,
        normal_color: COLOR_CARD_BG,
        press_color: 0x2a2a2a,
        text: buttonLabel,
        text_size: hasExtra ? FONT_SIZE_TINY : FONT_SIZE_BODY,
        color: COLOR_TEXT,
        radius: 6,
        click_func: cardNav,
      })

      // Remove favourite shortcut
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN + CONTENT_W - CARD_ACTION_W,
        y: cardY,
        w: CARD_ACTION_W,
        h: CARD_H,
        normal_color: 0x2a1010,
        press_color: 0x3a1616,
        text: 'X',
        text_size: FONT_SIZE_SMALL,
        color: COLOR_ERROR,
        radius: 8,
        click_func: removeStop,
      })
    },

    renderAddButton(count) {
      const btnY = SCREEN_H - ADD_BTN_H - 24
      const canAdd = count < MAX_FAVORITES

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN,
        y: btnY,
        w: CONTENT_W,
        h: ADD_BTN_H,
        normal_color: canAdd ? COLOR_PRIMARY : 0x333333,
        press_color: canAdd ? 0x00a884 : 0x333333,
        text: canAdd ? '+ Add stop' : `Max ${MAX_FAVORITES} stops`,
        color: canAdd ? COLOR_BG : COLOR_TEXT_DIM,
        text_size: FONT_SIZE_BODY,
        radius: 28,
        click_func: canAdd
          ? () => {
              push({ url: 'page/add-stop/index' })
            }
          : undefined,
      })
    },

    onDestroy() {
      logger.log('Home page destroyed')
    },
  })
)
