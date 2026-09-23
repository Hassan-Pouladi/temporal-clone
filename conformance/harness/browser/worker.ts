// B3 module worker for browsers. Loads no Temporal implementation (R0.12).

import { replyTo, replyToMessageError } from '../../worker-protocol.js';

addEventListener('message', (event: MessageEvent) => {
  postMessage(replyTo(event.data));
});
addEventListener('messageerror', () => {
  postMessage(replyToMessageError());
});
