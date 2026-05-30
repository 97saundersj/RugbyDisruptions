<script setup>
import { computed, onMounted, ref, watch } from "vue";
import {
  fetchWeatherByDate,
  loadSeasonStats,
  saveSeasonStats,
} from "./weather.js";

const API_BASE_URL = "https://rugby.highlightly.net/matches";
const RAPID_HOST = "rugby-highlights-api.p.rapidapi.com";
const STARTING_LIMIT = 100;
const STARTING_OFFSET = 0;
const matches = ref([]);
const totalCount = ref(null);
const isLoading = ref(false);
const errorMessage = ref("");
const pagesFetched = ref(0);
const currentOffset = ref(STARTING_OFFSET);
const currentLimit = ref(STARTING_LIMIT);
const isComplete = ref(false);
const hasStarted = ref(false);
const loadedFromCache = ref(false);
const weatherByDate = ref({});
const isWeatherLoading = ref(false);
const weatherError = ref("");
const seasonStats = ref(loadSeasonStats());
const tableSearch = ref("");
const selectedState = ref(null);
const selectedLeague = ref(null);
const selectedApiSeason = ref("2025");

const apiSeasonOptions = computed(() => {
  const seasons = [];
  for (let year = 2026; year >= 2016; year -= 1) {
    seasons.push(String(year));
  }
  return seasons;
});

const cacheKey = computed(
  () =>
    `rugbyMatchesCache:season=${selectedApiSeason.value}:country=GB-ENG:offset=${STARTING_OFFSET}:limit=${STARTING_LIMIT}`,
);

const cardTitle = computed(() => `Rugby Matches (${selectedApiSeason.value}, GB-ENG)`);
const sourceText = computed(() => (loadedFromCache.value ? "Cache" : "API"));
const hasSeasonDataCached = ref(false);

const seasonActionLabel = computed(() =>
  hasSeasonDataCached.value ? "Refresh" : "Search",
);

function updateSeasonCacheFlag() {
  try {
    const rawCache = localStorage.getItem(cacheKey.value);
    if (!rawCache) {
      hasSeasonDataCached.value = false;
      return;
    }
    const parsed = JSON.parse(rawCache);
    hasSeasonDataCached.value = Array.isArray(parsed?.matches);
  } catch {
    hasSeasonDataCached.value = false;
  }
}

watch(cacheKey, updateSeasonCacheFlag, { immediate: true });

const tableHeaders = [
  { title: "ID", key: "id", sortable: true },
  { title: "Date", key: "date", sortable: true },
  { title: "Location", key: "location", sortable: true },
  { title: "League", key: "leagueName", sortable: true },
  { title: "Season", key: "leagueSeason", sortable: true },
  { title: "Home", key: "homeTeamName", sortable: true },
  { title: "Away", key: "awayTeamName", sortable: true },
  { title: "State", key: "stateDescription", sortable: true },
  { title: "Score", key: "stateScore", sortable: true },
  { title: "Weather", key: "weatherLabel", sortable: true },
  { title: "Warning", key: "weatherWarning", sortable: true },
];

const progressText = computed(() => {
  if (totalCount.value === null) {
    return `${matches.value.length} loaded`;
  }
  return `${matches.value.length} / ${totalCount.value} loaded`;
});

const statusText = computed(() => {
  if (isLoading.value) {
    return "Loading...";
  }
  if (errorMessage.value) {
    return "Error";
  }
  if (isComplete.value) {
    return "Complete";
  }
  return "Idle";
});

function getWeatherForDate(dateValue) {
  const dateKey = (dateValue ?? "").slice(0, 10);
  return weatherByDate.value[dateKey] ?? null;
}

function isClimateLinkedDisruption(stateDescription, dateValue) {
  return isDisruptionState(stateDescription) && getWeatherForDate(dateValue)?.hasWarning;
}

