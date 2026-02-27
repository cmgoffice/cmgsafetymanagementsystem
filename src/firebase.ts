import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDa7FV0FoUcSiBzzjls690qTEVQyNmNiy8",
  authDomain: "cmgsafetydatabase.firebaseapp.com",
  projectId: "cmgsafetydatabase",
  storageBucket: "cmgsafetydatabase.firebasestorage.app",
  messagingSenderId: "543499927747",
  appId: "1:543499927747:web:8a3bcbcbc9e2efcbb4e276",
  measurementId: "G-4TKRFNS0B8",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
