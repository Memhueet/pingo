import "vitest";

// uPlot uses matchMedia at module load time; jsdom doesn't provide it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver is not provided by jsdom
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: class ResizeObserver {
    constructor(_callback: () => void) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
