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
      <div class="flex items-center gap-2 text-[11px] text-slate-400" aria-hidden="true">
        <span class="h-px bg-slate-200 flex-1"></span>oppure<span class="h-px bg-slate-200 flex-1"></span>
      </div>
      <button id="pf-google-signin" type="button"
        class="w-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg py-2.5 font-semibold flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-wait">
        <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M43.61 24.45c0-1.36-.12-2.72-.36-4.01H24v7.72h11.01a9.41 9.41 0 0 1-4.09 6.18v5.14h6.62c3.88-3.57 6.07-8.84 6.07-15.03z"/>
          <path fill="#34A853" d="M24 44c5.51 0 10.13-1.82 13.51-4.93l-6.62-5.14c-1.84 1.24-4.18 1.97-6.89 1.97-5.3 0-9.8-3.58-11.41-8.4H5.77v5.28C9.14 39.43 16.04 44 24 44z"/>
          <path fill="#FBBC05" d="M12.59 27.5a11.99 11.99 0 0 1 0-7.67v-5.28H5.77a20 20 0 0 0 0 18.23l6.82-5.28z"/>
          <path fill="#EA4335" d="M24 12.1c3 0 5.68 1.03 7.8 3.06l5.85-5.85C34.09 5.93 29.49 4 24 4 16.04 4 9.14 8.57 5.77 15.55l6.82 5.28c1.61-4.82 6.11-8.73 11.41-8.73z"/>
        </svg>
        Continua con Google
      </button>
      <p class="text-[11px] text-slate-500">Accedi con Google oppure con email/password. I dati rimangono legati al tuo account Firebase.</p>
    </form>`;
  document.body.appendChild(dialog);
  dialog.querySelector('#pf-close-auth').addEventListener('click', () => dialog.close());
  const googleProvider = new authSdk.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  let pendingGoogleCredential = null;
  let pendingGoogleEmail = null;
  const googleButton = dialog.querySelector('#pf-google-signin');
  const authForm = dialog.querySelector('#pf-auth-form');
  const authFeedback = dialog.querySelector('#pf-auth-feedback');
  googleButton.addEventListener('click', async () => {
    // Invoke the popup directly inside the click handler to avoid browser popup blockers.
    googleButton.disabled = true;
    authFeedback.textContent = 'Apertura accesso Google...';
    try {
      await authSdk.signInWithPopup(auth, googleProvider);
      pendingGoogleCredential = null;
      pendingGoogleEmail = null;
      authForm.reset();
      dialog.close();
    } catch (error) {
      if (error?.code === 'auth/account-exists-with-different-credential') {
        pendingGoogleCredential = authSdk.GoogleAuthProvider.credentialFromError(error);
        pendingGoogleEmail = String(error?.customData?.email || '').trim().toLowerCase();
        authFeedback.textContent = 'Questa email ha già un account: accedi con la password per collegare Google senza perdere i tuoi dati.';
      } else {
        authFeedback.textContent = readableError(error, 'google');
      }
    } finally {
      googleButton.disabled = false;
    }
  });
  dialog.querySelector('#pf-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = dialog.querySelector('#pf-auth-feedback');
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const isSignup = event.submitter?.dataset.mode === 'signup';
    if (pendingGoogleCredential && pendingGoogleEmail && email.toLowerCase() !== pendingGoogleEmail) {
      feedback.textContent = 'Per collegare Google accedi con la stessa email del tuo account Google.';
      return;
    }
    feedback.textContent = 'Connessione in corso...';
    [...form.querySelectorAll('button[type=submit]')].forEach(btn => { btn.disabled = true; });
    try {
      const result = isSignup
        ? await authSdk.createUserWithEmailAndPassword(auth, email, password)
        : await authSdk.signInWithEmailAndPassword(auth, email, password);
      if (!isSignup && pendingGoogleCredential) {
        try {
          // Keep the same Firebase UID and Firestore preferences when adding Google login.
          await authSdk.linkWithCredential(result.user, pendingGoogleCredential);
        } catch (linkError) {
          pendingGoogleCredential = null;
          pendingGoogleEmail = null;
          feedback.textContent = 'Accesso riuscito, ma Google non è stato collegato: ' +
            readableError(linkError, 'google');
          return;
        }
      }
      pendingGoogleCredential = null;
      pendingGoogleEmail = null;
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
        bridge.clearLocalSecrets();
      }
      signedInBefore = false;
      observedFingerprint = preferencesFingerprint(bridge.getPreferences());
      setLabel('Accedi');
      return;
    }
    // Avoid carrying personal data from another user across account switches.
    if (signedInBefore) {
      bridge.applyPreferences(normalizePreferences({}));
      bridge.clearLocalSecrets();
    }
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
      .filter(Boolean);
    if (remote.length) bridge.mergeLocations(remote);
  } catch (error) {
    console.warn('PosteFinder: uso il catalogo locale', error);
  }
}

function readableError(error, provider = 'email') {
  const code = String(error?.code || '');
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request'))
    return 'Accesso Google annullato.';
  if (code.includes('popup-blocked'))
    return 'Il browser ha bloccato la finestra Google: consenti i popup per questo sito.';
  if (code.includes('invalid-credential') || code.includes('wrong-password'))
    return 'Email o password non corretti.';
  if (code.includes('email-already-in-use'))
    return 'Questa email è già registrata.';
  if (code.includes('weak-password'))
    return 'Scegli una password più lunga.';
  if (code.includes('operation-not-allowed'))
    return provider === 'google'
      ? 'Attiva Google in Firebase Authentication → Metodo di accesso.'
      : 'Attiva Email/Password in Firebase Authentication.';
  if (code.includes('unauthorized-domain'))
    return 'Autorizza postefind.netlify.app in Firebase Authentication → Domini autorizzati.';
  if (code.includes('credential-already-in-use'))
    return 'Questo account Google è già collegato a un altro account.';
  if (code.includes('network-request-failed'))
    return 'Problema di rete: riprova quando la connessione è disponibile.';
  return 'Accesso non riuscito. Riprova.';
}
