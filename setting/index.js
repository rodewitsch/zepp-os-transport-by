// Route type → badge color (mirrors watch face)
const ROUTE_TYPE_COLORS = {
  0: '#00c853', // bus – green
  1: '#2196f3', // trolleybus – blue
  2: '#f44336', // tram – red
  3: '#ff9800', // minibus – orange
  4: '#9c27b0', // metro – purple
}

/**
 * Build route badge elements from a stop's Routes array.
 * @param {any} stop
 * @returns {any[]}
 */
function buildRouteBadges(stop, colors, isDark) {
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
  if (routes.length === 0) return []

  return routes.slice(0, 7).map((route) => {
    const color = colors[route.type] || colors[0]
    return View(
      {
        style: {
          display: 'inline-block',
          background: color,
          color: isDark ? '#000' : '#fff',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 'bold',
          padding: '2px 6px',
          marginRight: '4px',
          marginBottom: '4px',
          lineHeight: '1.4',
        },
      },
      [Text({}, route.num)]
    )
  })
}

AppSettingsPage({
  state: {
    searchQuery: '',
    searchResults: [],
    favorites: [],
    expandedStops: {},
    searching: false,
    initialized: false,
    currentView: 'stops',
    pendingDelete: null,
    darkMode: false,
    refreshInterval: 30,
  },

  build(props) {
    if (!this.state.initialized) {
      this.state.initialized = true
      props.settingsStorage.setItem('searchResults', JSON.stringify([]))
      props.settingsStorage.setItem('searching', 'false')
      props.settingsStorage.setItem('pendingDelete', '')
    }
    this.loadStorage(props)

    if (this.state.currentView === 'settings') {
      return this.buildSettingsView(props)
    }

    const { settingsStorage } = props
    const isDark = this.state.darkMode
    const THEME = isDark
      ? { bg: '#1a1a2e', border: '#2a2a4a', text: '#e0e0e0', textSec: '#999', textMut: '#aaa', btnBg: '#2a2a4a', btnText: '#e0e0e0', accent: '#5a7aaa', inputBorder: '#333', surface: '#16213e' }
      : { bg: '#ffffff', border: '#ddd', text: '#1a1a1a', textSec: '#555', textMut: '#777', btnBg: '#e0e0e0', btnText: '#1a1a1a', accent: '#8899aa', inputBorder: '#ccc', surface: '#f0f0f0' }
    const BADGE_COLORS = isDark
      ? { 0: '#3d8b5e', 1: '#4a7a9e', 2: '#b55252', 3: '#c48a42', 4: '#7a4a8a' }
      : { 0: '#00c853', 1: '#2196f3', 2: '#f44336', 3: '#ff9800', 4: '#9c27b0' }

    // --- Search Results ---
    const resultsUI = this.state.searchResults.map((stop) => {
      const stopId = String(stop.StopId || '')
      const alreadyAdded = this.state.favorites.some((f) => String(f.StopId) === stopId)

      return View(
        {
          style: {
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '12px',
            borderBottom: '1px solid ' + THEME.border
          },
        },
        [
          View({ style: { display: 'flex', flexDirection: 'column', flex: 1, width: '100px' } }, [
            Text({ bold: true, style: { color: THEME.text } }, stop.StopName || ''),
            Text(
              { style: { fontSize: '12px', color: THEME.textSec } },
              stop.Address || ''
            ),
            (stop.RoutesSummary && stop.RoutesSummary.map
              ? stop.RoutesSummary.map((part) => Text({ style: { fontSize: '12px', color: THEME.textMut } }, part))
              : Text({ style: { fontSize: '12px', color: THEME.textMut, fontStyle: 'italic' } }, 'Нет данных о маршрутах')
            )
          ]),
          alreadyAdded
            ? View({ style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [Text({ style: { color: '#00c853', fontSize: '18px', fontWeight: 'bold' } }, '✓')])
            : Button({
              label: '+',
              style: {
                background: THEME.btnBg,
                color: THEME.btnText,
                borderRadius: '4px',
                fontSize: '14px',
                padding: '4px 8px',
                minWidth: '28px',
                width: '28px',
                height: '28px',
                boxShadow: 'none',
              },
              onClick: () => {
                const favs = this.state.favorites.slice()
                // Store the raw API object — same shape the watch uses
                favs.push(stop)
                settingsStorage.setItem('favorites', JSON.stringify(favs))
              },
            }),
        ]
      )
    })

    // --- Favorites ---
    const favoritesUI = this.state.favorites.map((fav, idx) => {
      const isFirst = idx === 0
      const isLast = idx === this.state.favorites.length - 1
      const favCount = this.state.favorites.length
      const isOnly = favCount <= 1

      const btnMoveUp = isFirst || isOnly
        ? undefined
        : Button({
          label: '▲',
          style: {
            background: THEME.btnBg,
            color: THEME.btnText,
            borderRadius: '4px',
            fontSize: '12px',
            padding: '2px 6px',
            marginBottom: '2px',
            minWidth: '24px',
            width: '24px',
            boxShadow: 'none',
          },
          onClick: () => {
            const favs = this.state.favorites.slice()
              ;[favs[idx - 1], favs[idx]] = [favs[idx], favs[idx - 1]]
            settingsStorage.setItem('favorites', JSON.stringify(favs))
          },
        })

      const btnMoveDown = isLast || isOnly
        ? undefined
        : Button({
          label: '▼',
          style: {
            background: THEME.btnBg,
            color: THEME.btnText,
            borderRadius: '4px',
            fontSize: '12px',
            padding: '2px 6px',
            marginTop: '4px',
            minWidth: '24px',
            width: '24px',
            boxShadow: 'none',
          },
          onClick: () => {
            const favs = this.state.favorites.slice()
              ;[favs[idx], favs[idx + 1]] = [favs[idx + 1], favs[idx]]
            settingsStorage.setItem('favorites', JSON.stringify(favs))
          },
        })

      const isExpanded = this.state.expandedStops[idx] || false
      const btnInfo = View({
        style: {
          background: isExpanded ? THEME.btnBg : THEME.surface,
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        },
        onClick: () => {
          const expanded = { ...this.state.expandedStops }
          expanded[idx] = !expanded[idx]
          this.state.expandedStops = expanded
          settingsStorage.setItem('expandedStops', JSON.stringify(expanded))

          if (expanded[idx] && (!Array.isArray(fav.RoutesSummary) || fav.RoutesSummary.length === 0)) {
            settingsStorage.setItem('routeSummaryRequest', JSON.stringify({
              stopId: fav.StopId,
              favIndex: idx,
            }))
          }
        },
      }, [Text({
        style: {
          color: isExpanded ? THEME.text : THEME.btnText,
          fontSize: '17px',
          fontWeight: '200',
          marginTop: '1px'
        },
      }, 'ⓘ')])

      return View(
        {
          style: {
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            padding: '12px',
            borderBottom: '1px solid ' + THEME.border,
          },
        },
        [
          View({
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
            },
          }, [
            View({
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '8px',
              },
            }, [btnMoveUp, btnMoveDown]),
            View({ style: { flex: 1, display: 'flex', flexDirection: 'column' } }, [
              Text({ bold: true, style: { color: THEME.text } }, fav.StopName || ''),
              Text(
                { style: { fontSize: '12px', color: THEME.textSec } },
                fav.Address || ''
              ),
              View({ style: { display: 'flex', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' } }, [
                ...buildRouteBadges(fav, BADGE_COLORS, isDark),
                btnInfo,
              ]),
            ]),
            Button({
              label: '✕',
              style: {
                background: THEME.btnBg,
                color: THEME.btnText,
                borderRadius: '4px',
                fontSize: '14px',
                padding: '4px 8px',
                minWidth: '28px',
                width: '28px',
                height: '28px',
                boxShadow: 'none',
              },
              onClick: () => {
                settingsStorage.setItem('pendingDelete', JSON.stringify({
                  stopId: String(fav.StopId || ''),
                  name: fav.StopName || 'Неизвестная остановка',
                }))
              },
            }),
          ]),
          isExpanded && Array.isArray(fav.RoutesSummary) && fav.RoutesSummary.length > 0
            ? View({
              style: {
                display: 'flex',
                flexDirection: 'column',
                marginTop: '8px',
                paddingLeft: '31px',
              },
            }, fav.RoutesSummary.map((part) =>
              Text({ style: { fontSize: '12px', color: THEME.textMut } }, part)
            ))
            : undefined,
        ]
      )
    })

    // --- Layout ---
    // Inject CSS to set body/html background for full-screen theme
    if (typeof document !== 'undefined') {
      const styleId = 'theme-bg-style'
      let el = document.getElementById(styleId)
      if (!el) {
        el = document.createElement('style')
        el.id = styleId
        document.head.appendChild(el)
      }
      el.textContent = 'html,body{background:' + THEME.bg + '!important;margin:0;padding:0}'
    }

    return Section({ style: { background: THEME.bg, color: THEME.text, padding: '12px 0', colorScheme: isDark ? 'dark' : 'light', minHeight: '100vh' } }, [
      // Search + Settings button in one row
      Section({ style: { background: THEME.bg } }, [
        View({
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            margin: '0 10px 8px',
            gap: '6px',
          },
        }, [
          View({
            style: {
              position: 'relative',
              border: '1px solid ' + THEME.inputBorder,
              borderRadius: '8px',
              height: '36px',
              fontSize: '14px',
              flex: 1,
              overflow: 'hidden',
            }
          }, [TextInput({
            label: this.state.searchQuery || 'Введите название остановки',
            labelStyle: {
              padding: '8px 36px 8px 10px',
              display: 'flex',
              width: '100%',
              height: '5vh',
              color: THEME.text,
            },
            inputStyle: {
              color: THEME.text,
            },
            onChange: (val) => {
              // Keep in ephemeral state only — no settingsStorage write to avoid re-render
              this.state.searchQuery = val;
              const query = this.state.searchQuery || ''
              if (query.trim().length >= 2) {
                settingsStorage.setItem('searching', 'true')
                settingsStorage.setItem('searchResults', JSON.stringify([]))
                settingsStorage.setItem(
                  'searchRequest',
                  JSON.stringify({
                    query: query.trim(),
                    timestamp: Date.now(),
                  })
                )
              }
            },
          }),
          Button({
            label: '✕',
            style: {
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: THEME.btnBg,
              color: THEME.btnText,
              borderRadius: '4px',
              fontSize: '14px',
              padding: '4px 8px',
              minWidth: '28px',
              width: '28px',
              height: '28px',
              boxShadow: 'none',
            },
            onClick: () => {
              this.state.searchQuery = ''
              settingsStorage.setItem('searching', 'false')
              settingsStorage.setItem('searchResults', JSON.stringify([]))
            },
          })]),
          Button({
            label: '⚙',
            style: {
              background: THEME.btnBg,
              color: THEME.btnText,
              borderRadius: '8px',
              fontSize: '16px',
              padding: '0',
              minWidth: '36px',
              width: '36px',
              height: '36px',
              boxShadow: 'none',
            },
            onClick: () => {
              this.state.currentView = 'settings'
              settingsStorage.setItem('currentView', 'settings')
            },
          }),
        ]),
        this.state.searching
          ? Text(
            { style: { color: THEME.textSec, padding: '8px 0', fontStyle: 'italic' } },
            'Загрузка результатов...'
          )
          : resultsUI.length > 0
            ? View({}, resultsUI)
            : undefined,
      ]),

      // Favorites
      Section(
        {
          style: {
            marginTop: '20px',
            background: THEME.bg,
          }
        },
        [
          Text({ style: { marginBottom: '8px', fontSize: '20px', bold: true, textAlign: 'center', display: 'block', color: THEME.text } }, 'Избранные (' + this.state.favorites.length + ')'),
          this.state.favorites.length > 0
            ? favoritesUI
            : Text(
              { style: { color: THEME.textSec, fontStyle: 'italic' } },
              'Нет избранных остановок. Используйте поиск выше.'
            )]
      ),

      // Confirmation modal for deleting a favorite stop
      this.state.pendingDelete
        ? View({
          style: {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: '999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }, [
          View({
            style: {
              background: THEME.surface,
              border: '1px solid ' + THEME.border,
              borderRadius: '12px',
              padding: '20px',
              margin: '24px',
              width: '100%',
              maxWidth: '300px',
            },
          }, [
            Text(
              { bold: true, style: { fontSize: '16px', color: THEME.text, marginBottom: '8px', display: 'block' } },
              'Удалить остановку?'
            ),
            Text(
              { style: { fontSize: '13px', color: THEME.textSec, marginBottom: '16px', display: 'block' } },
              '«' + this.state.pendingDelete.name + '» будет удалена из избранных.'
            ),
            View({
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: '8px',
              },
            }, [
              Button({
                label: 'Отмена',
                style: {
                  background: THEME.btnBg,
                  color: THEME.btnText,
                  borderRadius: '6px',
                  fontSize: '14px',
                  padding: '6px 14px',
                  boxShadow: 'none',
                },
                onClick: () => {
                  settingsStorage.setItem('pendingDelete', '')
                },
              }),
              Button({
                label: 'Удалить',
                style: {
                  background: '#f44336',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '14px',
                  padding: '6px 14px',
                  boxShadow: 'none',
                },
                onClick: () => {
                  const stopId = String((this.state.pendingDelete && this.state.pendingDelete.stopId) || '')
                  const favs = this.state.favorites.slice()
                  const deleteIdx = favs.findIndex((f) => String(f.StopId) === stopId)
                  if (deleteIdx !== -1) {
                    favs.splice(deleteIdx, 1)
                    settingsStorage.setItem('favorites', JSON.stringify(favs))
                  }
                  settingsStorage.setItem('pendingDelete', '')
                },
              }),
            ]),
          ]),
        ])
        : undefined,
    ])
  },

  loadStorage(props) {
    const s = props.settingsStorage;

    try {
      const f = s.getItem('favorites')
      this.state.favorites = f ? JSON.parse(f) : []
    } catch (e) {
      this.state.favorites = []
    }

    try {
      const pd = s.getItem('pendingDelete')
      this.state.pendingDelete = pd ? JSON.parse(pd) : null
    } catch (e) {
      this.state.pendingDelete = null
    }

    try {
      const r = s.getItem('searchResults')
      this.state.searchResults = r ? JSON.parse(r) : []
    } catch (e) {
      this.state.searchResults = []
    }

    this.state.searching = s.getItem('searching') === 'true'

    try {
      const e = s.getItem('expandedStops')
      this.state.expandedStops = e ? JSON.parse(e) : {}
    } catch (_e) {
      this.state.expandedStops = {}
    }

    const dm = s.getItem('darkMode')
    // Light theme is the default; only switch to dark when explicitly set
    this.state.darkMode = dm === null ? false : dm === 'true'

    const ri = s.getItem('refreshInterval')
    this.state.refreshInterval = ri ? parseInt(ri, 10) || 30 : 30

    this.state.currentView = s.getItem('currentView') || 'stops'
  },

  buildSettingsView(props) {
    const { settingsStorage } = props
    const isDark = this.state.darkMode

    const THEME = isDark
      ? { bg: '#1a1a2e', border: '#2a2a4a', text: '#e0e0e0', btnBg: '#2a2a4a', btnText: '#e0e0e0', accent: '#5a7aaa', surface: '#16213e' }
      : { bg: '#ffffff', border: '#ddd', text: '#1a1a1a', btnBg: '#e0e0e0', btnText: '#1a1a1a', accent: '#8899aa', surface: '#f0f0f0' }

    const REFRESH_OPTIONS = [
      { value: 15, label: '15 сек' },
      { value: 30, label: '30 сек' },
      { value: 60, label: '1 мин' },
      { value: 120, label: '2 мин' },
      { value: 300, label: '5 мин' },
    ]

    if (typeof document !== 'undefined') {
      const styleId = 'theme-bg-style'
      let el = document.getElementById(styleId)
      if (!el) {
        el = document.createElement('style')
        el.id = styleId
        document.head.appendChild(el)
      }
      el.textContent = 'html,body{background:' + THEME.bg + '!important;margin:0;padding:0}'
    }

    return Section({ style: { background: THEME.bg, color: THEME.text, padding: '16px 12px', minHeight: '100vh' } }, [
      // Back button + Title in one row
      View({ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: '16px' } }, [
        View({
          style: { background: THEME.btnBg, borderRadius: '20px', padding: '6px 12px', cursor: 'pointer', width: '80px' },
          onClick: () => { this.state.currentView = 'stops'; settingsStorage.setItem('currentView', 'stops') },
        }, [Text({ style: { color: THEME.btnText, fontSize: '14px' } }, '< Назад')]),
        Text({ style: { fontSize: '20px', bold: true, color: THEME.text, flex: 1, textAlign: 'center' } }, 'Настройки'),
        View({ style: { width: '80px' } }),
      ]),

      // Theme toggle
      View({
        style: { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid ' + THEME.border },
      }, [
        Text({ style: { color: THEME.text, fontSize: '15px' } }, 'Тёмная тема'),
        View({
          style: { background: isDark ? THEME.accent : THEME.btnBg, borderRadius: '20px', padding: '6px 16px', cursor: 'pointer' },
          onClick: () => {
            this.state.darkMode = !this.state.darkMode
            settingsStorage.setItem('darkMode', this.state.darkMode ? 'true' : 'false')
          },
        }, [Text({ style: { color: isDark ? '#fff' : '#000', fontSize: '14px' } }, isDark ? 'Выкл' : 'Вкл')]),
      ]),

      // Refresh interval
      View({ style: { display: 'flex', flexDirection: 'column', padding: '12px 0' } }, [
        Text({ style: { color: THEME.text, fontSize: '15px', marginBottom: '10px' } }, 'Обновление данных'),
        View({ style: { display: 'flex', flexDirection: 'row', gap: '6px' } },
          REFRESH_OPTIONS.map((opt) =>
            View({
              style: { background: this.state.refreshInterval === opt.value ? THEME.accent : THEME.btnBg, borderRadius: '16px', padding: '8px 0', cursor: 'pointer', flex: 1, textAlign: 'center' },
              onClick: () => {
                this.state.refreshInterval = opt.value
                settingsStorage.setItem('refreshInterval', String(opt.value))
              },
            }, [Text({ style: { color: this.state.refreshInterval === opt.value ? (isDark ? '#fff' : '#000') : THEME.btnText, fontSize: '13px', textAlign: 'center', display: 'block' } }, opt.label)])
          )
        ),
      ]),
    ])
  },
})
