// Imported first by every entry, so it is evaluated before any polyfill module (R0.10).
export const native: unknown = Reflect.get(globalThis, 'Temporal');
