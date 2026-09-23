// File access for results, baseline and matrix. Paths are resolved from the bundle location
// (conformance/dist/node/), so every tool works from any working directory.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { readEngineResult, toJsonFile } from '../../result-schema.js';
import { ENGINES, type Engine, type EngineResult } from '../../types.js';

export const CONFORMANCE_DIR = fileURLToPath(new URL('../../', import.meta.url));
export const RESULTS_DIR = fileURLToPath(new URL('../../results/', import.meta.url));
export const RESULTS_TMP_DIR = fileURLToPath(new URL('../../results/tmp/', import.meta.url));
export const BASELINE_FILE = fileURLToPath(new URL('../../baseline.json', import.meta.url));
export const MATRIX_FILE = fileURLToPath(new URL('../../MATRIX.md', import.meta.url));

export function resultFile(engine: Engine): string {
  return fileURLToPath(new URL(`../../results/${engine}.json`, import.meta.url));
}

export async function writeEngineResult(result: EngineResult): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const file = resultFile(result.engine);
  await writeFile(file, toJsonFile(result), 'utf8');
  return file;
}

/** Reads every engine result that exists. Missing engines are simply absent. */
export async function readAllResults(): Promise<Partial<Record<Engine, EngineResult>>> {
  const results: Partial<Record<Engine, EngineResult>> = {};
  for (const engine of ENGINES) {
    const file = resultFile(engine);
    if (!existsSync(file)) continue;
    const json: unknown = JSON.parse(await readFile(file, 'utf8'));
    const result = readEngineResult(json, file);
    if (result.engine !== engine) {
      throw new Error(`${file} contains results for ${result.engine}, expected ${engine}`);
    }
    results[engine] = result;
  }
  return results;
}
