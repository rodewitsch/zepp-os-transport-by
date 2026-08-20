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
  HEADER_TOP,
  BOTTOM_PAD,
  IS_ROUND,
  COLOR_BG,
  COLOR_PRIMARY,
  COLOR_TEXT,
  COLOR_TEXT_DIM,
  COLOR_CARD_BG,
  COLOR_ERROR,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_TINY,
  getSafeBottomDims,
} from '../../utils/constants'
import { loadFavorites, saveFavorites, removeFavorite, saveRefreshInterval, saveAnalyticsEnabled, saveArrivalsCache } from '../../utils/storage'
import { initAnalytics, screenView, track, refreshAnalyticsEnabled } from '../../utils/analytics'

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
const CARD_H = 120
const CARD_GAP = 8
const ADD_BTN_H = 56
const EMPTY_ICON_SIZE = 128
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
      // Analytics: first_open / session_start on every app launch
      initAnalytics()
      screenView('home')

      this.state.favorites = loadFavorites()
      this.renderPage()

      // Preload arrivals for the top favorites in the background so the
      // arrivals page opens instantly when one of them is tapped.
      setTimeout(() => this.preloadArrivals(), 300)

      // Sync favorites from Settings App (settingsStorage → device LocalStorage)
      this.request({ method: 'GET_FAVORITES', params: {} })
        .then((data) => {
          if (data && data.refreshInterval) {
            saveRefreshInterval(data.refreshInterval)
          }
          if (data && typeof data.analyticsEnabled === 'boolean') {
            saveAnalyticsEnabled(data.analyticsEnabled)
            refreshAnalyticsEnabled()
          }
          const remoteFavs = /** @type {import('../../utils/storage').Stop[]} */ (data && data.favorites ? data.favorites : [])
          if (remoteFavs.length > 0) {
            const localFavs = loadFavorites()
            let changed = false

            // Merge: use remote order for matching stops, append new local-only stops
            const merged = []
            const mergedIds = new Set()

            // 1) Walk remote order — take matching local stops or new remote stops
            remoteFavs.forEach((rf) => {
              const rid = String(rf.StopId || '')
              if (!rid) return
              const localMatch = localFavs.find(lf => String(lf.StopId || '') === rid)
              if (localMatch) {
                merged.push(localMatch)
              } else {
                merged.push(rf)       // new stop added on phone
                changed = true
              }
              mergedIds.add(rid)
            })

            // 2) Append any local-only stops (added on watch, not yet on phone)
            localFavs.forEach((lf) => {
              const lid = String(lf.StopId || '')
              if (lid && !mergedIds.has(lid)) {
                merged.push(lf)
              }
            })

            // Detect if order actually changed vs local
            const sameOrder = localFavs.length === merged.length &&
              localFavs.every((lf, i) => String(lf.StopId || '') === String(merged[i].StopId || ''))

            if (!sameOrder || changed) {
              saveFavorites(merged)
              this.state.favorites = merged
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
        this.renderAddButton(0, true)
      } else {
        this.renderFavoritesList(favorites)
      }
    },

    /**
     * Fetch arrivals for the top favorites in the background and cache
     * them on the watch, so opening the arrivals page is instant.
     */
    preloadArrivals() {
      const favorites = this.state.favorites
      const count = Math.min(3, favorites.length)
      for (let i = 0; i < count; i++) {
        const stop = favorites[i]
        const stopId = String(stop.StopId || '')
        if (!stopId) continue
        this.request({
          method: 'GET_ARRIVALS',
          params: { stopId, lang: 'ru' },
        })
          .then((data) => {
            if (data && !data.error && Array.isArray(data.arrivals) && data.arrivals.length > 0) {
              saveArrivalsCache(stopId, data.arrivals, Date.now())
            }
          })
          .catch(() => { })
      }
    },

    renderEmptyState() {
      const TEXT_H = 30
      const ICON_TEXT_GAP = 10
      const ICON_NATIVE_SIZE = 80

      // Vertically center the icon + text group as a whole
      const groupH = EMPTY_ICON_SIZE + ICON_TEXT_GAP + TEXT_H
      const groupTop = (SCREEN_H - groupH) / 2

      // Bus stop icon — icon.png is 80×80. Render at native size without
      // w/h so the IMG widget doesn't stretch it. Center the 80×80 image
      // within the EMPTY_ICON_SIZE (128) vertical slot and horizontally
      // on screen using the actual image width.
      // ⚠️ Do NOT use align_h/align_v on IMG — they change x,y to
      // mean center-point instead of top-left, breaking centering.
      this._cw(hmUI.widget.IMG, {
        x: (SCREEN_W - ICON_NATIVE_SIZE) / 2,
        y: groupTop + (EMPTY_ICON_SIZE - ICON_NATIVE_SIZE) / 2,
        src: 'icon.png',
        color: COLOR_TEXT_DIM,
      })

      this._cw(hmUI.widget.TEXT, {
        x: MARGIN,
        y: groupTop + EMPTY_ICON_SIZE + ICON_TEXT_GAP,
        w: CONTENT_W,
        h: TEXT_H,
        text: 'Нет избранных остановок',
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })
    },

    /** @param {import('../../utils/storage').Stop[]} favorites */
    renderFavoritesList(favorites) {
      const listTop = HEADER_TOP + 4
      const count = favorites.length

      // Available height inside the scroll container
      const availableH = SCREEN_H - listTop
      // Total height of all cards + gap + button
      const totalContentH = count * (CARD_H + CARD_GAP) + 8 + ADD_BTN_H
      const fitsOnScreen = totalContentH <= availableH

      // Scrollable container fills the remaining screen height
      const scrollContainer = this._cw(hmUI.widget.VIEW_CONTAINER, {
        x: 0,
        y: listTop,
        w: SCREEN_W,
        h: availableH,
        scroll_enable: fitsOnScreen ? 0 : 1,
      })

      favorites.forEach((stop, index) => {
        const cardY = index * (CARD_H + CARD_GAP)
        this.renderStopCard(stop, index, cardY, scrollContainer)
      })

      const btnW = IS_ROUND ? Math.floor(CONTENT_W * 0.65) : CONTENT_W
      const padX = Math.floor((CONTENT_W - btnW) / 2)

      // Button position:
      // - если всё влезает — прижимаем к нижнему краю экрана
      // - если не влезает — ставим сразу после последней карточки (скролл)
      const btnY = fitsOnScreen
        ? SCREEN_H - ADD_BTN_H - BOTTOM_PAD - listTop
        : count * (CARD_H + CARD_GAP) + 8

      scrollContainer.createWidget(hmUI.widget.BUTTON, {
        x: MARGIN + padX,
        y: btnY,
        w: btnW,
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

    /**
     * @param {import('../../utils/storage').Stop} stop
     * @param {number} index
     * @param {number} cardY
     * @param {any} [parent]
     */
    renderStopCard(stop, index, cardY, parent) {
      const cw = parent ? (type, props) => parent.createWidget(type, props) : (...args) => this._cw(...args)
      const cardNav = () =>
        push({
          url: 'page/arrivals/index',
          params: JSON.stringify({ stop, index }),
        })
      const removeStop = () => {
        this.state.favorites = removeFavorite(index)
        track('stop_removed', {
          stop_id: String(stop.StopId || ''),
          stop_name: stop.StopName || '',
        })
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
      const deleteGroup = cw(hmUI.widget.GROUP, {
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
      const cardBg = cw(hmUI.widget.FILL_RECT, {
        x: MARGIN,
        y: cardY,
        w: CONTENT_W,
        h: CARD_H,
        color: COLOR_CARD_BG,
        radius: 8,
      })

      // ── Layer 4: nav group (covers deleteGroup when in default position) ──
      const navGroup = cw(hmUI.widget.GROUP, {
        x: MARGIN,
        y: cardY,
        w: CONTENT_W,
        h: CARD_H,
      })

      // Transparent hit-target filling the whole card so taps anywhere
      // on the card register on navGroup, not just on text/badge widgets.
      navGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: CONTENT_W,
        h: CARD_H,
        color: 0x000000,
        alpha: 0,
      })

      // Stop name
      navGroup.createWidget(hmUI.widget.TEXT, {
        x: IS_ROUND ? 14 : 10,
        y: address ? 14 : 26,
        w: CONTENT_W - (IS_ROUND ? 28 : 20),
        h: address ? 26 : 34,
        text: stopName,
        text_size: FONT_SIZE_BODY,
        color: COLOR_TEXT,
        align_h: IS_ROUND ? hmUI.align.CENTER_H : hmUI.align.LEFT,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.ELLIPSIS,
      })

      // Address
      if (address) {
        navGroup.createWidget(hmUI.widget.TEXT, {
          x: IS_ROUND ? 14 : 10,
          y: 44,
          w: CONTENT_W - (IS_ROUND ? 28 : 20),
          h: 24,
          text: address,
          text_size: FONT_SIZE_SMALL,
          color: COLOR_TEXT_DIM,
          align_h: IS_ROUND ? hmUI.align.CENTER_H : hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.ELLIPSIS,
        })
      }

      // Route badges – centered on round, left-aligned on square
      const badgeY = address ? 80 : 72
      const badgeGap = 4
      const badgeWidths = displayRoutes.map(r => Math.max(32, r.num.length * 11 + 10))
      let totalBadgeW = 0
      let badgeCount = 0
      for (let i = 0; i < badgeWidths.length; i++) {
        const nextW = totalBadgeW + badgeWidths[i] + (badgeCount > 0 ? badgeGap : 0)
        if (nextW > CONTENT_W - 16) break
        totalBadgeW = nextW
        badgeCount++
      }
      let badgeX = IS_ROUND ? Math.floor((CONTENT_W - totalBadgeW) / 2) : 8
      for (let i = 0; i < badgeCount; i++) {
        const route = displayRoutes[i]
        const badgeW = badgeWidths[i]
        const color = (/** @type {Record<number, number>} */ (ROUTE_TYPE_COLORS))[route.type] || ROUTE_TYPE_COLORS[0]
        navGroup.createWidget(hmUI.widget.FILL_RECT, {
          x: badgeX, y: badgeY, w: badgeW, h: 24, color, radius: 4,
        })
        navGroup.createWidget(hmUI.widget.TEXT, {
          x: badgeX, y: badgeY, w: badgeW, h: 24,
          text: route.num, text_size: FONT_SIZE_TINY, color: 0x000000,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        })
        badgeX += badgeW + badgeGap
      }

      // MOVE events fire faster than the UI can repaint. Skip redundant
      // setProperty calls when the offset hasn't changed.
      let lastAppliedOffset = null
      /** @param {number} offset */
      const applyOffset = (offset) => {
        if (offset === lastAppliedOffset) return
        lastAppliedOffset = offset
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

    /** @param {number} count @param {boolean} [forceBottom] */
    renderAddButton(count, forceBottom = false) {
      const listBottom = HEADER_TOP + 4 + count * (CARD_H + CARD_GAP)
      const btnY = forceBottom
        ? SCREEN_H - ADD_BTN_H - BOTTOM_PAD
        : Math.min(listBottom + 8, SCREEN_H - ADD_BTN_H - BOTTOM_PAD)
      const { w: btnW, x: padX } = getSafeBottomDims(btnY, ADD_BTN_H, CONTENT_W)

      this._cw(hmUI.widget.BUTTON, {
        x: MARGIN + padX,
        y: btnY,
        w: btnW,
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
