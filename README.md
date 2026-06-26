# wetter-chat

Ein **dynamisches Wetter-Dashboard** aus frei verschieb- und größenänderbaren Cards.
Jede Card zeigt ein Diagramm (ECharts) oder eine Tabelle (TanStack) auf Basis echter
Zeitreihen aus einer bestehenden **InfluxDB**. Fokus: Daten elegant, modern und
datengetrieben darstellen.

> **Status:** Iteration 1 (Walking Skeleton) ✅ abgeschlossen & verifiziert.
> Umfang & Erfolgskriterien je Iteration als eigenes Dokument unter
> [`docs/iterations/`](./docs/iterations/).

## Tech-Stack

| Bereich        | Wahl |
|----------------|------|
| Framework      | Next.js 16 · TypeScript · React 19 |
| Styling        | Tailwind CSS v4 · shadcn/ui |
| Dashboard-Grid | react-grid-layout v2 (Drag + Resize + Persist) |
| Diagramme      | Apache ECharts 6 (`echarts-for-react`) |
| Tabellen       | TanStack Table 8 (`@tanstack/react-virtual`) |
| Datenquelle    | InfluxDB 2.x via `@influxdata/influxdb-client` (serverseitig) |
| Laufzeit       | Docker + Docker Compose |

## Voraussetzungen

- Docker & Docker Compose (die App läuft **in Containern**, nicht nativ)
- Lesezugriff auf die InfluxDB (Read-Token)

## Schnellstart

```bash
# 1. Secrets anlegen (Vorlage kopieren und Token eintragen)
cp .env.example .env
#    -> INFLUXDB_TOKEN in .env setzen

# 2. App starten (Dev-Modus mit Hot Reload)
docker compose up

# -> http://localhost:3000
```

## Verifikation (Gate)

```bash
docker compose run --rm web npm run typecheck   # tsc --noEmit
docker compose run --rm web npm run build        # next build
```

Beide müssen mit Exit 0 enden — das ist die harte, secret-freie Erfolgsbedingung
(„Gate A") der aktuellen Iteration.

## Datenquelle

Wetterdaten kommen aus einer bestehenden InfluxDB (Home-Assistant-Sensorik). Die App
fragt sie **serverseitig** ab (Token bleibt im Backend, nie im Browser). Konfiguration
über `.env` (siehe [`.env.example`](./.env.example)):

| Variable          | Bedeutung |
|-------------------|-----------|
| `INFLUXDB_URL`    | Basis-URL der InfluxDB (`https://…:8086`) |
| `INFLUXDB_ORG`    | Organisation |
| `INFLUXDB_BUCKET` | Bucket mit den Sensordaten |
| `INFLUXDB_TOKEN`  | **Read**-Token (geheim, nicht committen) |

> Hinweis: Ein lokal konfigurierter InfluxDB-**MCP-Server** dient nur der Entwicklung
> (Datenexploration, Query-Design) — er ist **nicht** Teil der Laufzeit der App.

## Doku

- [`docs/iterations/`](./docs/iterations/) — je Iteration eine Spec (Scope + Erfolgskriterien);
  aktiv = höchste Nummer mit `Status: aktiv`.
