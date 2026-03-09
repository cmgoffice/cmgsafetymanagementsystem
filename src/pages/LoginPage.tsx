import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loginWithEmail, loginWithGoogle } from "../auth/authService";
import { ShieldCheck } from "lucide-react";

const FONT = { fontFamily: "'Sarabun', sans-serif" };

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile, setProfileFromLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  useEffect(() => {
    if (!userProfile) return;
    if (userProfile.status === "rejected") {
      setError("บัญชีนี้ถูกปฏิเสธการใช้งาน");
      return;
    }
    if (userProfile.status === "pending") {
      navigate("/pending", { replace: true });
      return;
    }
    if (userProfile.status === "approved") {
      navigate(from, { replace: true });
    }
  }, [userProfile, navigate, from]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const profile = await loginWithEmail(email, password);
      setProfileFromLogin(profile);
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code;
      if (msg === "auth/invalid-credential" || msg === "auth/wrong-password" || msg === "auth/user-not-found") {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const profile = await loginWithGoogle();
      setProfileFromLogin(profile);
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code;
      if (msg === "auth/popup-closed-by-user") {
        setError("ยกเลิกการเข้าสู่ระบบ");
      } else if (msg === "auth/unauthorized-domain") {
        setError("โดเมนนี้ยังไม่ได้รับอนุญาต");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4" style={FONT}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-10 h-10 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">CMG Safety</h1>
            <p className="text-sm text-gray-500">Site Safety Management System</p>
          </div>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">เข้าสู่ระบบ</h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <span className="flex-1 h-px bg-gray-200" />
          <span className="text-sm text-gray-500">หรือ</span>
          <span className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          เข้าสู่ระบบด้วย Google
        </button>

        <p className="mt-6 text-center text-sm text-gray-500">
          ยังไม่มีบัญชี?{" "}
          <Link to="/register" className="text-blue-600 hover:underline">สมัครสมาชิก</Link>
        </p>
      </div>
    </div>
  );
}
