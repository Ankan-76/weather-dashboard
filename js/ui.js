/**
 * ui.js — everything that touches the DOM. Reads plain data objects produced by
 * weather.js (via app.js) and renders them. Contains no fetch calls.
 */

import {
  qs,
  qsa,
  fmtTemp,
  cToUnit,
  fmtWind,
  fmtVisibility,
  fmtPressure,
  windDirection,
  uvLabel,
  aqiLabel,
  formatInTimeZone,
  timeZoneAbbreviation,
  utcOffsetLabel,
  clamp,
  safeRound,
  prefersReducedMotion,
} from './utils.js';
import { describeWeatherCode } from './weather.js';

/* ==========================================================================
   Weather icon system — small inline SVGs, lightly animated with CSS classes
   defined in style.css (icon-sun-glow, icon-cloud-drift, icon-rain-fall, ...)
   ========================================================================== */

function sunSvg(size = 1) {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-sun" style="--s:${size}">
      <circle cx="50" cy="50" r="20" class="sun-core" />
      <g class="sun-rays">
        ${Array.from({ length: 8 })
      .map((_, i) => {
        const angle = (i * 360) / 8;
        return `<line x1="50" y1="18" x2="50" y2="8" transform="rotate(${angle} 50 50)" />`;
      })
      .join('')}
      </g>
    </svg>`;
}

function moonSvg() {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-moon">
      <path class="moon-body" d="M62 20a32 32 0 1 0 18 40 26 26 0 0 1-18-40z" />
      <circle class="moon-star" cx="76" cy="26" r="2.4" />
      <circle class="moon-star" cx="84" cy="40" r="1.6" />
    </svg>`;
}

function cloudsSvg({ dense = false } = {}) {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-cloud">
      <g class="cloud-back">
        <ellipse cx="60" cy="46" rx="22" ry="15" />
      </g>
      <g class="cloud-front">
        <ellipse cx="40" cy="58" rx="26" ry="17" />
        <ellipse cx="60" cy="55" rx="18" ry="13" />
        ${dense ? '<ellipse cx="50" cy="50" rx="14" ry="11" />' : ''}
      </g>
    </svg>`;
}

function partlyCloudySvg(isDay) {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-partly">
      <g class="pc-sun" transform="translate(-6,-6)">
        <circle cx="42" cy="38" r="15" class="${isDay ? 'sun-core' : 'moon-body'}" />
      </g>
      <g class="cloud-front">
        <ellipse cx="46" cy="62" rx="27" ry="16" />
        <ellipse cx="68" cy="58" rx="16" ry="12" />
      </g>
    </svg>`;
}

function rainSvg(heavy = false) {
  const drops = heavy ? 6 : 4;
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-rain">
      <g class="cloud-front">
        <ellipse cx="50" cy="42" rx="28" ry="17" />
      </g>
      <g class="rain-drops">
        ${Array.from({ length: drops })
      .map((_, i) => `<line x1="${28 + i * 10}" y1="66" x2="${24 + i * 10}" y2="80" style="--d:${i}" />`)
      .join('')}
      </g>
    </svg>`;
}

function drizzleSvg() {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-drizzle">
      <g class="cloud-front">
        <ellipse cx="50" cy="42" rx="26" ry="16" />
      </g>
      <g class="drizzle-drops">
        ${Array.from({ length: 5 })
      .map((_, i) => `<circle cx="${26 + i * 11}" cy="${70 + (i % 2) * 6}" r="1.6" style="--d:${i}" />`)
      .join('')}
      </g>
    </svg>`;
}

function snowSvg() {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-snow">
      <g class="cloud-front">
        <ellipse cx="50" cy="40" rx="26" ry="16" />
      </g>
      <g class="snow-flakes">
        ${Array.from({ length: 5 })
      .map((_, i) => `<circle cx="${26 + i * 11}" cy="${68 + (i % 2) * 8}" r="2.2" style="--d:${i}" />`)
      .join('')}
      </g>
    </svg>`;
}

function thunderSvg() {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-thunder">
      <g class="cloud-front">
        <ellipse cx="50" cy="38" rx="27" ry="16" />
      </g>
      <polygon class="bolt" points="54,52 40,74 50,74 46,90 66,64 54,64" />
    </svg>`;
}

