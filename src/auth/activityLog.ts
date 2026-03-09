import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { APP_NAME } from "./constants";

type LogAction = "REGISTER" | "LOGIN";

/**
 * Non-blocking activity log. Never let log failure block auth flow.
 */
export function logActivity(
  action: LogAction,
  uid: string,
  extra?: { email?: string; method?: string }
): void {
  if (!db) return;
  const ref = doc(db, APP_NAME, "root", "activityLogs", `${action}_${Date.now()}_${uid}`);
  setDoc(ref, {
    action,
    uid,
    ...extra,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
