import "server-only";

/**
 * Interpret a data-step (Flux/InfluxDB) error into a friendly, ACTIONABLE German
 * message (spec §BUG3). The data step runs AFTER Claude has mapped the query, so
 * the failures here are timeouts (query too heavy), missing config, or other
 * server errors. The InfluxDB client timeout is 20 s (doubled on request, see
 * influx.ts); resolution reduction stays the primary defence. On a timeout we
 * still explain the cause and suggest how to narrow the query.
 */

export type DataErrorCategory = "timeout" | "config" | "server_error";

export interface CategorizedError {
  category: DataErrorCategory;
  httpStatus: number;
  /** Cause + suggestion, German, shown in the red error display under search. */
  detail: string;
}

/** Heuristic: does this error message indicate a request/DB timeout? */
function isTimeout(message: string): boolean {
  return /timed out|timeout|etimedout|deadline|aborted|socket hang up/i.test(
    message,
  );
}

export function categorizeDataError(error: unknown): CategorizedError {
  const message = error instanceof Error ? error.message : String(error);

  if (/Missing InfluxDB configuration/.test(message)) {
    return {
      category: "config",
      httpStatus: 503,
      detail:
        "Die Datenbank ist nicht erreichbar (Konfiguration fehlt). Bitte später erneut versuchen.",
    };
  }

  if (isTimeout(message)) {
    return {
      category: "timeout",
      httpStatus: 504,
      detail:
        "Die Abfrage war zu umfangreich und hat das Zeitlimit überschritten. " +
        "Tipp: einen kürzeren Zeitraum wählen, nur eine statt mehrerer Metriken " +
        "abfragen oder gröber/einfacher formulieren (z. B. „letzte 7 Tage“ statt mehrere Jahre).",
    };
  }

  return {
    category: "server_error",
    httpStatus: 500,
    detail:
      "Bei der Auswertung ist ein Fehler aufgetreten. Bitte erneut versuchen — " +
      "ggf. mit einer einfacheren oder kürzeren Anfrage.",
  };
}
