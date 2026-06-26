import "server-only";

import { InfluxDB, type QueryApi } from "@influxdata/influxdb-client";

/**
 * Server-only InfluxDB access. The read token must never reach the client,
 * so this module is guarded by `server-only` and reads from process.env.
 *
 * Iteration 2 generalised this from the single hard-wired temperature query
 * (Iteration 1) into a reusable query runner used by flux.ts.
 */

export type SeriesPoint = { t: string; v: number };

type InfluxEnv = {
  url: string;
  org: string;
  bucket: string;
  token: string;
};

/** Read + validate the InfluxDB connection settings. Throws if incomplete. */
export function readInfluxEnv(): InfluxEnv {
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
    throw new Error(`Missing InfluxDB configuration: ${missing.join(", ")}`);
  }

  // Non-null assertions are safe here: the check above guarantees presence.
  return { url: url!, org: org!, bucket: bucket!, token: token! };
}

/** The bucket name, validated from the environment. */
export function influxBucket(): string {
  return readInfluxEnv().bucket;
}

/** A query API bound to the configured org/token. Throws on missing config. */
export function getQueryApi(): QueryApi {
  const env = readInfluxEnv();
  return new InfluxDB({ url: env.url, token: env.token }).getQueryApi(env.org);
}

/**
 * Run a Flux query and collect `(_time, _value)` rows into points.
 * Rows with a null time or value are skipped. Throws on transport/DB errors —
 * callers map that to 5xx.
 */
export async function runFluxPoints(flux: string): Promise<SeriesPoint[]> {
  const queryApi = getQueryApi();
  const points: SeriesPoint[] = [];

  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const row = tableMeta.toObject(values) as {
      _time?: string;
      _value?: number | null;
    };

    if (row._time == null || row._value == null) continue;

    points.push({ t: row._time, v: row._value });
  }

  return points;
}
