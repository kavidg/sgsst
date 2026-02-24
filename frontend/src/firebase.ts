type FirebaseUserCredential = {
  user: {
    uid: string;
    getIdToken: () => Promise<string>;
  };
};

type FirebaseAuth = {
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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebase = window.firebase;

if (!firebase) {
  throw new Error('Firebase SDK no está cargado. Revisa los scripts en index.html');
}

if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export type { FirebaseUserCredential };
