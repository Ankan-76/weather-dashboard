/**
 * app.js — application state and event wiring. Talks to weather.js for data and
 * ui.js for rendering; holds the single source of truth for current state.
 */

import { storage, debounce, qs, uid } from './utils.js';
import * as api from './weather.js';
import * as ui from './ui.js';
import { describeWeatherCode } from './weather.js';

const STORAGE_KEYS = {
  favorites: 'atmos:favorites',
  recents: 'atmos:recents',
  units: 'atmos:units',
  lastLocation: 'atmos:last-location',
  cache: 'atmos:cache', // keyed by location id
  reducedMotion: 'atmos:reduced-motion',
  theme: 'atmos:theme',
};

const state = {
  location: null,
  bundle: null,
  units: storage.get(STORAGE_KEYS.units, { temp: 'C', wind: 'kmh', pressure: 'hPa' }),
  theme: storage.get(STORAGE_KEYS.theme, 'dark'),
  favorites: storage.get(STORAGE_KEYS.favorites, []),
  recents: storage.get(STORAGE_KEYS.recents, []),
  isOffline: !navigator.onLine,
  refreshTimer: null,
  clockTimer: null,
};

/* ---------- DOM references, gathered once ---------- */

function collectDom() {
  return {
    root: document.documentElement,
    dashboard: qs('#dashboard'),
    emptyState: qs('#empty-state'),
    errorBanner: qs('#error-banner'),
    errorMessage: qs('#error-message'),
    liveRegion: qs('#live-region'),

    // Header
    searchForm: qs('#search-form'),
    searchInput: qs('#search-input'),
    searchClear: qs('#search-clear'),
    searchResults: qs('#search-results'),
    useLocationBtn: qs('#use-location'),
    themeToggle: qs('#theme-toggle'),
    themeIconSun: qs('.theme-icon-sun'),
    themeIconMoon: qs('.theme-icon-moon'),
    settingsToggle: qs('#settings-toggle'),
    settingsDrawer: qs('#settings-drawer'),
    settingsClose: qs('#settings-close'),

    // Location & clock
    locationName: qs('#location-name'),
    locationSub: qs('#location-sub'),
    clockTime: qs('#clock-time'),
    clockDate: qs('#clock-date'),
    clockZone: qs('#clock-zone'),
    favoriteToggle: qs('#favorite-toggle'),

    // Hero
    heroLocation: qs('#hero-location'),
    heroLocationSub: qs('#hero-location-sub'),
    heroTemp: qs('#hero-temp'),
    heroUnit: qs('#hero-unit'),
    heroFeelsLike: qs('#hero-feelslike'),
    heroCondition: qs('#hero-condition'),
    heroIcon: qs('#hero-icon'),
    heroHigh: qs('#hero-high'),
    heroLow: qs('#hero-low'),
    heroSunrise: qs('#hero-sunrise'),
    heroSunset: qs('#hero-sunset'),

    // Overview quick-glance panel
    overviewFeelsLike: qs('#overview-feelslike'),
    overviewHumidity: qs('#overview-humidity'),
    overviewWind: qs('#overview-wind'),
    overviewUv: qs('#overview-uv'),

    // Metrics
    metricHumidity: qs('#metric-humidity'),
    metricHumidityBar: qs('#metric-humidity-bar'),
    metricWind: qs('#metric-wind'),
    metricWindDir: qs('#metric-wind-dir'),
    metricVisibility: qs('#metric-visibility'),
    metricPressure: qs('#metric-pressure'),
    metricUv: qs('#metric-uv'),
    metricUvLabel: qs('#metric-uv-label'),
    metricUvBar: qs('#metric-uv-bar'),
    metricDewPoint: qs('#metric-dewpoint'),

    // Hourly / daily
    hourlyList: qs('#hourly-list'),
    dailyList: qs('#daily-list'),

    // Chart
    chartSvg: qs('#temp-chart'),

    // Precipitation
    precipSection: qs('#precip-section'),
    precipSummary: qs('#precip-summary'),
    precipBars: qs('#precip-bars'),

    // Sun path
    sunPathSection: qs('#sunpath-section'),
    sunPathSvg: qs('#sunpath-svg'),
    sunriseTime: qs('#sunrise-time'),
    sunsetTime: qs('#sunset-time'),
    sunPathStatus: qs('#sunpath-status'),

    // Air quality
    airQualitySection: qs('#airquality-section'),
    aqiValue: qs('#aqi-value'),
    aqiLabel: qs('#aqi-label'),
    aqiPm25: qs('#aqi-pm25'),
    aqiPm10: qs('#aqi-pm10'),
    aqiCo: qs('#aqi-co'),
    aqiNo2: qs('#aqi-no2'),
    aqiO3: qs('#aqi-o3'),

    // Alert
    alertSection: qs('#alert-section'),
    alertText: qs('#alert-text'),

    // Favorites / recents
    favoritesList: qs('#favorites-list'),
    recentList: qs('#recent-list'),
    recentClear: qs('#recent-clear'),

    // Refresh / status
    refreshBtn: qs('#refresh-btn'),
    updatedText: qs('#updated-text'),
    offlineBadge: qs('#offline-badge'),

    // Settings controls
    unitTempButtons: qs('#unit-temp-toggle'),
    unitWindButtons: qs('#unit-wind-toggle'),
    reducedMotionToggle: qs('#reduced-motion-toggle'),
    clearRecentBtn: qs('#clear-recent-settings'),
    clearFavoritesBtn: qs('#clear-favorites-settings'),
    clearCacheBtn: qs('#clear-cache-settings'),
  };
}

