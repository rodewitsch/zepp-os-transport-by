function detectDarkTheme() {
  try {
    var els = [document.body, document.documentElement, document.body && document.body.firstChild]
    for (var i = 0; i < els.length; i++) {
      if (!els[i]) continue
      var bg = getComputedStyle(els[i]).backgroundColor
      if (bg) {
        var m = bg.match(/\d+/g)
        if (m && m.length >= 3) {
          var r = +m[0], g = +m[1], b = +m[2]
          if (r + g + b > 0) {
            return (0.299 * r + 0.587 * g + 0.114 * b) < 128
          }
        }
      }
    }
    var html = document.documentElement
    if (html) {
      var cls = (html.className || '') + ' ' + (html.getAttribute('data-theme') || '') + ' ' + (html.getAttribute('data-color-mode') || '')
      if (/dark/i.test(cls)) return true
      if (/light/i.test(cls)) return false
    }
  } catch (e) {}
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

var isDark = detectDarkTheme()

const THEME = isDark
  ? {
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
  : {
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

/**
 * Build route badge elements from a stop's Routes array.
 * @param {any} stop
 * @param {any} colors
 * @returns {any[]}
 */
function buildRouteBadges(stop, colors) {
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
  },

  build(props) {
    isDark = detectDarkTheme()

    const ROUTE_TYPE_COLORS = isDark
      ? { 0: '#3d8b5e', 1: '#4a7a9e', 2: '#b55252', 3: '#c48a42', 4: '#7a4a8a' }
      : { 0: '#00c853', 1: '#2196f3', 2: '#f44336', 3: '#ff9800', 4: '#9c27b0' }

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
                ...buildRouteBadges(fav, ROUTE_TYPE_COLORS),
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
    return Section({ style: { background: THEME.bg, color: THEME.text, padding: '12px 0' } }, [
      // Search
      Section({ style: { background: THEME.bg } }, [
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
              { style: { color: THEME.textSecondary, fontStyle: 'italic' } },
              'Нет избранных остановок. Используйте поиск выше.'
            )]
      ),
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
  },
})