const tableRows = computed(() =>
  matches.value.map((match) => {
    const weather = getWeatherForDate(match.date);
    return {
      id: match.id ?? "",
      date: match.date ?? "",
      location: [match.country?.name, match.country?.code].filter(Boolean).join(" "),
      leagueName: match.league?.name ?? "",
      leagueSeason: match.league?.season ?? "",
      homeTeamName: match.homeTeam?.name ?? "",
      awayTeamName: match.awayTeam?.name ?? "",
      stateDescription: match.state?.description ?? "",
      stateScore: match.state?.score ?? "",
      weatherLabel: weather?.label ?? (isWeatherLoading.value ? "Loading..." : "-"),
      weatherWarning: weather?.hasWarning ? "Yes" : weather ? "No" : "-",
      weatherWarningDetail: weather?.warningReasons?.join(", ") ?? "",
      climateLinked: isClimateLinkedDisruption(match.state?.description, match.date),
    };
  }),
);

const stateOptions = computed(() =>
  [...new Set(tableRows.value.map((row) => row.stateDescription).filter(Boolean))].sort(),
);

const leagueOptions = computed(() =>
  [...new Set(tableRows.value.map((row) => row.leagueName).filter(Boolean))].sort(),
);

const filteredRows = computed(() =>
  tableRows.value.filter((row) => {
    const stateMatch = !selectedState.value || row.stateDescription === selectedState.value;
    const leagueMatch = !selectedLeague.value || row.leagueName === selectedLeague.value;
    return stateMatch && leagueMatch;
  }),
);

const disruptionKeywords = ["postponed", "cancelled", "abandoned", "suspended", "interrupted", "delayed"];

function isDisruptionState(stateDescription) {
  const normalized = (stateDescription ?? "").toLowerCase();
  return disruptionKeywords.some((keyword) => normalized.includes(keyword));
}

function formatMatchSummary(row) {
  const kickoff = (row.date ?? "").slice(11, 16) || "TBD";
  const score = row.stateScore ? ` (${row.stateScore})` : "";
  return `${kickoff} - ${row.homeTeamName} vs ${row.awayTeamName} [${row.stateDescription}]${score}`;
}

function buildDateTooltip(point) {
  const warningText = point.hasWeatherWarning
    ? `Warning: Yes (${point.warningDetail || "Severe conditions"})`
    : "Warning: No";
  const lines = [
    `Date: ${point.date}`,
    `Disruptions: ${point.disruptions}`,
    `Weather warnings: ${point.weatherWarnings}`,
    `Weather: ${point.weatherLabel}`,
    warningText,
    "Matches:",
    ...point.matchSummaries.map((summary) => `- ${summary}`),
  ];
  return lines.join("\n");
}

function getPointColorClass(point) {
  if (point.disruptions > 0) {
    return point.hasWeatherWarning ? "with-warning" : "dulled-disruption";
  }
  return "no-disruption";
}

