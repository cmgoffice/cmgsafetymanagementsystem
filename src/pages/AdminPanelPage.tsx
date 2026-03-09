import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME, USER_ROLE_LABELS } from "../auth/constants";
import type { UserRole } from "../auth/constants";
import type { UserProfile } from "../auth/types";
import { ShieldCheck } from "lucide-react";

const FONT = { fontFamily: "'Sarabun', sans-serif" };

export function AdminPanelPage() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<(UserProfile & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const ref = collection(doc(db, APP_NAME, "root"), "users");
    getDocs(ref)
      .then((snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as UserProfile & { id: string }));
        setUsers(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (uid: string, status: "pending" | "approved" | "rejected") => {
    if (!db) return;
    const ref = doc(db, APP_NAME, "root", "users", uid);
    await updateDoc(ref, { status });
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, status } : u)));
  };

  const toggleRole = async (uid: string, role: UserRole, hasRole: boolean) => {
    if (!db) return;
    const u = users.find((x) => x.uid === uid);
    if (!u) return;
    const roles = hasRole ? (u.roles || []).filter((r) => r !== role) : [...(u.roles || []), role];
    const ref = doc(db, APP_NAME, "root", "users", uid);
    await updateDoc(ref, { roles });
    setUsers((prev) => prev.map((x) => (x.uid === uid ? { ...x, roles } : x)));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6" style={FONT}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">แผงผู้ดูแลระบบ</h1>
        </div>

        {loading ? (
          <p className="text-gray-500">กำลังโหลด...</p>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-700">อีเมล / ชื่อ</th>
                  <th className="px-4 py-3 font-medium text-gray-700">สถานะ</th>
                  <th className="px-4 py-3 font-medium text-gray-700">บทบาท</th>
                  <th className="px-4 py-3 font-medium text-gray-700">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>{u.email}</div>
                      <div className="text-gray-500 text-xs">{u.firstName} {u.lastName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        u.status === "approved" ? "bg-green-100 text-green-800" :
                        u.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {u.status === "approved" ? "อนุมัติ" : u.status === "rejected" ? "ปฏิเสธ" : "รออนุมัติ"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((role) => {
                          const has = (u.roles || []).includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => toggleRole(u.uid, role, has)}
                              className={`px-2 py-0.5 rounded text-xs ${has ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-500"}`}
                            >
                              {USER_ROLE_LABELS[role]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.status !== "approved" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(u.uid, "approved")}
                          className="text-green-600 hover:underline text-xs mr-2"
                        >
                          อนุมัติ
                        </button>
                      )}
                      {u.status !== "rejected" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(u.uid, "rejected")}
                          className="text-red-600 hover:underline text-xs"
                        >
                          ปฏิเสธ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
