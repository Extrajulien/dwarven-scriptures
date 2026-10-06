// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

// jsdom only exposes `requestAnimationFrame` when `pretendToBeVisual` is set,
// but the sprite animation (AnimatedSpriteTile) relies on it. Provide a
// minimal timer-based shim so component tests can render the app.
if (typeof global.requestAnimationFrame !== 'function') {
  global.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(Date.now()), 0);
  global.cancelAnimationFrame = (handle) => clearTimeout(handle);
}
