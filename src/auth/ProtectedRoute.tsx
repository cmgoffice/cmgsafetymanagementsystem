import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { UserRole } from "./constants";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireApproved?: boolean;
  requireRoles?: UserRole[];
}

export function ProtectedRoute({
  children,
  requireApproved = true,
  requireRoles,
}: ProtectedRouteProps) {
  const { firebaseUser, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100" style={{ fontFamily: "'Sarabun', sans-serif" }}>
        <div className="text-gray-500">กำลังโหลด...</div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (firebaseUser && userProfile === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100" style={{ fontFamily: "'Sarabun', sans-serif" }}>
        <div className="text-gray-500">กำลังโหลดโปรไฟล์...</div>
      </div>
    );
  }

  if (!userProfile) return null;

  if (userProfile.status === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (userProfile.status === "rejected") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireApproved && userProfile.status !== "approved") {
    return <Navigate to="/pending" replace />;
  }

  if (requireRoles && requireRoles.length > 0) {
    const hasRole = requireRoles.some((r) => userProfile.roles?.includes(r));
    if (!hasRole) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
