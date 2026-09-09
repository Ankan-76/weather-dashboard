/**
 * weather.js — all network access lives here. Nothing in this file touches the DOM.
 *
 * API_KEY
 * -------
 * This build uses Open-Meteo (https://open-meteo.com), a free weather API that does not
 * require an API key for the endpoints used below, so the dashboard works immediately.
 *
 * If you swap in a provider that DOES require a secret key (e.g. OpenWeatherMap), put it
 * here and read it from this single constant everywhere else in the app:
 *
 *   const API_KEY = "YOUR_API_KEY";
 *
 * Important: a static, frontend-only site cannot keep a secret key private — anyone can
 * open devtools and read it out of the network tab or the bundled JS. For a production
 * deployment that requires a private key, put the fetch calls below behind a small
 * backend or serverless proxy (e.g. a Cloudflare Worker or a Vercel function) that holds
 * the key server-side and forwards requests. The functions in this file are written so
 * that swapping the request target for a proxy URL later requires no changes to ui.js,
 * app.js, or any other part of the UI layer.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
].join(',');

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'visibility',
  'dew_point_2m',
  'is_day',
].join(',');

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'sunrise',
  'sunset',
  'precipitation_probability_max',
  'uv_index_max',
].join(',');

class WeatherApiError extends Error {
  constructor(message, kind = 'api') {
    super(message);
    this.kind = kind; // 'network' | 'not-found' | 'api'
  }
}

async function fetchJson(url, { timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new WeatherApiError(`Request failed with status ${res.status}`, 'api');
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new WeatherApiError('Request timed out', 'network');
    }
    if (err instanceof WeatherApiError) throw err;
    if (!navigator.onLine) {
      throw new WeatherApiError('You appear to be offline', 'network');
    }
    throw new WeatherApiError(err.message || 'Network error', 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search for a place by free-text name. Returns a list of candidate locations.
 */
export async function searchLocations(query, count = 5) {
  if (!query || !query.trim()) return [];
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query.trim())}&count=${count}&language=en&format=json`;
  const data = await fetchJson(url);
  if (!data.results) return [];
  return data.results.map(normalizeGeocodeResult);
}

function normalizeGeocodeResult(r) {
  return {
    id: `${r.id}`,
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    countryCode: r.country_code || '',
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  };
}

/**
 * Reverse-geocode a lat/lon pair (used for "Use my location") via BigDataCloud's
 * free, keyless reverse-geocoding endpoint.
 */
export async function reverseGeocode(latitude, longitude) {
  const url = `${REVERSE_GEOCODE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
  try {
    const data = await fetchJson(url, { timeout: 8000 });
    const name = data.city || data.locality || data.principalSubdivision || 'Current location';
    return {
      id: `${latitude.toFixed(2)},${longitude.toFixed(2)}`,
      name,
      admin1: data.principalSubdivision || '',
      country: data.countryName || '',
      countryCode: data.countryCode || '',
      latitude,
      longitude,
    };
  } catch {
    // Reverse geocoding is a nicety — fall back to coordinates rather than failing outright.
    return {
      id: `${latitude.toFixed(2)},${longitude.toFixed(2)}`,
      name: 'Current location',
      admin1: '',
      country: '',
      countryCode: '',
      latitude,
      longitude,
    };
  }
}

/**
 * Fetches current conditions, hourly and daily forecast for a coordinate pair.
 */
