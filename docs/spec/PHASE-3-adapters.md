# Phase 3: Adapters

## 3.1 Objective

Ship five thin, well-tested integrations as package subpaths. Each one is a small wrapper over `encode` and `decode`. None adds behavior that the core does not already guarantee.

| Subpath | Integrates with | Runs in |
|---|---|---|
| `temporal-clone/messaging` | `Worker`, `MessagePort`, `BroadcastChannel`, `Window`, worker globals, Node `worker_threads` | browsers, Node |
| `temporal-clone/comlink` | Comlink 4.4 | browsers, Node |
| `temporal-clone/piscina` | piscina 5 | Node |
| `temporal-clone/dexie` | Dexie 4 (DBCore middleware) | browsers (Node with `fake-indexeddb` for tests) |
| `temporal-clone/idb` | idb 8 | browsers (Node with `fake-indexeddb` for tests) |

## 3.2 Preconditions

Phase 2 approved.

## 3.3 Scope

In scope: `src/messaging/`, `src/comlink/`, `src/piscina/`, `src/dexie/`, `src/idb/`, their tests (Vitest and Playwright), the dev dependencies `comlink` 4.4.x, `piscina` 5.x, `dexie` 4.x, `idb` 8.x and `fake-indexeddb` 6.x, and a second origin for the browser test server.

Out of scope: package `exports` and publishing (Phase 4), any change to core behavior or encoder output, and any other integration (see `00-OVERVIEW.md` section 4).

## 3.4 Rules for every adapter

- R3.1 An adapter imports only from the core's public API (`../index.js`), never from core internals.
- R3.2 An adapter MUST NOT import its peer library at runtime, with one exception: piscina (R3.20). Comlink is passed in by the caller (dependency injection). Dexie and idb are type-only imports (`import type`).
- R3.3 Storage adapters (Dexie, idb) MUST NOT pass a passthrough predicate to `encode` (`01-FORMAT.md` section 10).
- R3.4 Messaging-style adapters (messaging, Comlink, piscina) default to `nativePassthrough: true`, meaning they use `nativePassthrough(globalThis.Temporal)`, which is `undefined` on every engine today. An option allows `false`.
- R3.5 Every adapter accepts `Temporal?: TemporalNamespace` (forwarded to `decode`).
- R3.6 Adapters never swallow errors. Platform errors propagate unchanged. Decode errors propagate as `TemporalCloneError`, or go to an explicit error callback where the API defines one.
- R3.7 Each adapter's public surface is exactly what this file specifies. The one exception is `PostMessageRest`, which is defined by its type tests (section 3.5). Add a runtime export-set test per subpath.
- R3.8 Adapter source MAY use DOM lib types. Each adapter compiles under its own tsconfig with the minimal libs it needs. The core stays ES2022-only.

## 3.5 `temporal-clone/messaging`

```ts
export interface EventTargetMessagingTarget {
  postMessage(message: unknown, ...rest: never[]): void; // see PostMessageRest
  addEventListener(type: 'message' | 'messageerror', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message' | 'messageerror', listener: (event: MessageEvent) => void): void;
  start?(): void;
}
export interface EmitterMessagingTarget {           // Node worker_threads Worker
  postMessage(message: unknown, ...rest: never[]): void;
  on(event: 'message' | 'messageerror', listener: (value: unknown) => void): unknown;
  off(event: 'message' | 'messageerror', listener: (value: unknown) => void): unknown;
}
export type MessagingTarget = EventTargetMessagingTarget | EmitterMessagingTarget;
/** NON-NORMATIVE shape. The naive `T extends { postMessage(m: unknown, ...r: infer R): unknown } ? R : never`
 *  is WRONG: `infer` picks only the last overload (verified with tsc 6.0.3: Worker yields only
 *  `[options?]`, Window yields only `[options?]`). You define an overload-aware type. The contract is
 *  the type tests below, not this sketch. */
export type PostMessageRest<T> = /* overload-aware; yours to define */;

export interface TemporalPortOptions {
  readonly Temporal?: TemporalNamespace;
  readonly nativePassthrough?: boolean;   // default true (R3.4)
  readonly validate?: boolean;            // default false: assertCloneable(encoded) before posting
}
export interface OnMessageOptions {
  readonly signal?: AbortSignal;
  readonly allowedOrigins?: readonly string[] | '*';          // REQUIRED for Window targets
  readonly onDecodeError?: (error: TemporalCloneError, raw: unknown) => void;
  readonly onMessageError?: (eventOrValue: unknown) => void;
  readonly onRejectedOrigin?: (event: MessageEvent) => void;
}
export interface TemporalPort<T extends MessagingTarget> {
  readonly target: T;
  postMessage(message: unknown, ...rest: PostMessageRest<T>): void;
  onMessage(handler: (data: unknown, event: MessageEvent | undefined) => void, options?: OnMessageOptions): () => void;
}
export function temporalPort<T extends MessagingTarget>(target: T, options?: TemporalPortOptions): TemporalPort<T>;
```

