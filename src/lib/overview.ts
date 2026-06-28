import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { getByKey } from "@/lib/catalog";
import { influxBucket, runFluxPoints } from "@/lib/influx";
import { resolveKennwerte } from "@/lib/flux";

/**
 * spec-06 E) — the Wetterlage-Überblick for the Kennwerte instrument panel.
 *
 * Like summary.ts (A), strictly two stages so nothing can be invented:
 *   1) `computeOverviewStats` derives hard per-day numbers over the LAST ~5 DAYS
 *      from InfluxDB — temperature (min/max/mean), the CORRECT daily rain total
 *      (via the dayrain accumulator's daily max, NOT a naive sum), wind-gust max
 *      and solar radiation max — plus the current live values (reuses
 *      `resolveKennwerte`, the /api/now logic). Purely arithmetic/DB, no model.
 *   2) `generateOverview` feeds those stats to Claude (same sonnet model + the
 *      same data-grounding prompt style as summary.ts) and asks for 1–3 plain-
 *      German sentences: the current situation + a notable thing from the last
 *      few days.
 *
 * The model receives only computed numbers, so every figure it can cite is
 * already true of the data; the prompt forbids inventing values, forecasting,
 * or advising. Called only by GET /api/overview (force-dynamic, runtime).
 */

/** Same model + family as /api/ask and summary.ts (quality, spec decision 1). */
const MODEL = "claude-sonnet-4-6";

/** Hard cap so a runaway response can't blow past the spec's ≤200-word limit. */
const MAX_TOKENS = 400;

/** How many days back the per-day window covers (spec: "letzten ~5 Tage"). */
const DAYS_BACK = 5;

/** Timezone preamble — windows align to Europe/Berlin local day boundaries. */
const TZ_PREAMBLE =
  'import "timezone"\noption location = timezone.location(name: "Europe/Berlin")\n';

/** Terminal sort — the repo convention for every time-series Flux query. */
const TERMINAL_SORT = '|> sort(columns: ["_time"])';

// ── 1) Stats (computed server-side over the last ~5 days) ───────────────────

/** One day's derived figures. Any field may be null if that metric had no data. */
export interface DayStats {
  /** YYYY-MM-DD in Europe/Berlin local time. */
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  tempMean: number | null;
  /** Correct daily rain total in mm (dayrain accumulator's daily max). */
  rainMm: number | null;
  /** Strongest wind gust of the day (km/h). */
  windGustMax: number | null;
  /** Peak solar radiation of the day (W/m²) — a proxy for how sunny it was. */
  solarMax: number | null;
}

/** The numeric overview handed to Claude. All figures are derived, never guessed. */
export interface OverviewStats {
  /** Per-day rows, chronological (oldest → newest). */
  days: DayStats[];
  /** A small set of current live readings (subset of the Kennwerte). */
  current: { label: string; value: number | null; unit: string }[];
}

/** Round to one decimal (matches the chart/label precision elsewhere). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Map a daily bucket's `_time` to its Europe/Berlin calendar date. The container
 * runs TZ=Europe/Berlin, so `sv-SE` formatting yields the correct `YYYY-MM-DD`
 * local day even though daily buckets are labelled at local midnight in UTC.
 */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

