import { NextResponse } from "next/server";

/**
 * Shared 500 response for the pinned-store routes. Logs `scope` (the per-call
 * prefix, e.g. "[api/pinned] add failed:") with the error message and returns
 * the byte-identical `{ error: "store_error", detail }` JSON at status 500.
 */
export function storeError(scope: string, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(scope, message);
  return NextResponse.json(
    { error: "store_error", detail: message },
    { status: 500 },
  );
}
