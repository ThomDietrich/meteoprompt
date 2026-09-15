import { describe, expect, it } from "vitest";

import { createBreaker } from "@/lib/breaker";

/**
 * spec-17 D: during a backend outage ~22 cards fired on every reload. The breaker
 * stops that after a few consecutive failures.
 */
describe("createBreaker", () => {
  it("stays closed below the threshold", () => {
    const b = createBreaker({ threshold: 3, cooldownMs: 1000, now: () => 0 });
    b.recordFailure();
    b.recordFailure();
    expect(b.failures()).toBe(2);
    expect(b.isOpen()).toBe(false);
  });

  it("opens at the threshold", () => {
    const b = createBreaker({ threshold: 3, cooldownMs: 1000, now: () => 0 });
    b.recordFailure();
    b.recordFailure();
    b.recordFailure();
    expect(b.isOpen()).toBe(true);
  });

  it("closes again after the cooldown", () => {
    let t = 0;
    const b = createBreaker({ threshold: 2, cooldownMs: 1000, now: () => t });
    b.recordFailure();
    b.recordFailure();
    expect(b.isOpen()).toBe(true);
    t = 999;
    expect(b.isOpen()).toBe(true);
    t = 1000;
    expect(b.isOpen()).toBe(false);
  });

  it("a success resets the count and closes it immediately", () => {
    const b = createBreaker({ threshold: 2, cooldownMs: 10_000, now: () => 0 });
    b.recordFailure();
    b.recordFailure();
    expect(b.isOpen()).toBe(true);
    b.recordSuccess();
    expect(b.failures()).toBe(0);
    expect(b.isOpen()).toBe(false);
  });
});
