import type { Timestamp } from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserRole } from "./constants";

export type UserProfileStatus = "pending" | "approved" | "rejected";

export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  /** User can have multiple roles */
  roles: UserRole[];
  status: UserProfileStatus;
  assignedProjects: string[];
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  photoURL?: string;
  isFirstUser: boolean;
}

export interface AppMetaConfig {
  firstUserRegistered: boolean;
  totalUsers: number;
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
}

export type { FirebaseUser };
