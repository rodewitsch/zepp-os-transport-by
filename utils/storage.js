import { LocalStorage } from '@zos/storage'
import { STORAGE_KEY_FAVORITES, STORAGE_KEY_SETTINGS, DEFAULT_CITY } from './constants'

const storage = new LocalStorage()

/**
 * Load saved favorite stops from local storage.
 * @returns {Array} Array of favorite stop objects
 */
export function loadFavorites() {
  return storage.getItem(STORAGE_KEY_FAVORITES, [])
}

/**
 * Save favorite stops to local storage.
 * @param {Array} favorites
 */
export function saveFavorites(favorites) {
  storage.setItem(STORAGE_KEY_FAVORITES, favorites)
}

/**
 * Add a stop to favorites.
 * @param {Object} stop - { StopId, StopName, City, Routes }
 * @returns {Array} Updated favorites list
 */
export function addFavorite(stop) {
  const favorites = loadFavorites()
  const exists = favorites.some((f) => f.StopId === stop.StopId && f.StopName === stop.StopName)
  if (!exists) {
    favorites.push(stop)
    saveFavorites(favorites)
  }
  return favorites
}

/**
 * Remove a stop from favorites by index.
 * @param {number} index
 * @returns {Array} Updated favorites list
 */
export function removeFavorite(index) {
  const favorites = loadFavorites()
  favorites.splice(index, 1)
  saveFavorites(favorites)
  return favorites
}

/**
 * Load app settings.
 * @returns {Object} Settings object
 */
export function loadSettings() {
  return storage.getItem(STORAGE_KEY_SETTINGS, {
    city: DEFAULT_CITY,
    language: 'ru',
  })
}

/**
 * Save app settings.
 * @param {Object} settings
 */
export function saveSettings(settings) {
  storage.setItem(STORAGE_KEY_SETTINGS, settings)
}
