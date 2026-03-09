import React from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Clock } from "lucide-react";

const FONT = { fontFamily: "'Sarabun', sans-serif" };

export function PendingApprovalPage() {
  const { userProfile, firebaseUser, logout } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (userProfile?.status === "approved") {
      navigate("/dashboard", { replace: true });
    }
  }, [userProfile?.status, navigate]);

  if (!firebaseUser) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4" style={FONT}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="inline-flex p-4 rounded-full bg-amber-100 mb-4">
          <Clock className="w-12 h-12 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">รอการอนุมัติ</h1>
        <p className="text-gray-600 mb-6">
          บัญชีของคุณกำลังรอให้ผู้ดูแลระบบอนุมัติ คุณจะสามารถใช้งานระบบได้เมื่อได้รับการอนุมัติ
        </p>
        <p className="text-sm text-gray-500 mb-6">
          {userProfile?.email}
        </p>
        <button
          type="button"
          onClick={() => logout().then(() => navigate("/login", { replace: true }))}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}