let dom;

/* ---------- Persistence helpers ---------- */

function saveUnits() {
  storage.set(STORAGE_KEYS.units, state.units);
}

function saveFavorites() {
  storage.set(STORAGE_KEYS.favorites, state.favorites);
}

function saveRecents() {
  storage.set(STORAGE_KEYS.recents, state.recents);
}

function cacheBundle(bundle) {
  const cache = storage.get(STORAGE_KEYS.cache, {});
  cache[bundle.location.id] = bundle;
  storage.set(STORAGE_KEYS.cache, cache);
  storage.set(STORAGE_KEYS.lastLocation, bundle.location);
}

function getCachedBundle(locationId) {
  const cache = storage.get(STORAGE_KEYS.cache, {});
  return cache[locationId] || null;
}

function pushRecent(location) {
  state.recents = [location, ...state.recents.filter((r) => r.id !== location.id)].slice(0, 6);
  saveRecents();
}

function isFavorite(locationId) {
  return state.favorites.some((f) => f.id === locationId);
}

/* ---------- Core load flow ---------- */

async function loadLocation(location, { skipRecent = false } = {}) {
  ui.hideError(dom);
  ui.setLoading(dom.dashboard, true);
  ui.showEmptyState(dom, false);
  state.location = location;

  try {
    const bundle = await api.getWeatherBundle(location);
    state.bundle = bundle;
    state.isOffline = false;
    cacheBundle(bundle);
    if (!skipRecent) pushRecent(location);
    render();
  } catch (err) {
    const cached = getCachedBundle(location.id);
    if (cached) {
      state.bundle = cached;
      state.isOffline = true;
      render();
      ui.showError(
        dom,
        err.kind === 'not-found'
          ? 'Location not found. Try searching for another city.'
          : "You're offline. Showing the most recently cached weather data."
      );
    } else {
      ui.showError(
        dom,
        err.kind === 'not-found'
          ? 'Location not found. Try searching for another city.'
          : 'Weather data is temporarily unavailable. Please try again.'
      );
    }
  } finally {
    ui.setLoading(dom.dashboard, false);
  }

  scheduleAutoRefresh();
}

function render() {
  if (!state.bundle) return;
  const { bundle, units } = state;

  ui.renderLocationHeading(dom, bundle.location);
  ui.renderCurrent(dom, bundle, units.temp);
  ui.renderMetrics(dom, bundle, units);
  ui.renderHourly(dom, bundle, units.temp);
  ui.renderDaily(dom, bundle, units.temp);
  ui.renderTemperatureChart(dom, bundle, units.temp);
  ui.renderPrecipitation(dom, bundle);
  ui.renderSunPath(dom, bundle);
  ui.renderAirQuality(dom, bundle);
  ui.renderAlert(dom, bundle);
  ui.updateFavoriteButton(dom, isFavorite(bundle.location.id));
  ui.renderUpdatedAt(dom, bundle.fetchedAt, state.isOffline);
  ui.renderFavorites(dom, state.favorites, bundle.location.id, handleSelectLocation, handleRemoveFavorite);
  ui.renderRecent(dom, state.recents, handleSelectLocation, handleClearRecents);

  const { icon } = describeWeatherCode(bundle.forecast.current?.weatherCode);
  ui.updateBackground(dom.root, { icon, isDay: bundle.forecast.current?.isDay ?? true });

  document.title = `${Math.round(bundle.forecast.current?.temperature ?? 0)}°${units.temp} in ${bundle.location.name} — Ankacast`;
}

function scheduleAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  // Refresh every 10 minutes; avoids hammering the API while staying current.
  state.refreshTimer = setInterval(() => {
    if (state.location && navigator.onLine) {
      loadLocation(state.location, { skipRecent: true });
    }
  }, 10 * 60 * 1000);
}

function startClock() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = setInterval(() => {
    if (state.bundle) {
      ui.renderClock(dom, state.bundle.forecast.timezone, state.bundle.forecast.utcOffsetSeconds);
      ui.renderUpdatedAt(dom, state.bundle.fetchedAt, state.isOffline);
    }
  }, 1000);
}

/* ---------- Event handlers ---------- */

function handleSelectLocation(location) {
  dom.searchInput.value = '';
  ui.renderSearchResults(dom, [], () => { });
  loadLocation(location);
}

function handleRemoveFavorite(location) {
  state.favorites = state.favorites.filter((f) => f.id !== location.id);
  saveFavorites();
  render();
}

function handleClearRecents() {
  state.recents = [];
  saveRecents();
  render();
}

function toggleFavorite() {
  if (!state.location) return;
  if (isFavorite(state.location.id)) {
    state.favorites = state.favorites.filter((f) => f.id !== state.location.id);
  } else {
    state.favorites = [...state.favorites, state.location];
  }
  saveFavorites();
  render();
}

const runSearch = debounce(async (query) => {
  if (!query.trim()) {
    ui.renderSearchResults(dom, [], () => { });
    return;
  }
  try {
    const results = await api.searchLocations(query, 6);
    ui.renderSearchResults(dom, results, handleSelectLocation);
  } catch {
    ui.renderSearchResults(dom, [], () => { });
  }
}, 350);

function handleUseMyLocation() {
  if (!navigator.geolocation) {
    ui.showError(dom, 'Geolocation is not supported in this browser. Search for a city instead.');
    return;
  }
  dom.useLocationBtn.classList.add('is-loading');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      dom.useLocationBtn.classList.remove('is-loading');
      const { latitude, longitude } = pos.coords;
      const location = await api.reverseGeocode(latitude, longitude);
      loadLocation(location);
    },
    () => {
      dom.useLocationBtn.classList.remove('is-loading');
      ui.showError(dom, 'Unable to access your location. Search for a city instead.');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
  );
}

function applyUnitsToUi() {
  qsButtons(dom.unitTempButtons).forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.units.temp));
  qsButtons(dom.unitWindButtons).forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.units.wind));
}

function setupUnitToggles() {
  dom.unitTempButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    state.units.temp = btn.dataset.value;
    state.units.pressure = state.units.pressure; // unchanged
    saveUnits();
    qsButtons(dom.unitTempButtons).forEach((b) => b.classList.toggle('is-active', b === btn));
    render();
  });

  dom.unitWindButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    state.units.wind = btn.dataset.value;
    state.units.pressure = btn.dataset.value === 'mph' ? 'inHg' : 'hPa';
    saveUnits();
    qsButtons(dom.unitWindButtons).forEach((b) => b.classList.toggle('is-active', b === btn));
    render();
  });
}

function qsButtons(container) {
  return Array.from(container.querySelectorAll('button[data-value]'));
}

function setupSettingsDrawer() {
  dom.settingsToggle.addEventListener('click', () => {
    const isOpen = dom.settingsDrawer.classList.toggle('is-open');
    dom.settingsToggle.setAttribute('aria-expanded', String(isOpen));
    dom.settingsDrawer.setAttribute('aria-hidden', String(!isOpen));
  });
  dom.settingsClose.addEventListener('click', closeSettings);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings();
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  dom.themeToggle.setAttribute('aria-checked', state.theme === 'light' ? 'true' : 'false');
}