function fogSvg() {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-fog">
      <g class="fog-lines">
        <line x1="20" y1="40" x2="80" y2="40" />
        <line x1="14" y1="54" x2="86" y2="54" style="--d:1" />
        <line x1="24" y1="68" x2="76" y2="68" style="--d:2" />
      </g>
    </svg>`;
}

function windSvg() {
  return `
    <svg viewBox="0 0 100 100" class="wicon wicon-wind">
      <g class="wind-lines">
        <path d="M15 40 H60 a8 8 0 1 0 -8 -8" />
        <path d="M15 56 H72 a8 8 0 1 1 -8 8" style="--d:1" />
        <path d="M25 72 H55" style="--d:2" />
      </g>
    </svg>`;
}

/**
 * Returns SVG markup for a weather icon key, sized by CSS classes applied by the caller.
 */
export function weatherIconMarkup(iconKey, isDay = true) {
  switch (iconKey) {
    case 'clear':
      return isDay ? sunSvg() : moonSvg();
    case 'partly-cloudy':
      return partlyCloudySvg(isDay);
    case 'cloudy':
      return cloudsSvg({ dense: true });
    case 'fog':
      return fogSvg();
    case 'drizzle':
      return drizzleSvg();
    case 'rain':
      return rainSvg();
    case 'snow':
      return snowSvg();
    case 'thunderstorm':
      return thunderSvg();
    case 'wind':
      return windSvg();
    default:
      return cloudsSvg();
  }
}

/* ==========================================================================
   Skeleton / loading state toggling
   ========================================================================== */

export function setLoading(root, isLoading) {
  root.classList.toggle('is-loading', isLoading);
  qsa('[data-skeleton]', root).forEach((el) => {
    el.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
  });
}

/* ==========================================================================
   Header / location / clock
   ========================================================================== */

export function renderLocationHeading(dom, location) {
  const place = [location.name, location.admin1, location.country].filter(Boolean);
  dom.locationName.textContent = location.name;
  dom.locationSub.textContent = [location.admin1, location.country].filter(Boolean).join(', ');
  dom.heroLocation.textContent = place.slice(0, 1).join(', ');
  dom.heroLocationSub.textContent = [location.admin1, location.country].filter(Boolean).join(', ');
}

export function renderClock(dom, timezone, utcOffsetSeconds) {
  const now = new Date();
  const time = formatInTimeZone(now, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const date = formatInTimeZone(now, timezone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const abbr = timeZoneAbbreviation(timezone);
  dom.clockTime.textContent = time;
  dom.clockDate.textContent = date;
  dom.clockZone.textContent = abbr ? `${abbr} · ${utcOffsetLabel(utcOffsetSeconds)}` : utcOffsetLabel(utcOffsetSeconds);
}

/* ==========================================================================
   Hero current-weather card
   ========================================================================== */

export function renderCurrent(dom, bundle, unit) {
  const { current, daily } = bundle.forecast;
  if (!current) return;
  const { label, icon } = describeWeatherCode(current.weatherCode);

  dom.heroTemp.textContent = fmtTemp(current.temperature, unit).replace('°', '');
  dom.heroUnit.textContent = `°${unit}`;
  dom.heroFeelsLike.textContent = `Feels like ${fmtTemp(current.feelsLike, unit)}`;
  dom.heroCondition.textContent = label;
  dom.heroIcon.innerHTML = weatherIconMarkup(icon, current.isDay);
  dom.heroIcon.classList.remove('is-night');
  dom.heroIcon.classList.toggle('is-night', !current.isDay);

  const today = daily[0];
  if (today) {
    dom.heroHigh.textContent = fmtTemp(today.tempMax, unit);
    dom.heroLow.textContent = fmtTemp(today.tempMin, unit);
    dom.heroSunrise.textContent = today.sunrise
      ? formatInTimeZone(new Date(today.sunrise), bundle.forecast.timezone, { hour: 'numeric', minute: '2-digit' })
      : '—';
    dom.heroSunset.textContent = today.sunset
      ? formatInTimeZone(new Date(today.sunset), bundle.forecast.timezone, { hour: 'numeric', minute: '2-digit' })
      : '—';
  }

  dom.liveRegion.textContent = `${bundle.location.name}: ${fmtTemp(current.temperature, unit)}, ${label}`;
}

/* ==========================================================================
   Metric cards
   ========================================================================== */

export function renderMetrics(dom, bundle, units) {
  const { current } = bundle.forecast;
  if (!current) return;

  // Quick-glance overview panel (companion to the hero card)
  if (dom.overviewFeelsLike) dom.overviewFeelsLike.textContent = fmtTemp(current.feelsLike, units.temp);
  if (dom.overviewHumidity) dom.overviewHumidity.textContent = current.humidity !== null && current.humidity !== undefined ? `${Math.round(current.humidity)}%` : '—';
  if (dom.overviewWind) dom.overviewWind.textContent = fmtWind(current.windSpeed, units.wind);
  if (dom.overviewUv) dom.overviewUv.textContent = current.uvIndex === null || current.uvIndex === undefined ? '—' : `${Math.round(current.uvIndex)} · ${uvLabel(current.uvIndex)}`;

  dom.metricHumidity.textContent = current.humidity !== null && current.humidity !== undefined ? `${Math.round(current.humidity)}%` : '—';
  dom.metricHumidityBar.style.setProperty('--value', `${clamp(current.humidity ?? 0, 0, 100)}%`);

  dom.metricWind.textContent = fmtWind(current.windSpeed, units.wind);
  dom.metricWindDir.textContent = windDirection(current.windDirection);

  dom.metricVisibility.textContent = fmtVisibility(current.visibility, units.wind === 'mph' ? 'mph' : 'km');

  dom.metricPressure.textContent = fmtPressure(current.pressure, units.pressure);

  const uv = current.uvIndex;
  dom.metricUv.textContent = uv === null || uv === undefined ? '—' : Math.round(uv);
  dom.metricUvLabel.textContent = uvLabel(uv);
  dom.metricUvBar.style.setProperty('--value', `${clamp(((uv ?? 0) / 11) * 100, 0, 100)}%`);

  dom.metricDewPoint.textContent = fmtTemp(current.dewPoint, units.temp);
}

/* ==========================================================================
   Hourly forecast strip
   ========================================================================== */

export function renderHourly(dom, bundle, unit) {
  const { hourly, currentHourIndex, timezone } = bundle.forecast;
  const slice = hourly.slice(currentHourIndex, currentHourIndex + 24);
  dom.hourlyList.innerHTML = slice
    .map((hour, i) => {
      const { icon } = describeWeatherCode(hour.weatherCode);
      const label = i === 0 ? 'Now' : formatInTimeZone(new Date(hour.time), timezone, { hour: 'numeric' });
      const prob = hour.precipitationProbability;
      return `
        <li class="hour-item${i === 0 ? ' is-now' : ''}">
          <span class="hour-time">${label}</span>
          <span class="hour-icon">${weatherIconMarkup(icon, hour.isDay)}</span>
          <span class="hour-temp">${fmtTemp(hour.temperature, unit)}</span>
          <span class="hour-precip">${prob !== null && prob !== undefined ? `${Math.round(prob)}%` : ''}</span>
        </li>`;
    })
    .join('');
}

/* ==========================================================================
   7-day forecast
   ========================================================================== */

export function renderDaily(dom, bundle, unit) {
  const { daily, timezone } = bundle.forecast;
  dom.dailyList.innerHTML = daily
    .slice(0, 7)
    .map((day, i) => {
      const { label, icon } = describeWeatherCode(day.weatherCode);
      const dayName = i === 0 ? 'Today' : formatInTimeZone(new Date(`${day.date}T12:00:00`), timezone, { weekday: 'short' });
      const prob = day.precipitationProbabilityMax;
      return `
        <li class="day-item">
          <span class="day-name">${dayName}</span>
          <span class="day-icon">${weatherIconMarkup(icon)}</span>
          <span class="day-condition">${label}</span>
          <span class="day-temps">
            <span class="day-max">${fmtTemp(day.tempMax, unit)}</span>
            <span class="day-min">${fmtTemp(day.tempMin, unit)}</span>
          </span>
          <span class="day-precip">${prob !== null && prob !== undefined ? `${Math.round(prob)}% rain` : ''}</span>
        </li>`;
    })
    .join('');
}

/* ==========================================================================
   Temperature chart (pure SVG, no library)
   ========================================================================== */

export function renderTemperatureChart(dom, bundle, unit) {
  const { hourly, currentHourIndex, timezone } = bundle.forecast;
  const points = hourly.slice(currentHourIndex, currentHourIndex + 24);
  if (!points.length) {
    dom.chartSvg.innerHTML = '';
    return;
  }

  const width = 720;
  const height = 220;
  const padX = 24;
  const padTop = 30;
  const padBottom = 34;

  const temps = points.map((p) => cToUnit(p.temperature, unit)).filter((v) => v !== null);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;

  const xStep = (width - padX * 2) / (points.length - 1);
  const yFor = (t) => padTop + (height - padTop - padBottom) * (1 - (t - min) / range);
  const xFor = (i) => padX + i * xStep;

  const coords = points.map((p, i) => [xFor(i), yFor(cToUnit(p.temperature, unit))]);

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${height - padBottom} L${coords[0][0].toFixed(1)},${height - padBottom} Z`;

  const labelEvery = Math.ceil(points.length / 6);
  const labels = points
    .map((p, i) => {
      if (i % labelEvery !== 0) return '';
      const timeLabel = i === 0 ? 'Now' : formatInTimeZone(new Date(p.time), timezone, { hour: 'numeric' });
      return `<text x="${xFor(i)}" y="${height - 10}" class="chart-axis-label" text-anchor="middle">${timeLabel}</text>`;
    })
    .join('');

  const dots = coords
    .map(([x, y], i) => (i % labelEvery === 0 ? `<circle cx="${x}" cy="${y}" r="3.5" class="chart-dot" />` : ''))
    .join('');

  dom.chartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  dom.chartSvg.innerHTML = `
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--chart-line)" stop-opacity="0.35" />
        <stop offset="100%" stop-color="var(--chart-line)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${areaPath}" class="chart-area" fill="url(#chartFill)" />
    <path d="${linePath}" class="chart-line" />
    ${dots}
    ${labels}
  `;
}

