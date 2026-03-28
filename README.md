# Transport BY – Zepp OS Mini Program

A Zepp OS Mini Program for **Amazfit Bip 6** that shows real-time public transport
arrival predictions from [transport-by.app](https://transport-by.app/), the official
passenger transport app for the Republic of Belarus.

## Features

- **Favourite stops** – save up to 10 bus/tram/trolleybus stops
- **Next arrivals** – see up to 5 upcoming vehicles with minutes-until-arrival
- **Multi-city** – Minsk, Brest, Grodno, Gomel, Vitebsk, Mogilev
- **Stop search** – search stops by name on the phone companion
- **Offline safe** – graceful error messages when offline
- **One-tap refresh** – pull fresh data any time

## App structure

```
zepp-os-transport-by-app/
├── app.json              ← Mini Program configuration (Bip 6 device IDs)
├── app.js                ← App lifecycle
├── package.json
├── jsconfig.json
├── app-side/
│   └── index.js          ← Companion service (runs on phone, makes HTTP requests)
├── page/
│   ├── home/index.js     ← Favourites list (entry point)
│   ├── arrivals/index.js ← Arrival board for a selected stop
│   ├── add-stop/index.js ← Search & add a new favourite stop
│   └── settings/index.js ← Manage favourites + app info
└── utils/
    ├── constants.js      ← API base, UI colours, layout sizes
    └── storage.js        ← LocalStorage helpers for favourites & settings
```

## How it works

```
Watch (Device App)          Phone (App-Side Service)        Internet
──────────────────          ────────────────────────        ───────
  home page                         │
  [tap stop]                        │
  arrivals page ──GET_ARRIVALS──►  app-side/index.js
                                    │  fetch()
                                    │  ──────────────────► transport-by.app API
                                    │  ◄──────────────────  JSON response
  ◄──────────── arrivals data ──────┘
  render rows
```

Network requests are made in the **companion** (app-side) because the Zepp OS
device itself does not have direct internet access; it communicates via the paired
phone over BLE.

## API endpoints used

The app calls the **transport-by.app** REST API:

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `https://transport-by.app/api/v1/stops/search?q=…&city=…&lang=…` | Search stops |
| `GET` | `https://transport-by.app/api/v1/stops/{stopId}/arrivals?city=…&lang=…` | Get arrivals |

> **Note:** These endpoints are reverse-engineered from the public web app.  
> If an endpoint returns a non-standard shape the `normalize*` functions in
> `app-side/index.js` will need updating.  
> You can also swap in any compatible REST API (e.g. `minsktrans.by`) by
> changing `API_BASE` in `utils/constants.js` **and**  `app-side/index.js`.

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

## Usage on the watch

1. Open **Transport BY** from the app list.
2. Tap **+ Add stop** and search for your bus stop by name.
3. Select a city first (default: Minsk).
4. Tap **+** on a search result to save it as a favourite.
5. Back on the home screen, tap a stop to see live arrivals.
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
