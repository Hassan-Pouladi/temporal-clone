// Zero-dependency static file server for browser tests and the conformance harness (R0.8).
//
// Usage: node scripts/serve.mjs [root]
//   root  directory to serve (default: current working directory)
//   PORT  environment variable, port to bind on 127.0.0.1 (default 0: a random free port)

import { realpathSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {Readonly<Record<string, string>>} */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

/**
 * Maps a raw request target to a file under `root`, or returns `undefined` when the target is
 * malformed or tries to leave `root`. Every check runs on the decoded path, so encoded variants
 * (`%2e%2e`, `%2f`, `%5c`) are caught the same way as their literal forms.
 *
 * @param {string} root absolute, real path of the served directory
 * @param {string} target raw request target, exactly as received
 * @returns {string | undefined}
 */
function resolveTarget(root, target) {
  // Only origin-form targets ("/path"). Absolute-form ("http://host/...") and "*" are rejected.
  if (!target.startsWith('/')) return undefined;
  const end = target.search(/[?#]/);
  const rawPath = end === -1 ? target : target.slice(0, end);
  /** @type {string} */
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return undefined;
  // "//host/share" and "/C:/..." are absolute paths on some platforms.
  if (decoded.startsWith('//') || /^\/[A-Za-z]:/.test(decoded)) return undefined;
  if (decoded.split('/').some((segment) => segment === '..' || segment === '.')) return undefined;
  const relative = decoded.slice(1);
  if (path.isAbsolute(relative)) return undefined;
  const resolved = path.resolve(root, relative);
  const fromRoot = path.relative(root, resolved);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return undefined;
  return resolved;
}

/**
 * @param {string} rootDir directory to serve
 * @returns {import('node:http').Server}
 */
export function createStaticServer(rootDir) {
  const root = realpathSync(path.resolve(rootDir));

  return createServer((req, res) => {
    /**
     * @param {number} status
     * @param {string} message
     */
    const fail = (status, message) => {
      res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(message);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fail(405, 'Method Not Allowed');
      return;
    }
    const file = resolveTarget(root, req.url ?? '');
    if (file === undefined) {
      fail(400, 'Bad Request');
      return;
    }
    const contentType = MIME_TYPES[path.extname(file).toLowerCase()];
    if (contentType === undefined) {
      fail(404, 'Not Found');
      return;
    }

    void (async () => {
      /** @type {Buffer} */
      let body;
      try {
        // A symlink inside root must not expose a file outside it.
        const real = await realpath(file);
        const fromRoot = path.relative(root, real);
        if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
          fail(404, 'Not Found');
          return;
        }
        if (!(await stat(real)).isFile()) {
          fail(404, 'Not Found');
          return;
        }
        body = await readFile(real);
      } catch {
        fail(404, 'Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    })();
  });
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const port = Number(process.env['PORT'] ?? '0');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(
      `PORT must be an integer from 0 to 65535, got ${String(process.env['PORT'])}`,
    );
  }
  const server = createStaticServer(root);
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const chosen = typeof address === 'object' && address !== null ? address.port : port;
    process.stdout.write(`serving ${root} at http://127.0.0.1:${String(chosen)}/\n`);
  });
}