/** Run a TZ-aware daily aggregate for one entity over the last DAYS_BACK days. */
async function dailyAgg(
  bucket: string,
  entityId: string,
  fn: "min" | "max" | "mean",
): Promise<Map<string, number>> {
  const flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: -${DAYS_BACK}d)
  |> filter(fn: (r) => r["entity_id"] == "${entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: 1d, fn: ${fn}, createEmpty: false)
  ${TERMINAL_SORT}`;
  const points = await runFluxPoints(flux);
  const byDay = new Map<string, number>();
  for (const p of points) byDay.set(dayKey(p.t), round1(p.v));
  return byDay;
}

/**
 * Derive the per-day overview stats over the last ~5 days + the current live
 * values. Each metric is one cheap TZ-aware daily aggregate; the daily-rain
 * total uses the dayrain accumulator's daily MAX (each local day's max of the
 * accumulator = that day's total mm — the same correct method /api/now uses for
 * "Regen heute"), never a naive sum of raw rain readings.
 */
export async function computeOverviewStats(): Promise<OverviewStats> {
  const bucket = influxBucket();

  const tempCat = getByKey("outdoor_temperature");
  const rainCat = getByKey("rainfall"); // dayrain_mm accumulator
  const gustCat = getByKey("wind_gust");
  const solarCat = getByKey("solar_radiation");

  // Resolve every series in parallel: temp min/max/mean, daily rain total,
  // gust max, solar max — plus the current live Kennwerte.
  const [
    tempMin,
    tempMax,
    tempMean,
    rainMax,
    gustMax,
    solarMax,
    kennwerte,
  ] = await Promise.all([
    tempCat ? dailyAgg(bucket, tempCat.entityId, "min") : new Map<string, number>(),
    tempCat ? dailyAgg(bucket, tempCat.entityId, "max") : new Map<string, number>(),
    tempCat ? dailyAgg(bucket, tempCat.entityId, "mean") : new Map<string, number>(),
    // dayrain accumulator: daily MAX = that day's total (correct, not a raw sum).
    rainCat ? dailyAgg(bucket, rainCat.entityId, "max") : new Map<string, number>(),
    gustCat ? dailyAgg(bucket, gustCat.entityId, "max") : new Map<string, number>(),
    solarCat ? dailyAgg(bucket, solarCat.entityId, "max") : new Map<string, number>(),
    resolveKennwerte().catch(() => []),
  ]);

  // Union of all observed local days, chronological.
  const allDays = new Set<string>([
    ...tempMin.keys(),
    ...tempMax.keys(),
    ...tempMean.keys(),
    ...rainMax.keys(),
    ...gustMax.keys(),
    ...solarMax.keys(),
  ]);
  const days: DayStats[] = [...allDays]
    .sort()
    .map((date) => ({
      date,
      tempMin: tempMin.get(date) ?? null,
      tempMax: tempMax.get(date) ?? null,
      tempMean: tempMean.get(date) ?? null,
      rainMm: rainMax.get(date) ?? null,
      windGustMax: gustMax.get(date) ?? null,
      solarMax: solarMax.get(date) ?? null,
    }));

  // A focused subset of the current live readings for the situational sentence.
  const wanted = new Set([
    "outdoor_temperature",
    "apparent_temperature",
    "outdoor_humidity",
    "wind_speed",
    "wind_gust",
    "rainfall",
    "pressure",
    "solar_radiation",
  ]);
  const current = kennwerte
    .filter((kv) => wanted.has(kv.key))
    .map((kv) => ({ label: kv.label, value: kv.value, unit: kv.unit }));

  return { days, current };
}

// ── 2) Claude call (stats → prose) ──────────────────────────────────────────

const SYSTEM_PROMPT = `Du beschreibst die aktuelle Wetterlage einer Wetterstation in 1–3 kurzen Sätzen (max. 200 Wörter), auf Deutsch, sachlich und allgemeinverständlich (kein Fachjargon) — für Laien.
(a) Beschreibe knapp die AKTUELLE Wetterlage (aus den aktuellen Werten + den letzten Tagen, z. B. eine heiße/kalte/milde Phase, eine trockene/nasse Phase).
(b) Hebe EINE Besonderheit der letzten Tage hervor (z. B. ein extremer Regentag, ein Sturmtag, der heißeste/kälteste Tag) mit konkreten Werten und Datum im DE-Format (Komma als Dezimaltrennzeichen, Einheit, z. B. „22 mm am 13.10.2020").
(c) Du darfst einordnen (z. B. „ungewöhnlich heiß"), aber NUR gestützt auf die bereitgestellten Zahlen — erfinde nichts, keine Vorhersage, keine Ratschläge.
(d) Wenn nichts Bemerkenswertes vorliegt, beschreibe schlicht die Lage.
Verwende ausschließlich die im JSON bereitgestellten Zahlen und Daten — erfinde KEINE Werte. Gib nur den Fließtext aus — keine Aufzählung, keine Überschrift, keine Anrede. Beispielton: „Gestern hat es extrem stark geregnet, ansonsten milde Temperaturen. Wir befinden uns aktuell in einer sehr heißen Sommerphase."`;

/** German-readable date hint (DD.MM.YYYY) for a YYYY-MM-DD day key. */
function deDate(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Build the user-payload JSON Claude reasons over (German keys, per spec A). */
function buildPayload(stats: OverviewStats): string {
  const payload = {
    aktuell: stats.current.map((c) => ({
      was: c.label,
      wert: c.value,
      einheit: c.unit,
    })),
    letzteTage: stats.days.map((d) => ({
      datum: deDate(d.date),
      tempMin: d.tempMin,
      tempMax: d.tempMax,
      tempMittel: d.tempMean,
      regenMm: d.rainMm,
      windboeMax: d.windGustMax,
      sonneMax: d.solarMax,
    })),
  };
  return JSON.stringify(payload);
}

/**
 * Generate the 1–3-sentence German Wetterlage overview. Returns `undefined`
 * (never throws) when there is no key, no data, or the call fails — the
 * Kennwerte values must always render, so the overview is best-effort and is
 * silently omitted on any hiccup. Whitespace-collapsed to one clean paragraph.
 */
export async function generateOverview(): Promise<string | undefined> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined; // no key → silently skip (values still render)

  let stats: OverviewStats;
  try {
    stats = await computeOverviewStats();
  } catch (error) {
    console.error(
      "[overview] stats computation failed:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }

  // Nothing measured at all → nothing to say.
  const hasDayData = stats.days.some(
    (d) =>
      d.tempMean != null ||
      d.tempMax != null ||
      d.rainMm != null ||
      d.windGustMax != null,
  );
  const hasCurrent = stats.current.some((c) => c.value != null);
  if (!hasDayData && !hasCurrent) return undefined;

  const userPayload = buildPayload(stats);

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPayload }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 0 ? text : undefined;
  } catch (error) {
    console.error(
      "[overview] generation failed:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}
