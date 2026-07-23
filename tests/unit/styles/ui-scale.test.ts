import { describe, test, expect, beforeEach } from "vitest";
import {
  UI_SCALE_STEPS,
  UI_SCALE_KEY,
  defaultUiScale,
  normalizeUiScale,
  readStoredUiScale,
  applyUiScale,
  setUiScale,
  getUiZoom,
} from "@/styles/ui-scale";

describe("ui-scale", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.style.zoom = "";
  });

  test("exposes exactly the four approved steps", () => {
    expect([...UI_SCALE_STEPS]).toEqual([90, 100, 115, 130]);
  });

  test("defaultUiScale: 115 on the Android shell, 100 elsewhere", () => {
    expect(defaultUiScale(true)).toBe(115);
    expect(defaultUiScale(false)).toBe(100);
  });

  test("normalizeUiScale accepts stored step values", () => {
    expect(normalizeUiScale("90", false)).toBe(90);
    expect(normalizeUiScale("130", true)).toBe(130);
  });

  test("normalizeUiScale rejects junk → platform default", () => {
    expect(normalizeUiScale(null, false)).toBe(100);
    expect(normalizeUiScale(null, true)).toBe(115);
    expect(normalizeUiScale("125", false)).toBe(100); // off-scale number
    expect(normalizeUiScale("garbage", true)).toBe(115);
    expect(normalizeUiScale("", false)).toBe(100);
  });

  test("readStoredUiScale reads the arcan-ui-scale key", () => {
    window.localStorage.setItem(UI_SCALE_KEY, "130");
    expect(readStoredUiScale(false)).toBe(130);
    window.localStorage.removeItem(UI_SCALE_KEY);
    expect(readStoredUiScale(true)).toBe(115);
  });

  test("applyUiScale sets html zoom; 100% clears it", () => {
    applyUiScale(130);
    expect(document.documentElement.style.zoom).toBe("1.3");
    applyUiScale(100);
    expect(document.documentElement.style.zoom).toBe("");
  });

  test("setUiScale persists AND applies", () => {
    setUiScale(115);
    expect(window.localStorage.getItem(UI_SCALE_KEY)).toBe("115");
    expect(document.documentElement.style.zoom).toBe("1.15");
  });

  test("getUiZoom mirrors the applied factor (1 when unscaled)", () => {
    expect(getUiZoom()).toBe(1);
    applyUiScale(130);
    expect(getUiZoom()).toBe(1.3);
    applyUiScale(100);
    expect(getUiZoom()).toBe(1);
  });
});