The exact TypeScript encoding of `postMessage` overloads is yours to get right. It is the one place in this file where the signature is defined by tests rather than by a declaration. Type tests MUST prove that all of these compile:

- `temporalPort(worker).postMessage(msg)`, `.postMessage(msg, [buffer])`, `.postMessage(msg, { transfer: [buffer] })` (DOM `Worker`)
- `temporalPort(window).postMessage(msg, 'https://a.example')`, `.postMessage(msg, 'https://a.example', [buffer])`, `.postMessage(msg, { targetOrigin: 'https://a.example' })`
- `temporalPort(port).postMessage(msg, [buffer])` (DOM `MessagePort`), `temporalPort(channel).postMessage(msg)` (`BroadcastChannel`)
- Node: `temporalPort(nodeWorker).postMessage(msg, [buffer])` and `temporalPort(nodePort).postMessage(msg, [buffer])` (`worker_threads`)

And that `temporalPort(worker).postMessage(msg, 42)` and `temporalPort(window).postMessage(msg, [buffer])` do not compile.

- R3.9 `postMessage`: if `validate` is `true`, first run `assertCloneable(message, { assumeEncoded: true })` on the original message (Phase 2, R2.4a), so the result does not depend on whether the message happens to contain Temporal values. Then encode the message (with passthrough per R3.4) and call `target.postMessage(encoded, ...rest)` with `rest` unchanged.
- R3.10 Listener selection: if the target has `addEventListener`, use it, pass `event.data` to decode, and call `target.start?.()` after adding (a web `MessagePort` does not deliver otherwise). Otherwise, if it has `on`/`off`, use them and pass the value directly (`event` is `undefined`). Otherwise throw `TypeError`.
- R3.11 Window targets are detected by `target.window === target`. For them, `onMessage` without `allowedOrigins` throws `TemporalCloneError` `E_ORIGIN_REQUIRED` synchronously. With a list, events whose `event.origin` is not an exact match are dropped and passed to `onRejectedOrigin` if provided. `'*'` MUST be passed explicitly to accept every origin.
- R3.12 If `decode` throws: call `onDecodeError` if provided; otherwise rethrow asynchronously with `queueMicrotask(() => { throw error; })`, so it surfaces as an uncaught error and is never silently dropped.
- R3.13 The returned unsubscribe function is idempotent. It removes both the `message` and the `messageerror` listeners. An aborted `signal` unsubscribes, and an already-aborted signal means the listener is never added.
- R3.14 Exceptions thrown by `handler` are not caught.

## 3.6 `temporal-clone/comlink`

```ts
export interface ComlinkLike {
  readonly transferHandlers: Map<string, {
    canHandle(value: unknown): boolean;
    serialize(value: never): [unknown, Transferable[]];
    deserialize(value: never): unknown;
  }>;
}
export interface ComlinkHandlerOptions {
  readonly Temporal?: TemporalNamespace;
  readonly name?: string;               // default 'temporal-clone'
  readonly nativePassthrough?: boolean; // default true
}
export function registerComlinkHandler(comlink: ComlinkLike, options?: ComlinkHandlerOptions): () => void;
export function withTransfer<T extends object>(value: T, transfer: readonly Transferable[]): T;
```

Facts about Comlink 4.4.2 (verified in its source, `dist/esm/comlink.mjs`; re-verify against the installed version):

- `toWireValue` checks transfer handlers only against each top-level argument and the return value, in `Map` insertion order. The built-in `proxy` and `throw` handlers come first. Nested values are never offered to handlers.
- `Comlink.transfer(obj, list)` stores the list in a private `WeakMap` that is only consulted on the RAW path. A value taken by a custom handler loses that list.

Requirements:

