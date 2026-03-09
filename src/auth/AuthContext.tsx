import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { fetchProfile, logout as authLogout } from "./authService";
import { getRemainingMinutes, isSessionExpired, clearSession } from "./session";
import type { FirebaseUser, UserProfile } from "./types";

export interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  sessionMinutesLeft: number;
  refreshProfile: (uid?: string) => Promise<void>;
  /** ใส่โปรไฟล์จากผล login/register โดยตรง (แก้ race กับ onAuthStateChanged) */
  setProfileFromLogin: (profile: UserProfile) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMinutesLeft, setSessionMinutesLeft] = useState(getRemainingMinutes());

  const setProfileFromLogin = useCallback((profile: UserProfile) => {
    setUserProfile(profile);
  }, []);

  const refreshProfile = useCallback(async (uid?: string) => {
    const id = uid ?? firebaseUser?.uid;
    if (!id) return;
    const profile = await fetchProfile(id);
    setUserProfile(profile);
  }, [firebaseUser?.uid]);

  const logout = useCallback(async () => {
    clearSession();
    await authLogout();
    setFirebaseUser(null);
    setUserProfile(null);
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await fetchProfile(user.uid);
        setUserProfile(profile);
      } catch {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Session expiry check every 60s; do NOT force-logout inside onAuthStateChanged
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionMinutesLeft(getRemainingMinutes());
      if (isSessionExpired() && auth?.currentUser) {
        clearSession();
        authLogout().then(() => {
          setFirebaseUser(null);
          setUserProfile(null);
        }).catch(() => {});
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const value: AuthContextValue = {
    firebaseUser,
    userProfile,
    loading,
    sessionMinutesLeft,
    refreshProfile,
    setProfileFromLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
