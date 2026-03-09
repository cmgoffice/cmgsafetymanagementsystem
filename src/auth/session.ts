import { SESSION_EXPIRY_KEY, SESSION_DURATION_MS } from "./constants";

/**
 * Call IMMEDIATELY after sign-in (before any awaits) to avoid race with onAuthStateChanged.
 */
export function setSessionExpiry(): void {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  try {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
  } catch {
    // ignore
  }
}

export function isSessionExpired(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (!raw) return true;
    const expiresAt = parseInt(raw, 10);
    return Date.now() >= expiresAt;
  } catch {
    return true;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch {
    // ignore
  }
}

/** Remaining minutes (for countdown). Returns 0 if expired. */
export function getRemainingMinutes(): number {
  try {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (!raw) return 0;
    const expiresAt = parseInt(raw, 10);
    const remaining = Math.max(0, expiresAt - Date.now());
    return Math.floor(remaining / 60000);
  } catch {
    return 0;
  }
}
