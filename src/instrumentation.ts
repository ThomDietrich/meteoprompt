/**
 * spec-15 — Next.js instrumentation hook: runs ONCE when the server boots
 * (runtime only; `next build` never calls it, so Gate A stays DB-free). Logs
 * `server_start` and probes InfluxDB reachability → `db_connect` / `db_error`,
 * so the log shows the app came up and whether the database is reachable.
 *
 * Everything is dynamically imported inside `register()` so the server-only
 * Influx client is never pulled into the build/edge graph.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logEvent } = await import("@/lib/logger");
  logEvent({ event: "server_start" });

  try {
    const { runFluxScalar, influxBucket } = await import("@/lib/influx");
    const bucket = influxBucket();
    // Cheap bounded probe: keep only `_time` (uniform type). Keeping `_value`
    // would hit a Flux schema collision because the bucket mixes string (state)
    // and float (value) `_value` columns — that is a query error, NOT a
    // connectivity failure. Any real transport/auth failure still throws → db_error.
    await runFluxScalar(
      `from(bucket: "${bucket}") |> range(start: -1m) |> limit(n: 1) |> keep(columns: ["_time"])`,
    );
    logEvent({ event: "db_connect", bucket });
  } catch (error) {
    logEvent({
      event: "db_error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
