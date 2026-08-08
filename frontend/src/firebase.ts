type FirebaseUser = {
  uid: string;
  getIdToken: () => Promise<string>;
};

type FirebaseUserCredential = {
  user: FirebaseUser;
};

type FirebaseAuth = {
  currentUser: FirebaseUser | null;
  signInWithEmailAndPassword: (
    email: string,
    password: string,
  ) => Promise<FirebaseUserCredential>;
  signOut: () => Promise<void>;
};

type FirebaseNamespace = {
  apps: unknown[];
  initializeApp: (config: Record<string, string>) => void;
  auth: () => FirebaseAuth;
};

declare global {
  interface Window {
    firebase: FirebaseNamespace;
  }
}

const firebase = window.firebase;

if (!firebase) {
  throw new Error('Firebase SDK no está cargado. Revisa los scripts en index.html');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();

export async function signInWithEmailAndPassword(email: string, password: string) {
  return auth.signInWithEmailAndPassword(email, password);
}

export async function getIdToken(user: FirebaseUser) {
  return user.getIdToken();
}

/**
 * Devuelve el token Firebase del usuario autenticado actualmente
 * (null si no hay sesión activa). FASE 7.2 — usado por hooks como usePhvaCatalog.
 */
export async function getCurrentUserIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

export async function signOut() {
  return auth.signOut();
}

export type { FirebaseUser, FirebaseUserCredential };
