import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, normalizeLocationDoc, preferencesFingerprint } from '../src/state-schema.mjs';

test('private preferences strip unknown properties and invalid ids', () => {
  const state = normalizePreferences({
    favorites: [1, 1, 404, '1', -2],
    removedIds: [303, 303, null],
    ratings: { 1: 5, 2: 14, abc: 4 },
    customPlaces: [
      { id: -101, name: 'Casa', address: 'Riservato', coords: [41.23, 16.5], icon: 'ph-house' },
      { id: 5, name: '<test>', address: 'Via A', coords: [999, 20], icon: 'bad-icon' }
    ],
    dangerousExtra: { token: 'not persisted' }
  });
  assert.deepEqual(state.favorites, [1, 404]);
  assert.deepEqual(state.removedIds, [303]);
  assert.equal(state.ratings['1'], 5);
  assert.equal(state.ratings['2'], undefined);
  assert.equal(state.customPlaces[0].name, 'Casa');
  assert.equal(state.customPlaces[1].icon, 'ph-map-pin');
  assert.equal(state.customPlaces[1].coords, null);
  assert.ok(!('dangerousExtra' in state));
});

test('stable preference fingerprints', () => {
  assert.equal(
    preferencesFingerprint({ favorites: [1, 1], ratings: {}, customPlaces: [] }),
    preferencesFingerprint({ favorites: [1], ratings: {}, customPlaces: [] })
  );
});

test('public location documents are validated before rendering', () => {
  const valid = {
    id: 101, kind: 'ufficio_postale', realName: 'Ufficio A', address: 'Bisceglie',
    services: 'Poste', hasPoste: true, hasLis: false, coords: [41.25, 16.52],
    schedule: { mon: [[8, 30, 19, 0]], tue: [] }
  };
  const normalized = normalizeLocationDoc(valid);
  assert.equal(normalized.id, 101);
  assert.equal(normalized.schedule.mon.length, 1);
  assert.equal(normalized.schedule.sun.length, 0);
  assert.equal(normalizeLocationDoc({ ...valid, kind: 'javascript:alert(1)' }), null);
  assert.equal(normalizeLocationDoc({ ...valid, id: '101' }), null);
});
