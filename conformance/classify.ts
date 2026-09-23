// R0.13 / R0.14: pure outcome classifier. No I/O. Must never throw, whatever it is handed:
// received values come from the far side of a boundary and may be anything.

import { temporalString } from './temporal-like.js';
import type { Cell, Expected, Observation } from './types.js';

const SHAPE_LIMIT = 200;
const MESSAGE_LIMIT = 200;
const STACK_LIMIT = 1000;

export function classify(observation: Observation, expected: Expected): Cell {
  switch (observation.kind) {
    case 'received':
      return classifyReceived(observation.value, expected);
    case 'send-threw': {
      const { errorName, message } = describeError(observation.error);
      return { outcome: 'throws', detail: { errorName, message } };
    }
    case 'async-error': {
      const { errorName, message } = describeError(observation.error);
      return { outcome: 'async-error', detail: { errorName, message } };
    }
    case 'timeout':
      return { outcome: 'timeout' };
    case 'unavailable':
      return { outcome: 'unavailable', detail: { reason: observation.reason } };
    case 'harness-error': {
      const { errorName, message, stack } = describeError(observation.error);
      return {
        outcome: 'harness-error',
        detail: { errorName, message, stack: stack.slice(0, STACK_LIMIT) },
      };
    }
  }
}

function classifyReceived(value: unknown, expected: Expected): Cell {
  const receivedTag = tagOf(value);
  if (receivedTag === `[object Temporal.${expected.type}]`) {
    let str: string | undefined;
    try {
      str = temporalString(value, expected.type);
    } catch {
      str = undefined;
    }
    if (str === expected.str) return { outcome: 'ok' };
  }
  return {
    outcome: 'silent-loss',
    detail: { receivedTag, ownKeyCount: ownKeyCount(value), shape: shapeOf(value) },
  };
}

function tagOf(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch (error) {
    return `<tag threw: ${describeError(error).errorName}>`;
  }
}

/** -1 when the keys cannot be enumerated (for example a revoked Proxy). */
function ownKeyCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  try {
    return Reflect.ownKeys(value).length;
  } catch {
    return -1;
  }
}

function shapeOf(value: unknown): string {
  try {
    // Typed as string, but JSON.stringify returns undefined for undefined, functions and symbols.
    const json: unknown = JSON.stringify(value);
    return (typeof json === 'string' ? json : typeof value).slice(0, SHAPE_LIMIT);
  } catch (error) {
    return `<unserializable: ${describeError(error).errorName}>`.slice(0, SHAPE_LIMIT);
  }
}

interface ErrorDescription {
  readonly errorName: string;
  readonly message: string;
  readonly stack: string;
}

function describeError(error: unknown): ErrorDescription {
  if (typeof error !== 'object' || error === null) {
    return { errorName: typeof error, message: safeString(error), stack: '' };
  }
  const name = safeGet(error, 'name');
  const message = safeGet(error, 'message');
  const stack = safeGet(error, 'stack');
  return {
    errorName: typeof name === 'string' ? name : 'unknown',
    message: (typeof message === 'string' ? message : '').slice(0, MESSAGE_LIMIT),
    stack: typeof stack === 'string' ? stack : '',
  };
}

function safeGet(target: object, key: string): unknown {
  try {
    const value: unknown = Reflect.get(target, key);
    return value;
  } catch {
    return undefined;
  }
}

function safeString(value: unknown): string {
  try {
    return String(value).slice(0, MESSAGE_LIMIT);
  } catch {
    return '';
  }
}