export async function getForecast(latitude, longitude) {
  const url =
    `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
    `&current=${CURRENT_FIELDS}&hourly=${HOURLY_FIELDS}&daily=${DAILY_FIELDS}` +
    `&timezone=auto&forecast_days=8&wind_speed_unit=kmh`;
  const data = await fetchJson(url);
  return normalizeForecast(data);
}

function normalizeForecast(data) {
  const tz = data.timezone;
  const utcOffsetSeconds = data.utc_offset_seconds;

  const current = data.current
    ? {
        time: data.current.time,
        temperature: data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        isDay: data.current.is_day === 1,
        precipitation: data.current.precipitation,
        weatherCode: data.current.weather_code,
        cloudCover: data.current.cloud_cover,
        pressure: data.current.pressure_msl,
        windSpeed: data.current.wind_speed_10m,
        windDirection: data.current.wind_direction_10m,
        windGusts: data.current.wind_gusts_10m,
      }
    : null;

  // Find the hourly index closest to "now" in the location's own timezone.
  let currentHourIndex = 0;
  if (data.hourly?.time?.length && current?.time) {
    currentHourIndex = data.hourly.time.indexOf(current.time);
    if (currentHourIndex === -1) currentHourIndex = 0;
  }

  const hourly = (data.hourly?.time || []).map((time, i) => ({
    time,
    temperature: data.hourly.temperature_2m?.[i] ?? null,
    feelsLike: data.hourly.apparent_temperature?.[i] ?? null,
    precipitationProbability: data.hourly.precipitation_probability?.[i] ?? null,
    precipitation: data.hourly.precipitation?.[i] ?? null,
    weatherCode: data.hourly.weather_code?.[i] ?? null,
    visibility: data.hourly.visibility?.[i] ?? null,
    dewPoint: data.hourly.dew_point_2m?.[i] ?? null,
    isDay: data.hourly.is_day?.[i] === 1,
  }));

  const daily = (data.daily?.time || []).map((date, i) => ({
    date,
    weatherCode: data.daily.weather_code?.[i] ?? null,
    tempMax: data.daily.temperature_2m_max?.[i] ?? null,
    tempMin: data.daily.temperature_2m_min?.[i] ?? null,
    sunrise: data.daily.sunrise?.[i] ?? null,
    sunset: data.daily.sunset?.[i] ?? null,
    precipitationProbabilityMax: data.daily.precipitation_probability_max?.[i] ?? null,
    uvIndexMax: data.daily.uv_index_max?.[i] ?? null,
  }));

  const dewPoint = hourly[currentHourIndex]?.dewPoint ?? null;
  const visibility = hourly[currentHourIndex]?.visibility ?? null;
  const uvIndex = daily[0]?.uvIndexMax ?? null;

  return {
    timezone: tz,
    utcOffsetSeconds,
    current: current ? { ...current, dewPoint, visibility, uvIndex } : null,
    hourly,
    currentHourIndex,
    daily,
    sunrise: daily[0]?.sunrise ?? null,
    sunset: daily[0]?.sunset ?? null,
  };
}

/**
 * Fetches current air quality. Returns null if the API has no data for this location
 * rather than fabricating values.
 */
export async function getAirQuality(latitude, longitude) {
  const url =
    `${AIR_QUALITY_URL}?latitude=${latitude}&longitude=${longitude}` +
    `&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone&timezone=auto`;
  try {
    const data = await fetchJson(url, { timeout: 8000 });
    if (!data.current || data.current.us_aqi === undefined || data.current.us_aqi === null) return null;
    return {
      aqi: data.current.us_aqi,
      pm2_5: data.current.pm2_5,
      pm10: data.current.pm10,
      co: data.current.carbon_monoxide,
      no2: data.current.nitrogen_dioxide,
      o3: data.current.ozone,
    };
  } catch {
    return null;
  }
}

/**
 * Combined convenience call used by the app: forecast + air quality for one place.
 */
export async function getWeatherBundle(location) {
  const [forecast, airQuality] = await Promise.all([
    getForecast(location.latitude, location.longitude),
    getAirQuality(location.latitude, location.longitude).catch(() => null),
  ]);
  return { location, forecast, airQuality, fetchedAt: Date.now() };
}

export async function getWeatherByCity(cityName) {
  const results = await searchLocations(cityName, 1);
  if (!results.length) {
    throw new WeatherApiError(`No location found for "${cityName}"`, 'not-found');
  }
  return getWeatherBundle(results[0]);
}

export async function getWeatherByCoordinates(latitude, longitude) {
  const location = await reverseGeocode(latitude, longitude);
  return getWeatherBundle(location);
}

/* ---------- WMO weather code → condition mapping ---------- */

const WMO_CODES = {
  0: { label: 'Clear sky', icon: 'clear' },
  1: { label: 'Mainly clear', icon: 'partly-cloudy' },
  2: { label: 'Partly cloudy', icon: 'partly-cloudy' },
  3: { label: 'Overcast', icon: 'cloudy' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Depositing rime fog', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'drizzle' },
  53: { label: 'Drizzle', icon: 'drizzle' },
  55: { label: 'Dense drizzle', icon: 'drizzle' },
  56: { label: 'Freezing drizzle', icon: 'drizzle' },
  57: { label: 'Dense freezing drizzle', icon: 'drizzle' },
  61: { label: 'Slight rain', icon: 'rain' },
  63: { label: 'Rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  66: { label: 'Freezing rain', icon: 'rain' },
  67: { label: 'Heavy freezing rain', icon: 'rain' },
  71: { label: 'Slight snow', icon: 'snow' },
  73: { label: 'Snow', icon: 'snow' },
  75: { label: 'Heavy snow', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Slight rain showers', icon: 'rain' },
  81: { label: 'Rain showers', icon: 'rain' },
  82: { label: 'Violent rain showers', icon: 'rain' },
  85: { label: 'Slight snow showers', icon: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'thunderstorm' },
  96: { label: 'Thunderstorm with hail', icon: 'thunderstorm' },
  99: { label: 'Severe thunderstorm with hail', icon: 'thunderstorm' },
};

export function describeWeatherCode(code) {
  return WMO_CODES[code] || { label: 'Unknown', icon: 'cloudy' };
}

export { WeatherApiError };