const disruptionChartData = computed(() => {
  const groupedByDate = new Map();

  for (const row of filteredRows.value) {
    const dateKey = (row.date ?? "").slice(0, 10);
    if (!dateKey) {
      continue;
    }

    if (!groupedByDate.has(dateKey)) {
      const weather = getWeatherForDate(dateKey);
      groupedByDate.set(dateKey, {
        date: dateKey,
        disruptions: 0,
        weatherWarnings: weather?.hasWarning ? 1 : 0,
        weatherLabel: weather?.label ?? "-",
        hasWeatherWarning: weather?.hasWarning ?? false,
        warningDetail: weather?.warningReasons?.join(", ") ?? "",
        matchSummaries: [],
      });
    }

    const current = groupedByDate.get(dateKey);
    current.matchSummaries.push(formatMatchSummary(row));
    if (isDisruptionState(row.stateDescription)) {
      current.disruptions += 1;
    }
  }

  return [...groupedByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
});

const disruptionListPoints = computed(() =>
  disruptionChartData.value.filter((point) => point.disruptions > 0),
);

const maxGraphValue = computed(() =>
  disruptionChartData.value.reduce((maxValue, point) => Math.max(maxValue, point.disruptions), 0),
);

const lineChartLayout = computed(() => {
  const data = disruptionChartData.value;
  if (data.length === 0) {
    return null;
  }

  const width = 1000;
  const height = 300;
  const padding = { top: 24, right: 24, bottom: 56, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(maxGraphValue.value, 1);

  const points = data.map((point, index) => {
    const x =
      padding.left +
      (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = padding.top + plotHeight - (point.disruptions / max) * plotHeight;

    return {
      ...point,
      x,
      y,
      shortDate: point.date.slice(5),
    };
  });

  const disruptionsPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const yTickCount = Math.min(max, 5);
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, index) => {
    const value = Math.round((max / yTickCount) * index);
    const y = padding.top + plotHeight - (value / max) * plotHeight;
    return { value, y };
  });

  const labelStep = Math.max(1, Math.ceil(data.length / 14));
  const xLabels = points
    .filter((_, index) => index % labelStep === 0 || index === points.length - 1)
    .map((point) => ({
      x: point.x,
      label: point.shortDate,
    }));

  return {
    width,
    height,
    padding,
    plotHeight,
    max,
    points,
    plotBaseline: padding.top + plotHeight,
    disruptionsPath,
    yTicks,
    xLabels,
  };
});

const totalDisruptions = computed(() =>
  filteredRows.value.reduce(
    (count, row) => count + (isDisruptionState(row.stateDescription) ? 1 : 0),
    0,
  ),
);

const totalWeatherWarnings = computed(() => {
  const warningDates = new Set();
  for (const row of filteredRows.value) {
    const weather = getWeatherForDate(row.date);
    if (weather?.hasWarning) {
      warningDates.add((row.date ?? "").slice(0, 10));
    }
  }
  return warningDates.size;
});

const totalClimateLinkedDisruptions = computed(() =>
  filteredRows.value.reduce(
    (count, row) => count + (row.climateLinked ? 1 : 0),
    0,
  ),
);

const seasonTrendData = computed(() => {
  const stats = { ...seasonStats.value };
  if (matches.value.length > 0 && Object.keys(weatherByDate.value).length > 0) {
    stats[selectedApiSeason.value] = buildSeasonSummary(tableRows.value);
  }

  return Object.entries(stats)
    .map(([season, summary]) => ({ season, ...summary }))
    .sort((a, b) => Number(a.season) - Number(b.season));
});

const maxSeasonTrendValue = computed(() =>
  seasonTrendData.value.reduce(
    (maxValue, point) =>
      Math.max(maxValue, point.disruptions, point.weatherWarningDays, point.climateLinkedDisruptions),
    0,
  ),
);

function buildSeasonSummary(rows) {
  const warningDates = new Set();
  let disruptions = 0;
  let climateLinkedDisruptions = 0;

  for (const row of rows) {
    if (isDisruptionState(row.stateDescription)) {
      disruptions += 1;
    }
    const weather = getWeatherForDate(row.date);
    if (weather?.hasWarning) {
      warningDates.add((row.date ?? "").slice(0, 10));
    }
    if (row.climateLinked) {
      climateLinkedDisruptions += 1;
    }
  }

  return {
    disruptions,
    weatherWarningDays: warningDates.size,
    climateLinkedDisruptions,
    matchCount: rows.length,
  };
}

function persistSeasonStats() {
  if (!matches.value.length) {
    return;
  }

  const nextStats = {
    ...seasonStats.value,
    [selectedApiSeason.value]: buildSeasonSummary(tableRows.value),
  };
  seasonStats.value = nextStats;
  saveSeasonStats(nextStats);
}

async function loadWeatherForMatches() {
  const dates = matches.value.map((match) => (match.date ?? "").slice(0, 10)).filter(Boolean);
  if (dates.length === 0) {
    weatherByDate.value = {};
    return;
  }

  isWeatherLoading.value = true;
  weatherError.value = "";

  try {
    weatherByDate.value = await fetchWeatherByDate(dates);
    persistSeasonStats();
  } catch (error) {
    weatherError.value =
      error instanceof Error ? error.message : "Unexpected weather request failure.";
  } finally {
    isWeatherLoading.value = false;
  }
}

function buildUrl(offset, limit) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("season", selectedApiSeason.value);
  url.searchParams.set("countryCode", "GB-ENG");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  return url;
}

