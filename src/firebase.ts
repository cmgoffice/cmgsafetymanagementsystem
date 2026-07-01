import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { readAppEnv } from "./env";

const firebaseConfig = {
  apiKey: readAppEnv("VITE_FIREBASE_API_KEY", "REACT_APP_FIREBASE_API_KEY"),
  authDomain: readAppEnv(
    "VITE_FIREBASE_AUTH_DOMAIN",
    "REACT_APP_FIREBASE_AUTH_DOMAIN"
  ),
  projectId: readAppEnv(
    "VITE_FIREBASE_PROJECT_ID",
    "REACT_APP_FIREBASE_PROJECT_ID"
  ),
  storageBucket: readAppEnv(
    "VITE_FIREBASE_STORAGE_BUCKET",
    "REACT_APP_FIREBASE_STORAGE_BUCKET"
  ),
  messagingSenderId: readAppEnv(
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "REACT_APP_FIREBASE_MESSAGING_SENDER_ID"
  ),
  appId: readAppEnv("VITE_FIREBASE_APP_ID", "REACT_APP_FIREBASE_APP_ID"),
  measurementId: readAppEnv(
    "VITE_FIREBASE_MEASUREMENT_ID",
    "REACT_APP_FIREBASE_MEASUREMENT_ID"
  ),
};

const masterFirebaseConfig = {
  apiKey: readAppEnv(
    "VITE_MASTERDATABASE_API_KEY",
    "REACT_APP_MASTERDATABASE_API_KEY"
  ),
  authDomain: readAppEnv(
    "VITE_MASTERDATABASE_AUTH_DOMAIN",
    "REACT_APP_MASTERDATABASE_AUTH_DOMAIN"
  ),
  projectId: readAppEnv(
    "VITE_MASTERDATABASE_PROJECT_ID",
    "REACT_APP_MASTERDATABASE_PROJECT_ID"
  ),
  storageBucket: readAppEnv(
    "VITE_MASTERDATABASE_STORAGE_BUCKET",
    "REACT_APP_MASTERDATABASE_STORAGE_BUCKET"
  ),
  messagingSenderId: readAppEnv(
    "VITE_MASTERDATABASE_MESSAGING_SENDER_ID",
    "REACT_APP_MASTERDATABASE_MESSAGING_SENDER_ID"
  ),
  appId: readAppEnv(
    "VITE_MASTERDATABASE_APP_ID",
    "REACT_APP_MASTERDATABASE_APP_ID"
  ),
  measurementId: readAppEnv(
    "VITE_MASTERDATABASE_MEASUREMENT_ID",
    "REACT_APP_MASTERDATABASE_MEASUREMENT_ID"
  ),
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;
let masterApp: FirebaseApp | null = null;
let masterDb: Firestore | null = null;

const hasConfig =
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId;

const hasMasterConfig =
  masterFirebaseConfig.apiKey &&
  masterFirebaseConfig.projectId &&
  masterFirebaseConfig.appId;

if (hasConfig) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (err) {
    console.error("[Firebase] init error:", err);
  }
} else {
  console.warn(
    "[Firebase] Firebase app env is missing. Add VITE_FIREBASE_* (or legacy REACT_APP_FIREBASE_*) to .env and restart npm run dev."
  );
}

if (hasMasterConfig) {
  try {
    masterApp = initializeApp(masterFirebaseConfig, "MasterDatabase");
    masterDb = getFirestore(masterApp);
  } catch (err) {
    console.error("[Firebase] MasterDatabase init error:", err);
  }
} else {
  console.warn(
    "[Firebase] MasterDatabase env is missing. Add VITE_MASTERDATABASE_* (or legacy REACT_APP_MASTERDATABASE_*) to .env to enable employee lookup."
  );
}

export { app, auth, db, masterApp, masterDb, storage };
