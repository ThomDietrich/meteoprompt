import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Tiny server-side file store under `data/` (spec-05 §8). The app's first
 * server-side writes — pinned cards (JSON) and the failed-query log (JSONL).
 *
 * - Creates the data directory on demand.
 * - Tolerant of missing/empty/corrupt files (returns the fallback).
 * - JSON writes are atomic (temp file + rename) so a concurrent reader never
 *   sees a half-written file.
 * - No secrets are ever written here.
 *
 * The directory is gitignored and not needed at build time; routes that use it
 * are force-dynamic.
 */

/** Absolute path to the data directory (resolve once). */
const DATA_DIR = path.join(process.cwd(), "data");

/** Resolve a filename inside the data dir (no path traversal). */
function dataPath(filename: string): string {
  const base = path.basename(filename); // strip any directory components
  return path.join(DATA_DIR, base);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** Read + parse a JSON file. Returns `fallback` if missing/empty/corrupt. */
export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(dataPath(filename), "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Missing file (ENOENT) or parse error → fallback.
    return fallback;
  }
}

/** Atomically write a value as pretty JSON (temp file + rename). */
export async function writeJson(filename: string, value: unknown): Promise<void> {
  await ensureDir();
  const target = dataPath(filename);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/** Append one JSON object as a line to a JSONL file (append-only log). */
export async function appendJsonl(
  filename: string,
  record: unknown,
): Promise<void> {
  await ensureDir();
  await fs.appendFile(dataPath(filename), JSON.stringify(record) + "\n", "utf8");
}
