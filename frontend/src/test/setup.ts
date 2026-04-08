import "@testing-library/jest-dom";

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-url";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