- R3.15 `canHandle(value)` is exactly: if `value` is not an object, return `false`; otherwise compute `encoded = encode(value, …)`, and if `encoded !== value`, store it in a module-private `WeakMap` keyed by `value` and return `true`; else return `false`. The fast path (`01-FORMAT.md` 6.7) makes this cheap for values that need nothing. Values that need no encoding take Comlink's RAW path unchanged, so `Comlink.transfer` keeps working for them.
- R3.16 `serialize(value)` returns `[encoded, transferListFor(value)]`. `encoded` is taken from the `canHandle` cache and deleted from it (fall back to `encode(value)` if absent). `transferListFor` reads a second module-private `WeakMap` populated by `withTransfer`.
- R3.17 `deserialize(value)` returns `decode(value, { Temporal })`.
- R3.18 `registerComlinkHandler` throws `TypeError` if `name` is already registered to a different handler. It returns an unregister function that removes only its own handler.
- R3.19 Both realms MUST register. Tests prove that a Temporal value in an argument and in a return value round-trips, that nested values work, that `withTransfer` detaches the buffer on the sender, and that values without Temporal still honor `Comlink.transfer`. Document the limitations: thrown values and `Comlink.proxy` values are not handled.

## 3.7 `temporal-clone/piscina` (Node only)

```ts
export interface PiscinaLike { run(task: unknown, options?: object): Promise<unknown> }
export interface RunTaskOptions {
  readonly Temporal?: TemporalNamespace;
  readonly nativePassthrough?: boolean; // default true
  readonly runOptions?: object;         // forwarded to pool.run unchanged (transferList, name, signal, filename)
}
export function runTask<R = unknown>(pool: PiscinaLike, task: unknown, options?: RunTaskOptions): Promise<R>;
export function temporalTask<A, R>(
  fn: (task: A) => R | Promise<R>,
  options?: { readonly Temporal?: TemporalNamespace; readonly nativePassthrough?: boolean },
): (task: unknown) => Promise<unknown>;
```

- R3.20 `temporalTask` imports `transferableSymbol` and `valueSymbol` from `piscina` at runtime (the only runtime peer import in this package). If `fn` returns a piscina movable (an object that has both symbols), it is returned untouched. Otherwise the result is encoded.
- R3.21 `runTask` is exactly `decode(await pool.run(encode(task, …), runOptions), { Temporal })`.
- R3.22 Tests use a real `Piscina` pool with a worker file whose default export is `temporalTask(fn)`: Temporal arguments and results round-trip; `transferList` in `runOptions` still detaches; a movable result passes through; a worker exception rejects `runTask` with the worker's error, not a `TemporalCloneError`.

Informative, for the owner: piscina's worker loop (`dist/worker.js`, `atomicsWaitLoop`) coordinates tasks with `Atomics.wait` on request and response counters in a `SharedArrayBuffer`. It is worth reading.

## 3.8 `temporal-clone/dexie`

```ts
import type { Middleware, DBCore } from 'dexie';
export interface DexieTemporalOptions { readonly Temporal?: TemporalNamespace }
export function temporalMiddleware(options?: DexieTemporalOptions): Middleware<DBCore>;
// usage: db.use(temporalMiddleware({ Temporal }));
```

Facts about Dexie 4.4.6 (verified in `dist/dexie.mjs`; re-verify against the installed version): built-in DBCore middlewares have levels `cache` 0, `observability` 0, `VirtualIndexMiddleware` 1, `HooksMiddleware` 2, and one internal at -1. `DBCorePutRequest` can carry `values`, or `changeSpec`, or `updates.changeSpecs`.

- R3.23 `name: 'temporal-clone'`. The `level` MUST be strictly between the installed `VirtualIndexMiddleware` level and `HooksMiddleware` level (1.5 for 4.4.6). This way legacy `creating`/`reading` hooks see real Temporal values, and virtual indexes and the cache see encoded values. Prove the ordering with a behavioral test: a `reading` hook receives a Temporal value, and a compound virtual index on `[due.v+id]` works.
- R3.24 Writes: `add` and `put` encode every element of `values`; for `put` with `changeSpec`, and with `updates.changeSpecs`, encode every value of every change spec. `delete` and `deleteRange` pass through. Responses (keys) pass through.
- R3.25 Reads: `get` decodes the result; `getMany` decodes each result; `query` decodes `result` when `req.values` is not `false`; `openCursor` returns a cursor wrapper whose `value` getter decodes the current raw value, memoized per raw value object (a `WeakMap`), so repeated reads return the same object. Model the wrapper on how Dexie's own middlewares wrap cursors: read the installed source and cite the function in a comment.
- R3.26 Tests (Vitest with `fake-indexeddb`, and Playwright in three browsers with real IndexedDB): `add`/`put`/`bulkPut`/`update`/`modify` round-trip Temporal values; `where('due.v').between(indexKey(a), indexKey(b), true, true)` returns exactly the chronologically correct records (use values whose naive `toString` order would be wrong, as in H-11); `liveQuery` emits decoded values; a primary key path `id` and an inbound auto-increment key still get assigned to the caller's object.

