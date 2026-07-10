// ===========================================================
// Transport BY API constants
//
// The transport-by.app uses an internal API.
// Reverse-engineered endpoint patterns are used here.
// If endpoints change, update API_BASE below.
// ===========================================================

import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device';

export const API_BASE = 'https://transport-by.app/api/v1';

// Endpoints:
//   GET {API_BASE}/stops/search?q={query}&city={cityId}
//   GET {API_BASE}/stops/{stopId}/arrivals
//   GET {API_BASE}/stops/{stopId}

// Storage keys
export const STORAGE_KEY_FAVORITES = 'transport_by_favorites';
export const STORAGE_KEY_SETTINGS = 'transport_by_settings';

// UI layout constants — dynamically resolved from device info
const deviceInfo = getDeviceInfo();
export const SCREEN_W = deviceInfo.width;
export const SCREEN_H = deviceInfo.height;
export const IS_ROUND = deviceInfo.screenShape === SCREEN_SHAPE_ROUND;

export const MARGIN = IS_ROUND ? 40 : 16;
export const CONTENT_W = SCREEN_W - MARGIN * 2;

// Safe offsets for round screens (content near top/bottom edges gets clipped
// by the circular bezel). On square screens a small header is enough.
export const HEADER_TOP = IS_ROUND ? 44 : 10;
export const BOTTOM_PAD = IS_ROUND ? 32 : 24;

// Colors
export const COLOR_BG = 0x000000;
export const COLOR_PRIMARY = 0x00c853;
export const COLOR_ACCENT = 0x2196f3;
export const COLOR_TEXT = 0xffffff;
export const COLOR_TEXT_DIM = 0x888888;
export const COLOR_CARD_BG = 0x1a1a1a;
export const COLOR_CARD_BORDER = 0x333333;
export const COLOR_WARNING = 0xff9800;
export const COLOR_ERROR = 0xf44336;
export const COLOR_SEPARATOR = 0x2a2a2a;

// Typography
export const FONT_SIZE_TITLE = 30;
export const FONT_SIZE_BODY = 24;
export const FONT_SIZE_SMALL = 20;
export const FONT_SIZE_TINY = 16;

// Request timeout in ms
export const REQUEST_TIMEOUT = 15000;

/**
 * Compute the maximum usable content width at a given Y coordinate
 * for round screens, accounting for circular bezel clipping.
 * On square screens, returns the requested width unchanged.
 * @param {number} y - Y position (top of element)
 * @param {number} elemH - element height
 * @param {number} defaultW - default width if no clipping
 * @returns {{ w: number, x: number }} safe width and x offset
 */
export function getSafeBottomDims(y, elemH, defaultW) {
  if (!IS_ROUND) return { w: defaultW, x: 0 }
  const radius = SCREEN_W / 2
  // Check the closest-to-edge point of the element (its bottom edge)
  const elemBottom = y + elemH
  const distFromCenter = Math.abs(elemBottom - radius)
  if (distFromCenter >= radius) return { w: 0, x: 0 }
  const maxHalfW = Math.sqrt(radius * radius - distFromCenter * distFromCenter)
  const maxW = Math.floor(maxHalfW * 2)
  const safeW = Math.min(defaultW, maxW - 8) // 8px safety margin
  const offsetX = Math.floor((defaultW - safeW) / 2)
  return { w: Math.max(0, safeW), x: Math.max(0, offsetX) }
}