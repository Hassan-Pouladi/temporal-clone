// Starts scripts/serve.mjs as a child process, exactly as Playwright's webServer does, and reads
// the port it prints. Running it in-process would bundle its CLI entry point into the runner.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVE_SCRIPT = fileURLToPath(new URL('../../../scripts/serve.mjs', import.meta.url));
const STARTUP_TIMEOUT_MS = 10_000;

export interface RunningServer {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

export function startServer(root: string): Promise<RunningServer> {
  const child = spawn(process.execPath, [SERVE_SCRIPT, root], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => {
        resolve();
      });
      child.kill();
    });

  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      void stop();
      reject(new Error(`serve.mjs did not report a port within ${String(STARTUP_TIMEOUT_MS)} ms`));
    }, STARTUP_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      const match = /at (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(output);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve({ baseUrl: match[1], stop });
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`serve.mjs exited with code ${String(code)} before reporting a port`));
    });
  });
}
