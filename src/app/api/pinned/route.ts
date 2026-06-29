import { NextResponse } from "next/server";

import {
  addPinned,
  isValidLayoutUpdates,
  isValidPinnedCard,
  listPinned,
  updatePinnedLayouts,
} from "@/lib/pinned";

// Global pinned cards (spec-05 §7). Reads/writes data/pinned.json at runtime —
// force-dynamic so `next build` needs neither the file nor a DB.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET — list all global pinned cards. */
export async function GET() {
  try {
    const cards = await listPinned();
    return NextResponse.json(
      { cards },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/pinned] list failed:", message);
    return NextResponse.json({ error: "store_error", detail: message }, { status: 500 });
  }
}

/** POST — pin a card (add to the global set). Body: a PinnedCard. */
export async function POST(request: Request) {
  let card;
  try {
    card = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad request", detail: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!isValidPinnedCard(card)) {
    return NextResponse.json(
      { error: "Bad request", detail: "Body must be a valid pinned card { id, spec, originQuery, layout }." },
      { status: 400 },
    );
  }

  try {
    const cards = await addPinned(card);
    return NextResponse.json(
      { cards },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/pinned] add failed:", message);
    return NextResponse.json({ error: "store_error", detail: message }, { status: 500 });
  }
}

/** PUT — persist drag/resize layout edits (spec-08). Body: { layouts: [...] }. */
export async function PUT(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad request", detail: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const layouts = (body as { layouts?: unknown })?.layouts;
  if (!isValidLayoutUpdates(layouts)) {
    return NextResponse.json(
      { error: "Bad request", detail: "Body must be { layouts: [{ id, layout:{x,y,w,h} }] }." },
      { status: 400 },
    );
  }

  try {
    const cards = await updatePinnedLayouts(layouts);
    return NextResponse.json(
      { cards },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/pinned] layout update failed:", message);
    return NextResponse.json({ error: "store_error", detail: message }, { status: 500 });
  }
}
