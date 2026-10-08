import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { normalizeLocationDoc } from '../src/state-schema.mjs';

// Read ONLY the 31 static entries inside index.html, never execute the page.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const opening = 'const LOCATIONS_DATA = [';
const start = html.indexOf(opening);
const end = html.indexOf('\n    ];', start);
if (start < 0 || end < 0) throw new Error('Static LOCATIONS_DATA not found in index.html');
const literal = html.slice(start + 'const LOCATIONS_DATA = '.length, end + 7).trim().replace(/;$/, '');
const raw = new Script('(' + literal + ')').runInNewContext({}, { timeout: 1000 });
if (!Array.isArray(raw)) throw new Error('Expected an array of locations');
const locations = raw.map(entry => normalizeLocationDoc(JSON.parse(JSON.stringify(entry))));
if (locations.some(item => !item)) throw new Error('Some locations failed validation');
if (locations.length !== 31) throw new Error(`Expected 31 locations, found ${locations.length}`);
const ids = locations.map(item => item.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate location ids');

if (!process.argv.includes('--write')) {
  console.log(`DRY RUN: ${locations.length} locations validated. Nothing written to Firebase.`);
  console.log('Example:', JSON.stringify({ id: locations[0].id, name: locations[0].realName, address: locations[0].address }));
  process.exit(0);
}

// Explicit write flag and project ID required; service credentials must stay OUTSIDE GitHub.
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID before using --write');
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();
const batch = firestore.batch();
for (const location of locations) {
  batch.set(firestore.collection('locations').doc(String(location.id)),
    { ...location, source: 'PosteFinder original export', verified: false }, { merge: true });
}
await batch.commit();
console.log(`WROTE ${locations.length} documents to project ${projectId}. Review hours, availability and couriers before marking verified.`);
