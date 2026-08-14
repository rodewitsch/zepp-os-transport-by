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
function buildRouteBadges(stop) {
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
    const color = ROUTE_TYPE_COLORS[route.type] || ROUTE_TYPE_COLORS[0]
    return View(
      {
        style: {
          display: 'inline-block',
          background: color,
          color: '#fff',
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
  },

  build(props) {
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
            borderBottom: '1px solid #333'
          },
        },
        [
          View({ style: { display: 'flex', flexDirection: 'column', flex: 1, width: '100px' } }, [
            Text({ bold: true }, stop.StopName || ''),
            Text(
              { style: { fontSize: '12px', color: '#888' } },
              stop.Address || ''
            ),
            (stop.RoutesSummary && stop.RoutesSummary.map
              ? stop.RoutesSummary.map((part) => Text({ style: { fontSize: '12px', color: '#555' } }, part))
              : Text({ style: { fontSize: '12px', color: '#555', fontStyle: 'italic' } }, 'Нет данных о маршрутах')
            )
          ]),
          alreadyAdded
            ? View({ style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [Text({ style: { color: '#00c853', fontSize: '18px', fontWeight: 'bold' } }, '✓')])
            : Button({
              label: '+',
              style: {
                background: '#00c853',
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
            background: '#ddd',
            color: '#000',
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
            background: '#ddd',
            color: '#000',
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
          background: isExpanded ? '#555' : '#ddd',
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
          color: isExpanded ? '#fff' : '#000',
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
            borderBottom: '1px solid #333',
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
              Text({ bold: true }, fav.StopName || ''),
              Text(
                { style: { fontSize: '12px', color: '#888' } },
                fav.Address || ''
              ),
              View({ style: { display: 'flex', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' } }, [
                ...buildRouteBadges(fav),
                btnInfo,
              ]),
            ]),
            Button({
              label: '✕',
              style: {
                background: '#ddd',
                color: '#000',
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
              Text({ style: { fontSize: '12px', color: '#555' } }, part)
            ))
            : undefined,
        ]
      )
    })

    // --- Layout ---
    return Section({}, [
      // Search
      Section({}, [
        View({
          style: {
            position: 'relative',
            border: '1px solid #333',
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
            background: '#ddd',
            color: '#000',
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
            { style: { color: '#888', padding: '8px 0', fontStyle: 'italic' } },
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
          }
        },
        [
          Text({ style: { marginBottom: '8px', fontSize: '20px', bold: true, textAlign: 'center', display: 'block' } }, 'Избранные (' + this.state.favorites.length + ')'),
          this.state.favorites.length > 0
            ? favoritesUI
            : Text(
              { style: { color: '#888', fontStyle: 'italic' } },
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
