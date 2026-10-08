import { normalizePreferences, preferencesFingerprint, normalizeLocationDoc } from './state-schema.mjs';

// Firebase is an opt-in enhancement; without configuration the original UI works as before.
const config = window.POSTEFINDER_FIREBASE_CONFIG;
if (config?.apiKey && config?.authDomain && config?.projectId && config?.appId) {
  startFirebase().catch(error => console.warn('PosteFinder: Firebase non disponibile, modalità locale attiva', error));
}

async function startFirebase() {
  const version = '12.19.0';
  const [{ initializeApp }, authSdk, storeSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
  ]);
  const app = initializeApp(config);
  const auth = authSdk.getAuth(app);
  const db = storeSdk.getFirestore(app);
  const bridge = window.PosteFinderBridge;
  if (!bridge) throw new Error('PosteFinderBridge non trovato');

  const locateButton = document.getElementById('btn-locate');
  const right = document.createElement('div');
  right.className = 'flex items-center gap-2';
  locateButton.parentElement.replaceChild(right, locateButton);
  right.appendChild(locateButton);
  const accountButton = document.createElement('button');
  accountButton.type = 'button';
  accountButton.className = 'px-3 py-2 rounded-full bg-white text-xs font-bold text-slate-700 border border-slate-200 hover:bg-blue-50';
  accountButton.textContent = 'Accedi';
  right.appendChild(accountButton);

  const dialog = document.createElement('dialog');
  dialog.className = 'rounded-2xl shadow-2xl border border-slate-200 p-5 w-[min(94vw,380px)] backdrop:bg-black/45';
  dialog.innerHTML = `
    <form id="pf-auth-form" class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-bold text-lg text-slate-800">Account PosteFinder</h2>
        <button id="pf-close-auth" type="button" class="text-slate-500 text-xl" aria-label="Chiudi">&times;</button>
      </div>
      <p class="text-xs text-slate-500">Accedi per sincronizzare preferiti, valutazioni, punti nascosti e luoghi privati tra i tuoi dispositivi.</p>
      <label class="block text-sm">Email
        <input name="email" type="email" autocomplete="username" required maxlength="254"
          class="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-2"></label>
      <label class="block text-sm">Password
        <input name="password" type="password" autocomplete="current-password" required minlength="6"
          class="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-2"></label>
      <p id="pf-auth-feedback" role="status" class="text-xs text-slate-600 min-h-4"></p>
      <div class="flex gap-2">
        <button type="submit" data-mode="login" class="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold">Accedi</button>
        <button type="submit" data-mode="signup" class="flex-1 border border-blue-200 text-blue-700 rounded-lg py-2 font-semibold">Registrati</button>
      </div>
      <p class="text-[11px] text-slate-500">Crea un account solo se hai configurato Firebase Authentication. Non usare password di altri servizi.</p>
    </form>`;
  document.body.appendChild(dialog);
  dialog.querySelector('#pf-close-auth').addEventListener('click', () => dialog.close());
  dialog.querySelector('#pf-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = dialog.querySelector('#pf-auth-feedback');
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const isSignup = event.submitter?.dataset.mode === 'signup';
    feedback.textContent = 'Connessione in corso...';
    [...form.querySelectorAll('button[type=submit]')].forEach(btn => { btn.disabled = true; });
    try {
      if (isSignup) await authSdk.createUserWithEmailAndPassword(auth, email, password);
      else await authSdk.signInWithEmailAndPassword(auth, email, password);
      form.reset();
      dialog.close();
    } catch (error) {
      feedback.textContent = readableError(error);
    } finally {
      [...form.querySelectorAll('button[type=submit]')].forEach(btn => { btn.disabled = false; });
    }
  });
  accountButton.addEventListener('click', async () => {
    if (auth.currentUser) {
      if (confirm('Uscire da PosteFinder? I dati sincronizzati rimarranno nel tuo account. I luoghi privati di questo dispositivo verranno rimossi.')) {
        await authSdk.signOut(auth);
      }
    } else {
      dialog.showModal();
    }
  });

  let generation = 0;
  let ready = false;
  let signedInBefore = false;
  let observedFingerprint = '';
  let pendingSave = false;
  let unlisten = null;
  let scheduledSave = null;
  const setLabel = label => { accountButton.textContent = label; accountButton.title = label; };

  const connect = async user => {
    const session = ++generation;
    ready = false;
    if (unlisten) { unlisten(); unlisten = null; }
    if (scheduledSave) { clearTimeout(scheduledSave); scheduledSave = null; }
    pendingSave = false;
    if (!user) {
      if (signedInBefore) {
        bridge.applyPreferences(normalizePreferences({}));
      }
      signedInBefore = false;
      observedFingerprint = preferencesFingerprint(bridge.getPreferences());
      setLabel('Accedi');
      return;
    }
    // Avoid carrying personal data from another user across account switches.
    if (signedInBefore) bridge.applyPreferences(normalizePreferences({}));
    signedInBefore = true;
    setLabel('Collegamento...');
    const ref = storeSdk.doc(db, 'users', user.uid, 'private', 'preferences');
    try {
      const existing = await storeSdk.getDoc(ref);
      if (session !== generation) return;
      if (existing.exists()) {
        bridge.applyPreferences(normalizePreferences(existing.data()));
      } else {
        await storeSdk.setDoc(ref, {
          ...normalizePreferences(bridge.getPreferences()), updatedAt: storeSdk.serverTimestamp()
        });
      }
      if (session !== generation) return;
      observedFingerprint = preferencesFingerprint(bridge.getPreferences());
      ready = true;
      setLabel('Sincronizzato · Esci');

      unlisten = storeSdk.onSnapshot(ref, snapshot => {
        if (session !== generation || !ready || !snapshot.exists() || snapshot.metadata.hasPendingWrites) return;
        const remote = normalizePreferences(snapshot.data());
        const remoteHash = preferencesFingerprint(remote);
        const localHash = preferencesFingerprint(bridge.getPreferences());
        if (remoteHash === localHash) { observedFingerprint = localHash; return; }
        if (pendingSave || scheduledSave || localHash !== observedFingerprint) return;
        bridge.applyPreferences(remote);
        observedFingerprint = remoteHash;
      }, error => {
        console.warn('PosteFinder: ascolto preferenze non disponibile', error);
        setLabel('Sync non disponibile · Esci');
      });
    } catch (error) {
      if (session !== generation) return;
      console.warn('PosteFinder: preferenze in modalità locale', error);
      ready = false; // Never silently overwrite remote data when the initial read fails.
      setLabel('Offline · Esci');
    }
  };

  authSdk.onAuthStateChanged(auth, user => { void connect(user); });

  // Poll only for changed legacy localStorage state. Avoid network writes when unchanged.
  setInterval(() => {
    if (!ready || !auth.currentUser) return;
    const next = preferencesFingerprint(bridge.getPreferences());
    if (next === observedFingerprint) return;
    observedFingerprint = next;
    if (scheduledSave) clearTimeout(scheduledSave);
    const uid = auth.currentUser.uid;
    const session = generation;
    scheduledSave = setTimeout(async () => {
      scheduledSave = null;
      if (session !== generation || !auth.currentUser || auth.currentUser.uid !== uid) return;
      pendingSave = true;
      try {
        const latest = normalizePreferences(bridge.getPreferences());
        await storeSdk.setDoc(
          storeSdk.doc(db, 'users', uid, 'private', 'preferences'),
          { ...latest, updatedAt: storeSdk.serverTimestamp() }
        );
        if (session === generation) setLabel('Sincronizzato · Esci');
      } catch (error) {
        console.error('PosteFinder: salvataggio non riuscito', error);
        if (session === generation) {
          observedFingerprint = ''; // Retry later, don't throw away local changes.
          setLabel('Da sincronizzare · Esci');
        }
      } finally {
        pendingSave = false;
      }
    }, 900);
  }, 2000);

  // The public directory remains bundled in index.html until Firestore is seeded.
  // A partial dataset is MERGED with bundled locations, never deletes missing entries.
  try {
    const result = await storeSdk.getDocs(storeSdk.collection(db, 'locations'));
    const remote = result.docs.map(entry => normalizeLocationDoc(entry.data()))
      .filter(item => item && item.active);
    if (remote.length) bridge.mergeLocations(remote);
  } catch (error) {
    console.warn('PosteFinder: uso il catalogo locale', error);
  }
}

function readableError(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Email o password non corretti.';
  if (code.includes('email-already-in-use')) return 'Questa email è già registrata.';
  if (code.includes('weak-password')) return 'Scegli una password più lunga.';
  if (code.includes('operation-not-allowed')) return 'Attiva Email/Password in Firebase Authentication.';
  if (code.includes('unauthorized-domain')) return 'Autorizza questo dominio nella console Firebase.';
  return 'Accesso non riuscito. Riprova.';
}
