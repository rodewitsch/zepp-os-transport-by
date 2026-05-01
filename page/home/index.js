import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { push } from '@zos/router'
import { setScrollLock } from '@zos/page'
import { Vibrator, VIBRATOR_SCENE_SHORT_STRONG } from '@zos/sensor'
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
const vibrator = new Vibrator()

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
const CARD_H = 120
const CARD_GAP = 8
const ADD_BTN_H = 56
const EMPTY_ICON_SIZE = 64
const SNAP_REVEAL_W = 72
const SWIPE_REVEAL_THRESHOLD = 40

Page(
  BasePage({
    state: {
      /** @type {import('../../utils/storage').Stop[]} */
      favorites: [],
      scrollY: 0,
      /** @type {any[]} */
      widgets: [],
      /** @type {Array<() => void>} */
      resets: [],
    },
    build() {
      this.state.favorites = loadFavorites()
      this.renderPage()

      // Sync favorites from Settings App (settingsStorage → device LocalStorage)
      this.request({ method: 'GET_FAVORITES', params: {} })
        .then((data) => {
          const remoteFavs = /** @type {import('../../utils/storage').Stop[]} */ (data && data.favorites ? data.favorites : [])
          if (remoteFavs.length > 0) {
            // Merge: add remote stops not yet in local
            const localFavs = loadFavorites()
            let changed = false
            remoteFavs.forEach((rf) => {
              const rid = String(rf.StopId || '')
              const exists = localFavs.some((lf) => {
                const lid = String(lf.StopId || '')
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

    /**
     * @param {number} type
     * @param {any} props
     * @returns {any}
     */
    _cw(type, props) {
      const w = hmUI.createWidget(type, props)
      this.state.widgets.push(w)
      return w
    },

    renderPage() {
      const favorites = this.state.favorites;

      // Destroy all previously created widgets before rebuilding
      this.state.widgets.forEach((w) => hmUI.deleteWidget(w))
      this.state.widgets = []
      this.state.resets = []

      hmUI.setStatusBarVisible(false);

      // Background – tap on empty space resets all revealed cards
      const bg = this._cw(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SCREEN_W,
        h: SCREEN_H,
        color: COLOR_BG,
      })
      bg.addEventListener(hmUI.event.CLICK_UP, () => {
        this.state.resets.forEach(fn => fn())
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
      this._cw(hmUI.widget.TEXT, {
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

      this._cw(hmUI.widget.TEXT, {
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

      this._cw(hmUI.widget.TEXT, {
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

    /** @param {import('../../utils/storage').Stop[]} favorites */
    renderFavoritesList(favorites) {
      const listTop = HEADER_H + 8

      favorites.forEach((stop, index) => {
        const cardY = listTop + index * (CARD_H + CARD_GAP)
        this.renderStopCard(stop, index, cardY)
      })
    },

    /**
     * @param {import('../../utils/storage').Stop} stop
     * @param {number} index
     * @param {number} cardY
     */
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

      const stopName = stop.StopName || 'Неизвестная остановка'
      const address = stop.Address || ''
      const routeItems = Array.isArray(stop.Routes) ? stop.Routes : []
      const routes = []
      const seen = new Set()
      for (const item of routeItems) {
        const r = item.result || item
        const num = r.Number || ''
        const type = r.Type != null ? r.Type : 0
        if (num && !seen.has(num) && type !== 3) {
          seen.add(num)
          routes.push({ num, type })
        }
      }
      const displayRoutes = routes.slice(0, 7)

      // null = undecided, 'h' = horizontal, 'v' = vertical
      /** @type {'h' | 'v' | null} */
      let gestureDir = null
      let touchStartX = 0
      let touchStartY = 0
      let currentOffset = 0
      let isRevealed = false

      // ── Layer 2: delete tap area (GROUP, below navGroup in z-order) ──
      // Exposed only when navGroup slides left far enough.
      // isRevealed guard prevents accidental fire if touch propagation surprises.
      const deleteGroup = this._cw(hmUI.widget.GROUP, {
        x: MARGIN + CONTENT_W - SNAP_REVEAL_W,
        y: cardY,
        w: SNAP_REVEAL_W,
        h: CARD_H,
      })

      deleteGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: SNAP_REVEAL_W,
        h: CARD_H,
        color: COLOR_ERROR,
        radius: 8,
      })

      // Trash bin icon
      deleteGroup.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: 0,
        w: SNAP_REVEAL_W,
        h: CARD_H,
        text: '\uD83D\uDDD1',
        text_size: 28,
        color: 0xffffff,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })


      deleteGroup.addEventListener(hmUI.event.CLICK_UP, () => {
        removeStop()
      })

      // ── Layer 3: sliding card background ──
      const cardBg = this._cw(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: cardY,
        w: CONTENT_W,
        h: CARD_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      // ── Layer 4: nav group (covers deleteGroup when in default position) ──
      const navGroup = this._cw(hmUI.widget.GROUP, {
        x: MARGIN,
        y: cardY,
        w: CONTENT_W,
        h: CARD_H,
      })

      // Stop name
      navGroup.createWidget(hmUI.widget.TEXT, {
        x: 10,
        y: 8,
        w: CONTENT_W - 10,
        h: 34,
        text: stopName,
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Address
      if (address) {
        navGroup.createWidget(hmUI.widget.TEXT, {
          x: 10,
          y: 46,
          w: CONTENT_W - 10,
          h: 26,
          text: address,
          text_size: FONT_SIZE_SMALL,
          color: COLOR_TEXT_DIM,
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.ELLIPSIS,
        })
      }

      // Route badges (group-relative coordinates)
      const badgeY = CARD_H - 36
      let badgeX = 8
      for (const route of displayRoutes) {
        const badgeW = Math.max(32, route.num.length * 11 + 10)
        if (badgeX + badgeW > CONTENT_W - 8) break
        const color = (/** @type {Record<number, number>} */ (ROUTE_TYPE_COLORS))[route.type] || ROUTE_TYPE_COLORS[0]
        navGroup.createWidget(hmUI.widget.FILL_RECT, {
          x: badgeX, y: badgeY, w: badgeW, h: 24, color, radius: 4,
        })
        navGroup.createWidget(hmUI.widget.TEXT, {
          x: badgeX, y: badgeY, w: badgeW, h: 24,
          text: route.num, text_size: FONT_SIZE_TINY, color: 0x000000,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        })
        badgeX += badgeW + 4
      }

      /** @param {number} offset */
      const applyOffset = (offset) => {
        const newX = MARGIN + offset
        cardBg.setProperty(hmUI.prop.MORE, { x: newX, y: cardY, w: CONTENT_W, h: CARD_H })
        navGroup.setProperty(hmUI.prop.MORE, { x: newX, y: cardY, w: CONTENT_W, h: CARD_H })
      }

      const resetCard = () => {
        isRevealed = false
        applyOffset(0)
      }

      const resetOthers = () => {
        this.state.resets.forEach(fn => fn !== resetCard && fn())
      }

      const snapToRevealed = () => {
        isRevealed = true
        applyOffset(-SNAP_REVEAL_W)
        vibrator.setMode({ mode: VIBRATOR_SCENE_SHORT_STRONG })
        vibrator.start()
      }

      this.state.resets.push(resetCard)

      navGroup.addEventListener(hmUI.event.CLICK_DOWN, (/** @type {any} */ e) => {
        touchStartX = e.x
        touchStartY = e.y
        currentOffset = isRevealed ? -SNAP_REVEAL_W : 0
        gestureDir = null
      })

      navGroup.addEventListener(hmUI.event.MOVE, (/** @type {any} */ e) => {
        const dx = e.x - touchStartX
        const absDx = Math.abs(dx)
        const absDy = Math.abs(e.y - touchStartY)

        if (gestureDir === null) {
          if (absDx < 16 && absDy < 16) return
          gestureDir = absDy > absDx ? 'v' : 'h'
          if (gestureDir === 'h') {
            setScrollLock({ lock: true })
            resetOthers()
          }
          if (gestureDir === 'v') {
            if (isRevealed) resetCard()
            return
          }
        }

        if (gestureDir === 'v') return

        // Finger drifted far outside the card vertically – CLICK_UP won't fire
        // outside widget bounds in Zepp OS, so settle the gesture here.
        if (absDy > CARD_H / 2) {
          setScrollLock({ lock: false })
          if (currentOffset < -SWIPE_REVEAL_THRESHOLD) {
            snapToRevealed()
          } else {
            resetCard()
          }
          resetOthers()
          gestureDir = null
          currentOffset = 0
          return
        }

        const baseOffset = isRevealed ? -SNAP_REVEAL_W : 0
        const offset = Math.max(-SNAP_REVEAL_W, Math.min(0, baseOffset + dx))
        currentOffset = offset
        applyOffset(offset)
      })

      navGroup.addEventListener(hmUI.event.CLICK_UP, () => {
        setScrollLock({ lock: false })

        if (gestureDir === 'h') {
          if (currentOffset < -SWIPE_REVEAL_THRESHOLD) {
            snapToRevealed()
          } else {
            resetCard()
          }
        } else if (gestureDir === null) {
          if (isRevealed) {
            resetCard()
          } else {
            cardNav()
          }
        }

        resetOthers()
        gestureDir = null
        currentOffset = 0
      })


    },

    /** @param {number} count */
    renderAddButton(count) {
      const listBottom = HEADER_H + 8 + count * (CARD_H + CARD_GAP)
      const btnY = Math.max(listBottom + 8, SCREEN_H - ADD_BTN_H - 24)

      this._cw(hmUI.widget.BUTTON, {
        x: MARGIN,
        y: btnY,
        w: CONTENT_W,
        h: ADD_BTN_H,
        normal_color: COLOR_PRIMARY,
        press_color: 0x00a884,
        text: '+ добавить',
        color: COLOR_BG,
        text_size: FONT_SIZE_BODY,
        radius: 28,
        click_func: () => push({ url: 'page/add-stop/index' })
      })
    },
  })
)
