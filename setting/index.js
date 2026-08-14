const THEME_DARK = {
  bg: '#1a1a2e',
  surface: '#16213e',
  border: '#2a2a4a',
  text: '#e0e0e0',
  textSecondary: '#888',
  textMuted: '#666',
  btnBg: '#2a2a4a',
  btnText: '#e0e0e0',
  accent: '#00c853',
  inputBorder: '#333',
}

const THEME_LIGHT = {
  bg: '#ffffff',
  surface: '#f0f0f0',
  border: '#ddd',
  text: '#1a1a1a',
  textSecondary: '#666',
  textMuted: '#999',
  btnBg: '#e0e0e0',
  btnText: '#1a1a1a',
  accent: '#00c853',
  inputBorder: '#ccc',
}

const BADGE_COLORS_DARK = { 0: '#3d8b5e', 1: '#4a7a9e', 2: '#b55252', 3: '#c48a42', 4: '#7a4a8a' }
const BADGE_COLORS_LIGHT = { 0: '#00c853', 1: '#2196f3', 2: '#f44336', 3: '#ff9800', 4: '#9c27b0' }

/**
 * Build route badge elements from a stop's Routes array.
 * @param {any} stop
 * @param {any} colors
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
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 'bold',
          padding: '2px 6px',
          marginRight: '4px',
          marginBottom: '4px',
          lineHeight: '1.4',
        },
      },
      [Text({ style: { color: isDark ? '#000' : '#fff' } }, route.num)]
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
    darkMode: true,
    refreshInterval: 30,
  },

  build(props) {
    const isDark = this.state.darkMode
    const THEME = isDark ? THEME_DARK : THEME_LIGHT
    const ROUTE_TYPE_COLORS = isDark ? BADGE_COLORS_DARK : BADGE_COLORS_LIGHT

    if (!this.state.initialized) {
      this.state.initialized = true
      props.settingsStorage.setItem('searchResults', JSON.stringify([]))
      props.settingsStorage.setItem('searching', 'false')
    }
    this.loadStorage(props)

    const { settingsStorage } = props

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
              { style: { fontSize: '12px', color: THEME.textSecondary } },
              stop.Address || ''
            ),
            (stop.RoutesSummary && stop.RoutesSummary.map
              ? stop.RoutesSummary.map((part) => Text({ style: { fontSize: '12px', color: THEME.textSecondary } }, part))
              : Text({ style: { fontSize: '12px', color: THEME.textSecondary, fontStyle: 'italic' } }, 'Нет данных о маршрутах')
            )
          ]),
          alreadyAdded
            ? View({ style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [Text({ style: { color: THEME.accent, fontSize: '18px', fontWeight: 'bold' } }, '✓')])
            : Button({
              label: '+',
              style: {
                background: THEME.accent,
                color: '#fff',
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
          background: isExpanded ? THEME.surface : THEME.btnBg,
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          marginTop: '-4px',
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
          marginTop: '-2px'
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
                { style: { fontSize: '12px', color: THEME.textSecondary } },
                fav.Address || ''
              ),
              View({ style: { display: 'flex', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' } }, [
                ...buildRouteBadges(fav, ROUTE_TYPE_COLORS, isDark),
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
                const favs = this.state.favorites.slice()
                favs.splice(idx, 1)
                settingsStorage.setItem('favorites', JSON.stringify(favs))
              },
            }),
          ]),
          isExpanded && Array.isArray(fav.RoutesSummary) && fav.RoutesSummary.length > 0
            ? View({
              style: {
                display: 'flex',
                flexDirection: 'column',
                marginTop: '8px',
                paddingLeft: '40px',
              },
            }, fav.RoutesSummary.map((part) =>
              Text({ style: { fontSize: '12px', color: THEME.textSecondary } }, part)
            ))
            : undefined,
        ]
      )
    })

    // --- Layout ---
    const REFRESH_OPTIONS = [
      { value: 15, label: '15 сек' },
      { value: 30, label: '30 сек' },
      { value: 60, label: '1 мин' },
      { value: 120, label: '2 мин' },
      { value: 300, label: '5 мин' },
    ]

    return Section({ style: { background: THEME.bg, color: THEME.text, padding: '12px 0' } }, [
      // --- General Settings ---
      Section({ style: { background: THEME.bg, padding: '0 12px 16px' } }, [
        Text({ style: { fontSize: '18px', bold: true, color: THEME.text, marginBottom: '12px', display: 'block' } }, '⚙️ Настройки'),

        // Theme toggle
        View({
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: '1px solid ' + THEME.border,
          },
        }, [
          Text({ style: { color: THEME.text, fontSize: '15px' } }, 'Тёмная тема'),
          View({
            style: {
              background: isDark ? THEME.accent : THEME.btnBg,
              borderRadius: '20px',
              padding: '6px 14px',
              cursor: 'pointer',
            },
            onClick: () => {
              this.state.darkMode = !this.state.darkMode
              settingsStorage.setItem('darkMode', this.state.darkMode ? 'true' : 'false')
            },
          }, [Text({ style: { color: '#fff', fontSize: '13px' } }, isDark ? '🌙 Вкл' : '☀️ Выкл')]),
        ]),

        // Refresh interval
        View({
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: '10px 0',
          },
        }, [
          Text({ style: { color: THEME.text, fontSize: '15px', marginBottom: '8px' } }, 'Обновление данных'),
          View({
            style: {
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: '6px',
            },
          }, REFRESH_OPTIONS.map((opt) =>
            View({
              style: {
                background: this.state.refreshInterval === opt.value ? THEME.accent : THEME.btnBg,
                borderRadius: '16px',
                padding: '6px 12px',
                cursor: 'pointer',
              },
              onClick: () => {
                this.state.refreshInterval = opt.value
                settingsStorage.setItem('refreshInterval', String(opt.value))
              },
            }, [Text({ style: { color: this.state.refreshInterval === opt.value ? '#fff' : THEME.btnText, fontSize: '13px' } }, opt.label)])
          )),
        ]),
      ]),

      // --- Stops Management ---
      Section({ style: { background: THEME.bg, marginTop: '8px' } }, [
        Text({ style: { fontSize: '18px', bold: true, color: THEME.text, marginBottom: '12px', padding: '0 12px', display: 'block' } }, '🚌 Остановки'),
        View({
          style: {
            position: 'relative',
            border: '1px solid ' + THEME.inputBorder,
            margin: '0 10px 8px',
            borderRadius: '8px',
            height: '40px',
            fontSize: '14px',
          }
        }, [TextInput({
          label: this.state.searchQuery || 'Введите название остановки',
          labelStyle: {
            padding: '10px 40px 10px 12px',
            display: 'flex',
            width: '100%',
            height: '5vh',
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
        this.state.searching
          ? Text(
            { style: { color: THEME.textSecondary, padding: '8px 0', fontStyle: 'italic' } },
            'Загрузка результатов...'
          )
          : resultsUI.length > 0
            ? View({}, resultsUI)
            : undefined,
      ]),

      // Favorites
      View({ style: { marginTop: '20px' } }, [
        Text({ style: { marginBottom: '8px', fontSize: '18px', bold: true, textAlign: 'center', display: 'block', color: THEME.text } }, 'Избранные (' + this.state.favorites.length + ')'),
        this.state.favorites.length > 0
          ? favoritesUI
          : Text(
            { style: { color: THEME.textSecondary, fontStyle: 'italic' } },
            'Нет избранных остановок. Используйте поиск выше.'
          )
      ]),
    ]),
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
    this.state.darkMode = dm === null ? true : dm === 'true'

    const ri = s.getItem('refreshInterval')
    this.state.refreshInterval = ri ? parseInt(ri, 10) || 30 : 30
  },
})
