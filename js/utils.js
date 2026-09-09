/**
 * utils.js — generic helpers with no knowledge of the DOM or the weather API.
 */

/* ---------- LocalStorage wrapper (fails soft) ---------- */

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/* ---------- Timing helpers ---------- */

export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ---------- DOM helpers ---------- */

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function setText(el, value) {
  if (!el) return;
  el.textContent = value;
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- Formatting ---------- */

export function fmtTemp(celsius, unit) {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return '—';
  const value = unit === 'F' ? celsius * (9 / 5) + 32 : celsius;
  return `${Math.round(value)}°`;
}

export function cToUnit(celsius, unit) {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return null;
  return unit === 'F' ? celsius * (9 / 5) + 32 : celsius;
}

export function fmtWind(kmh, unit) {
  if (kmh === null || kmh === undefined || Number.isNaN(kmh)) return '—';
  const value = unit === 'mph' ? kmh * 0.621371 : kmh;
  return `${Math.round(value)} ${unit === 'mph' ? 'mph' : 'km/h'}`;
}

export function fmtVisibility(meters, unit) {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return '—';
  const km = meters / 1000;
  const value = unit === 'mph' ? km * 0.621371 : km;
  return `${value.toFixed(1)} ${unit === 'mph' ? 'mi' : 'km'}`;
}

export function fmtPressure(hpa, unit) {
  if (hpa === null || hpa === undefined || Number.isNaN(hpa)) return '—';
  if (unit === 'inHg') return `${(hpa * 0.02953).toFixed(2)} inHg`;
  return `${Math.round(hpa)} hPa`;
}

export function windDirection(deg) {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function uvLabel(uv) {
  if (uv === null || uv === undefined || Number.isNaN(uv)) return '—';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}

export function aqiLabel(aqi) {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return { label: '—', tone: 'neutral' };
  if (aqi <= 50) return { label: 'Good', tone: 'good' };
  if (aqi <= 100) return { label: 'Moderate', tone: 'moderate' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', tone: 'poor' };
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'bad' };
  if (aqi <= 300) return { label: 'Very Unhealthy', tone: 'severe' };
  return { label: 'Hazardous', tone: 'severe' };
}

/**
 * Formats a Date in a specific IANA timezone.
 */
export function formatInTimeZone(date, timeZone, options) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

export function timeZoneAbbreviation(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : '';
  } catch {
    return '';
  }
}

export function utcOffsetLabel(offsetSeconds) {
  if (offsetSeconds === null || offsetSeconds === undefined) return '';
  const sign = offsetSeconds >= 0 ? '+' : '-';
  const abs = Math.abs(offsetSeconds);
  const hours = String(Math.floor(abs / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `UTC ${sign}${hours}:${minutes}`;
}

/* ---------- Small numeric helpers ---------- */

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function safeRound(value, fallback = '—') {
  return value === null || value === undefined || Number.isNaN(value) ? fallback : Math.round(value);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
