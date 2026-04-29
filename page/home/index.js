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
} from '../../utils/constants'
import { loadFavorites, saveFavorites, removeFavorite } from '../../utils/storage'

const logger = Logger.getLogger('home')

// Route type → badge color (mirrors arrivals screen)
const ROUTE_TYPE_COLORS = {
  0: 0x00c853, // bus – green
  1: 0x2196f3, // trolleybus – blue
  2: 0xf44336, // tram – red
  3: 0xff9800, // minibus – orange
  4: 0x9c27b0, // metro – purple
}

// Layout constants
const HEADER_H = 10
const CARD_H = 112
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
          }).catch(() => { })
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

      favorites.forEach((stop, index) => {
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
        }).catch(() => { })
        this.renderPage()
      }

      const stopName = stop.StopName || 'Unknown stop'
      const address = stop.Address || ''
      const routeItems = Array.isArray(stop.Routes) ? stop.Routes : []
      const routes = []
      const seen = new Set()
      for (const item of routeItems) {
        const r = item.result || item
        const num = r.Number || ''
        const type = r.Type != null ? r.Type : 0
        if (num && !seen.has(num)) {
          seen.add(num)
          routes.push({ num, type })
        }
      }
      const displayRoutes = routes.slice(0, 7)
      const navW = CONTENT_W - CARD_ACTION_W

      // Shared card background – animated as one unit on press
      const cardBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: cardY,
        w: CONTENT_W,
        h: CARD_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      // GROUP is transparent – children use group-relative coordinates
      // Non-interactive children (TEXT, FILL_RECT) pass touches up to the group
      const navGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: MARGIN,
        y: cardY,
        w: navW,
        h: CARD_H,
      })

      // Stop name
      navGroup.createWidget(hmUI.widget.TEXT, {
        x: 10,
        y: 8,
        w: navW - 10,
        h: 34,
        text: stopName,
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Address
      if (address) {
        navGroup.createWidget(hmUI.widget.TEXT, {
          x: 10,
          y: 46,
          w: navW - 10,
          h: 26,
          text: address,
          text_size: FONT_SIZE_SMALL,
          color: COLOR_TEXT_DIM,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.ELLIPSIS,
        })
      }

      // Route badges (group-relative y)
      const badgeY = CARD_H - 32 + 4
      let badgeX = 8
      for (const route of displayRoutes) {
        const badgeW = Math.max(32, route.num.length * 11 + 10)
        const color = ROUTE_TYPE_COLORS[route.type] || ROUTE_TYPE_COLORS[0]
        navGroup.createWidget(hmUI.widget.FILL_RECT, {
          x: badgeX,
          y: badgeY,
          w: badgeW,
          h: 24,
          color,
          radius: 4,
        })
        navGroup.createWidget(hmUI.widget.TEXT, {
          x: badgeX,
          y: badgeY,
          w: badgeW,
          h: 24,
          text: route.num,
          text_size: FONT_SIZE_TINY,
          color: 0x000000,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
        })
        badgeX += badgeW + 4
      }

      // Whole nav area animates as one: change shared card bg color on press/release
      navGroup.addEventListener(hmUI.event.CLICK_DOWN, () => {
        cardBg.setProperty(hmUI.prop.MORE, { color: 0x2a2a2a })
      })
      navGroup.addEventListener(hmUI.event.CLICK_UP, () => {
        cardBg.setProperty(hmUI.prop.MORE, { color: COLOR_CARD_BG })
        cardNav()
      })

      // Remove favourite button
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

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN,
        y: btnY,
        w: CONTENT_W,
        h: ADD_BTN_H,
        normal_color: COLOR_PRIMARY,
        press_color: 0x00a884,
        text: '+ Add stop',
        color: COLOR_BG,
        text_size: FONT_SIZE_BODY,
        radius: 28,
        click_func: () => push({ url: 'page/add-stop/index' })
      })
    },
  })
)
