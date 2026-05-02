# Transport BY – Zepp OS Mini Program

A Zepp OS Mini Program for **Amazfit Bip 6** that shows real-time public transport
arrival predictions from [transport-by.app](https://transport-by.app/), the official
passenger transport app for the Republic of Belarus.

## Features

- **Favourite stops** – save favourite bus/tram/trolleybus/metro stops on the watch
- **Live arrivals** – see upcoming vehicles with minutes-until-arrival, colour-coded by transport type
- **Auto-refresh** – arrivals update every 30 seconds automatically
- **Bright screen** – screen stays on for 1 hour while viewing arrivals
- **Stop search** – search stops by name in the Zepp phone app companion settings
- **Swipe to delete** – swipe a stop card left on the home screen to reveal the delete button
- **Offline safe** – graceful error messages when offline

## App structure

```
zepp-os-transport-by-app/
├── app.json              ← Mini Program configuration (Bip 6 device IDs & permissions)
├── app.js                ← App lifecycle & global data
├── package.json
├── jsconfig.json
├── app-side/
│   └── index.js          ← Companion service (runs on phone; all HTTP requests made here)
├── page/
│   ├── home/index.js     ← Favourite stops list (entry point); swipe-to-delete cards
│   ├── arrivals/index.js ← Live arrival board for a selected stop; auto-refreshes
│   └── add-stop/index.js ← Search & add a new favourite stop from the watch
├── setting/
│   └── index.js          ← Zepp Settings App UI (runs on phone); stop search & favourites management
└── utils/
    ├── constants.js      ← API base URL, storage keys, UI colours, layout sizes, font sizes
    ├── spinner.js        ← Animated arc spinner widget for watch pages
    └── storage.js        ← LocalStorage helpers for favourites & settings
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

Network requests are made exclusively in the **companion** (app-side) because the Zepp OS
device does not have direct internet access; it communicates with the phone over BLE.

Stop search in the Settings App is driven by a `settingsStorage` listener in `app-side/index.js`
instead of a direct message request, which avoids blocking the settings UI.

## API endpoints used

All requests use `POST` against the **transport-by.app** internal API:

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `https://transport-by.app/api/Search` | Search stops by text |
| `POST` | `https://transport-by.app/api/GetStopRouts` | Get routes for a stop |
| `POST` | `https://transport-by.app/api/GetScoreboard` | Get live arrival predictions |

> **Note:** These endpoints are reverse-engineered from the public web app.  
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
