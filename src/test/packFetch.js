import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs with the repo root as its root, the same place `public/` sits.
const REPO_ROOT = process.cwd();

/**
 * A `fetch` stand-in that serves `public/` off the disk, so tests exercise the
 * same published packs the browser downloads without needing a server.
 *
 * @type {typeof fetch}
 */
export const fetchFromPublic = async (url) => {
  const path = String(url).replace(/^\.?\//, '');
  try {
    const body = readFileSync(resolve(REPO_ROOT, 'public', path), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};
