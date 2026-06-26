import "server-only";

import { InfluxDB } from "@influxdata/influxdb-client";

/**
 * Server-only InfluxDB access. The read token must never reach the client,
 * so this module is guarded by `server-only` and reads from process.env.
 */

export type SeriesPoint = { t: string; v: number };

export type SeriesResponse = {
  unit: string;
  entity: string;
  points: SeriesPoint[];
};

/** The single, hard-wired entity for Iteration 1 (see SPEC §5). */
export const OUTDOOR_TEMPERATURE_ENTITY =
  "garten_ventus_w830_outdoor_temperature";

const OUTDOOR_TEMPERATURE_UNIT = "°C";

type InfluxEnv = {
  url: string;
  org: string;
  bucket: string;
  token: string;
};

/** Read + validate the InfluxDB connection settings. Throws if incomplete. */
function readInfluxEnv(): InfluxEnv {
  const url = process.env.INFLUXDB_URL;
  const org = process.env.INFLUXDB_ORG;
  const bucket = process.env.INFLUXDB_BUCKET;
  const token = process.env.INFLUXDB_TOKEN;

  const missing = [
    ["INFLUXDB_URL", url],
    ["INFLUXDB_ORG", org],
    ["INFLUXDB_BUCKET", bucket],
    ["INFLUXDB_TOKEN", token],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing InfluxDB configuration: ${missing.join(", ")}`,
    );
  }

  // Non-null assertions are safe here: the check above guarantees presence.
  return { url: url!, org: org!, bucket: bucket!, token: token! };
}

/** Build the Flux query for the outdoor-temperature hourly mean (SPEC §5). */
function buildOutdoorTemperatureQuery(bucket: string): string {
  return `from(bucket: "${bucket}")
  |> range(start: -28d)
  |> filter(fn: (r) => r["entity_id"] == "${OUTDOOR_TEMPERATURE_ENTITY}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> yield(name: "mean")`;
}

/**
 * Query the last 4 weeks of hourly-mean outdoor temperature.
 * Throws on missing config or DB/transport errors — callers map that to 5xx.
 */
export async function queryOutdoorTemperature(): Promise<SeriesResponse> {
  const env = readInfluxEnv();

  const queryApi = new InfluxDB({
    url: env.url,
    token: env.token,
  }).getQueryApi(env.org);

  const flux = buildOutdoorTemperatureQuery(env.bucket);
  const points: SeriesPoint[] = [];

  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const row = tableMeta.toObject(values) as {
      _time?: string;
      _value?: number | null;
    };

    if (row._time == null || row._value == null) continue;

    points.push({ t: row._time, v: row._value });
  }

  return {
    unit: OUTDOOR_TEMPERATURE_UNIT,
    entity: OUTDOOR_TEMPERATURE_ENTITY,
    points,
  };
}
