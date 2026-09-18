#!/usr/bin/env node
/**
 * App bundle size budget.
 *
 * The published packs under `public/v1/ships/` are served, not bundled; a
 * static `import` of one pulls the whole fleet's deck geometry into the entry
 * chunk. That regression is invisible in tests and lint, so this guards the
 * built size the same way `pack size budget` guards the packs themselves.
 *
 * Run after `npm run build`. To move the baseline deliberately, re-record
 * scripts/bundle-size-baseline.json in the change that justifies the growth.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --record
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = resolve(REPO_ROOT, 'dist/assets');
const BASELINE_PATH = resolve(REPO_ROOT, 'scripts/bundle-size-baseline.json');
const TOLERANCE = 1.15;

/** @returns {{rawBytes:number, gzipBytes:number}} totals for the built JS. */
export function measureBundle(assetsDir = ASSETS_DIR) {
  const scripts = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  if (scripts.length === 0) {
    throw new Error(`No JS found in ${assetsDir}; run "npm run build" first.`);
  }
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of scripts) {
    const body = readFileSync(resolve(assetsDir, file));
    rawBytes += body.length;
    gzipBytes += gzipSync(body).length;
  }
  return { rawBytes, gzipBytes };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const measured = measureBundle();

if (process.argv.includes('--record')) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(measured, null, 2)}\n`);
  console.log(`[record] app bundle: ${kb(measured.rawBytes)} raw / ${kb(measured.gzipBytes)} gzipped`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const ceiling = Math.floor(baseline.gzipBytes * TOLERANCE);

console.log(
  `app bundle: ${kb(measured.rawBytes)} raw / ${kb(measured.gzipBytes)} gzipped ` +
    `(baseline ${kb(baseline.gzipBytes)} gzipped, ceiling ${kb(ceiling)})`
);

if (measured.gzipBytes > ceiling) {
  console.error(
    `\nThe gzipped app bundle grew past ${Math.round((TOLERANCE - 1) * 100)} % over the baseline.\n` +
      'A static import of a file under public/v1/ships/ is the usual cause: those packs\n' +
      'are fetched at runtime (see src/data/fleetRouting.js). If the growth is intended,\n' +
      're-record the baseline with: node scripts/check-bundle-size.mjs --record'
  );
  process.exit(1);
}
