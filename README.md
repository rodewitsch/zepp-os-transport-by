# Остановка – Transport BY Zepp OS Mini Program

A Zepp OS Mini Program for **Amazfit Bip 6**, **Amazfit Balance 2**, **Amazfit T-Rex 3**, **Amazfit T-Rex 3 Pro**, **Amazfit Active 2**, and **Amazfit Bip Max** that shows
real-time public transport arrival predictions from [transport-by.app](https://transport-by.app/),
the official passenger transport app for the Republic of Belarus.

## Features

- **Multi-device** – supports Amazfit Bip 6 (390 px), Balance 2 (480 px), T-Rex 3 (480 px), T-Rex 3 Pro (480 px), Active 2 (466 px), and Bip Max (432 px)
- **Round screen support** – safe-area calculations for circular watch bezels
- **Favourite stops** – save bus/tram/trolleybus/metro stops on the watch
- **Live arrivals** – see upcoming vehicles with minutes-until-arrival, colour-coded by transport type
- **Auto-refresh** – arrivals update every 30 seconds automatically
- **Bright screen** – screen stays on and palm/drop-wrist sleep is disabled while viewing arrivals
- **Stop search** – search stops by name on the watch using the on-device keyboard, or in the Zepp phone app Settings UI
- **Swipe to delete** – swipe a stop card left on the home screen to reveal a red delete button
- **Route summaries** – when searching, each stop shows its available routes with destination names (e.g. `91→Веснинка`)
- **Favourites sync** – favourites added/removed on the watch are synced to the phone Settings UI and vice versa
- **Offline safe** – graceful error messages when offline or API unavailable

## Supported devices

| Device | Design width | Screen shape | Device sources |
|--------|-------------|-------------|----------------|
| Amazfit Bip 6 | 390 px | Square | `9765120`, `9765121`, `10158337` |
| Amazfit Balance 2 | 480 px | Round | `9568512`, `9568513`, `9568515` |
| Amazfit T-Rex 3 | 480 px | Round | `8716544`, `8716545`, `8716547` |
| Amazfit T-Rex 3 Pro | 480 px | Round | `10551552`, `10551553`, `10551555` |
| Amazfit Active 2 | 466 px | Round | `8913152`, `8913153`, `8913155`, `8913159`, `10092800`, `10092801`, `10092803`, `10092807` |
| Amazfit Bip Max | 432 px | Square | `11206915` |

## App structure

```
zepp-os-transport-by-app/
├── app.json                 ← Multi-target Mini Program configuration (Bip 6 & Balance 2)
├── app.js                   ← App lifecycle & global data
├── package.json
├── jsconfig.json
├── CHANGELOG.md
├── README.md
├── app-side/
│   └── index.js             ← Companion service (runs on phone; all HTTP requests made here)
├── page/
│   ├── home/index.js        ← Favourite stops list (entry point); swipe-to-delete cards, favourites sync
│   ├── arrivals/index.js    ← Live arrival board for a selected stop; auto-refreshes every 30 s
│   └── add-stop/index.js    ← Search & add a new favourite stop from the watch (on-device keyboard)
├── setting/
│   └── index.js             ← Zepp Settings App UI (runs on phone); stop search, route summaries, favourites management
├── utils/
│   ├── constants.js         ← Device-aware layout constants (screen size, safe zones, colours, fonts)
│   ├── spinner.js           ← Animated arc spinner widget for loading states
│   └── storage.js           ← LocalStorage helpers for favourites & settings
├── assets/
│   ├── bip6/                ← Bip 6 device assets (icons, images)
│   ├── balance2/            ← Balance 2 device assets (icons, images)
│   ├── trex3/               ← T-Rex 3 device assets
│   ├── trex3pro/            ← T-Rex 3 Pro device assets
│   ├── active2/             ← Active 2 device assets
│   └── bipmax/              ← Bip Max device assets
```

## How it works

```
Watch (Device App)              Phone (App-Side / Settings)       Internet
──────────────────              ───────────────────────────       ───────
home page
[tap stop]
arrivals page ──GET_ARRIVALS──► app-side/index.js
                                │  POST /api/GetScoreboard ──────► transport-by.app
                                │  ◄───────────────────────────── JSON / NDJSON
◄────── arrivals data ──────────┘

Settings App (phone)
[type stop name]
                  searchRequest ──► app-side/index.js (settingsStorage listener)
                                    │  POST /api/Search ──────────► transport-by.app
                                    │  POST /api/GetStopRouts ────► transport-by.app
                                    │  ◄──────────────────────────  results
                  searchResults ◄───┘  (written back to settingsStorage)
Settings App re-renders with results
[tap +] → favourite saved to settingsStorage
                      ─── GET_FAVORITES ──► app-side syncs to device LocalStorage
```

Network requests are made exclusively in the **companion** (`app-side/index.js`) because the
Zepp OS device does not have direct internet access; it communicates with the phone over BLE.

Stop search in the Settings App is driven by a `settingsStorage` listener in `app-side/index.js`
instead of a direct message request, which avoids blocking the settings UI. Favourites are
bidirectionally synced between the device (`LocalStorage`) and phone (`settingsStorage`).

## API endpoints used

All requests use `POST` against the **transport-by.app** internal API:

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `https://transport-by.app/api/Search` | Search stops by text |
| `POST` | `https://transport-by.app/api/GetStopRouts` | Get routes for a stop |
| `POST` | `https://transport-by.app/api/GetScoreboard` | Get live arrival predictions |

> **Note:** These endpoints are reverse-engineered from the public web app.  
> The API response can be JSON or NDJSON—`app-side/index.js` handles both formats.
> If an endpoint changes shape, update `normalizeArrivals()` or the relevant
> handler in `app-side/index.js`.

## App-side message methods (watch ↔ phone)

| Method | Params | Returns |
|--------|--------|---------|
| `GET_ARRIVALS` | `{ stopId, lang }` | `{ stopId, arrivals: [{ route, minutes, direction, type }] }` |
| `SEARCH_STOPS` | `{ query, lang }` | `{ stops: Stop[] }` |
| `GET_FAVORITES` | — | `{ favorites: Stop[] }` |
| `SAVE_FAVORITES` | `{ favorites: Stop[] }` | `{ ok: true }` |

## Transport type colours

| Type | Transport | Colour |
|------|-----------|--------|
| 0 | Bus | Green `#00c853` |
| 1 | Trolleybus | Blue `#2196f3` |
| 2 | Tram | Red `#f44336` |
| 3 | Minibus | Orange `#ff9800` *(filtered out from arrivals)* |
| 4 | Metro | Purple `#9c27b0` |

## Key modules

### `app-side/index.js` – Companion service

- **`searchStops(query, lang)`** – searches stops via `POST /api/Search`, then enriches each result with route data via `POST /api/GetStopRouts` (excluding minibuses). Builds a compact `RoutesSummary` string per stop.
- **`getArrivals(stopId, lang)`** – fetches live arrivals via `POST /api/GetScoreboard`, normalises the response (handles both JSON and NDJSON formats).
- **`normalizeArrivals(raw, stopId)`** – normalises quote characters, sorts by minutes, filters out minibuses and arrivals > 60 min.
- Settings Storage listener – intercepts `searchRequest` key changes from the Settings App and writes results back to `searchResults`.

### `page/home/index.js` – Home (favourite stops)

- Renders a scrollable list of favourite stop cards with route-type colour badges.
- Swipe-to-delete: swiping a card left reveals a red delete button. Tapping background resets all revealed cards.
- Empty state with app icon when no favourites exist; an "Add stop" button is always visible.
- On `build()`, syncs favourites from the phone (`GET_FAVORITES`) and merges with local storage.

### `page/arrivals/index.js` – Arrivals board

- Displays live arrivals for a selected stop: route number, direction, and minutes until arrival.
- Colour-coded by transport type (bus/trolleybus/tram/metro).
- Auto-refreshes every 30 seconds with a timestamp footer.
- Keeps the screen on (1 hour bright time + disables palm/drop-wrist sleep).

### `page/add-stop/index.js` – Add stop (watch)

- Opens an on-device keyboard for entering a stop name.
- Sends `SEARCH_STOPS` to the companion and displays results with route summaries.
- Each result has an add button to save to favourites.

### `setting/index.js` – Settings App (phone)

- Full search UI with text input, debounced search via `settingsStorage`.
- Displays search results with stop name, address, and route summaries.
- Add/remove favourites with +/✕ buttons. Already-added stops show "★ Добавлено".

### `utils/constants.js` – Layout & design tokens

- Screen dimensions and safe-area calculations via `getSafeBottomDims()` for round screens.
- Colour palette, font sizes, and spacing constants.
- Storage key names.

### `utils/spinner.js` – Animated spinner

- Creates an arc-based spinning indicator using `hmUI.widget.ARC` rotating with `setInterval`.
- Exposes a `stop()` method to clean up the timer and widget.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview on device
npm run preview
```

The project uses [`@zeppos/zeus-cli`](https://github.com/zepp-health/zeus-cli) for building
and deploying. Version bumps follow [standard-version](https://github.com/conventional-changelog/standard-version).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 16
- [Zeus CLI](https://docs.zepp.com/docs/guides/quick-start/environment/)
  (`npm install -g @zeppos/zeus-cli`)
- Zepp app on your phone, paired with your Amazfit Bip 6
- Developer Mode enabled on the watch

### Install & run

```bash
cd zepp-os-transport-by-app
npm install
zeus dev          # compile & push to simulator / device
```

### Building a `.zab` installer

```bash
zeus build
```

The signed `.zab` file appears in `dist/`. Transfer it via the Zepp app.

## Usage

### On the watch

1. Open **Transport BY** from the app list.
2. Tap **+ Add stop** to search for a stop directly from the watch.
3. Tap a saved stop to see live arrivals (auto-refreshes every 30 s).
4. Swipe a stop card left and tap **✕** to remove it.

### In the Zepp phone app (Settings)

1. Open the Zepp app → Mini Programs → Transport BY → Settings.
2. Type a stop name in the search field (≥ 2 characters triggers search).
3. Tap **+** on a result to save it as a favourite; tap **✕** to clear the search.
4. Saved favourites appear below and can be removed with **✕**.
6. Tap `X` on a saved stop from the home screen to remove it quickly.
7. Tap **↻ Refresh** to reload.
8. Tap 🗑 in the arrivals header to remove a stop from favourites.

## Customisation

| File | What to change |
|------|----------------|
| `utils/constants.js` | `API_BASE`, colours, screen sizes |
| `app-side/index.js` | HTTP request logic, response normalisation |
| `app.json` | `appId` (need a real Zepp developer ID for publishing) |

## Supported devices

| Device | deviceSource |
|--------|-------------|
| Amazfit Bip 6 | 9765120, 9765121, 10158337 |

To add more devices, extend the `platforms` array and `targets` object in `app.json`.

## License

MIT – feel free to fork and adapt.
