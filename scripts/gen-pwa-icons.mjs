// Dev-only one-off (spec-14): render the square brand icon (src/app/icon.svg)
// into the PNG sizes a PWA needs, written to public/. Composites the SVG over an
// OPAQUE brand-blue square so the icon's transparent rounded corners never show
// as black on iOS and the maskable variant keeps a safe zone. `sharp` already
// lives in node_modules (Next bundles it), so this adds NO dependency. Run in
// Docker:
//
//   docker compose run --rm web node scripts/gen-pwa-icons.mjs
//
// The generated PNGs are committed; this script is not part of the build.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#1f5ba8"; // Wappen blue — matches the icon.svg background
const svg = await readFile(new URL("../src/app/icon.svg", import.meta.url));

/**
 * Write a square PNG icon of `size` px: the SVG scaled to `inset` of the canvas,
 * centred over an opaque brand-blue background. `inset = 1` → full-bleed (any);
 * `inset < 1` → padded (maskable safe zone).
 */
async function icon(size, inset, out) {
  const inner = Math.round(size * inset);
  const density = Math.ceil((72 * inner) / 32); // 32 = icon.svg viewBox → crisp raster
  const glyph = await sharp(svg, { density })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: BRAND } })
    .composite([{ input: glyph, gravity: "centre" }])
    .png()
    .toBuffer();
  await writeFile(new URL(`../public/${out}`, import.meta.url), png);
  console.log(`wrote public/${out} (${size}x${size}, inset ${inset})`);
}

await icon(192, 1, "icon-192.png");
await icon(512, 1, "icon-512.png");
await icon(180, 1, "apple-icon-180.png");
await icon(512, 0.78, "icon-maskable-512.png"); // Android maskable safe zone
console.log("done");
