// R0.17 cell notation, shared by MATRIX.md and the baseline diff.

import type { Cell } from './types.js';

function detailText(cell: Cell, key: string): string {
  const value = cell.detail?.[key];
  return value === undefined ? '?' : String(value);
}

export function cellCode(cell: Cell): string {
  switch (cell.outcome) {
    case 'ok':
      return 'OK';
    case 'throws':
      return `THROW(${detailText(cell, 'errorName')})`;
    case 'silent-loss':
      return `LOSS(${detailText(cell, 'shape')})`;
    case 'async-error':
      return `ASYNC(${detailText(cell, 'errorName')})`;
    case 'timeout':
      return 'TIMEOUT';
    case 'unavailable':
      return 'N/A';
    case 'harness-error':
      return 'HARNESS';
  }
}