## 3.9 `temporal-clone/idb`

```ts
import type { IDBPDatabase } from 'idb';
export interface IdbTemporalOptions { readonly Temporal?: TemporalNamespace }
// Use IDBPDatabase<unknown> as the constraint. If a typed IDBPDatabase<MySchema> is then not
// assignable (type test), you MAY use `any` in this one constraint, with a DECISIONS entry.
export interface TemporalIDB<DB extends IDBPDatabase<unknown>> {
  readonly db: DB;
  get(...args: Parameters<DB['get']>): Promise<unknown>;
  getAll(...args: Parameters<DB['getAll']>): Promise<unknown[]>;
  getFromIndex(...args: Parameters<DB['getFromIndex']>): Promise<unknown>;
  getAllFromIndex(...args: Parameters<DB['getAllFromIndex']>): Promise<unknown[]>;
  put(...args: Parameters<DB['put']>): ReturnType<DB['put']>;
  add(...args: Parameters<DB['add']>): ReturnType<DB['add']>;
}
export function temporalDB<DB extends IDBPDatabase<unknown>>(db: DB, options?: IdbTemporalOptions): TemporalIDB<DB>;
```

- R3.27 `put` and `add` encode argument 1 (the value) and pass every other argument unchanged. Reads decode their results.
- R3.28 Only these shortcut methods are wrapped. Transactions, stores and cursors are used through `db` with explicit `encode`/`decode`. `docs/RECIPES.md` (Phase 4) shows how. Do not proxy idb's internals.
- R3.29 Tests (Vitest + `fake-indexeddb`, Playwright in three browsers): round trip through every wrapped method; `getAllFromIndex(store, 'due', IDBKeyRange.bound(indexKey(a), indexKey(b)))` on an index with key path `due.v` returns chronologically correct results.

## 3.10 Browser end-to-end tests (Playwright, chromium, firefox, webkit)

- R3.30 `e2e/` contains, at minimum: messaging with a module `Worker`, a `MessageChannel`, a `BroadcastChannel`, and `window.postMessage` to a cross-origin iframe. `scripts/serve.mjs` serves a second origin (`localhost` vs `127.0.0.1` on a second port). The test proves an allowed origin is decoded and a disallowed origin is rejected via `onRejectedOrigin`. Plus Comlink with a worker, Dexie with a range query, and idb with a range query.
- R3.31 Every e2e test runs against at least S2 and S4 on the page side. On chromium and firefox it also runs against S1.
- R3.32 Transfer-list test: an `ArrayBuffer` inside a message that also contains Temporal values is transferred (sender `byteLength === 0`, receiver has the bytes).

## 3.11 Deliverables

`src/{messaging,comlink,piscina,dexie,idb}/index.ts` plus tests, `e2e/**`, updated `scripts/serve.mjs` (second origin, with a test), updated `playwright.config.ts`, per-adapter tsconfigs, updated `ci.yml`, `docs/phase-reports/PHASE-3.md`.

## 3.12 Exit criteria

| ID | Criterion |
|---|---|
| X3.1 | All commands green on Node 22, 24, 26 and in three browsers. |
| X3.2 | Every requirement R3.1 to R3.32 maps to at least one named test. The report contains the mapping table (requirement to test names). |
| X3.3 | Runtime export-set tests pass for every subpath. |
| X3.4 | `grep` proves R3.2: the only runtime import of a peer library in `src/` is `piscina` in `src/piscina/`. Paste the command and output. |
| X3.5 | Core coverage gates still hold. Adapters: at least 95% lines and branches each. |
| X3.6 | `test/vectors/v1.json` unchanged since Phase 1 (same command as X2.7). |

## 3.13 Stop conditions

- An adapter needs core internals or a new core export.
- A third-party fact stated in this file does not match the installed version (for example, Dexie middleware levels or Comlink handler semantics).
- A browser behaves differently from the others in a way the tests cannot express without per-browser branches.
