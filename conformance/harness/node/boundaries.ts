// Node boundaries B1 to B4 and B8 (R0.12).

import { deserialize, serialize } from 'node:v8';
import { BroadcastChannel, MessageChannel, Worker } from 'node:worker_threads';

import { observed, receivedIfOurs, receivedSync, type Boundary } from '../../cell.js';
import type { BoundaryId } from '../../types.js';
import { readWorkerReply } from '../../worker-protocol.js';

let channelCounter = 0;

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

/** B2: `worker_threads` `MessageChannel`, `port1.postMessage` to `port2`. */
const messageChannelBoundary: Boundary = (message, context) => {
  const { port1, port2 } = new MessageChannel();
  context.onCleanup(() => {
    port1.close();
    port2.close();
  });
  port2.on('message', (data: unknown) => {
    const result = receivedIfOurs(data, message.expected);
    if (result !== undefined) context.settle(result);
  });
  port2.on('messageerror', (error: Error) => {
    context.settle(observed({ kind: 'async-error', error }));
  });
  try {
    port1.postMessage(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

/** B3: `worker_threads` `Worker` that loads no Temporal implementation and classifies. */
const workerBoundary: Boundary = (message, context) => {
  const worker = new Worker(new URL('./worker.js', import.meta.url));
  context.onCleanup(() => worker.terminate());
  worker.on('message', (data: unknown) => {
    try {
      const result = readWorkerReply(data, message.expected);
      if (result !== undefined) context.settle(result);
    } catch (error) {
      context.settle(observed({ kind: 'harness-error', error }));
    }
  });
  worker.on('messageerror', (error: Error) => {
    context.settle(observed({ kind: 'harness-error', error }));
  });
  worker.on('error', (error: Error) => {
    context.settle(observed({ kind: 'harness-error', error }));
  });
  try {
    worker.postMessage(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

/** B4: two `BroadcastChannel` instances with the same unique name in the same realm. */
const broadcastChannelBoundary: Boundary = (message, context) => {
  channelCounter += 1;
  const name = `temporal-clone-b4-${String(process.pid)}-${String(channelCounter)}`;
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
    context.settle(
      observed({
        kind: 'async-error',
        error: { name: 'messageerror', message: `messageerror event (${event.type})` },
      }),
    );
  };
  try {
    sender.postMessage(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
  }
};

/**
 * B8: `v8.deserialize(v8.serialize(message))`. Serializing is the send; a failure to deserialize
 * is the receiving side's failure, the analogue of `messageerror`, so it is `async-error`.
 */
const v8Boundary: Boundary = (message, context) => {
  let bytes: Buffer;
  try {
    bytes = serialize(message);
  } catch (error) {
    context.settle(observed({ kind: 'send-threw', error }));
    return;
  }
  let copy: unknown;
  try {
    copy = deserialize(bytes);
  } catch (error) {
    context.settle(observed({ kind: 'async-error', error }));
    return;
  }
  context.settle(receivedSync(copy, message.expected));
};

export const NODE_BOUNDARY_IMPLEMENTATIONS: readonly (readonly [BoundaryId, Boundary])[] = [
  ['B1', structuredCloneBoundary],
  ['B2', messageChannelBoundary],
  ['B3', workerBoundary],
  ['B4', broadcastChannelBoundary],
  ['B8', v8Boundary],
];