/* ==========================================================================
   Precipitation trend
   ========================================================================== */

export function renderPrecipitation(dom, bundle) {
  const { hourly, currentHourIndex } = bundle.forecast;
  const points = hourly.slice(currentHourIndex, currentHourIndex + 12);
  if (!points.length) {
    dom.precipSection.hidden = true;
    return;
  }
  dom.precipSection.hidden = false;

  const nextRainIndex = points.findIndex((p) => (p.precipitationProbability ?? 0) >= 40);
  if (nextRainIndex === -1) {
    dom.precipSummary.textContent = 'No significant rain expected in the next 12 hours.';
  } else if (nextRainIndex === 0) {
    dom.precipSummary.textContent = 'Rain is likely right now.';
  } else {
    dom.precipSummary.textContent = `Rain becoming likely in about ${nextRainIndex} hour${nextRainIndex > 1 ? 's' : ''}.`;
  }

  dom.precipBars.innerHTML = points
    .map((p, i) => {
      const prob = clamp(p.precipitationProbability ?? 0, 0, 100);
      return `
        <div class="precip-bar" title="${prob}%">
          <div class="precip-bar-fill" style="--h:${prob}%"></div>
          <span class="precip-bar-value">${prob}%</span>
        </div>`;
    })
    .join('');
}