function resetFetchState() {
  hasStarted.value = false;
  isComplete.value = false;
  errorMessage.value = "";
  matches.value = [];
  totalCount.value = null;
  pagesFetched.value = 0;
  currentOffset.value = STARTING_OFFSET;
  currentLimit.value = STARTING_LIMIT;
  loadedFromCache.value = false;
  weatherByDate.value = {};
  weatherError.value = "";
}

function saveCache() {
  try {
    const cachePayload = {
      matches: matches.value,
      totalCount: totalCount.value,
      pagesFetched: pagesFetched.value,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(cacheKey.value, JSON.stringify(cachePayload));
    updateSeasonCacheFlag();
  } catch {
    // Ignore cache write errors (quota/private mode)
  }
}

function loadCache() {
  try {
    const rawCache = localStorage.getItem(cacheKey.value);
    if (!rawCache) {
      return false;
    }

    const parsed = JSON.parse(rawCache);
    if (!Array.isArray(parsed?.matches)) {
      return false;
    }

    matches.value = parsed.matches;
    totalCount.value =
      typeof parsed.totalCount === "number" ? parsed.totalCount : null;
    pagesFetched.value =
      typeof parsed.pagesFetched === "number" ? parsed.pagesFetched : 0;
    hasStarted.value = true;
    isComplete.value = true;
    loadedFromCache.value = true;
    return true;
  } catch {
    return false;
  }
}

async function fetchNextPage() {
  if (isLoading.value) {
    return false;
  }

  const apiKey = import.meta.env.VITE_RUGBY_API_KEY;
  if (!apiKey) {
    errorMessage.value =
      "Missing VITE_RUGBY_API_KEY. Add it to a .env file before running.";
    return false;
  }

  isLoading.value = true;

  try {
    const url = buildUrl(currentOffset.value, currentLimit.value);

    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": RAPID_HOST,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const payload = await response.json();
    const pageData = Array.isArray(payload?.data) ? payload.data : [];
    const pagination = payload?.pagination ?? {};

    if (typeof pagination.totalCount === "number") {
      totalCount.value = pagination.totalCount;
    }

    if (typeof pagination.limit === "number" && pagination.limit > 0) {
      currentLimit.value = pagination.limit;
    }

    if (pageData.length > 0) {
      matches.value.push(...pageData);
      pagesFetched.value += 1;
      currentOffset.value += currentLimit.value;
    }

    const hasAllData =
      typeof totalCount.value === "number" &&
      matches.value.length >= totalCount.value;
    const noMorePages = pageData.length === 0;

    if (hasAllData || noMorePages) {
      isComplete.value = true;
      saveCache();
      return false;
    } else {
      return true;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Unexpected request failure.";
    return false;
  } finally {
    isLoading.value = false;
  }
}

async function startSearch() {
  if (isLoading.value) {
    return;
  }

  resetFetchState();
  hasStarted.value = true;

  let hasMorePages = true;
  while (hasMorePages) {
    hasMorePages = await fetchNextPage();
  }

  await loadWeatherForMatches();
}

function handleApiSeasonChange() {
  if (isLoading.value) {
    return;
  }
  selectedState.value = null;
  selectedLeague.value = null;
  resetFetchState();
  if (loadCache()) {
    loadWeatherForMatches();
  }
}

onMounted(async () => {
  if (loadCache()) {
    await loadWeatherForMatches();
  }
});
</script>

<template>
  <v-app>
    <v-main>
      <v-container class="py-6 climate-tracker">
        <v-card elevation="3">
          <v-card-title class="text-h5 pt-6 px-6">
            Climate Disruption Tracker — {{ cardTitle }}
          </v-card-title>

          <v-card-text>
            <v-row class="mb-3" align="center" dense>
              <v-col cols="12" md="6">
                <v-select
                  v-model="selectedApiSeason"
                  :items="apiSeasonOptions"
                  label="Season"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  @update:model-value="handleApiSeasonChange"
                />
              </v-col>
              <v-col cols="12" md="6" class="d-flex flex-wrap ga-2">
                <v-btn color="primary" :loading="isLoading" @click="startSearch">
                  {{ seasonActionLabel }}
                </v-btn>
              </v-col>
            </v-row>

            <v-row class="mb-2" dense>
              <v-col cols="12" sm="6" md="3">
                <v-chip color="info" variant="tonal">Status: {{ statusText }}</v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-chip color="primary" variant="tonal">
                  Progress: {{ progressText }}
                </v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-chip color="purple" variant="tonal">Pages: {{ pagesFetched }}</v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-chip class="metric-chip disruptions" variant="flat">
                  Disruptions: {{ totalDisruptions }}
                </v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-chip class="metric-chip warnings" variant="flat">
                  Weather warnings: {{ totalWeatherWarnings }}
                </v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-chip class="metric-chip linked" variant="flat">
                  Climate-linked: {{ totalClimateLinkedDisruptions }}
                </v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-chip color="green" variant="tonal">Source: {{ sourceText }}</v-chip>
              </v-col>
              <v-col cols="12" sm="6" md="3" v-if="isWeatherLoading">
                <v-chip color="cyan" variant="tonal">Weather: Loading...</v-chip>
              </v-col>
            </v-row>

            <v-alert
              v-if="errorMessage"
              class="mb-3"
              type="error"
              variant="tonal"
              :text="errorMessage"
            />

            <v-alert
              v-if="weatherError"
              class="mb-3"
              type="warning"
              variant="tonal"
              :text="weatherError"
            />

            <v-card class="mb-4" variant="outlined">
              <v-card-title class="text-subtitle-1">Climate impact by season</v-card-title>
              <v-card-subtitle class="px-4 pb-2">
                Search each season to build the year-over-year trend.
              </v-card-subtitle>
              <v-card-text>
                <div v-if="seasonTrendData.length" class="graph-scroll">
                  <div
                    class="graph-wrap trend-wrap"
                    :style="{ width: `${Math.max(seasonTrendData.length * 120, 520)}px` }"
                  >
                    <div class="graph-bars trend-bars">
                      <div v-for="point in seasonTrendData" :key="point.season" class="graph-column trend-column">
                        <div class="trend-values">
                          <span class="trend-value disruptions">{{ point.disruptions }}</span>
                          <span class="trend-value warnings">{{ point.weatherWarningDays }}</span>
                          <span class="trend-value linked">{{ point.climateLinkedDisruptions }}</span>
                        </div>
                        <div class="bar-stack trend-stack">
                          <div
                            class="bar disruptions"
                            :style="{ height: `${(point.disruptions / Math.max(maxSeasonTrendValue, 1)) * 120}px` }"
                            :title="`${point.season}: ${point.disruptions} disruptions`"
                          />
                          <div
                            class="bar warnings"
                            :style="{ height: `${(point.weatherWarningDays / Math.max(maxSeasonTrendValue, 1)) * 120}px` }"
                            :title="`${point.season}: ${point.weatherWarningDays} warning days`"
                          />
                          <div
                            class="bar linked"
                            :style="{ height: `${(point.climateLinkedDisruptions / Math.max(maxSeasonTrendValue, 1)) * 120}px` }"
                            :title="`${point.season}: ${point.climateLinkedDisruptions} climate-linked disruptions`"
                          />
                        </div>
                        <div class="graph-date trend-date">{{ point.season }}</div>
                      </div>
                    </div>
                    <div class="graph-legend">
                      <span><i class="legend-dot disruptions"></i> Disruptions</span>
                      <span class="legend-muted"><i class="legend-dot warnings"></i> Weather warnings</span>
                      <span><i class="legend-dot linked"></i> Climate-linked</span>
                    </div>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">
                  No season trend data yet. Run Search for a season to start tracking.
                </div>
              </v-card-text>
            </v-card>

            <v-card class="mb-4" variant="outlined">
              <v-card-title class="text-subtitle-1">Disruptions by date</v-card-title>
              <v-card-subtitle class="px-4 pb-2">
                Disruption count per match day. Orange highlights disruptions on weather warning days; other disruptions are shown muted.
              </v-card-subtitle>
              <v-card-text>
                <div v-if="lineChartLayout" class="line-chart">
                  <div class="line-chart-panel">
                    <svg
                      class="line-chart-svg"
                      :viewBox="`0 0 ${lineChartLayout.width} ${lineChartLayout.height}`"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <line
                        v-for="tick in lineChartLayout.yTicks"
                        :key="`grid-${tick.value}`"
                        :x1="lineChartLayout.padding.left"
                        :x2="lineChartLayout.width - lineChartLayout.padding.right"
                        :y1="tick.y"
                        :y2="tick.y"
                        class="line-grid"
                      />
                      <line
                        :x1="lineChartLayout.padding.left"
                        :x2="lineChartLayout.width - lineChartLayout.padding.right"
                        :y1="lineChartLayout.plotBaseline"
                        :y2="lineChartLayout.plotBaseline"
                        class="line-axis-base"
                      />
                      <text
                        v-for="tick in lineChartLayout.yTicks"
                        :key="`ylabel-${tick.value}`"
                        :x="lineChartLayout.padding.left - 8"
                        :y="tick.y + 4"
                        class="line-axis-label y-label"
                      >
                        {{ tick.value }}
                      </text>

                      <path :d="lineChartLayout.disruptionsPath" class="line-path disruptions-track" />
                      <g v-for="point in lineChartLayout.points" :key="`point-${point.date}`">
                        <text
                          v-if="point.disruptions > 0"
                          :x="point.x"
                          :y="point.y - 10"
                          class="line-point-value"
                          :class="getPointColorClass(point)"
                        >
                          {{ point.disruptions }}
                        </text>
                        <circle
                          :cx="point.x"
                          :cy="point.y"
                          :r="point.disruptions > 0 ? 5.5 : 3.5"
                          class="line-point"
                          :class="getPointColorClass(point)"
                        >
                          <title>{{ buildDateTooltip(point) }}</title>
                        </circle>
                      </g>

                      <text
                        v-for="label in lineChartLayout.xLabels"
                        :key="`xlabel-${label.x}`"
                        :x="label.x"
                        :y="lineChartLayout.height - 16"
                        class="line-axis-label x-label"
                      >
                        {{ label.label }}
                      </text>
                    </svg>
                  </div>

                  <div class="graph-legend line-chart-legend">
                    <span><i class="legend-dot disruptions"></i> Disruptions (weather warning day)</span>
                    <span><i class="legend-dot dulled"></i> Disruptions (no weather warning)</span>
                    <span><i class="legend-dot no-disruption"></i> No disruptions</span>
                  </div>

                  <div v-if="disruptionListPoints.length" class="line-point-list">
                    <div
                      v-for="point in disruptionListPoints"
                      :key="`list-${point.date}`"
                      class="line-point-item"
                      :class="getPointColorClass(point)"
                      :title="buildDateTooltip(point)"
                    >
                      <span class="line-point-date">{{ point.date }}</span>
                      <span class="line-point-metric disruptions">
                        <strong>{{ point.disruptions }}</strong> disruption{{ point.disruptions === 1 ? "" : "s" }}
                      </span>
                      <span class="line-point-metric warnings">
                        {{ point.hasWeatherWarning ? "Weather warning" : "No weather warning" }}
                      </span>
                      <span class="line-point-weather">{{ point.weatherLabel }}</span>
                    </div>
                  </div>
                  <div v-else class="text-medium-emphasis line-point-empty">
                    No disruptions in the current filters.
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">
                  No match dates to display yet. Run Search to load matches.
                </div>
              </v-card-text>
            </v-card>

            <v-card class="matches-table-card" variant="outlined">
              <v-card-title class="text-subtitle-1">Matches</v-card-title>
              <v-card-subtitle class="px-4 pb-0">
                {{ filteredRows.length }} match{{ filteredRows.length === 1 ? "" : "es" }} shown
              </v-card-subtitle>
              <v-card-text>
                <v-row class="mb-3" dense>
                  <v-col cols="12" md="4">
                    <v-select
                      v-model="selectedState"
                      :items="stateOptions"
                      label="Filter by state"
                      variant="outlined"
                      density="comfortable"
                      hide-details
                      clearable
                    />
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-select
                      v-model="selectedLeague"
                      :items="leagueOptions"
                      label="Filter by league"
                      variant="outlined"
                      density="comfortable"
                      hide-details
                      clearable
                    />
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-text-field
                      v-model="tableSearch"
                      label="Search matches"
                      density="comfortable"
                      variant="outlined"
                      hide-details
                      clearable
                    />
                  </v-col>
                </v-row>

                <v-data-table
                  :headers="tableHeaders"
                  :items="filteredRows"
                  :search="tableSearch"
                  item-value="id"
                  density="comfortable"
                  :items-per-page="100"
                  :items-per-page-options="[25, 50, 100, 250, -1]"
                >
                  <template #item.weatherWarning="{ item }">
                    <v-chip
                      v-if="item.weatherWarning === 'Yes'"
                      size="small"
                      class="metric-chip warnings"
                      variant="flat"
                      :title="item.weatherWarningDetail"
                    >
                      Warning
                    </v-chip>
                    <span v-else>{{ item.weatherWarning }}</span>
                  </template>
                </v-data-table>
              </v-card-text>
            </v-card>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.climate-tracker {
  --metric-disruptions: #ff9800;
  --metric-disruptions-light: #ffb74d;
  --metric-disruptions-glow: rgba(255, 152, 0, 0.45);
  --metric-disruptions-bg: rgba(255, 152, 0, 0.14);
  --metric-disruptions-border: rgba(255, 152, 0, 0.32);
  --metric-disruptions-point-stroke: #fff3e0;

  --metric-weather: #9e9e9e;
  --metric-weather-light: #bdbdbd;
  --metric-weather-muted: rgba(189, 189, 189, 0.55);
  --metric-weather-fill: rgba(158, 158, 158, 0.18);
  --metric-weather-point: rgba(189, 189, 189, 0.45);
  --metric-weather-text: rgba(255, 255, 255, 0.55);

  --metric-linked: #8d6e63;
  --metric-linked-light: #a1887f;
  --metric-linked-bg: rgba(141, 110, 99, 0.14);
  --metric-linked-border: rgba(141, 110, 99, 0.32);
}

.metric-chip.disruptions {
  background: var(--metric-disruptions-bg) !important;
  color: var(--metric-disruptions-light) !important;
  border: 1px solid var(--metric-disruptions-border);
}

.metric-chip.warnings {
  background: var(--metric-weather-fill) !important;
  color: var(--metric-weather-light) !important;
  border: 1px solid rgba(158, 158, 158, 0.35);
}

.metric-chip.linked {
  background: var(--metric-linked-bg) !important;
  color: var(--metric-linked-light) !important;
  border: 1px solid var(--metric-linked-border);
}

.matches-table-card {
  margin-top: 8px;
}

.graph-scroll {
  overflow-x: auto;
}

.graph-wrap {
  padding-top: 8px;
}

.graph-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 200px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 8px;
}

.graph-column {
  min-width: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.bar-stack {
  display: flex;
  align-items: flex-end;
  height: 160px;
}

.dual-stack,
.trend-stack {
  gap: 4px;
}

.bar-values {
  display: flex;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.bar-value.disruptions,
.trend-value.disruptions,
.line-point-metric.disruptions {
  color: var(--metric-disruptions-light);
}

.bar-value.warnings,
.trend-value.warnings,
.line-point-metric.warnings {
  color: var(--metric-weather-light);
}

.bar-value.disruptions,
.bar-value.warnings {
  min-width: 12px;
  text-align: center;
}

.bar {
  width: 20px;
  border-radius: 4px 4px 0 0;
}

.bar.disruptions {
  background-color: var(--metric-disruptions);
}

.bar.warnings {
  background-color: var(--metric-weather);
}

.bar.linked {
  background-color: var(--metric-linked);
}

.weather-label {
  font-size: 10px;
  text-align: center;
  max-width: 48px;
  line-height: 1.2;
  min-height: 24px;
}

.line-chart {
  width: 100%;
}

.line-chart-panel {
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.line-chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.line-grid {
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 1;
}

.line-axis-base {
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.5;
}

.line-path.disruptions-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.line-point {
  cursor: pointer;
  stroke-width: 2;
}

.line-point.with-warning {
  fill: var(--metric-disruptions);
  stroke: var(--metric-disruptions-point-stroke);
}

.line-point.dulled-disruption {
  fill: rgba(255, 255, 255, 0.2);
  stroke: rgba(255, 255, 255, 0.14);
}

.line-point.no-disruption {
  fill: rgba(255, 255, 255, 0.18);
  stroke: rgba(255, 255, 255, 0.12);
}

.line-point-value {
  font-size: 11px;
  font-weight: 600;
  text-anchor: middle;
}

.line-point-value.with-warning {
  fill: var(--metric-disruptions-light);
}

.line-point-value.dulled-disruption {
  fill: rgba(255, 255, 255, 0.45);
  font-weight: 500;
}

.line-chart-legend {
  margin-top: 14px;
}

.line-axis-label {
  fill: rgba(255, 255, 255, 0.75);
  font-size: 11px;
}

.line-axis-label.y-label {
  text-anchor: end;
}

.line-axis-label.x-label {
  text-anchor: middle;
}

.line-point-empty {
  margin-top: 16px;
}

.line-point-list {
  margin-top: 16px;
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.line-point-item {
  display: grid;
  grid-template-columns: 110px minmax(140px, 1fr) 110px 1fr;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.line-point-item.with-warning {
  background: var(--metric-disruptions-bg);
  border-color: var(--metric-disruptions-border);
}

.line-point-item.with-warning .line-point-metric.disruptions strong {
  color: var(--metric-disruptions);
}

.line-point-item.dulled-disruption {
  opacity: 0.65;
}

.line-point-item.dulled-disruption .line-point-metric.disruptions strong {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.line-point-item.no-disruption {
  opacity: 0.7;
}

.line-point-item.no-disruption .line-point-metric.disruptions strong {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
}

.line-point-date {
  font-weight: 600;
}

.line-point-metric.disruptions {
  font-weight: 500;
}

.line-point-metric.disruptions strong {
  color: var(--metric-disruptions);
  font-size: 14px;
}

.line-point-metric.warnings {
  color: var(--metric-weather-text);
  font-size: 11px;
}

.line-point-item.with-warning .line-point-metric.warnings {
  color: var(--metric-disruptions-light);
}

.line-point-weather {
  color: var(--metric-weather-text);
  font-size: 11px;
}

.trend-column {
  min-width: 96px;
}

.trend-values {
  display: flex;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
}

.trend-value.linked {
  color: var(--metric-linked-light);
}

.trend-date {
  transform: none;
  width: auto;
  font-size: 12px;
  font-weight: 600;
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  font-size: 13px;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}

.legend-dot.disruptions {
  background-color: var(--metric-disruptions);
}

.legend-dot.warnings {
  background-color: var(--metric-weather);
}

.legend-dot.linked {
  background-color: var(--metric-linked);
}

.legend-dot.no-disruption {
  background-color: rgba(255, 255, 255, 0.35);
}

.legend-dot.dulled {
  background-color: rgba(255, 255, 255, 0.25);
}

.bar-value {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.graph-date {
  font-size: 11px;
  transform: rotate(-45deg);
  transform-origin: top left;
  width: 28px;
  white-space: nowrap;
}

</style>
