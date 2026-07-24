import "@testing-library/jest-dom";

// jsdom lacks ResizeObserver; the conversation timeline constructs one to
// re-anchor scroll on late content growth (feedback round 5). Every real
// target engine (Chromium/Firefox/Android WebView) provides it — this no-op
// stub only fills the jsdom gap so component tests can mount the route.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}
