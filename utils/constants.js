// ===========================================================
// Transport BY API constants
//
// The transport-by.app uses an internal API.
// Reverse-engineered endpoint patterns are used here.
// If endpoints change, update API_BASE below.
// ===========================================================

export const API_BASE = 'https://transport-by.app/api/v1'

// Endpoints:
//   GET {API_BASE}/stops/search?q={query}&city={cityId}
//   GET {API_BASE}/stops/{stopId}/arrivals
//   GET {API_BASE}/stops/{stopId}

export const CITIES = {
  MINSK: 'minsk',
  BREST: 'brest',
  GRODNO: 'grodno',
  GOMEL: 'gomel',
  VITEBSK: 'vitebsk',
  MOGILEV: 'mogilev',
}

export const DEFAULT_CITY = CITIES.MINSK

// Storage keys
export const STORAGE_KEY_FAVORITES = 'transport_by_favorites'
export const STORAGE_KEY_SETTINGS = 'transport_by_settings'

// UI layout constants for Amazfit Bip 6
// Screen: 390 x 450 px, design width 390
export const SCREEN_W = 390
export const SCREEN_H = 450
export const MARGIN = 16
export const CONTENT_W = SCREEN_W - MARGIN * 2

// Colors
export const COLOR_BG = 0x000000
export const COLOR_PRIMARY = 0x00c853
export const COLOR_ACCENT = 0x2196f3
export const COLOR_TEXT = 0xffffff
export const COLOR_TEXT_DIM = 0x888888
export const COLOR_CARD_BG = 0x1a1a1a
export const COLOR_CARD_BORDER = 0x333333
export const COLOR_WARNING = 0xff9800
export const COLOR_ERROR = 0xf44336
export const COLOR_SEPARATOR = 0x2a2a2a

// Typography
export const FONT_SIZE_TITLE = 28
export const FONT_SIZE_BODY = 22
export const FONT_SIZE_SMALL = 18
export const FONT_SIZE_TINY = 14

// Request timeout in ms
export const REQUEST_TIMEOUT = 15000

// Max arrivals to show
export const MAX_ARRIVALS_SHOWN = 5

// Max favorites
export const MAX_FAVORITES = 10
