const ENGLAND_LAT = 52.3555;
const ENGLAND_LON = -1.1743;
const WEATHER_CACHE_PREFIX = "rugbyWeatherCache:GB-ENG:";

const WEATHER_LABELS = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Icing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Heavy thunderstorm with hail",
};

const SEVERE_WEATHER_CODES = new Set([55, 65, 67, 75, 82, 86, 95, 96, 99]);

export function getWeatherLabel(code) {
  return WEATHER_LABELS[code] ?? "Unknown";
}

export function isWeatherWarning(day) {
  if (!day) {
    return false;
  }

  return (
    SEVERE_WEATHER_CODES.has(day.weatherCode) ||
    day.precipitation >= 20 ||
    day.windGust >= 55 ||
    day.tempMin <= -5 ||
    day.tempMax >= 32
  );
}

function readWeatherCache(startDate, endDate) {
  try {
    const raw = localStorage.getItem(`${WEATHER_CACHE_PREFIX}${startDate}:${endDate}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed?.days ?? null;
  } catch {
    return null;
  }
}

function writeWeatherCache(startDate, endDate, days) {
  try {
    localStorage.setItem(
      `${WEATHER_CACHE_PREFIX}${startDate}:${endDate}`,
      JSON.stringify({ days, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Ignore cache write errors
  }
}

export async function fetchWeatherByDate(dates) {
  const uniqueDates = [...new Set(dates.filter(Boolean))].sort();
  if (uniqueDates.length === 0) {
    return {};
  }

  const startDate = uniqueDates[0];
  const endDate = uniqueDates[uniqueDates.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  const effectiveEndDate = endDate > today ? today : endDate;

  if (startDate > effectiveEndDate) {
    return {};
  }

  const cachedDays = readWeatherCache(startDate, effectiveEndDate);
  if (cachedDays) {
    return cachedDays;
  }

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(ENGLAND_LAT));
  url.searchParams.set("longitude", String(ENGLAND_LON));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", effectiveEndDate);
  url.searchParams.set(
    "daily",
    "weather_code,precipitation_sum,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min",
  );
  url.searchParams.set("timezone", "Europe/London");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status})`);
  }

  const payload = await response.json();
  const daily = payload?.daily ?? {};
  const days = {};

  for (let index = 0; index < (daily.time?.length ?? 0); index += 1) {
    const date = daily.time[index];
    const weatherCode = daily.weather_code?.[index] ?? null;
    const precipitation = daily.precipitation_sum?.[index] ?? 0;
    const windGust = daily.wind_gusts_10m_max?.[index] ?? 0;
    const tempMax = daily.temperature_2m_max?.[index] ?? null;
    const tempMin = daily.temperature_2m_min?.[index] ?? null;
    const summary = {
      weatherCode,
      label: getWeatherLabel(weatherCode),
      precipitation,
      windGust,
      tempMax,
      tempMin,
      hasWarning: false,
      warningReasons: [],
    };

    if (SEVERE_WEATHER_CODES.has(weatherCode)) {
      summary.warningReasons.push(summary.label);
    }
    if (precipitation >= 20) {
      summary.warningReasons.push(`${precipitation.toFixed(1)}mm rain`);
    }
    if (windGust >= 55) {
      summary.warningReasons.push(`${Math.round(windGust)} km/h gusts`);
    }
    if (tempMin <= -5) {
      summary.warningReasons.push(`${tempMin.toFixed(1)}°C min`);
    }
    if (tempMax >= 32) {
      summary.warningReasons.push(`${tempMax.toFixed(1)}°C max`);
    }

    summary.hasWarning = summary.warningReasons.length > 0;
    days[date] = summary;
  }

  writeWeatherCache(startDate, effectiveEndDate, days);
  return days;
}

export const SEASON_STATS_KEY = "rugbySeasonClimateStats";

export function loadSeasonStats() {
  try {
    const raw = localStorage.getItem(SEASON_STATS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSeasonStats(stats) {
  try {
    localStorage.setItem(SEASON_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore cache write errors
  }
}
