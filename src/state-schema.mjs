// Pure data functions shared by the browser and Node tests.
// Sanitize remote Firestore data before it reaches the legacy map/HTML renderer.
const ID_LIMIT = 150;
const PLACE_LIMIT = 50;
const LIMIT = 200;

const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanString = (value, max = LIMIT) => String(value ?? '').trim().slice(0, max);
const validCoord = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter(id => Number.isSafeInteger(id) && id >= 0 && id <= 1000000))].slice(0, ID_LIMIT);
}
function coords(value) {
  return Array.isArray(value) && value.length === 2
    && validCoord(value[0], -90, 90) && validCoord(value[1], -180, 180)
    ? [value[0], value[1]] : null;
}
function ratingsMap(value) {
  const out = {};
  if (!plainObject(value)) return out;
  for (const [id, rate] of Object.entries(value)) {
    if (Object.keys(out).length >= ID_LIMIT) break;
    if (/^\d{1,7}$/.test(id) && Number.isInteger(rate) && rate >= 1 && rate <= 5) out[id] = rate;
  }
  return out;
}
function normalizePlace(value) {
  if (!plainObject(value) || !Number.isSafeInteger(value.id)) return null;
  const name = cleanString(value.name, 75);
  if (!name) return null;
  return {
    id: value.id,
    isDefault: value.id === -101 || value.id === -102,
    name,
    address: cleanString(value.address, 200),
    icon: ['ph-house', 'ph-barbell', 'ph-map-pin'].includes(value.icon) ? value.icon : 'ph-map-pin',
    coords: coords(value.coords)
  };
}
export function normalizePreferences(value) {
  const input = plainObject(value) ? value : {};
  const places = (Array.isArray(input.customPlaces) ? input.customPlaces : [])
    .map(normalizePlace).filter(Boolean);
  return {
    version: 1,
    favorites: ids(input.favorites),
    removedIds: ids(input.removedIds),
    ratings: ratingsMap(input.ratings),
    customPlaces: [...new Map(places.map(place => [place.id, place])).values()].slice(0, PLACE_LIMIT)
  };
}
export function preferencesFingerprint(value) {
  return JSON.stringify(normalizePreferences(value));
}

const kinds = new Set([
  'punto', 'ufficio_postale', 'locker_punto_poste', 'locker_inpost', 'locker_amazon', 'amazon_counter'
]);
export function normalizeLocationDoc(value) {
  if (!plainObject(value) || !Number.isSafeInteger(value.id) || value.id <= 0) return null;
  if (!kinds.has(value.kind) || !value.realName || !value.address) return null;
  if (!plainObject(value.schedule)) return null;
  const schedule = {};
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const intervals = value.schedule[day];
    schedule[day] = Array.isArray(intervals)
      ? intervals.filter(it => Array.isArray(it) && it.length === 4
          && it.every(n => Number.isInteger(n) && n >= 0 && n <= 59)
          && it[0] <= 23 && it[2] <= 23).slice(0, 5).map(it => [...it])
      : [];
  }
  return {
    id: value.id,
    kind: value.kind,
    realName: cleanString(value.realName, 130),
    originalName: cleanString(value.originalName || value.realName, 130),
    address: cleanString(value.address, 200),
    services: cleanString(value.services, 200),
    hasPoste: value.hasPoste === true,
    hasLis: value.hasLis === true,
    coords: coords(value.coords),
    schedule,
    active: value.active !== false
  };
}
