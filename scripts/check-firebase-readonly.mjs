import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Only checks public project endpoints. Never creates accounts, changes documents, or deploys.
const source = readFileSync(new URL('../firebase-config.js', import.meta.url), 'utf8');
const context = { window: {} };
runInNewContext(source, context, { timeout: 1000 });
const cfg = context.window.POSTEFINDER_FIREBASE_CONFIG;
if (cfg?.projectId !== 'postefinder-dev' || !cfg?.apiKey) throw new Error('Wrong Firebase test project');

const statuses = {};
async function inspect(label, url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => ({}));
    const status = body?.error?.status || (response.ok ? 'OK' : 'UNKNOWN');
    statuses[label] = response.status;
    console.log(label + ': HTTP ' + response.status + ' ' + status);
    if (!response.ok) {
      const message = String(body?.error?.message || 'Unknown error')
        .replaceAll(cfg.apiKey, '[REDACTED]').slice(0, 260);
      console.log(label + ' diagnostic: ' + message);
    }
    return { response, body };
  } catch (error) {
    statuses[label] = 0;
    console.log(label + ': network unavailable (' + String(error?.name || 'request failed') + ')');
    return null;
  }
}

const auth = await inspect('AUTH', 'https://identitytoolkit.googleapis.com/v1/projects?key=' + encodeURIComponent(cfg.apiKey));
if (auth?.response.ok) {
  const enabled = auth.body?.signIn?.email?.enabled;
  console.log('EMAIL_PASSWORD_PROVIDER=' +
    (enabled === true ? 'ENABLED' : enabled === false ? 'DISABLED' : 'NOT_CONFIRMED_BY_PUBLIC_ENDPOINT'));
}
const firestore = await inspect('FIRESTORE',
  'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.projectId) +
  '/databases/(default)/documents/locations?pageSize=1&key=' + encodeURIComponent(cfg.apiKey));
if (firestore?.response.ok) {
  console.log('FIRESTORE_PUBLIC_LOCATIONS=READABLE');
  console.log('FIRESTORE_SAMPLE_DOCUMENTS=' +
    (Array.isArray(firestore.body?.documents) ? firestore.body.documents.length : 0));
} else {
  console.log('FIRESTORE_PUBLIC_LOCATIONS=NOT_VERIFIED');
}
console.log('FIREBASE_API_STATUS=' +
  (statuses.AUTH === 200 && statuses.FIRESTORE === 200 ? 'REACHABLE' : 'NOT_READY_OR_RESTRICTED'));
// Informational only. Browser login and owner-only rules require separate manual tests.
