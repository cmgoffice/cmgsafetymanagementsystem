/** Firestore root collection name (same as existing app) */
export const APP_NAME = "CMG-Tool-Store-Management";

/** Session localStorage key */
export const SESSION_EXPIRY_KEY = "cmg_session_expires";

/** Session duration in milliseconds (1 hour) */
export const SESSION_DURATION_MS = 60 * 60 * 1000;

/**
 * Roles: 1 user can have multiple roles.
 * SuperAdmin, Admin for admin panel; rest from existing CMG Safety system.
 */
export const USER_ROLES = [
  "SuperAdmin",
  "Admin",
  "staff",
  "site_mgr",
  "cm",
  "cmg_mgr",
  "exec",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SuperAdmin: "Super Admin",
  Admin: "Admin",
  staff: "Safety Staff",
  site_mgr: "Site Safety Manager",
  cm: "Construction Manager (CM)",
  cmg_mgr: "CMG Safety Manager",
  exec: "PM/PD/GM/MD",
};
