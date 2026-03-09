import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { AdminPanelPage } from "./pages/AdminPanelPage";
import App from "./App";

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending" element={<PendingApprovalPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute requireApproved={true}>
              <App />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requireApproved={true} requireRoles={["MasterAdmin", "SuperAdmin", "Admin"]}>
              <AdminPanelPage />
            </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
