// B3 worker for Node. Loads no Temporal implementation (R0.12).

import { parentPort } from 'node:worker_threads';

import { replyTo, replyToMessageError } from '../../worker-protocol.js';

if (parentPort === null) throw new Error('worker.js must run inside a worker_threads Worker');
const port = parentPort;

port.on('message', (data: unknown) => {
  port.postMessage(replyTo(data));
});
port.on('messageerror', () => {
  port.postMessage(replyToMessageError());
});
