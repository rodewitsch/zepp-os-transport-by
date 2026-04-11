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
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  MAX_FAVORITES,
} from '../../utils/constants'
import { loadFavorites, saveFavorites, removeFavorite } from '../../utils/storage'

const logger = Logger.getLogger('home')

// Layout constants
const HEADER_H = 10
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

      // Sync favorites from Settings App (settingsStorage → device LocalStorage)
      this.request({ method: 'GET_FAVORITES', params: {} })
        .then((data) => {
          const remoteFavs = data && data.favorites ? data.favorites : []
          if (remoteFavs.length > 0) {
            // Merge: add remote stops not yet in local
            const localFavs = loadFavorites()
            let changed = false
            remoteFavs.forEach((rf) => {
              const rid = String(rf.StopID || rf.StopId || rf.id || '')
              const exists = localFavs.some((lf) => {
                const lid = String(lf.StopID || lf.StopId || lf.id || '')
                return lid === rid
              })
              if (!exists && rid) {
                localFavs.push(rf)
                changed = true
              }
            })
            if (changed) {
              saveFavorites(localFavs)
              this.state.favorites = localFavs
              this.renderPage()
            }
          }
          // Push local favorites to settingsStorage so Settings App is in sync
          this.request({
            method: 'SAVE_FAVORITES',
            params: { favorites: loadFavorites() },
          }).catch(() => {})
        })
        .catch((err) => {
          logger.log('Favorites sync failed (offline?):', err)
        })
    },

    renderPage() {
      const favorites = this.state.favorites;

      hmUI.setStatusBarVisible(false);

      // Background
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })

      if (favorites.length === 0) {
        this.renderEmptyState()
      } else {
        this.renderFavoritesList(favorites)
      }

      // Add button at bottom
      this.renderAddButton(favorites.length)
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

      favorites.slice(0, MAX_FAVORITES).forEach((stop, index) => {
        const cardY = listTop + index * (CARD_H + CARD_GAP)
        this.renderStopCard(stop, index, cardY)
      })
    },

    renderStopCard(stop, index, cardY) {
      const cardNav = () =>
        push({
          url: 'page/arrivals/index',
          params: JSON.stringify({ stop, index }),
        })
      const removeStop = () => {
        this.state.favorites = removeFavorite(index)
        this.request({
          method: 'SAVE_FAVORITES',
          params: { favorites: this.state.favorites },
        }).catch(() => {})
        this.renderPage()
      }
      const contentW = CONTENT_W - CARD_ACTION_W - 12
      const stopName = stop.StopName || 'Unknown stop'
      const address = stop.Address || ''
      const routeItems = Array.isArray(stop.Routes) ? stop.Routes : []
      const routeNums = []
      const seen = new Set()
      for (const item of routeItems) {
        const r = item.result || item
        const num = r.Number || ''
        if (num && !seen.has(num)) {
          seen.add(num)
          routeNums.push(num)
        }
      }
      const routeStr = routeNums.slice(0, 6).join('  ')
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
      const listBottom = HEADER_H + 8 + count * (CARD_H + CARD_GAP)
      const btnY = Math.max(listBottom + 8, SCREEN_H - ADD_BTN_H - 24)
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
