import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const expected of [
  'id="map"', 'id="locations-list"', 'const LOCATIONS_DATA = [',
  'id="location-search"', 'filter-open-now', 'window.PosteFinderBridge',
  'src="./firebase-config.js"', 'src="./src/firebase-sync.mjs"',
  'order-2 md:order-1', 'order-1 md:order-2'
]) assert.ok(html.includes(expected), `Missing original UI element: ${expected}`);

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  const inline = match[1];
  if (inline.trim()) new Script(inline, { filename: 'index-inline.js' });
}
console.log('OK: original Netlify map/sidebar present; inline JavaScript parses.');
