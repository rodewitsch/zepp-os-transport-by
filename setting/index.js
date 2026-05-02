AppSettingsPage({
  state: {
    searchQuery: '',
    searchResults: [],
    favorites: [],
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
            ? Text({ style: { color: '#00c853', fontSize: '12px' } }, '★ Добавлено')
            : Button({
              label: '+',
              style: {
                background: '#00c853',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '16px',
                padding: '4px 14px',
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
    const favoritesUI = this.state.favorites.map((fav, idx) =>
      View(
        {
          style: {
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '12px',
            borderBottom: '1px solid #333',
          },
        },
        [
          View({ style: { flex: 1, display: 'flex', flexDirection: 'column' } }, [
            Text({ bold: true }, fav.StopName || ''),
            Text(
              { style: { fontSize: '12px', color: '#888' } },
              fav.Address || ''
            ),
          ]),
          Button({
            label: '✕',
            style: {
              background: '#f44336',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '14px',
              padding: '4px 12px',
            },
            onClick: () => {
              const favs = this.state.favorites.slice()
              favs.splice(idx, 1)
              settingsStorage.setItem('favorites', JSON.stringify(favs))
            },
          }),
        ]
      )
    )

    // --- Layout ---
    return Section({}, [
      // Search
      Section({}, [
        Text({ style: { marginBottom: '8px', fontSize: '20px', bold: true, textAlign: 'center', display: 'block' } }, 'Поиск остановок'),
        View({
          style: {
            display: 'flex',
            border: '1px solid #333',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            margin: '0 10px 8px',
            padding: '0 12px',
            borderRadius: '8px',
            height: '40px',
            fontSize: '14px',
            alignItems: 'center',
          }
        }, [TextInput({
          label: this.state.searchQuery || 'Введите название остановки',
          labelStyle: {
            padding: '10px 0',
            display: 'flex',
            width: '90vw',
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
          label: 'X',
          style: {
            position: 'absolute',
            right: '10px',
            fontSize: '14px',
            background: '#880000',
            color: '#fff',
            borderRadius: '0 8px 8px 0',
            height: '5.2vh',
            marginTop: '',
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
          Text({ style: { marginBottom: '8px', fontSize: '20px', bold: true, textAlign: 'center', display: 'block' } }, 'Избранные остановки (' + this.state.favorites.length + ')'),
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
  },
})
