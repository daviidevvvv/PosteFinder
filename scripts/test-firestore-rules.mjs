import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Emulator only. No service credentials and no production Firebase writes.
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-postefinder',
  firestore: { rules, host: '127.0.0.1', port: 8080 }
});

try {
  const guest = testEnv.unauthenticatedContext().firestore();
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const publicDoc = 'locations/example';
  const privateKey = 'users/alice/private/geminiKey';
  const privatePrefs = 'users/alice/private/preferences';

  await assertSucceeds(getDoc(doc(guest, publicDoc)));
  await assertFails(setDoc(doc(guest, publicDoc), { name: 'Not allowed' }));
  await assertFails(getDoc(doc(guest, privateKey)));
  await assertFails(getDoc(doc(bob, privateKey)));

  await assertSucceeds(setDoc(doc(alice, privateKey), {
    version: 1,
    apiKey: 'AIza' + 'A'.repeat(35),
    updatedAt: new Date()
  }));
  await assertSucceeds(getDoc(doc(alice, privateKey)));
  await assertFails(setDoc(doc(alice, privateKey), {
    version: 1, apiKey: 'not-valid', updatedAt: new Date()
  }));

  await assertSucceeds(setDoc(doc(alice, privatePrefs), {
    version: 1,
    favorites: [1], removedIds: [], ratings: { '1': 5 }, customPlaces: [],
    updatedAt: new Date()
  }));
  await assertFails(getDoc(doc(bob, privatePrefs)));
  console.log('PASS: Firestore rules compile, public locations are read-only, and private user data is owner-only.');
} finally {
  await testEnv.cleanup();
}
