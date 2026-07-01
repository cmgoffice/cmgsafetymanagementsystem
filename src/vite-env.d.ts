/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_MASTERDATABASE_API_KEY?: string;
  readonly VITE_MASTERDATABASE_AUTH_DOMAIN?: string;
  readonly VITE_MASTERDATABASE_PROJECT_ID?: string;
  readonly VITE_MASTERDATABASE_STORAGE_BUCKET?: string;
  readonly VITE_MASTERDATABASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_MASTERDATABASE_APP_ID?: string;
  readonly VITE_MASTERDATABASE_MEASUREMENT_ID?: string;
  readonly VITE_MASTERDATABASE_COLLECTION?: string;
  readonly VITE_MASTERDATABASE_EMPLOYEE_CODE_FIELD?: string;
  readonly REACT_APP_FIREBASE_API_KEY?: string;
  readonly REACT_APP_FIREBASE_AUTH_DOMAIN?: string;
  readonly REACT_APP_FIREBASE_PROJECT_ID?: string;
  readonly REACT_APP_FIREBASE_STORAGE_BUCKET?: string;
  readonly REACT_APP_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly REACT_APP_FIREBASE_APP_ID?: string;
  readonly REACT_APP_FIREBASE_MEASUREMENT_ID?: string;
  readonly REACT_APP_MASTERDATABASE_API_KEY?: string;
  readonly REACT_APP_MASTERDATABASE_AUTH_DOMAIN?: string;
  readonly REACT_APP_MASTERDATABASE_PROJECT_ID?: string;
  readonly REACT_APP_MASTERDATABASE_STORAGE_BUCKET?: string;
  readonly REACT_APP_MASTERDATABASE_MESSAGING_SENDER_ID?: string;
  readonly REACT_APP_MASTERDATABASE_APP_ID?: string;
  readonly REACT_APP_MASTERDATABASE_MEASUREMENT_ID?: string;
  readonly REACT_APP_MASTERDATABASE_COLLECTION?: string;
  readonly REACT_APP_MASTERDATABASE_EMPLOYEE_CODE_FIELD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