function setupThemeToggle() {
  applyTheme();
  dom.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    storage.set(STORAGE_KEYS.theme, state.theme);
    applyTheme();
  });
}

function closeSettings() {
  dom.settingsDrawer.classList.remove('is-open');
  dom.settingsToggle.setAttribute('aria-expanded', 'false');
  dom.settingsDrawer.setAttribute('aria-hidden', 'true');
}

function setupReducedMotionToggle() {
  const stored = storage.get(STORAGE_KEYS.reducedMotion, false);
  dom.reducedMotionToggle.checked = stored;
  document.documentElement.classList.toggle('force-reduced-motion', stored);
  dom.reducedMotionToggle.addEventListener('change', () => {
    storage.set(STORAGE_KEYS.reducedMotion, dom.reducedMotionToggle.checked);
    document.documentElement.classList.toggle('force-reduced-motion', dom.reducedMotionToggle.checked);
  });
}

function setupClearActions() {
  dom.clearRecentBtn.addEventListener('click', () => {
    state.recents = [];
    saveRecents();
    render();
  });
  dom.clearFavoritesBtn.addEventListener('click', () => {
    state.favorites = [];
    saveFavorites();
    render();
  });
  dom.clearCacheBtn.addEventListener('click', () => {
    storage.remove(STORAGE_KEYS.cache);
  });
}

function setupSearch() {
  dom.searchInput.addEventListener('input', (e) => {
    dom.searchClear.hidden = !e.target.value;
    runSearch(e.target.value);
  });
  dom.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = dom.searchInput.value.trim();
    if (!query) return;
    try {
      const results = await api.searchLocations(query, 1);
      if (results.length) {
        handleSelectLocation(results[0]);
      } else {
        ui.showError(dom, 'Location not found. Try searching for another city.');
      }
    } catch {
      ui.showError(dom, 'Weather data is temporarily unavailable. Please try again.');
    }
  });
  dom.searchClear.addEventListener('click', () => {
    dom.searchInput.value = '';
    dom.searchClear.hidden = true;
    ui.renderSearchResults(dom, [], () => { });
    dom.searchInput.focus();
  });
  document.addEventListener('click', (e) => {
    if (!dom.searchForm.contains(e.target)) {
      ui.renderSearchResults(dom, [], () => { });
    }
  });
}

function setupOnlineOfflineHandlers() {
  window.addEventListener('offline', () => {
    state.isOffline = true;
    if (state.bundle) ui.renderUpdatedAt(dom, state.bundle.fetchedAt, true);
    ui.showError(dom, "You're offline. Showing the most recently cached weather data.");
  });
  window.addEventListener('online', () => {
    state.isOffline = false;
    ui.hideError(dom);
    if (state.location) loadLocation(state.location, { skipRecent: true });
  });
}

function setupRefreshButton() {
  dom.refreshBtn.addEventListener('click', () => {
    if (!state.location) return;
    dom.refreshBtn.classList.add('is-spinning');
    loadLocation(state.location, { skipRecent: true }).finally(() => {
      setTimeout(() => dom.refreshBtn.classList.remove('is-spinning'), 500);
    });
  });
}

/* ---------- Boot ---------- */

async function init() {
  dom = collectDom();

  setupSearch();
  dom.useLocationBtn.addEventListener('click', handleUseMyLocation);
  qs('#empty-search-btn')?.addEventListener('click', () => dom.searchInput.focus());
  qs('#empty-location-btn')?.addEventListener('click', handleUseMyLocation);
  dom.favoriteToggle.addEventListener('click', toggleFavorite);
  setupThemeToggle();
  setupSettingsDrawer();
  setupUnitToggles();
  applyUnitsToUi();
  setupReducedMotionToggle();
  setupClearActions();
  setupOnlineOfflineHandlers();
  setupRefreshButton();
  startClock();
  ui.enableTiltInteraction(document.body);
  ui.renderStars(qs('#stars'), 70);

  const last = storage.get(STORAGE_KEYS.lastLocation, null);
  if (last) {
    await loadLocation(last, { skipRecent: true });
  } else {
    ui.showEmptyState(dom, true);
  }

  requestAnimationFrame(() => ui.playEntranceAnimation(document.body));
}

document.addEventListener('DOMContentLoaded', init);
