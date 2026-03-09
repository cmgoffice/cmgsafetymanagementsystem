import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc, runTransaction, serverTimestamp, Timestamp, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { APP_NAME } from "./constants";
import type { UserRole } from "./constants";
import type { UserProfile } from "./types";
import { setSessionExpiry, clearSession } from "./session";
import { logActivity } from "./activityLog";

const USERS_PATH = [APP_NAME, "root", "users"] as const;
const APP_META_PATH = [APP_NAME, "root", "appMeta", "config"] as const;

function userDoc(uid: string) {
  return doc(db!, ...USERS_PATH, uid);
}

function appMetaDoc() {
  return doc(db!, ...APP_META_PATH);
}

/** Convert Firestore data to UserProfile (createdAt may be Timestamp or plain object) */
function toUserProfile(uid: string, data: Record<string, unknown>): UserProfile {
  const createdAt = data.createdAt as Timestamp | { seconds: number; nanoseconds: number };
  return {
    uid,
    email: String(data.email ?? ""),
    firstName: String(data.firstName ?? ""),
    lastName: String(data.lastName ?? ""),
    position: String(data.position ?? ""),
    roles: Array.isArray(data.roles) ? (data.roles as UserRole[]) : [],
    status: (data.status as UserProfile["status"]) ?? "pending",
    assignedProjects: Array.isArray(data.assignedProjects) ? data.assignedProjects as string[] : [],
    createdAt: createdAt ?? { seconds: 0, nanoseconds: 0 },
    photoURL: data.photoURL as string | undefined,
    isFirstUser: Boolean(data.isFirstUser),
  };
}

/**
 * Create user profile in Firestore. Uses transaction for first-user detection.
 */
async function createUserProfile(
  firebaseUser: FirebaseUser,
  options: {
    firstName: string;
    lastName: string;
    position: string;
    isFirstUser: boolean;
    roles: UserRole[];
    status: UserProfile["status"];
  }
): Promise<UserProfile> {
  const uid = firebaseUser.uid;
  const email = firebaseUser.email ?? "";
  const photoURL = firebaseUser.photoURL ?? undefined;
  const userRef = userDoc(uid);
  const metaRef = appMetaDoc();

  let isFirst = false;
  await runTransaction(db!, async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const firstUser = metaSnap.exists() ? Boolean(metaSnap.data()?.firstUserRegistered) : false;
    const totalUsers = metaSnap.exists() ? Number(metaSnap.data()?.totalUsers ?? 0) : 0;
    isFirst = !firstUser;
    const profile = {
      uid,
      email,
      firstName: options.firstName,
      lastName: options.lastName,
      position: options.position,
      roles: isFirst ? (["MasterAdmin", "SuperAdmin"] as UserRole[]) : options.roles,
      status: isFirst ? "approved" : options.status,
      assignedProjects: [],
      photoURL,
      isFirstUser: isFirst,
      createdAt: serverTimestamp(),
    };
    tx.set(userRef, profile);
    tx.set(metaRef, {
      firstUserRegistered: true,
      totalUsers: totalUsers + 1,
      createdAt: metaSnap.exists() ? metaSnap.data()?.createdAt : serverTimestamp(),
    });
  });

  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error("Profile not found after create");
  return toUserProfile(uid, snap.data()!);
}

export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  setSessionExpiry(); // immediately, before any awaits
  const profile = await fetchProfile(userCred.user.uid);
  if (!profile) throw new Error("ไม่พบโปรไฟล์ผู้ใช้");
  logActivity("LOGIN", userCred.user.uid, { email, method: "email" });
  return profile;
}

export async function loginWithGoogle(): Promise<UserProfile> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  const provider = new GoogleAuthProvider();
  const userCred = await signInWithPopup(auth, provider);
  setSessionExpiry(); // immediately, before any awaits
  const existing = await getDoc(userDoc(userCred.user.uid));
  let profile: UserProfile;
  if (existing.exists()) {
    profile = toUserProfile(userCred.user.uid, existing.data()!);
  } else {
    profile = await createUserProfile(userCred.user, {
      firstName: userCred.user.displayName?.split(" ")[0] ?? "",
      lastName: userCred.user.displayName?.split(" ").slice(1).join(" ") ?? "",
      position: "",
      isFirstUser: false,
      roles: ["staff"],
      status: "pending",
    });
  }
  logActivity("LOGIN", userCred.user.uid, { email: userCred.user.email ?? "", method: "google" });
  return profile;
}

export async function registerWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  position: string
): Promise<UserProfile> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  setSessionExpiry(); // immediately, before any awaits
  const profile = await createUserProfile(userCred.user, {
    firstName,
    lastName,
    position,
    isFirstUser: false,
    roles: ["staff"],
    status: "pending",
  });
  logActivity("REGISTER", userCred.user.uid, { email });
  return profile;
}

export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(userDoc(uid));
    if (!snap.exists()) return null;
    return toUserProfile(uid, snap.data()!);
  } catch {
    return null;
  }
}

/**
 * Real-time subscription to user profile. เมื่อแอดมินอัปเดตสิทธิ์ จะได้ profile ใหม่ทันที
 */
export function subscribeToProfile(uid: string, onProfile: (profile: UserProfile | null) => void): () => void {
  if (!db) return () => {};
  const ref = userDoc(uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      try {
        onProfile(toUserProfile(uid, snap.data()!));
      } catch {
        onProfile(null);
      }
    },
    () => onProfile(null)
  );
}

export function logout(): Promise<void> {
  clearSession();
  if (!auth) return Promise.resolve();
  return fbSignOut(auth);
}
