# Rugby Disruptions

A Vue app for tracking **climate-related disruption** to professional rugby matches in England (GB-ENG). It loads match data by season, overlays historical weather, and highlights how disruptions align with severe weather days over time.

## Features

- **Season search** — Load all matches for a chosen season (2016–2026) from the Rugby Highlights API
- **Disruption detection** — Flags matches with states such as postponed, cancelled, abandoned, suspended, interrupted, or delayed
- **Weather context** — Fetches daily historical weather for England via [Open-Meteo](https://open-meteo.com/) and marks warning days (heavy rain, storms, high winds, extreme temperatures)
- **Disruptions by date** — Line chart of disruption counts; points are **orange** on weather-warning days and **muted** otherwise
- **Climate impact by season** — Year-over-year bars for disruptions, weather-warning days, and climate-linked disruptions (search each season to build the trend)
- **Matches table** — Filterable, searchable list with weather columns and pagination (default 100 rows per page)
- **Local caching** — Match results and weather are cached in the browser to reduce repeat API calls

## Tech stack

- [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)
- [Vuetify 4](https://vuetifyjs.com/) for UI
- Rugby Highlights API (RapidAPI)
- Open-Meteo Archive API (no key required)

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (recommended)
- A [RapidAPI](https://rapidapi.com/) key for the [Rugby Highlights API](https://rapidapi.com/highlightly/api/rugby-highlights-api)

## Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd RugbyDisruptions
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file from the example:

   ```bash
   cp .env.example .env
   ```

4. Add your RapidAPI key to `.env`:

   ```env
   VITE_RUGBY_API_KEY=your_api_key_here
   ```

   Do not commit `.env` — it is listed in `.gitignore`.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with hot reload |
| `npm run build`   | Production build to `dist/`          |
| `npm run preview` | Preview the production build locally |

The dev server typically runs at `http://localhost:5173`.

## Usage

1. Choose a **Season** (API season) and click **Search** to load all matches for England (`GB-ENG`).
2. Wait for weather data to load (shown in the status chips).
3. Use the charts to compare disruptions and weather across dates and seasons.
4. Use the **Matches** table filters (state, league, search) to narrow the list.

**Tip:** Run **Search** for multiple seasons (e.g. 2020, 2021, 2022) to populate the “Climate impact by season” chart. Stats are stored in `localStorage`.

## Data sources

| Source              | Purpose                                      |
| ------------------- | -------------------------------------------- |
| Rugby Highlights API | Match fixtures, teams, leagues, match state |
| Open-Meteo Archive  | Daily weather for England (central coordinates) |

Weather warnings are derived from thresholds (precipitation, wind gusts, temperature, WMO weather codes), not official Met Office warning feeds.

## Project structure

```
RugbyDisruptions/
├── src/
│   ├── App.vue       # Main UI, charts, table, API loading
│   ├── weather.js    # Weather fetch, cache, season stats helpers
│   └── main.js       # Vue + Vuetify bootstrap
├── .env.example
├── index.html
├── openapi.json      # API reference (Rugby Highlights)
├── package.json
└── vite.config.js
```

## License

ISC
