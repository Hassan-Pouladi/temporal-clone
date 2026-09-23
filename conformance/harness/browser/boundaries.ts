// Browser boundaries B1 to B7 (R0.12).

import { observed, receivedIfOurs, receivedSync, type Boundary } from '../../cell.js';
import type { BoundaryId } from '../../types.js';
import { readWorkerReply } from '../../worker-protocol.js';

let counter = 0;
function uniqueName(prefix: string): string {
  counter += 1;
  return `temporal-clone-${prefix}-${String(Date.now())}-${String(counter)}`;
}

function messageErrorEvent(event: Event): { name: string; message: string } {
  return { name: 'messageerror', message: `${event.type} event` };
}

/** B1: `structuredClone(message)`. */
const structuredCloneBoundary: Boundary = (message, context) => {
  let copy: unknown;
  try {
    copy = structuredClone(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
    return;
  }
  context.settle(receivedSync(copy, message.expected));
};

/** B2: `MessageChannel`, `port1.postMessage` to `port2`. */
const messageChannelBoundary: Boundary = (message, context) => {
  const { port1, port2 } = new MessageChannel();
  context.onCleanup(() => {
    port1.close();
    port2.close();
  });
  port2.onmessage = (event: MessageEvent) => {
    const result = receivedIfOurs(event.data, message.expected);
    if (result !== undefined) context.settle(result);
  };
  port2.onmessageerror = (event: MessageEvent) => {
    context.settle(observed({ kind: 'async-error', error: messageErrorEvent(event) }));
  };
  try {
    port1.postMessage(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

/** B3: module `Worker` that loads no Temporal implementation and classifies. */
const workerBoundary: Boundary = (message, context) => {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  context.onCleanup(() => {
    worker.terminate();
  });
  worker.onmessage = (event: MessageEvent) => {
    try {
      const result = readWorkerReply(event.data, message.expected);
      if (result !== undefined) context.settle(result);
    } catch (error) {
      context.settle(observed({ kind: 'harness-error', error }));
    }
  };
  worker.onmessageerror = (event: MessageEvent) => {
    context.settle(observed({ kind: 'harness-error', error: messageErrorEvent(event) }));
  };
  worker.onerror = (event: ErrorEvent) => {
    context.settle(
      observed({ kind: 'harness-error', error: { name: 'ErrorEvent', message: event.message } }),
    );
  };
  try {
    worker.postMessage(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

/** B4: two `BroadcastChannel` instances with the same unique name in the same realm. */
const broadcastChannelBoundary: Boundary = (message, context) => {
  const name = uniqueName('b4');
  const sender = new BroadcastChannel(name);
  const receiver = new BroadcastChannel(name);
  context.onCleanup(() => {
    sender.close();
    receiver.close();
  });
  receiver.onmessage = (event: MessageEvent) => {
    const result = receivedIfOurs(event.data, message.expected);
    if (result !== undefined) context.settle(result);
  };
  receiver.onmessageerror = (event: MessageEvent) => {
    context.settle(observed({ kind: 'async-error', error: messageErrorEvent(event) }));
  };
  try {
    sender.postMessage(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

/** B5: `window.postMessage(message, '*')` to self. */
const windowPostMessageBoundary: Boundary = (message, context) => {
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    const result = receivedIfOurs(event.data, message.expected);
    if (result !== undefined) context.settle(result);
  };
  const onMessageError = (event: MessageEvent): void => {
    context.settle(observed({ kind: 'async-error', error: messageErrorEvent(event) }));
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('messageerror', onMessageError);
  context.onCleanup(() => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('messageerror', onMessageError);
  });
  try {
    window.postMessage(message, '*');
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

const STORE = 'cells';

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`could not open ${name}`));
    };
  });
}

/**
 * `blocked` is not a failure: `db.close()` only takes effect once the connection's last
 * transaction finishes, and the delete then proceeds to `success`. runCell bounds the wait.
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`could not delete ${name}`));
    };
  });
}

class IndexedDbError extends Error {
  constructor(readonly original: unknown) {
    super('IndexedDB error');
  }
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(new IndexedDbError(transaction.error));
    };
    transaction.onabort = () => {
      reject(new IndexedDbError(transaction.error));
    };
  });
}

function requestDone(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const result: unknown = request.result;
      resolve(result);
    };
    request.onerror = () => {
      reject(new IndexedDbError(request.error));
    };
  });
}

/** B6: IndexedDB, fresh database, `put` then `get` in separate transactions, then deleted. */
const indexedDbBoundary: Boundary = async (message, context) => {
  const name = uniqueName('b6');
  context.onCleanup(() => deleteDatabase(name));
  const db = await openDatabase(name);
  context.onCleanup(() => {
    db.close();
  });

  const write = db.transaction(STORE, 'readwrite');
  const written = transactionDone(write);
  try {
    write.objectStore(STORE).put(message, 1);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
    // The empty transaction still commits; wait for it so cleanup finds the database idle.
    await written.catch(() => undefined);
    return;
  }
  try {
    await written;
    const read = db.transaction(STORE, 'readonly');
    const data = await requestDone(read.objectStore(STORE).get(1));
    context.settle(receivedSync(data, message.expected));
  } catch (error) {
    if (!(error instanceof IndexedDbError)) throw error;
    context.settle(observed({ kind: 'async-error', error: error.original }));
  }
};

/** B7: `history.replaceState(message, '')`, then read `history.state`. */
const historyBoundary: Boundary = (message, context) => {
  const original: unknown = history.state;
  context.onCleanup(() => {
    history.replaceState(original, '');
  });
  try {
    history.replaceState(message, '');
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
    return;
  }
  const state: unknown = history.state;
  context.settle(receivedSync(state, message.expected));
};

export const BROWSER_BOUNDARY_IMPLEMENTATIONS: readonly (readonly [BoundaryId, Boundary])[] = [
  ['B1', structuredCloneBoundary],
  ['B2', messageChannelBoundary],
  ['B3', workerBoundary],
  ['B4', broadcastChannelBoundary],
  ['B5', windowPostMessageBoundary],
  ['B6', indexedDbBoundary],
  ['B7', historyBoundary],
];
