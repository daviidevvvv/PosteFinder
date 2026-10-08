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
const configSource = readFileSync(new URL('../firebase-config.js', import.meta.url), 'utf8');
assert.ok(!configSource.includes('-----BEGIN PRIVATE KEY-----'), 'Never commit service-account private keys');
const scoped = { window: {} };
new Script(configSource, { filename: 'firebase-config.js' }).runInNewContext(scoped, { timeout: 1000 });
const config = scoped.window.POSTEFINDER_FIREBASE_CONFIG;
assert.equal(config?.projectId, 'postefinder-dev', 'Unexpected Firebase project');
assert.equal(config?.authDomain, 'postefinder-dev.firebaseapp.com');
assert.match(config?.apiKey || '', /^AIza[A-Za-z0-9_-]+$/);
assert.match(config?.appId || '', /^1:\d+:web:[a-zA-Z0-9]+$/);
assert.equal(config?.storageBucket, 'postefinder-dev.firebasestorage.app');
const authSource = readFileSync(new URL('../src/firebase-sync.mjs', import.meta.url), 'utf8');
for (const expected of [
  'id="pf-google-signin"',
  'new authSdk.GoogleAuthProvider()',
  'authSdk.signInWithPopup(auth, googleProvider)',
  'authSdk.GoogleAuthProvider.credentialFromError(error)',
  'authSdk.linkWithCredential(result.user, pendingGoogleCredential)'
]) {
  assert.ok(authSource.includes(expected), 'Missing Google OAuth integration: ' + expected);
}
assert.ok(authSource.includes("code.includes('unauthorized-domain')"),
  'Missing authorized-domain error message');
console.log('OK: original layout, Firebase config and Google sign-in integration found.');
