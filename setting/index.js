AppSettingsPage({
  state: {
    searchQuery: '',
    searchResults: [],
    favorites: [],
    searching: false,
  },

  build(props) {
    this.loadStorage(props)

    const { settingsStorage } = props

    // --- Search Results ---
    const resultsUI = this.state.searchResults.map((stop) => {
      const stopId = String(stop.StopID || stop.StopId || '')
      const alreadyAdded = this.state.favorites.some(
        (f) => String(f.StopID || f.StopId || '') === stopId
      )

      return View(
        {
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '12px',
            borderBottom: '1px solid #333',
          },
        },
        [
          View({ style: { flex: 1 } }, [
            Text({ bold: true }, stop.StopName || ''),
            Text(
              { style: { fontSize: '12px', color: '#888' } },
              stop.Address || ''
            ),
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
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '12px',
            borderBottom: '1px solid #333',
          },
        },
        [
          View({ style: { flex: 1 } }, [
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
    return Section({ title: 'Остановка — Настройки' }, [
      // Search
      Section({ title: 'Поиск остановки' }, [
        TextInput({
          label: 'Название остановки',
          onChange: (val) => {
            // Keep in ephemeral state only — no settingsStorage write to avoid re-render
            this.state.searchQuery = val
          },
        }),
        Button({
          label: this.state.searching ? 'Поиск...' : 'Искать',
          style: {
            background: '#2196f3',
            color: '#fff',
            borderRadius: '8px',
            marginTop: '8px',
          },
          onClick: () => {
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
        { title: 'Избранные остановки (' + this.state.favorites.length + ')' },
        this.state.favorites.length > 0
          ? [
              ...favoritesUI,
              Button({
                label: 'Очистить все',
                style: {
                  background: '#880000',
                  color: '#fff',
                  borderRadius: '8px',
                  marginTop: '12px',
                },
                onClick: () => {
                  settingsStorage.setItem('favorites', JSON.stringify([]))
                },
              }),
            ]
          : Text(
              { style: { color: '#888', fontStyle: 'italic' } },
              'Нет избранных остановок. Используйте поиск выше.'
            )
      ),
    ])
  },

  loadStorage(props) {
    const s = props.settingsStorage

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
