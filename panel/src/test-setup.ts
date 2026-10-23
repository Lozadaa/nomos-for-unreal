import '@testing-library/jest-dom/vitest'

// jsdom no trae estas APIs y cmdk / Radix las usan
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
Element.prototype.scrollIntoView ??= () => {}
