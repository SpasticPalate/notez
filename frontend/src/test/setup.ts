import '@testing-library/jest-dom';

/**
 * jsdom 28 changed localStorage/sessionStorage to return empty stub objects
 * by default (they require a --localstorage-file for persistence).
 * We install a proper in-memory localStorage mock so tests can use
 * localStorage.setItem / getItem / clear / removeItem as expected.
 */
function makeStorage(): Storage {
  let store: Record<string, string> = {};

  return {
    get length() {
      return Object.keys(store).length;
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null;
    },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      store = {};
    },
  };
}

const localStorageMock = makeStorage();
const sessionStorageMock = makeStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
});
