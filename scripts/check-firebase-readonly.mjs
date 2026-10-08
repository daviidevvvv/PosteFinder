import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Read-only HTTP inspection, without creating accounts, databases or documents.
// The Firebase Web API key is a PUBLIC identifier. Never print it or use admin credentials.
const script = readFileSync(new URL('../firebase-config.js', import.meta.url), 'utf8');
const scope = { window: {} };
runInNewContext(script, scope, { timeout: 1000 });
const config = scope.window.POSTEFINDER_FIREBASE_CONFIG;
if (!config?.apiKey || !config?.projectId) throw new Error('Firebase Web config missing');

async function inspect(label, endpoint) {
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    const status = payload?.error?.status || (response.ok ? 'OK' : 'UNKNOWN_ERROR');
    if (label === 'Auth') {
      const enabled = payload?.signIn?.email?.enabled;
      console.log(`AUTH: HTTP ${response.status} ${status}; Email/Password: ${enabled === true ? 'enabled' : enabled === false ? 'disabled' : 'not confirmed'}`);
    } else {
      const count = Array.isArray(payload.documents) ? payload.documents.length : 0;
      console.log(`FIRESTORE: HTTP ${response.status} ${status}; sample visible locations: ${count}`);
    }
    if (!response.ok && payload?.error?.message) {
      const message = String(payload.error.message).replace(config.apiKey, '[REDACTED]').slice(0, 250);
      console.log(`${label}: ${message}`);
    }
  } catch (error) {
    console.log(`${label}: connectivity check unavailable (${error?.name || 'request error'})`);
  }
}

await inspect('Auth', `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(config.apiKey)}`);
await inspect('Firestore', `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/locations?pageSize=1&key=${encodeURIComponent(config.apiKey)}`);
// Informational only: actual login and owner-only security rules still require manual tests.