/* ==========================================================================
   Sunrise / sunset arc
   ========================================================================== */

export function renderSunPath(dom, bundle) {
  const { sunrise, sunset, timezone } = bundle.forecast;
  if (!sunrise || !sunset) {
    dom.sunPathSection.hidden = true;
    return;
  }
  dom.sunPathSection.hidden = false;

  const now = Date.now();
  const sunriseMs = new Date(sunrise).getTime();
  const sunsetMs = new Date(sunset).getTime();
  const progress = clamp((now - sunriseMs) / (sunsetMs - sunriseMs), 0, 1);
  const isDaytime = now >= sunriseMs && now <= sunsetMs;

  dom.sunriseTime.textContent = formatInTimeZone(new Date(sunrise), timezone, { hour: 'numeric', minute: '2-digit' });
  dom.sunsetTime.textContent = formatInTimeZone(new Date(sunset), timezone, { hour: 'numeric', minute: '2-digit' });

  // Status text for time until sunset/sunrise
  let statusText = '';
  const formatDiff = (ms) => {
    const mins = Math.round(Math.abs(ms) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (now < sunriseMs) {
    statusText = `Sunrise in ${formatDiff(sunriseMs - now)}`;
  } else if (now < sunsetMs) {
    statusText = `${formatDiff(sunsetMs - now)} to sunset`;
  } else {
    statusText = `Sunset was ${formatDiff(now - sunsetMs)} ago`;
  }
  if (dom.sunPathStatus) dom.sunPathStatus.textContent = statusText;

  const width = 400;
  const height = 140;
  const startX = 30;
  const endX = width - 30;
  const baseY = 110;
  const peakY = 20;

  // Quadratic arc from (startX, baseY) to (endX, baseY) peaking at midpoint.
  const arcPoint = (t) => {
    const x = startX + (endX - startX) * t;
    const y = baseY - (baseY - peakY) * (1 - Math.pow(2 * t - 1, 2));
    return [x, y];
  };

  const [sunX, sunY] = isDaytime ? arcPoint(progress) : arcPoint(progress < 0.5 ? 0 : 1);

  const pathD = `M${startX},${baseY} Q${width / 2},${peakY - (baseY - peakY)} ${endX},${baseY}`;

  dom.sunPathSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  dom.sunPathSvg.innerHTML = `
    <path d="${pathD}" class="sun-arc-track" pathLength="100" />
    <path d="${pathD}" class="sun-arc-progress" pathLength="100" style="--progress:${progress}" />
    <circle cx="${startX}" cy="${baseY}" r="3" class="sun-arc-anchor" />
    <circle cx="${endX}" cy="${baseY}" r="3" class="sun-arc-anchor" />
    <g class="${isDaytime ? 'sun-arc-marker-wrap' : ''}" style="transform-origin: ${sunX}px ${sunY}px">
      <circle cx="${sunX}" cy="${sunY}" r="7" class="sun-arc-marker${isDaytime ? '' : ' is-below-horizon'}" />
    </g>
  `;
}

/* ==========================================================================
   Air quality
   ========================================================================== */

export function renderAirQuality(dom, bundle) {
  const aq = bundle.airQuality;
  if (!aq) {
    dom.airQualitySection.hidden = true;
    return;
  }
  dom.airQualitySection.hidden = false;
  const { label, tone } = aqiLabel(aq.aqi);
  dom.aqiValue.textContent = safeRound(aq.aqi);
  dom.aqiLabel.textContent = label;
  dom.aqiLabel.dataset.tone = tone;
  dom.aqiPm25.textContent = aq.pm2_5 !== null && aq.pm2_5 !== undefined ? `${aq.pm2_5.toFixed(1)} µg/m³` : '—';
  dom.aqiPm10.textContent = aq.pm10 !== null && aq.pm10 !== undefined ? `${aq.pm10.toFixed(1)} µg/m³` : '—';
  dom.aqiCo.textContent = aq.co !== null && aq.co !== undefined ? `${Math.round(aq.co)} µg/m³` : '—';
  dom.aqiNo2.textContent = aq.no2 !== null && aq.no2 !== undefined ? `${aq.no2.toFixed(1)} µg/m³` : '—';
  dom.aqiO3.textContent = aq.o3 !== null && aq.o3 !== undefined ? `${aq.o3.toFixed(1)} µg/m³` : '—';
}

/* ==========================================================================
   Weather advisory (heuristic — clearly labelled as computed, not an official alert)
   ========================================================================== */

export function renderAlert(dom, bundle) {
  const { hourly, currentHourIndex, timezone } = bundle.forecast;
  const window = hourly.slice(currentHourIndex, currentHourIndex + 12);
  const trigger = window.find((h) => {
    const { icon } = describeWeatherCode(h.weatherCode);
    return icon === 'thunderstorm' || (h.precipitationProbability ?? 0) >= 75;
  });

  if (!trigger) {
    dom.alertSection.hidden = true;
    return;
  }
  dom.alertSection.hidden = false;
  const { icon } = describeWeatherCode(trigger.weatherCode);
  const timeLabel = formatInTimeZone(new Date(trigger.time), timezone, { hour: 'numeric', minute: '2-digit' });
  dom.alertText.textContent =
    icon === 'thunderstorm'
      ? `Thunderstorms possible around ${timeLabel}. Expect brief heavy rain and lightning.`
      : `Heavy rainfall likely around ${timeLabel} — a ${Math.round(trigger.precipitationProbability)}% chance of precipitation.`;
}

/* ==========================================================================
   Favorites & recent searches
   ========================================================================== */

export function renderFavorites(dom, favorites, activeLocationId, onSelect, onRemove) {
  if (!favorites.length) {
    dom.favoritesList.innerHTML = `<li class="empty-hint">No favorites yet — tap the star on a location to save it.</li>`;
    return;
  }
  dom.favoritesList.innerHTML = favorites
    .map(
      (loc) => `
      <li class="chip-item${loc.id === activeLocationId ? ' is-active' : ''}" data-id="${loc.id}">
        <button type="button" class="chip-select" data-action="select">★ ${loc.name}</button>
        <button type="button" class="chip-remove" data-action="remove" aria-label="Remove ${loc.name} from favorites">✕</button>
      </li>`
    )
    .join('');

  dom.favoritesList.onclick = (e) => {
    const li = e.target.closest('.chip-item');
    if (!li) return;
    const id = li.dataset.id;
    const loc = favorites.find((f) => f.id === id);
    if (e.target.dataset.action === 'remove') {
      onRemove(loc);
    } else {
      onSelect(loc);
    }
  };
}

export function renderRecent(dom, recents, onSelect, onClear) {
  if (!recents.length) {
    dom.recentList.innerHTML = `<li class="empty-hint">Your recent searches will show up here.</li>`;
    dom.recentClear.hidden = true;
    return;
  }
  dom.recentClear.hidden = false;
  dom.recentList.innerHTML = recents
    .map((loc) => `<li class="chip-item" data-id="${loc.id}"><button type="button" class="chip-select">${loc.name}</button></li>`)
    .join('');
  dom.recentList.onclick = (e) => {
    const li = e.target.closest('.chip-item');
    if (!li) return;
    const loc = recents.find((r) => r.id === li.dataset.id);
    if (loc) onSelect(loc);
  };
  dom.recentClear.onclick = onClear;
}

export function updateFavoriteButton(dom, isFavorite) {
  dom.favoriteToggle.setAttribute('aria-pressed', String(isFavorite));
  dom.favoriteToggle.classList.toggle('is-active', isFavorite);
  dom.favoriteToggle.textContent = isFavorite ? '★' : '☆';
}

/* ==========================================================================
   Refresh / last-updated indicator
   ========================================================================== */

export function renderUpdatedAt(dom, timestamp, isOffline) {
  if (!timestamp) {
    dom.updatedText.textContent = '';
    return;
  }
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  const rel = mins < 1 ? 'just now' : mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
  dom.updatedText.textContent = isOffline ? `Offline · Showing last available weather (${rel})` : `Updated ${rel}`;
  dom.offlineBadge.hidden = !isOffline;
}

/* ==========================================================================
   Error / empty states
   ========================================================================== */

export function showError(dom, message) {
  dom.errorBanner.hidden = false;
  dom.errorMessage.textContent = message;
}

export function hideError(dom) {
  dom.errorBanner.hidden = true;
}

export function showEmptyState(dom, show) {
  dom.emptyState.hidden = !show;
  dom.dashboard.hidden = show;
}

/* ==========================================================================
   Dynamic background (time of day + condition)
   ========================================================================== */

let lastBackgroundCondition = null;

export function updateBackground(root, { icon, isDay }) {
  const condition = icon || 'clear';
  root.dataset.condition = condition;
  root.dataset.daytime = isDay ? 'day' : 'night';

  if (condition !== lastBackgroundCondition) {
    lastBackgroundCondition = condition;
    renderParticles(condition);
  }
}

function renderParticles(condition) {
  const container = qs('#particles');
  if (!container) return;
  container.innerHTML = '';
  if (prefersReducedMotion()) return;

  if (condition === 'rain' || condition === 'drizzle' || condition === 'thunderstorm') {
    const count = condition === 'drizzle' ? 26 : 36;
    for (let i = 0; i < count; i += 1) {
      const drop = document.createElement('span');
      drop.className = 'bg-drop';
      drop.style.left = `${Math.random() * 100}%`;
      drop.style.animationDuration = `${0.5 + Math.random() * 0.4}s`;
      drop.style.animationDelay = `${Math.random() * 2}s`;
      container.appendChild(drop);
    }
  } else if (condition === 'snow') {
    for (let i = 0; i < 40; i += 1) {
      const flake = document.createElement('span');
      flake.className = 'bg-flake';
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDuration = `${6 + Math.random() * 6}s`;
      flake.style.animationDelay = `${Math.random() * 5}s`;
      flake.style.opacity = `${0.3 + Math.random() * 0.5}`;
      container.appendChild(flake);
    }
  }
}

export function renderStars(container, count = 60) {
  if (!container || container.childElementCount) return;
  for (let i = 0; i < count; i += 1) {
    const star = document.createElement('span');
    star.className = 'star';
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 70}%`;
    star.style.animationDelay = `${Math.random() * 4.5}s`;
    star.style.opacity = `${0.3 + Math.random() * 0.6}`;
    container.appendChild(star);
  }
}

/* ==========================================================================
   3D tilt interaction (disabled on touch devices, respects reduced motion)
   ========================================================================== */

export function enableTiltInteraction(container) {
  if (prefersReducedMotion() || matchMedia('(hover: none)').matches) return;

  qsa('[data-tilt]', container).forEach((card) => {
    let frame = null;
    const onMove = (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty('--rx', `${(-py * 6).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(px * 6).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    };
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
  });
}

/* ==========================================================================
   Entrance animation orchestration
   ========================================================================== */

export function playEntranceAnimation(root) {
  if (prefersReducedMotion()) return;
  const items = qsa('[data-entrance]', root);
  items.forEach((el, i) => {
    el.style.setProperty('--entrance-delay', `${Math.min(i * 60, 360)}ms`);
    el.classList.add('entrance-play');
  });
}

/* ==========================================================================
   Skeleton shimmer helper for city search results / suggestions
   ========================================================================== */

export function renderSearchResults(dom, results, onSelect) {
  if (!results.length) {
    dom.searchResults.hidden = true;
    dom.searchResults.innerHTML = '';
    return;
  }
  dom.searchResults.hidden = false;
  dom.searchResults.innerHTML = results
    .map(
      (loc, i) => `
      <li>
        <button type="button" class="search-result" data-index="${i}">
          <span class="search-result-name">${loc.name}</span>
          <span class="search-result-sub">${[loc.admin1, loc.country].filter(Boolean).join(', ')}</span>
        </button>
      </li>`
    )
    .join('');
  dom.searchResults.onclick = (e) => {
    const btn = e.target.closest('.search-result');
    if (!btn) return;
    onSelect(results[Number(btn.dataset.index)]);
  };
}
