import { describe, test, expect, beforeEach, vi } from "vitest";
import { InMemoryRateLimiter } from "../src/rate-limiter.js";

describe("InMemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("allows up to `max` requests within the window", () => {
    const limiter = new InMemoryRateLimiter({ max: 3, windowSeconds: 60 });
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
  });

  test("resets after the window elapses", () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(limiter.consume("user-1")).toBe(true);
  });

  test("keys are isolated per-user", () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-2")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
  });
});
