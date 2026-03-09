import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME, USER_ROLE_LABELS } from "../auth/constants";
import type { UserRole } from "../auth/constants";
import type { UserProfile } from "../auth/types";
import { ShieldCheck, Users, Clock, CheckCircle, XCircle, ChevronDown } from "lucide-react";

const FONT = { fontFamily: "'Sarabun', sans-serif" };

type StatusFilter = "all" | "pending" | "approved" | "rejected";

type ProjectOption = { projectNo: string; projectName: string };

export function AdminPanelPage() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<(UserProfile & { id: string })[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rolePopupUid, setRolePopupUid] = useState<string | null>(null);
  const [projectPopupUid, setProjectPopupUid] = useState<string | null>(null);
  const rolePopupRef = useRef<HTMLDivElement>(null);
  const projectPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db) return;
    const usersRef = collection(doc(db, APP_NAME, "root"), "users");
    getDocs(usersRef)
      .then((snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as UserProfile & { id: string }));
        setUsers(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!db) return;
    const projectsRef = collection(doc(db, APP_NAME, "root"), "projects");
    getDocs(projectsRef)
      .then((snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return { projectNo: String(data?.projectNo ?? ""), projectName: String(data?.projectName ?? "") };
        }).filter((p) => p.projectNo);
        setProjects(list);
      })
      .catch(console.error);
  }, []);

  const pendingUsers = useMemo(() => users.filter((u) => u.status === "pending"), [users]);
  const approvedUsers = useMemo(() => users.filter((u) => u.status === "approved"), [users]);
  const rejectedUsers = useMemo(() => users.filter((u) => u.status === "rejected"), [users]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === "all") return users;
    if (statusFilter === "pending") return pendingUsers;
    if (statusFilter === "approved") return approvedUsers;
    return rejectedUsers;
  }, [users, statusFilter, pendingUsers, approvedUsers, rejectedUsers]);

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

  const toggleProject = async (uid: string, projectNo: string, add: boolean) => {
    if (!db) return;
    const u = users.find((x) => x.uid === uid);
    if (!u) return;
    const current = u.assignedProjects || [];
    const assignedProjects = add
      ? (current.includes(projectNo) ? current : [...current, projectNo])
      : current.filter((p) => p !== projectNo);
    const ref = doc(db, APP_NAME, "root", "users", uid);
    await updateDoc(ref, { assignedProjects });
    setUsers((prev) => prev.map((x) => (x.uid === uid ? { ...x, assignedProjects } : x)));
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rolePopupRef.current && !rolePopupRef.current.contains(e.target as Node)) {
        setRolePopupUid(null);
      }
      if (projectPopupRef.current && !projectPopupRef.current.contains(e.target as Node)) {
        setProjectPopupUid(null);
      }
    };
    if (rolePopupUid || projectPopupUid) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [rolePopupUid, projectPopupUid]);

  const roleLabelsList = Object.keys(USER_ROLE_LABELS) as UserRole[];

  return (
    <div className="min-h-screen bg-gray-100 p-4" style={FONT}>
      <div className="w-full max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้</h1>
          </div>
          <Link
            to="/dashboard"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            ← กลับไป Dashboard
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-500">กำลังโหลด...</p>
        ) : (
          <>
            {/* รายการรออนุมัติ - แสดงของทุกคน */}
            <section className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                รายการรออนุมัติ ({pendingUsers.length} คน)
              </h2>
              {pendingUsers.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-gray-500 text-sm">
                  ไม่มีผู้ใช้รออนุมัติ
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <ul className="divide-y divide-amber-100">
                    {pendingUsers.map((u) => (
                      <li key={u.uid} className="px-4 py-3 flex items-center justify-between hover:bg-amber-100/50">
                        <div>
                          <span className="font-medium text-gray-900">{u.email}</span>
                          <span className="text-gray-500 text-sm ml-2">
                            {u.firstName} {u.lastName}
                            {u.position ? ` · ${u.position}` : ""}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateStatus(u.uid, "approved")}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                          >
                            อนุมัติ
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(u.uid, "rejected")}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* สรุปสถานะ */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`p-3 rounded-xl text-left transition ${statusFilter === "all" ? "bg-blue-100 border-2 border-blue-400" : "bg-white border border-gray-200 hover:border-gray-300"}`}
              >
                <Users className="w-5 h-5 text-gray-600 mb-1" />
                <div className="text-lg font-bold text-gray-900">{users.length}</div>
                <div className="text-xs text-gray-500">ทั้งหมด</div>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("approved")}
                className={`p-3 rounded-xl text-left transition ${statusFilter === "approved" ? "bg-green-100 border-2 border-green-400" : "bg-white border border-gray-200 hover:border-gray-300"}`}
              >
                <CheckCircle className="w-5 h-5 text-green-600 mb-1" />
                <div className="text-lg font-bold text-gray-900">{approvedUsers.length}</div>
                <div className="text-xs text-gray-500">อนุมัติแล้ว</div>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("rejected")}
                className={`p-3 rounded-xl text-left transition ${statusFilter === "rejected" ? "bg-red-100 border-2 border-red-400" : "bg-white border border-gray-200 hover:border-gray-300"}`}
              >
                <XCircle className="w-5 h-5 text-red-600 mb-1" />
                <div className="text-lg font-bold text-gray-900">{rejectedUsers.length}</div>
                <div className="text-xs text-gray-500">ปฏิเสธแล้ว</div>
              </button>
            </div>

            {/* ตารางผู้ใช้ทั้งหมด (ตาม filter) - overflow-visible เพื่อให้ป๊อปอัปบทบาท/โครงการไม่ถูกตัด */}
            <div className="bg-white rounded-xl shadow overflow-visible">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">แสดง:</span>
                {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1 rounded-lg text-sm ${statusFilter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {f === "all" ? "ทั้งหมด" : f === "pending" ? "รออนุมัติ" : f === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}
                  </button>
                ))}
              </div>
              <table className="w-full text-left text-sm table-fixed">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-[24%] px-2 py-2 font-medium text-gray-700 text-xs">อีเมล / ชื่อ</th>
                    <th className="w-[10%] px-2 py-2 font-medium text-gray-700 text-xs">สถานะ</th>
                    <th className="w-[20%] px-2 py-2 font-medium text-gray-700 text-xs">บทบาท</th>
                    <th className="w-[24%] px-2 py-2 font-medium text-gray-700 text-xs">โครงการที่ให้สิทธิ์</th>
                    <th className="w-[22%] px-2 py-2 font-medium text-gray-700 text-xs">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-2 align-middle">
                        <div className="truncate text-xs" title={u.email}>{u.email}</div>
                        <div className="text-gray-500 text-xs truncate">{u.firstName} {u.lastName}</div>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs whitespace-nowrap ${
                          u.status === "approved" ? "bg-green-100 text-green-800" :
                          u.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {u.status === "approved" ? "อนุมัติ" : u.status === "rejected" ? "ปฏิเสธ" : "รออนุมัติ"}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-middle relative">
                        <div ref={rolePopupUid === u.uid ? rolePopupRef : undefined} className="relative">
                        <button
                          type="button"
                          onClick={() => setRolePopupUid((prev) => (prev === u.uid ? null : u.uid))}
                          className="w-full text-left flex items-center justify-between gap-1 px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs text-gray-700"
                        >
                          <span className="truncate">
                            {(u.roles || []).length > 0
                              ? (u.roles || []).map((r) => USER_ROLE_LABELS[r]).join(", ")
                              : "เลือกบทบาท"}
                          </span>
                          <ChevronDown size={12} className="flex-shrink-0 text-gray-400" />
                        </button>
                        {rolePopupUid === u.uid && (
                          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] max-w-[240px] bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-56 overflow-y-auto">
                            <div className="px-3 py-1 text-xs font-medium text-gray-500 border-b border-gray-100 mb-1">เลือกบทบาท</div>
                            {roleLabelsList.map((role) => {
                              const has = (u.roles || []).includes(role);
                              return (
                                <label key={role} className="flex items-center gap-2 cursor-pointer text-xs hover:bg-gray-50 px-3 py-1.5">
                                  <input
                                    type="checkbox"
                                    checked={has}
                                    onChange={() => toggleRole(u.uid, role, has)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-gray-700">{USER_ROLE_LABELS[role]}</span>
                                </label>
                              );
                            })}
                            <div className="border-t border-gray-100 mt-1 pt-1 px-3">
                              <button
                                type="button"
                                onClick={() => setRolePopupUid(null)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                ปิด
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-middle relative">
                        <div ref={projectPopupUid === u.uid ? projectPopupRef : undefined} className="relative">
                        <button
                          type="button"
                          onClick={() => setProjectPopupUid((prev) => (prev === u.uid ? null : u.uid))}
                          className="w-full text-left flex items-center justify-between gap-1 px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs text-gray-700"
                        >
                          <span className="truncate">
                            {(u.assignedProjects || []).length > 0
                              ? (u.assignedProjects || [])
                                  .map((no) => projects.find((p) => p.projectNo === no)?.projectName || no)
                                  .join(", ")
                              : "เลือกโครงการ"}
                          </span>
                          <ChevronDown size={12} className="flex-shrink-0 text-gray-400" />
                        </button>
                        {projectPopupUid === u.uid && (
                          <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] max-w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-56 overflow-y-auto">
                            <div className="px-3 py-1 text-xs font-medium text-gray-500 border-b border-gray-100 mb-1">
                              โครงการที่ User ใช้งาน/มองเห็นได้
                            </div>
                            {projects.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-gray-500">ยังไม่มีโครงการในระบบ</div>
                            ) : (
                              projects.map((p) => {
                                const has = (u.assignedProjects || []).includes(p.projectNo);
                                return (
                                  <label
                                    key={p.projectNo}
                                    className="flex items-center gap-2 cursor-pointer text-xs hover:bg-gray-50 px-3 py-1.5"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={has}
                                      onChange={() => toggleProject(u.uid, p.projectNo, !has)}
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-700">
                                      {p.projectNo} {p.projectName ? `· ${p.projectName}` : ""}
                                    </span>
                                  </label>
                                );
                              })
                            )}
                            <div className="border-t border-gray-100 mt-1 pt-1 px-3">
                              <button
                                type="button"
                                onClick={() => setProjectPopupUid(null)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                ปิด
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        {u.status !== "approved" && (
                          <button
                            type="button"
                            onClick={() => updateStatus(u.uid, "approved")}
                            className="text-green-600 hover:underline text-xs mr-1"
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
              {filteredUsers.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500">ไม่มีรายการในหมวดนี้</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
