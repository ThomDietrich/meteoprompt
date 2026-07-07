import { describe, expect, it } from "vitest";

import { degreesToCompass, getByKey } from "@/lib/catalog";

describe("degreesToCompass", () => {
  it("maps the cardinal/ordinal degrees to German abbreviations", () => {
    expect(degreesToCompass(0)).toBe("N");
    expect(degreesToCompass(45)).toBe("NO");
    expect(degreesToCompass(90)).toBe("O");
    expect(degreesToCompass(180)).toBe("S");
    expect(degreesToCompass(270)).toBe("W");
  });

  it("normalises out-of-range and wrap-around degrees", () => {
    expect(degreesToCompass(350)).toBe("N"); // 350 rounds up into the N sector
    expect(degreesToCompass(-90)).toBe("W"); // -90 → 270
    expect(degreesToCompass(360)).toBe("N"); // 360 → 0
  });
});

describe("getByKey", () => {
  it("resolves a catalog key to its station entityId", () => {
    expect(getByKey("outdoor_temperature")?.entityId).toBe(
      "garten_ventus_w830_aussentemperatur",
    );
  });

  it("returns undefined for an unknown key", () => {
    expect(getByKey("nope")).toBeUndefined();
  });
});
