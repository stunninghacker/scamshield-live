// =====================================================================
// firebase.js — saves and loads the ANONYMOUS survey results.
//
// What is saved (and nothing else — the Firestore rules enforce this):
//   v, confidence, correct, awareness, rounds (8 true/false),
//   traps (allow/block/unsupported), escaped, createdAt
// No name, no email, no IP, no device info, no location, no photos.
//
// The "config" below is NOT a password. Firebase web keys are public by
// design; security comes from the rules in firestore.rules.
//
// Every call is wrapped in try/catch: if Firebase is down or not set up,
// the site keeps working (the report just shows a message).
// =====================================================================

// TODO: paste your Firebase config here (Firebase console →
// Project settings → Your apps → Web app → "firebaseConfig").
// See README.md → "Firebase setup".
const firebaseConfig = {
  apiKey: 'TODO',
  authDomain: 'TODO',
  projectId: 'TODO',
  storageBucket: 'TODO',
  messagingSenderId: 'TODO',
  appId: 'TODO',
};

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const COLLECTION = 'results';

// true once the TODO values above are replaced with real ones.
export function isConfigured() {
  return firebaseConfig.apiKey !== 'TODO' && firebaseConfig.projectId !== 'TODO';
}

// Load Firebase only when needed (the checker page never loads it).
let connection = null;

async function connect() {
  if (connection) return connection;
  const appLib = await import(SDK + 'firebase-app.js');
  const authLib = await import(SDK + 'firebase-auth.js');
  const db = await import(SDK + 'firebase-firestore.js');

  const app = appLib.initializeApp(firebaseConfig);
  const auth = authLib.getAuth(app);
  await authLib.signInAnonymously(auth); // anonymous: no account, no name
  connection = { db: db, firestore: db.getFirestore(app) };
  return connection;
}

// Promise that gives up after `ms` milliseconds.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Save one result. Document ID = the random session ID, so saving the
// same session twice is impossible (the rules forbid updates).
// Returns true if saved.
export async function saveResult(sessionId, result) {
  if (!isConfigured()) return false;
  try {
    const c = await withTimeout(connect(), 8000);
    const ref = c.db.doc(c.firestore, COLLECTION, sessionId);
    const data = {
      v: 1,
      confidence: result.confidence,
      correct: result.correct,
      awareness: result.awareness,
      rounds: result.rounds,
      traps: result.traps,
      escaped: result.escaped,
      createdAt: c.db.serverTimestamp(),
    };
    await withTimeout(c.db.setDoc(ref, data), 8000);
    return true;
  } catch (err) {
    console.warn('Could not save result:', err);
    return false;
  }
}

// Load every result. Returns an array, or null if Firebase is
// unreachable / not set up (then the report uses the offline snapshot).
export async function loadResults() {
  if (!isConfigured()) return null;
  try {
    const c = await withTimeout(connect(), 8000);
    const snapshot = await withTimeout(c.db.getDocs(c.db.collection(c.firestore, COLLECTION)), 10000);
    const list = [];
    snapshot.forEach((doc) => {
      const d = doc.data();
      list.push({
        confidence: d.confidence,
        correct: d.correct,
        awareness: d.awareness,
        rounds: d.rounds,
        traps: d.traps,
        escaped: d.escaped,
        createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : null,
      });
    });
    return list;
  } catch (err) {
    console.warn('Could not load results:', err);
    return null;
  }
}
