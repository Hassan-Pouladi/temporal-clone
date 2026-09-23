import { spawn } from 'node:child_process';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticServer } from '../../../scripts/serve.mjs';

const fixtureRoot = fileURLToPath(new URL('./fixtures/serve/', import.meta.url));
const serveScript = fileURLToPath(new URL('../../../scripts/serve.mjs', import.meta.url));

interface RawResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

/** Sends `path` byte for byte: fetch() and URL would normalize `..` away before it reached the server. */
function rawGet(port: number, path: string, method = 'GET'): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('scripts/serve.mjs (R0.8, R0.23)', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createStaticServer(fixtureRoot);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it.each([
    ['/index.html', 'text/html; charset=utf-8', '<title>fixture</title>'],
    ['/app.js', 'text/javascript; charset=utf-8', 'fixture = 1'],
    ['/sub/mod.mjs', 'text/javascript; charset=utf-8', 'fixture = 2'],
    ['/app.js?cache=bust', 'text/javascript; charset=utf-8', 'fixture = 1'],
  ])('serves %s as %s with no-store', async (path, contentType, content) => {
    const res = await rawGet(port, path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(contentType);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain(content);
  });

  it.each(['/missing.html', '/sub/missing.js', '/data.txt', '/', '/sub', '/sub/'])(
    'answers 404 for %s',
    async (path) => {
      const res = await rawGet(port, path);
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    },
  );

  it.each([
    '/../package.json',
    '/sub/../../package.json',
    '/%2e%2e/package.json',
    '/%2E%2E/package.json',
    '/..%2fpackage.json',
    '/..%2Fpackage.json',
    '/%2e%2e%2fpackage.json',
    '/sub/%2e%2e/%2e%2e/package.json',
    '/..\\package.json',
    '/%5c..%5cpackage.json',
    '/sub\\..\\..\\package.json',
    '//etc/passwd',
    '/%2fetc%2fpasswd',
    '/C:/Windows/win.ini',
    '/C:%5CWindows%5Cwin.ini',
    '/c:%2fWindows%2fwin.ini',
    'http://127.0.0.1/index.html',
    '/%00index.html',
    '/%e0%a4%a',
  ])('rejects %s with 400', async (path) => {
    const res = await rawGet(port, path);
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects methods other than GET and HEAD with 405', async () => {
    const res = await rawGet(port, '/index.html', 'POST');
    expect(res.status).toBe(405);
  });

  it('answers HEAD without a body', async () => {
    const res = await rawGet(port, '/index.html', 'HEAD');
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
  });

  it('as a CLI, binds 127.0.0.1 on PORT=0 and prints the chosen port', async () => {
    const child = spawn(process.execPath, [serveScript, fixtureRoot], {
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    try {
      const line = await new Promise<string>((resolve, reject) => {
        let output = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          output += chunk;
          if (output.includes('\n')) resolve(output);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          reject(new Error(`serve.mjs exited early with code ${String(code)}`));
        });
      });
      const match = /^serving .+ at http:\/\/127\.0\.0\.1:(\d+)\/$/m.exec(line);
      expect(match).not.toBeNull();
      const cliPort = Number(match?.[1]);
      expect(cliPort).toBeGreaterThan(0);
      const res = await rawGet(cliPort, '/index.html');
      expect(res.status).toBe(200);
    } finally {
      child.kill();
    }
  });
});
