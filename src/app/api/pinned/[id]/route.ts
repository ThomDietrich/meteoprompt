import { NextResponse } from "next/server";

import { removePinned } from "@/lib/pinned";

// Unpin a card (remove from the global set). force-dynamic — writes at runtime.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Bad request", detail: "Missing pin id." },
      { status: 400 },
    );
  }

  try {
    const cards = await removePinned(id);
    return NextResponse.json(
      { cards },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/pinned/:id] delete failed:", message);
    return NextResponse.json({ error: "store_error", detail: message }, { status: 500 });
  }
}
