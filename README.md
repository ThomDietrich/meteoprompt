# MeteoPrompt

**Ask your weather station's data anything.** MeteoPrompt is a self-hostable dashboard
over an existing **InfluxDB** time-series database (a WeeWX / Ecowitt weather station
logged via Home Assistant): type a question in plain language and get a chart back.
It also ships a fixed "station dashboard" of curated charts and a live current-conditions
strip.

Built with Next.js, Apache ECharts and Anthropic's Claude (for the natural-language →
query mapping). Everything runs in Docker; your InfluxDB token and Claude key stay
server-side and never reach the browser.

> The UI is in German (the reference deployment serves a German community), but the
> codebase is general. An optional chat assistant is planned, not yet built.

## Features

- **Prompt → chart.** A natural-language question (e.g. *"outdoor temperature over the
  last 4 weeks"*, *"how much did it rain this week?"*, *"coldest moment in 2025"*) is
  mapped by Claude (forced tool-use) to a structured **QuerySpec**, shaped into Flux
  server-side, and rendered as a card.
- **Movable, resizable card grid** (react-grid-layout) with per-browser persistence.
- **~14 chart types** — line, bars, wind rose, candlestick, range band, scatter,
  calendar & hour×day heatmaps, gauge, boxplot, radar, violin … — with weighted
  "smart variety" selection.
- **Analytical answers:** records/extremes (with a marked point + exact timestamp),
  scalar aggregates, counts over a threshold, year-over-year comparison overlays, and
  derived series (growing / heating / cooling degree-days, evapotranspiration).
- **Permanent station dashboard:** a fixed set of curated charts plus a 12-metric live
  "current conditions" strip.
- **Global pinning:** pin a card to make it visible to everyone (stored server-side);
  unpinned cards stay private to the browser.
- **Data-quality aware:** rain via the daily accumulator, evapotranspiration via a
  dedup-then-sum of the per-interval value, timezone-correct daily/hourly windows —
  see [`docs/data-quality-influxdb.md`](./docs/data-quality-influxdb.md).

## How it works

```
prompt ──▶ /api/ask ──▶ Claude (tool-use) ──▶ QuerySpec ──▶ Flux (server) ──▶ InfluxDB ──▶ ECharts card
```

- `POST /api/ask` — natural language → `QuerySpec` → data (the only LLM call).
- `POST /api/chart` — re-runs a stored chart spec (Flux only, **no** LLM) for reloads.
- `GET /api/now` — the current-conditions strip (one `last()`-per-entity query).
- `GET/POST /api/pinned`, `DELETE /api/pinned/[id]` — globally pinned cards.

The InfluxDB token is **read-only** and used only server-side. A locally configured
InfluxDB **MCP server** is a development/agent tool for data exploration only — it is
not part of the app's runtime.

## Tech stack

| Area            | Choice |
|-----------------|--------|
| Framework       | Next.js 16 · React 19 · TypeScript 6 |
| Styling         | Tailwind CSS v4 · shadcn/ui |
| Dashboard grid  | react-grid-layout v2 (drag + resize + persist) |
| Charts          | Apache ECharts 6 (`echarts-for-react`) + `@echarts-x` custom series |
| Tables          | TanStack Table 8 (`@tanstack/react-virtual`) |
| NL → query      | Anthropic Claude via `@anthropic-ai/sdk` (forced tool-use) |
| Data source     | InfluxDB 2.x via `@influxdata/influxdb-client` (server-side) |
| Runtime         | Docker + Docker Compose |

## Prerequisites

- **Docker & Docker Compose** — the app runs in containers, not natively.
- An **InfluxDB 2.x** instance holding weather time-series. The bundled metric catalog
  targets a WeeWX/Ecowitt `weather_station_*` schema as logged by Home Assistant;
  adapting to a different schema means editing [`src/lib/catalog.ts`](./src/lib/catalog.ts).
- A **read-only InfluxDB token**.
- An **Anthropic API key** (for the natural-language feature).

## Quick start

```bash
cp docker-compose.dist.yaml docker-compose.yaml   # your own compose (gitignored)
cp .env.example .env                              # then fill in the values (see Configuration)
# for local dev, set the build target to `dev` in docker-compose.yaml (see its comments)
docker compose up                                 # → http://localhost:3000
```

## Configuration (`.env`)

Secrets stay server-side; `.env` is gitignored and kept out of the Docker image.

| Variable            | Purpose |
|---------------------|---------|
| `INFLUXDB_URL`      | Base URL of the InfluxDB (`https://host:8086`) |
| `INFLUXDB_ORG`      | Organization |
| `INFLUXDB_BUCKET`   | Bucket holding the sensor data |
| `INFLUXDB_TOKEN`    | **Read** token (secret) |
| `ANTHROPIC_API_KEY` | Claude key, used server-side by `/api/ask` |
| `SITE_TAGLINE`      | Subtitle shown under the wordmark + in the page title |
| `IMPRESSUM_NAME` / `IMPRESSUM_STREET` / `IMPRESSUM_CITY` / `IMPRESSUM_EMAIL` | Provider details for the `/impressum` legal page (German *Impressumspflicht*); read at runtime so they stay out of the repo |

## Development

Everything runs through Docker (no native `npm`). Verification gate — both must exit 0:

```bash
docker compose run --rm web npm run typecheck   # tsc --noEmit
docker compose run --rm web npm run build        # next build
```

Per-iteration scope and acceptance criteria live under
[`docs/iterations/`](./docs/iterations/); background/reference docs under
[`docs/`](./docs/).

## Deployment

Only **`docker-compose.dist.yaml`** is tracked. Copy it to your own (gitignored)
`docker-compose.yaml` and shape it to your host — it defaults to the production
`runner` target (standalone server on `127.0.0.1:3000`, `app_data` volume):

```bash
cp docker-compose.dist.yaml docker-compose.yaml
cp .env.example .env                  # fill in INFLUXDB_*, ANTHROPIC_API_KEY, IMPRESSUM_*, SITE_TAGLINE
# add your reverse-proxy bits (e.g. Traefik labels / network) to docker-compose.yaml
docker compose up -d --build
```

`docker-compose.yaml` / `docker-compose.yml` are gitignored, so `git pull` never
touches your deployment file. Bring your own reverse proxy + TLS (Traefik / nginx /
Caddy) — the dist file has a commented Traefik example. (For local development, switch
the build target to `dev` for hot reload, as noted in the file.)

> **Production, not dev:** the `runner` target is required behind a proxy on another
> host. Running `next dev` there blocks its HMR resources cross-origin → a blank page.

## License

[MIT](./LICENSE).
