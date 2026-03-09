import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useFirestoreCollection } from "./useFirestore";
import { seedToFirebase } from "./seedFirebase";
import { collection, doc, getDocs } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { useAuth } from "./auth/AuthContext";
import { APP_NAME } from "./auth/constants";
import {
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  Camera,
  ChevronRight,
  ShieldCheck,
  Eye,
  Clock,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Menu,
  Building2,
  HardHat,
  Wind,
  Download,
  Upload,
  FileDown,
  ClipboardCheck,
  Settings,
  Columns,
  ChevronDown,
} from "lucide-react";

// --- TYPES ---

type ChecklistStatus = "pass" | "warn" | "fail";
type ChecklistMap = { [key: number]: ChecklistStatus };
type HistoryEntry = { role: string; action: string; time: string };

/** รูปภาพอัปโหลดต่อรายการ 2.4 (ไม่บังคับ สูงสุด 5 รูปต่อรายการ) */
type ChecklistImagesMap = { [itemId: number]: string[] };

type Report = {
  id: number;
  project: string;
  /** เลขที่เอกสาร รูปแบบ รหัสโครงการ-DailyReport-XXX เช่น J-74-DailyReport-001 */
  docNo?: string;
  date: string;
  staffName: string;
  toolboxTopic: string;
  workerCount: number | string;
  training: string;
  accident: string;
  checklist: ChecklistMap;
  /** รูปภาพแนบต่อรายการการตรวจความปลอดภัยประจำวัน */
  checklistImages?: ChecklistImagesMap;
  status: string;
  history: HistoryEntry[];
  acknowledgedByExecs: string[];
};

type Role = { id: string; label: string; level: number };
type User = { role: Role; project: string; name: string };

type SafetyPerson = {
  id: number;
  safetyName: string;
  scopeType: string;
  startWork: string;
  finishWork: string;
  workPattern: string;
  note: string;
};

type Project = {
  id: number;
  projectNo: string;
  projectName: string;
  location: string;
  projectManager: string;
  constructionManager: string;
  projectStart: string;
  projectFinish: string;
  mainContractor: string;
  subContractor: string;
  clientName: string;
  projectNote: string;
  safetyPersons: SafetyPerson[];
};

type AuditFinding = { id: number; category: string; description: string; severity: "low" | "medium" | "high"; status: "open" | "closed" };

type SiteAudit = {
  id: number;
  project: string;
  auditDate: string;
  auditor: string;
  auditType: string;
  location: string;
  summary: string;
  findings: AuditFinding[];
  overallResult: "pass" | "fail" | "conditional";
  createdAt: number;
};

type TrainingRecord = {
  date: string;
  institute: string;
  cer: string;
};

type CraneTrainee = {
  id: number;
  fullName: string;
  company: string;
  position: string;
  type: string;
  status: string;
  project: string;
  course: string;
  lastTrainDate: string;
  institute: string;
  cer: string;
  round1: TrainingRecord;
  round2: TrainingRecord;
  round3: TrainingRecord;
  remark: string;
  checkDate: string;
};

type ConfinedSpaceTrainee = {
  id: number;
  fullName: string;
  company: string;
  position: string;
  type: string;
  status: string;
  project: string;
  course: string;
  lastTrainDate: string;
  institute: string;
  cer: string;
  renewal3yr: TrainingRecord;
  remark: string;
  checkDate: string;
};

type TrainingSignIn = {
  id: number;
  regDate: string;
  timeSlot: string;
  seq: number;
  fullName1: string;
  dept1: string;
  position1: string;
  company1: string;
  link1: string;
  link2: string;
  totalCount: number;
  fullName2: string;
  dept2: string;
  company2: string;
  link3: string;
  link4: string;
  remark: string;
};

type SidebarSection = "projects" | "daily-report" | "site-audit" | "crane-register" | "confined-space-register" | "training-signin";

// --- MOCK DATA & CONSTANTS ---

const ROLES = {
  STAFF: { id: "staff", label: "Safety Staff", level: 1 },
  SITE_MGR: { id: "site_mgr", label: "Site Safety Manager", level: 2 },
  CM: { id: "cm", label: "Construction Manager (CM)", level: 3 },
  CMG_MGR: { id: "cmg_mgr", label: "CMG Safety Manager", level: 4 },
  EXEC: { id: "exec", label: "PM/PD/GM/MD", level: 5 },
};

const WORKFLOW_ROLE_IDS = ["staff", "site_mgr", "cm", "cmg_mgr", "exec"] as const;
const ROLE_LIST = Object.values(ROLES);

const CHECKLIST_ITEMS = [
  { id: 1, category: "PPE", text: "การสวมใส่อุปกรณ์ป้องกันภัยส่วนบุคคล (หมวก, รองเท้า, เสื้อ)" },
  { id: 2, category: "Working at Height", text: "ความปลอดภัยการทำงานบนที่สูง (นั่งร้าน, ราวกันตก)" },
  { id: 3, category: "Electrical", text: "ระบบไฟฟ้าและตู้ควบคุมไฟ" },
  { id: 4, category: "Machinery", text: "สภาพความพร้อมของเครื่องจักรและรถเครน" },
  { id: 5, category: "Housekeeping", text: "ความสะอาดและความเป็นระเบียบในพื้นที่" },
  { id: 6, category: "Fire Safety", text: "อุปกรณ์ดับเพลิงและทางหนีไฟ" },
];

const INITIAL_PROJECTS: Project[] = [
  {
    id: 1,
    projectNo: "J-01",
    projectName: "อาคารสำนักงานใหญ่ A",
    location: "กรุงเทพมหานคร",
    projectManager: "นายสมศักดิ์ วงศ์ใหญ่",
    constructionManager: "นายประเสริฐ ดีงาม",
    projectStart: "2023-01-01",
    projectFinish: "2024-12-31",
    mainContractor: "บริษัท ก่อสร้างไทย จำกัด",
    subContractor: "บริษัท ระบบไฟฟ้า จำกัด",
    clientName: "บริษัท ลูกค้า ABC จำกัด",
    projectNote: "โครงการก่อสร้างอาคารสำนักงาน 20 ชั้น",
    safetyPersons: [
      { id: 1, safetyName: "สมชาย ใจดี", scopeType: "Safety Officer", startWork: "2023-01-01", finishWork: "2024-12-31", workPattern: "OT", note: "" },
    ],
  },
  {
    id: 2,
    projectNo: "J-02",
    projectName: "คลังสินค้าโลจิสติกส์ B",
    location: "สมุทรปราการ",
    projectManager: "นางสาวมาลี รักดี",
    constructionManager: "นายชัยชนะ เก่งงาน",
    projectStart: "2023-06-01",
    projectFinish: "2024-06-30",
    mainContractor: "บริษัท โครงสร้างเหล็ก จำกัด",
    subContractor: "-",
    clientName: "บริษัท โลจิสติกส์ XYZ จำกัด",
    projectNote: "",
    safetyPersons: [],
  },
  {
    id: 3,
    projectNo: "J-03",
    projectName: "โรงงานผลิต C",
    location: "ระยอง",
    projectManager: "นายวิชัย สุขใจ",
    constructionManager: "นายธนากร มั่งมี",
    projectStart: "2024-01-01",
    projectFinish: "2025-03-31",
    mainContractor: "บริษัท อุตสาหกรรมสร้าง จำกัด",
    subContractor: "บริษัท งานระบบ จำกัด",
    clientName: "บริษัท โรงงาน DEF จำกัด",
    projectNote: "โรงงานผลิตชิ้นส่วนอิเล็กทรอนิกส์",
    safetyPersons: [],
  },
];

/** คืนค่าเลขที่เอกสารสำหรับแสดง (รองรับรายงานเก่าที่ไม่มี docNo) */
function getReportDocNo(report: Report): string {
  if (report.docNo) return report.docNo;
  const prefix = `${report.project}-DailyReport-`;
  const num = String(report.id).slice(-3).padStart(3, "0");
  return `${prefix}${num}`;
}

/** คืนค่า Doc No. ถัดไปของโครงการ เช่น J-74-DailyReport-001 */
function getNextDailyReportDocNo(projectCode: string, existingReports: Report[]): string {
  const prefix = `${projectCode}-DailyReport-`;
  const sameProject = existingReports.filter((r) => r.project === projectCode);
  let maxNum = 0;
  for (const r of sameProject) {
    if (r.docNo && r.docNo.startsWith(prefix)) {
      const numStr = r.docNo.slice(prefix.length);
      const n = parseInt(numStr, 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

const INITIAL_REPORTS: Report[] = [
  {
    id: 101,
    project: "J-01",
    docNo: "J-01-DailyReport-001",
    date: "2023-10-25",
    staffName: "สมชาย ใจดี",
    toolboxTopic: "การทำงานในที่อับอากาศ",
    workerCount: 45,
    training: "ไม่มี",
    accident: "ไม่มี",
    checklist: { 1: "pass", 2: "pass", 3: "warn", 4: "pass", 5: "pass", 6: "pass" },
    status: "APPROVED",
    history: [
      { role: "Safety Staff", action: "ส่งรายงาน", time: "08:00" },
      { role: "Site Safety Manager", action: "รับทราบ", time: "09:00" },
      { role: "CM", action: "รับทราบ", time: "10:00" },
      { role: "CMG Safety Manager", action: "อนุมัติ", time: "11:00" },
    ],
    acknowledgedByExecs: [],
  },
];

const INITIAL_AUDITS: SiteAudit[] = [
  {
    id: 1001,
    project: "J-01",
    auditDate: "2023-10-20",
    auditor: "นายตรวจ ความปลอดภัย",
    auditType: "Monthly Safety Audit",
    location: "Zone A - ชั้น 5-10",
    summary: "พบข้อบกพร่องเล็กน้อยด้านการใช้ PPE",
    findings: [
      { id: 1, category: "PPE", description: "พนักงาน 3 คนไม่สวมหมวกนิรภัย", severity: "medium", status: "open" },
      { id: 2, category: "Housekeeping", description: "วัสดุก่อสร้างวางกีดขวางทางหนีไฟ", severity: "high", status: "open" },
    ],
    overallResult: "conditional",
    createdAt: 1697760000000,
  },
];

const EMPTY_TRAINING_RECORD: TrainingRecord = { date: "", institute: "", cer: "" };

const INITIAL_CRANE_TRAINEES: CraneTrainee[] = [
  {
    id: 1, fullName: "นายสมชาย ใจดี", company: "บริษัท ก่อสร้างไทย", position: "Rigger", type: "ปั้นจั่นเหนือเมียง", status: "ปฏิบัติงาน",
    project: "J-01", course: "Crane Operator", lastTrainDate: "2023-05-15", institute: "Direction Training", cer: "CR-001",
    round1: { date: "2021-05-15", institute: "Direction Training", cer: "CR-001-1" },
    round2: { date: "2023-05-15", institute: "Direction Training", cer: "CR-001-2" },
    round3: EMPTY_TRAINING_RECORD,
    remark: "", checkDate: "2024-01-10",
  },
];

const INITIAL_CONFINED_TRAINEES: ConfinedSpaceTrainee[] = [
  {
    id: 1, fullName: "นายวิชัย สุขใจ", company: "บริษัท โครงสร้างเหล็ก", position: "Supervisor", type: "ทำงานอยู่", status: "ปฏิบัติงาน",
    project: "J-02", course: "Confined Space Safety", lastTrainDate: "2022-11-05", institute: "Direction Training", cer: "CS-001",
    renewal3yr: { date: "2025-11-05", institute: "", cer: "" },
    remark: "", checkDate: "2024-01-10",
  },
];

const INITIAL_TRAINING_SIGNINS: TrainingSignIn[] = [
  {
    id: 1, regDate: "2024-01-15", timeSlot: "08:00 am - 18:00 pm", seq: 1,
    fullName1: "นายสมชาย ใจดี", dept1: "1 บท", position1: "Engineer", company1: "CMG",
    link1: "", link2: "", totalCount: 10,
    fullName2: "นางสาวสมหญิง มีสุข", dept2: "ช่วยเหลือ", company2: "CMG",
    link3: "", link4: "", remark: "",
  },
];

// --- MAIN APP ---

export default function App() {
  const { userProfile, logout, sessionMinutesLeft } = useAuth();
  const navigate = useNavigate();

  // บทบาทที่ฝังใน User (จากแอดมิน) — มีสิทธิ์บทบาทใดก็ใช้ได้เลย ไม่ต้องเลือกสลับ
  const workflowRoles = useMemo((): typeof WORKFLOW_ROLE_IDS[number][] => {
    const list = userProfile?.roles?.filter((r) => WORKFLOW_ROLE_IDS.includes(r as typeof WORKFLOW_ROLE_IDS[number])) ?? [];
    return Array.from(new Set(list)) as typeof WORKFLOW_ROLE_IDS[number][];
  }, [userProfile?.roles]);

  const hasWorkflowRole = (roleId: string) => workflowRoles.includes(roleId as typeof WORKFLOW_ROLE_IDS[number]);

  const currentUser = useMemo((): User => {
    if (!userProfile) return { role: ROLES.STAFF, project: "J-01", name: "User" };
    const role = ROLE_LIST.find((ro) => ro.id === workflowRoles[0]) ?? ROLES.STAFF;
    const project = userProfile.assignedProjects?.[0] ?? "J-01";
    const name = `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email;
    return { role, project, name };
  }, [userProfile, workflowRoles]);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SidebarSection>("daily-report");

  // Daily Report state — Firestore
  const { items: reports, loading: loadingReports, saveItem: saveReport, deleteItem: deleteReportFS } = useFirestoreCollection<Report>("reports", "id", "desc");
  const [reportView, setReportView] = useState<"list" | "create" | "detail">("list");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // Projects state — Firestore
  const { items: projects, loading: loadingProjects, saveItem: saveProjectFS, deleteItem: deleteProjectFS } = useFirestoreCollection<Project>("projects", "id", "asc");
  const [projectView, setProjectView] = useState<"list" | "form">("list");
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Site Audit state — Firestore
  const { items: audits, loading: loadingAudits, saveItem: saveAuditFS, deleteItem: deleteAuditFS } = useFirestoreCollection<SiteAudit>("audits", "createdAt", "desc");
  const [auditView, setAuditView] = useState<"list" | "form" | "detail">("list");
  const [selectedAudit, setSelectedAudit] = useState<SiteAudit | null>(null);
  const [editingAudit, setEditingAudit] = useState<SiteAudit | null>(null);

  // Crane register state — Firestore
  const { items: craneTrainees, loading: loadingCrane, saveItem: saveCraneFS, deleteItem: deleteCraneFS } = useFirestoreCollection<CraneTrainee>("craneTrainees", "id", "desc");
  const [craneView, setCraneView] = useState<"list" | "form">("list");
  const [editingCrane, setEditingCrane] = useState<CraneTrainee | null>(null);

  // Confined Space register state — Firestore
  const { items: confinedTrainees, loading: loadingConfined, saveItem: saveConfinedFS, deleteItem: deleteConfinedFS } = useFirestoreCollection<ConfinedSpaceTrainee>("confinedTrainees", "id", "desc");
  const [confinedView, setConfinedView] = useState<"list" | "form">("list");
  const [editingConfined, setEditingConfined] = useState<ConfinedSpaceTrainee | null>(null);

  // Training Sign-in state — Firestore
  const { items: trainingSignIns, loading: loadingSignIns, saveItem: saveSignInFS, deleteItem: deleteSignInFS } = useFirestoreCollection<TrainingSignIn>("trainingSignIns", "id", "desc");
  const [trainingSignInView, setTrainingSignInView] = useState<"list" | "form">("list");
  const [editingTrainingSignIn, setEditingTrainingSignIn] = useState<TrainingSignIn | null>(null);

  const anyLoading = loadingReports || loadingProjects || loadingAudits || loadingCrane || loadingConfined || loadingSignIns;

  // One-time seed mock data when DB is empty (shared for all users)
  const hasTriedSeed = useRef(false);
  useEffect(() => {
    if (!db || hasTriedSeed.current || loadingProjects || projects.length > 0) return;
    hasTriedSeed.current = true;
    seedToFirebase({
      projects: INITIAL_PROJECTS,
      reports: INITIAL_REPORTS,
      audits: INITIAL_AUDITS,
      craneTrainees: INITIAL_CRANE_TRAINEES,
      confinedTrainees: INITIAL_CONFINED_TRAINEES,
      trainingSignIns: INITIAL_TRAINING_SIGNINS,
    }).then((seeded) => {
      if (seeded) console.log("[App] Mock data seeded to Firebase.");
    });
  }, [loadingProjects, projects.length]);

  // โครงการที่ User มีสิทธิ์ (แอดมินจัดในแผงผู้ดูแล) — ไม่มี assignedProjects = เห็นทั้งหมด
  const displayProjects = useMemo(() => {
    const assigned = userProfile?.assignedProjects;
    if (assigned?.length) return projects.filter((p) => assigned.includes(p.projectNo));
    return projects;
  }, [projects, userProfile?.assignedProjects]);
  const projectCodes = displayProjects.map((p) => p.projectNo);

  // --- Daily Report handlers ---
  const allowedProjectCodes = useMemo(() => {
    const assigned = userProfile?.assignedProjects;
    if (assigned?.length) return assigned;
    return currentUser.project ? [currentUser.project] : [];
  }, [userProfile?.assignedProjects, currentUser.project]);

  const filteredReports = useMemo(() => {
    return reports
      .filter((r) => {
        if (workflowRoles.includes("staff") && allowedProjectCodes.includes(r.project)) return true;
        if (workflowRoles.includes("site_mgr") && allowedProjectCodes.includes(r.project)) return true;
        if (workflowRoles.includes("cm") && allowedProjectCodes.includes(r.project) && ["PENDING_CM", "PENDING_CMG_MGR", "APPROVED"].includes(r.status)) return true;
        if (workflowRoles.includes("cmg_mgr") && ["PENDING_CMG_MGR", "APPROVED"].includes(r.status)) return true;
        if (workflowRoles.includes("exec") && r.status === "APPROVED") return true;
        return false;
      })
      .sort((a, b) => b.id - a.id);
  }, [reports, workflowRoles, allowedProjectCodes]);

  const handleCreateReport = async (newReport: Omit<Report, "id" | "project" | "staffName" | "status" | "history" | "acknowledgedByExecs" | "docNo">) => {
    const report: Report = {
      ...newReport,
      id: Date.now(),
      project: currentUser.project,
      docNo: getNextDailyReportDocNo(currentUser.project, reports),
      staffName: currentUser.name,
      status: "PENDING_SITE_MGR",
      history: [{ role: "Safety Staff", action: "ส่งรายงาน", time: new Date().toLocaleTimeString("th-TH") }],
      acknowledgedByExecs: [],
    };
    await saveReport(report);
    setReportView("list");
  };

  const updateStatus = async (reportId: number, newStatus: string, actionLabel: string, roleLabel?: string) => {
    const r = reports.find((r) => r.id === reportId);
    if (!r) return;
    const role = roleLabel ?? ROLE_LIST.find((ro) => workflowRoles.includes(ro.id as typeof WORKFLOW_ROLE_IDS[number]))?.label ?? "User";
    const updated = { ...r, status: newStatus, history: [...r.history, { role, action: actionLabel, time: new Date().toLocaleTimeString("th-TH") }] };
    await saveReport(updated);
    setReportView("list");
  };

  const markAsSeen = async (reportId: number) => {
    const r = reports.find((r) => r.id === reportId);
    if (!r || r.acknowledgedByExecs.includes(currentUser.name)) return;
    await saveReport({ ...r, acknowledgedByExecs: [...r.acknowledgedByExecs, currentUser.name] });
  };

  // --- Project handlers ---
  const handleSaveProject = async (proj: Project) => {
    await saveProjectFS(proj.id === 0 ? { ...proj, id: Date.now() } : proj);
    setProjectView("list");
    setEditingProject(null);
  };

  const handleDeleteProject = async (id: number) => {
    if (window.confirm("ต้องการลบโครงการนี้หรือไม่?")) {
      await deleteProjectFS(id);
    }
  };

  // --- Audit handlers ---
  const handleSaveAudit = async (audit: SiteAudit) => {
    await saveAuditFS(audit.id === 0 ? { ...audit, id: Date.now(), createdAt: Date.now() } : audit);
    setAuditView("list");
    setEditingAudit(null);
  };

  const handleDeleteAudit = async (id: number) => {
    if (window.confirm("ต้องการลบรายการ Audit นี้หรือไม่?")) {
      await deleteAuditFS(id);
    }
  };

  // --- Crane register handlers ---
  const handleSaveCrane = async (trainee: CraneTrainee) => {
    await saveCraneFS(trainee.id === 0 ? { ...trainee, id: Date.now() } : trainee);
    setCraneView("list");
    setEditingCrane(null);
  };

  const handleDeleteCrane = async (id: number) => {
    if (window.confirm("ต้องการลบรายการนี้หรือไม่?")) {
      await deleteCraneFS(id);
    }
  };

  // --- Training Sign-in handlers ---
  const handleSaveTrainingSignIn = async (record: TrainingSignIn) => {
    await saveSignInFS(record.id === 0 ? { ...record, id: Date.now() } : record);
    setTrainingSignInView("list");
    setEditingTrainingSignIn(null);
  };

  const handleDeleteTrainingSignIn = async (id: number) => {
    if (window.confirm("ต้องการลบรายการนี้หรือไม่?")) {
      await deleteSignInFS(id);
    }
  };

  // --- Confined Space register handlers ---
  const handleSaveConfined = async (trainee: ConfinedSpaceTrainee) => {
    await saveConfinedFS(trainee.id === 0 ? { ...trainee, id: Date.now() } : trainee);
    setConfinedView("list");
    setEditingConfined(null);
  };

  const handleDeleteConfined = async (id: number) => {
    if (window.confirm("ต้องการลบรายการนี้หรือไม่?")) {
      await deleteConfinedFS(id);
    }
  };

  const navItems: { key: SidebarSection; label: string; icon: React.ReactNode }[] = [
    { key: "projects", label: "โครงการ / Projects", icon: <Building2 size={18} /> },
    { key: "daily-report", label: "Daily Report", icon: <ClipboardList size={18} /> },
    { key: "site-audit", label: "Site Audit Report", icon: <ShieldCheck size={18} /> },
    { key: "crane-register", label: "ทะเบียนผู้อบรมปั้นจั่น", icon: <HardHat size={18} /> },
    { key: "confined-space-register", label: "ทะเบียนผู้อบรมที่อับอากาศ", icon: <Wind size={18} /> },
    { key: "training-signin", label: "CMG-ใบลงชื่อเข้ารับการอบรม", icon: <ClipboardCheck size={18} /> },
  ];

  const isAdmin = userProfile?.roles?.some((r) => r === "MasterAdmin" || r === "SuperAdmin" || r === "Admin");
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  useEffect(() => {
    if (!db || !isAdmin) return;
    const ref = collection(doc(db, APP_NAME, "root"), "users");
    getDocs(ref)
      .then((snap) => {
        const count = snap.docs.filter((d) => d.data()?.status === "pending").length;
        setPendingApprovalCount(count);
      })
      .catch(() => {});
  }, [isAdmin]);

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800 flex flex-col">
      {!db && (
        <div className="bg-amber-500 text-black px-4 py-2 text-center text-sm">
          Firebase ไม่ได้เชื่อมต่อ — กรุณาตั้งค่า .env ให้มี REACT_APP_FIREBASE_* ครบ แล้ว restart (npm start)
        </div>
      )}
      {/* HEADER */}
      <header className="bg-blue-900 text-white px-4 py-3 shadow-lg sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-blue-800 transition">
            <Menu size={22} />
          </button>
          <ShieldCheck className="w-7 h-7 text-yellow-400" />
          <div>
            <h1 className="text-lg font-bold leading-none">CMG Safety</h1>
            <span className="text-xs text-blue-200">Site Safety Management System</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{currentUser.name}</div>
            <div className="text-xs text-yellow-300 flex items-center justify-end gap-1">
              <span>
                {workflowRoles.length > 0
                  ? workflowRoles.map((id) => ROLE_LIST.find((r) => r.id === id)?.label).filter(Boolean).join(", ")
                  : "—"}
              </span>
              {projectCodes.length > 0 && (
                <span> · {projectCodes.length === 1 ? projectCodes[0] : `${projectCodes.length} โครงการ`}</span>
              )}
            </div>
          </div>
          {sessionMinutesLeft > 0 && (
            <span className="text-xs text-blue-200 hidden sm:inline">เหลือ {sessionMinutesLeft} นาที</span>
          )}
          <button
            type="button"
            onClick={() => logout().then(() => navigate("/login", { replace: true }))}
            className="text-xs text-blue-200 hover:text-white px-2 py-1 rounded hover:bg-blue-800 transition"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`${sidebarOpen ? "w-60" : "w-0"} transition-all duration-300 overflow-hidden bg-white border-r border-gray-200 flex-shrink-0 flex flex-col`}>
          <nav className="p-3 flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-2 mt-2">เมนูหลัก</p>
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  setActiveSection(item.key);
                  setReportView("list");
                  setProjectView("list");
                  setAuditView("list");
                  setCraneView("list");
                  setConfinedView("list");
                  setTrainingSignInView("list");
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  activeSection === item.key
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            {isAdmin && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-2 mt-4">ผู้ดูแลระบบ</p>
                <Link
                  to="/admin"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                >
                  <Settings size={18} />
                  <span className="flex-1 text-left">แผงผู้ดูแล</span>
                  {pendingApprovalCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1.5 rounded-full flex items-center justify-center">
                      {pendingApprovalCount}
                    </span>
                  )}
                </Link>
              </>
            )}
          </nav>
          <div className="p-3 border-t border-gray-100">
            <div className="text-xs text-gray-400 text-center">v1.0.0 &copy; CMG Safety</div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-auto p-5 relative">
          {anyLoading && (
            <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-500 font-medium">กำลังโหลดข้อมูลจาก Firebase...</span>
              </div>
            </div>
          )}

          {/* ===== PROJECTS SECTION ===== */}
          {activeSection === "projects" && (
            <>
              {projectView === "list" && (
                <ProjectsList
                  projects={displayProjects}
                  onAdd={() => { setEditingProject(null); setProjectView("form"); }}
                  onEdit={(p) => { setEditingProject(p); setProjectView("form"); }}
                  onDelete={handleDeleteProject}
                />
              )}
              {projectView === "form" && (
                <ProjectForm
                  project={editingProject}
                  onCancel={() => { setProjectView("list"); setEditingProject(null); }}
                  onSave={handleSaveProject}
                />
              )}
            </>
          )}

          {/* ===== DAILY REPORT SECTION ===== */}
          {activeSection === "daily-report" && (
            <>
              {reportView === "list" && (
                <DailyReportList
                  reports={filteredReports}
                  currentUser={currentUser}
                  hasWorkflowRole={hasWorkflowRole}
                  onSelectReport={(r) => { setSelectedReport(r); setReportView("detail"); }}
                  onCreateReport={() => setReportView("create")}
                />
              )}
              {reportView === "create" && (
                <ReportForm
                  onCancel={() => setReportView("list")}
                  onSubmit={handleCreateReport}
                />
              )}
              {reportView === "detail" && selectedReport && (
                <ReportDetail
                  report={selectedReport}
                  currentUser={currentUser}
                  hasWorkflowRole={hasWorkflowRole}
                  onBack={() => { setSelectedReport(null); setReportView("list"); }}
                  onUpdateStatus={updateStatus}
                  onMarkSeen={markAsSeen}
                />
              )}
            </>
          )}

          {/* ===== SITE AUDIT SECTION ===== */}
          {activeSection === "site-audit" && (
            <>
              {auditView === "list" && (
                <SiteAuditList
                  audits={audits}
                  onAdd={() => { setEditingAudit(null); setAuditView("form"); }}
                  onView={(a) => { setSelectedAudit(a); setAuditView("detail"); }}
                  onEdit={(a) => { setEditingAudit(a); setAuditView("form"); }}
                  onDelete={handleDeleteAudit}
                />
              )}
              {auditView === "form" && (
                <SiteAuditForm
                  audit={editingAudit}
                  projectCodes={projectCodes}
                  onCancel={() => { setAuditView("list"); setEditingAudit(null); }}
                  onSave={handleSaveAudit}
                />
              )}
              {auditView === "detail" && selectedAudit && (
                <SiteAuditDetail
                  audit={selectedAudit}
                  onBack={() => { setSelectedAudit(null); setAuditView("list"); }}
                  onEdit={() => { setEditingAudit(selectedAudit); setAuditView("form"); }}
                />
              )}
            </>
          )}

          {/* ===== CRANE REGISTER SECTION ===== */}
          {activeSection === "crane-register" && (
            <>
              {craneView === "list" && (
                <CraneRegisterList
                  trainees={craneTrainees}
                  onAdd={() => { setEditingCrane(null); setCraneView("form"); }}
                  onEdit={(t: CraneTrainee) => { setEditingCrane(t); setCraneView("form"); }}
                  onDelete={handleDeleteCrane}
                  onImport={(rows: CraneTrainee[]) => rows.forEach((r) => saveCraneFS(r.id === 0 ? { ...r, id: Date.now() } : r))}
                />
              )}
              {craneView === "form" && (
                <CraneTraineeForm
                  trainee={editingCrane}
                  projectCodes={projectCodes}
                  onCancel={() => { setCraneView("list"); setEditingCrane(null); }}
                  onSave={handleSaveCrane}
                />
              )}
            </>
          )}

          {/* ===== TRAINING SIGN-IN SECTION ===== */}
          {activeSection === "training-signin" && (
            <>
              {trainingSignInView === "list" && (
                <TrainingSignInList
                  records={trainingSignIns}
                  onAdd={() => { setEditingTrainingSignIn(null); setTrainingSignInView("form"); }}
                  onEdit={(r) => { setEditingTrainingSignIn(r); setTrainingSignInView("form"); }}
                  onDelete={handleDeleteTrainingSignIn}
                  onImport={(rows: TrainingSignIn[]) => rows.forEach((r) => saveSignInFS(r.id === 0 ? { ...r, id: Date.now() } : r))}
                />
              )}
              {trainingSignInView === "form" && (
                <TrainingSignInForm
                  record={editingTrainingSignIn}
                  onCancel={() => { setTrainingSignInView("list"); setEditingTrainingSignIn(null); }}
                  onSave={handleSaveTrainingSignIn}
                />
              )}
            </>
          )}

          {/* ===== CONFINED SPACE REGISTER SECTION ===== */}
          {activeSection === "confined-space-register" && (
            <>
              {confinedView === "list" && (
                <ConfinedSpaceRegisterList
                  trainees={confinedTrainees}
                  onAdd={() => { setEditingConfined(null); setConfinedView("form"); }}
                  onEdit={(t: ConfinedSpaceTrainee) => { setEditingConfined(t); setConfinedView("form"); }}
                  onDelete={handleDeleteConfined}
                  onImport={(rows: ConfinedSpaceTrainee[]) => rows.forEach((r) => saveConfinedFS(r.id === 0 ? { ...r, id: Date.now() } : r))}
                />
              )}
              {confinedView === "form" && (
                <ConfinedSpaceTraineeForm
                  trainee={editingConfined}
                  projectCodes={projectCodes}
                  onCancel={() => { setConfinedView("list"); setEditingConfined(null); }}
                  onSave={handleSaveConfined}
                />
              )}
            </>
          )}

        </main>
      </div>
    </div>
  );
}

// ============================================================
// TRAINING SIGN-IN COMPONENTS
// ============================================================

const SIGNIN_COLUMNS = [
  "วันที่ลงทะเบียน", "เวลาอบรม", "ลำดับ",
  "1.ชื่อ-นามสกุล", "1.สังกัด", "1.ตำแหน่ง", "1.บริษัท", "1.Link ใบลงชื่อ", "1.Link ใบรับรอง",
  "จำนวนผู้เข้าอบรม(รวม)",
  "2.ชื่อ-นามสกุล", "2.สังกัด", "2.บริษัท", "2.Link ใบลงชื่อ", "2.Link ใบรับรอง",
  "หมายเหตุ",
];

const SIGNIN_TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "regDate", label: "วันที่ลงทะเบียน" },
  { key: "timeSlot", label: "เวลาอบรม" },
  { key: "seq", label: "ลำดับ" },
  { key: "fullName1", label: "1.ชื่อ-นามสกุล" },
  { key: "dept1", label: "1.สังกัด" },
  { key: "position1", label: "1.ตำแหน่ง" },
  { key: "company1", label: "1.บริษัท" },
  { key: "link1", label: "1.Link ใบลงชื่อ" },
  { key: "link2", label: "1.Link ใบรับรอง" },
  { key: "totalCount", label: "จำนวนรวม" },
  { key: "fullName2", label: "2.ชื่อ-นามสกุล" },
  { key: "dept2", label: "2.สังกัด" },
  { key: "company2", label: "2.บริษัท" },
  { key: "link3", label: "2.Link ใบลงชื่อ" },
  { key: "link4", label: "2.Link ใบรับรอง" },
  { key: "remark", label: "หมายเหตุ" },
];

function signinToRow(r: TrainingSignIn): Record<string, string | number> {
  return {
    "วันที่ลงทะเบียน": r.regDate, "เวลาอบรม": r.timeSlot, "ลำดับ": r.seq,
    "1.ชื่อ-นามสกุล": r.fullName1, "1.สังกัด": r.dept1, "1.ตำแหน่ง": r.position1, "1.บริษัท": r.company1,
    "1.Link ใบลงชื่อ": r.link1, "1.Link ใบรับรอง": r.link2,
    "จำนวนผู้เข้าอบรม(รวม)": r.totalCount,
    "2.ชื่อ-นามสกุล": r.fullName2, "2.สังกัด": r.dept2, "2.บริษัท": r.company2,
    "2.Link ใบลงชื่อ": r.link3, "2.Link ใบรับรอง": r.link4,
    "หมายเหตุ": r.remark,
  };
}

function rowToSignin(row: Record<string, string>, id: number): TrainingSignIn {
  return {
    id,
    regDate: row["วันที่ลงทะเบียน"] || "",
    timeSlot: row["เวลาอบรม"] || "",
    seq: parseInt(row["ลำดับ"]) || 0,
    fullName1: row["1.ชื่อ-นามสกุล"] || "",
    dept1: row["1.สังกัด"] || "",
    position1: row["1.ตำแหน่ง"] || "",
    company1: row["1.บริษัท"] || "",
    link1: row["1.Link ใบลงชื่อ"] || "",
    link2: row["1.Link ใบรับรอง"] || "",
    totalCount: parseInt(row["จำนวนผู้เข้าอบรม(รวม)"]) || 0,
    fullName2: row["2.ชื่อ-นามสกุล"] || "",
    dept2: row["2.สังกัด"] || "",
    company2: row["2.บริษัท"] || "",
    link3: row["2.Link ใบลงชื่อ"] || "",
    link4: row["2.Link ใบรับรอง"] || "",
    remark: row["หมายเหตุ"] || "",
  };
}

function TrainingSignInList({
  records,
  onAdd,
  onEdit,
  onDelete,
  onImport,
}: {
  records: TrainingSignIn[];
  onAdd: () => void;
  onEdit: (r: TrainingSignIn) => void;
  onDelete: (id: number) => void;
  onImport: (rows: TrainingSignIn[]) => void;
}) {
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SIGNIN_TABLE_COLUMNS.map((c) => [c.key, true]))
  );
  const [columnPopupOpen, setColumnPopupOpen] = useState(false);
  const columnPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (columnPopupRef.current && !columnPopupRef.current.contains(e.target as Node)) setColumnPopupOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = records.filter(
    (r) =>
      r.fullName1.toLowerCase().includes(search.toLowerCase()) ||
      r.fullName2.toLowerCase().includes(search.toLowerCase()) ||
      r.company1.toLowerCase().includes(search.toLowerCase()) ||
      r.regDate.includes(search)
  );

  const handleExportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([SIGNIN_COLUMNS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_training_signin.xlsx");
  };

  const handleExport = () => {
    const rows = records.map(signinToRow);
    const ws = XLSX.utils.json_to_sheet(rows, { header: SIGNIN_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ใบลงชื่ออบรม");
    XLSX.writeFile(wb, "training_signin.xlsx");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const imported = json.map((row, i) => rowToSignin(row, Date.now() + i));
      onImport(imported);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="text-blue-600" size={22} />
          CMG — ใบลงชื่อเข้ารับการอบรม
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative" ref={columnPopupRef}>
            <button
              type="button"
              onClick={() => setColumnPopupOpen((o) => !o)}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Columns size={15} /> แสดง/ซ่อน คอลัมน์ <ChevronDown size={14} />
            </button>
            {columnPopupOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">เลือกคอลัมน์ที่ต้องการดู</div>
                {SIGNIN_TABLE_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key] !== false}
                      onChange={() => setVisibleColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                    />
                    <span className="text-gray-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleExportTemplate}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition">
            <FileDown size={15} /> ดาวน์โหลด Template
          </button>
          <label className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition cursor-pointer">
            <Upload size={15} /> Import Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition">
            <Download size={15} /> Export Excel
          </button>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition">
            <Plus size={15} /> เพิ่มรายการ
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="ค้นหาชื่อ, บริษัท, วันที่..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      <div className="text-xs text-gray-400 mb-2">ทั้งหมด {records.length} รายการ {search && `(กรองแล้ว ${filtered.length} รายการ)`}</div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ไม่พบรายการ</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-700 text-white text-xs">
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">#</th>
                {SIGNIN_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) => (
                  <th key={c.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{c.label}</th>
                ))}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  {SIGNIN_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((col) => (
                    <td key={col.key} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {col.key === "regDate" && r.regDate}
                      {col.key === "timeSlot" && r.timeSlot}
                      {col.key === "seq" && <span className="text-center block">{r.seq}</span>}
                      {col.key === "fullName1" && <span className="font-medium text-gray-800">{r.fullName1}</span>}
                      {col.key === "dept1" && r.dept1}
                      {col.key === "position1" && r.position1}
                      {col.key === "company1" && r.company1}
                      {col.key === "link1" && (r.link1 ? <a href={r.link1} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">เปิดลิงก์</a> : <span className="text-gray-300 text-xs">-</span>)}
                      {col.key === "link2" && (r.link2 ? <a href={r.link2} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">เปิดลิงก์</a> : <span className="text-gray-300 text-xs">-</span>)}
                      {col.key === "totalCount" && <span className="text-center font-semibold text-blue-700 block">{r.totalCount || "-"}</span>}
                      {col.key === "fullName2" && <span className="font-medium text-gray-800">{r.fullName2}</span>}
                      {col.key === "dept2" && r.dept2}
                      {col.key === "company2" && r.company2}
                      {col.key === "link3" && (r.link3 ? <a href={r.link3} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">เปิดลิงก์</a> : <span className="text-gray-300 text-xs">-</span>)}
                      {col.key === "link4" && (r.link4 ? <a href={r.link4} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">เปิดลิงก์</a> : <span className="text-gray-300 text-xs">-</span>)}
                      {col.key === "remark" && r.remark}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); onEdit(r); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="แก้ไข"><Pencil size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(r.id); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_TRAINING_SIGNIN: TrainingSignIn = {
  id: 0, regDate: "", timeSlot: "08:00 am - 18:00 pm", seq: 1,
  fullName1: "", dept1: "", position1: "", company1: "", link1: "", link2: "",
  totalCount: 0,
  fullName2: "", dept2: "", company2: "", link3: "", link4: "",
  remark: "",
};

function TrainingSignInForm({
  record,
  onCancel,
  onSave,
}: {
  record: TrainingSignIn | null;
  onCancel: () => void;
  onSave: (r: TrainingSignIn) => void;
}) {
  const [form, setForm] = useState<TrainingSignIn>(record ?? EMPTY_TRAINING_SIGNIN);
  const set = (field: keyof TrainingSignIn, val: string | number) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  const txt = (label: string, field: keyof TrainingSignIn, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
        <h2 className="font-bold text-blue-900 text-lg flex items-center gap-2">
          <ClipboardCheck size={20} className="text-blue-600" />
          {record ? "แก้ไขรายการ" : "เพิ่มรายการ"} — ใบลงชื่อเข้ารับการอบรม
        </h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
      </div>

      <div className="p-6 space-y-6">
        {/* General Info */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 border-b pb-1">ข้อมูลทั่วไป</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {txt("วันที่ลงทะเบียน", "regDate", "date")}
            {txt("เวลาอบรม", "timeSlot")}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ลำดับ</label>
              <input type="number" value={form.seq}
                onChange={(e) => set("seq", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">จำนวนผู้เข้าอบรม (รวม)</label>
              <input type="number" value={form.totalCount}
                onChange={(e) => set("totalCount", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {txt("หมายเหตุ", "remark")}
          </div>
        </div>

        {/* Person 1 */}
        <div>
          <h3 className="text-sm font-bold text-blue-700 mb-3 border-b border-blue-100 pb-1">ข้อมูลผู้อบรม คนที่ 1</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {txt("ชื่อ-นามสกุล", "fullName1")}
            {txt("สังกัด", "dept1")}
            {txt("ตำแหน่ง", "position1")}
            {txt("บริษัท", "company1")}
            {txt("Link ใบลงชื่อ (Google Drive)", "link1")}
            {txt("Link ใบรับรอง (Google Drive)", "link2")}
          </div>
        </div>

        {/* Person 2 */}
        <div>
          <h3 className="text-sm font-bold text-indigo-700 mb-3 border-b border-indigo-100 pb-1">ข้อมูลผู้อบรม คนที่ 2</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {txt("ชื่อ-นามสกุล", "fullName2")}
            {txt("สังกัด", "dept2")}
            {txt("บริษัท", "company2")}
            <div />
            {txt("Link ใบลงชื่อ (Google Drive)", "link3")}
            {txt("Link ใบรับรอง (Google Drive)", "link4")}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={() => onSave(form)}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition text-sm">
          บันทึก
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CRANE REGISTER COMPONENTS
// ============================================================

const CRANE_COLUMNS = [
  "ชื่อ-สกุล", "ต้นสังกัด", "ตำแหน่ง", "ประเภทปั้นจั่น", "สถานะ", "โครงการ", "หลักสูตร",
  "วันที่อบรมล่าสุด", "สถาบันอบรม", "CER.",
  "อบรมครั้งที่1_วันที่", "อบรมครั้งที่1_สถาบัน", "อบรมครั้งที่1_CER",
  "อบรมครั้งที่2_วันที่", "อบรมครั้งที่2_สถาบัน", "อบรมครั้งที่2_CER",
  "อบรมครั้งที่3_วันที่", "อบรมครั้งที่3_สถาบัน", "อบรมครั้งที่3_CER",
  "หมายเหตุ", "วันที่เช็ค",
];

function craneToRow(t: CraneTrainee): Record<string, string> {
  return {
    "ชื่อ-สกุล": t.fullName, "ต้นสังกัด": t.company, "ตำแหน่ง": t.position,
    "ประเภทปั้นจั่น": t.type, "สถานะ": t.status, "โครงการ": t.project, "หลักสูตร": t.course,
    "วันที่อบรมล่าสุด": t.lastTrainDate, "สถาบันอบรม": t.institute, "CER.": t.cer,
    "อบรมครั้งที่1_วันที่": t.round1.date, "อบรมครั้งที่1_สถาบัน": t.round1.institute, "อบรมครั้งที่1_CER": t.round1.cer,
    "อบรมครั้งที่2_วันที่": t.round2.date, "อบรมครั้งที่2_สถาบัน": t.round2.institute, "อบรมครั้งที่2_CER": t.round2.cer,
    "อบรมครั้งที่3_วันที่": t.round3.date, "อบรมครั้งที่3_สถาบัน": t.round3.institute, "อบรมครั้งที่3_CER": t.round3.cer,
    "หมายเหตุ": t.remark, "วันที่เช็ค": t.checkDate,
  };
}

function rowToCrane(row: Record<string, string>, id: number): CraneTrainee {
  return {
    id,
    fullName: row["ชื่อ-สกุล"] || "", company: row["ต้นสังกัด"] || "",
    position: row["ตำแหน่ง"] || "", type: row["ประเภทปั้นจั่น"] || "",
    status: row["สถานะ"] || "ปฏิบัติงาน", project: row["โครงการ"] || "",
    course: row["หลักสูตร"] || "", lastTrainDate: row["วันที่อบรมล่าสุด"] || "",
    institute: row["สถาบันอบรม"] || "", cer: row["CER."] || "",
    round1: { date: row["อบรมครั้งที่1_วันที่"] || "", institute: row["อบรมครั้งที่1_สถาบัน"] || "", cer: row["อบรมครั้งที่1_CER"] || "" },
    round2: { date: row["อบรมครั้งที่2_วันที่"] || "", institute: row["อบรมครั้งที่2_สถาบัน"] || "", cer: row["อบรมครั้งที่2_CER"] || "" },
    round3: { date: row["อบรมครั้งที่3_วันที่"] || "", institute: row["อบรมครั้งที่3_สถาบัน"] || "", cer: row["อบรมครั้งที่3_CER"] || "" },
    remark: row["หมายเหตุ"] || "", checkDate: row["วันที่เช็ค"] || "",
  };
}

const CRANE_TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "fullName", label: "ชื่อ-สกุล" },
  { key: "company", label: "ต้นสังกัด" },
  { key: "position", label: "ตำแหน่ง" },
  { key: "type", label: "ประเภทปั้นจั่น" },
  { key: "status", label: "สถานะ" },
  { key: "project", label: "โครงการ" },
  { key: "lastTrainDate", label: "วันที่อบรมล่าสุด" },
  { key: "institute", label: "สถาบัน" },
  { key: "cer", label: "CER." },
  { key: "round1", label: "ครั้งที่ 1 (วันที่)" },
  { key: "round2", label: "ครั้งที่ 2 (วันที่)" },
  { key: "round3", label: "ครั้งที่ 3 (วันที่)" },
  { key: "remark", label: "หมายเหตุ" },
  { key: "checkDate", label: "วันที่เช็ค" },
];

function CraneRegisterList({
  trainees,
  onAdd,
  onEdit,
  onDelete,
  onImport,
}: {
  trainees: CraneTrainee[];
  onAdd: () => void;
  onEdit: (t: CraneTrainee) => void;
  onDelete: (id: number) => void;
  onImport: (rows: CraneTrainee[]) => void;
}) {
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    CRANE_TABLE_COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {})
  );
  const [columnPopupOpen, setColumnPopupOpen] = useState(false);
  const columnPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPopupRef.current && !columnPopupRef.current.contains(e.target as Node)) setColumnPopupOpen(false);
    };
    if (columnPopupOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [columnPopupOpen]);

  const filtered = trainees.filter(
    (t) =>
      t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.project.toLowerCase().includes(search.toLowerCase()) ||
      t.company.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([CRANE_COLUMNS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_crane_register.xlsx");
  };

  const handleExport = () => {
    const rows = trainees.map(craneToRow);
    const ws = XLSX.utils.json_to_sheet(rows, { header: CRANE_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ทะเบียนปั้นจั่น");
    XLSX.writeFile(wb, "crane_register.xlsx");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const imported = json.map((row, i) => rowToCrane(row, Date.now() + i));
      onImport(imported);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <HardHat className="text-yellow-500" size={22} />
          ทะเบียนรายชื่อผู้อบรมปั้นจั่น (Crane)
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative" ref={columnPopupRef}>
            <button
              type="button"
              onClick={() => setColumnPopupOpen((o) => !o)}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Columns size={15} /> แสดง/ซ่อน คอลัมน์ <ChevronDown size={14} />
            </button>
            {columnPopupOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">เลือกคอลัมน์ที่ต้องการดู</div>
                {CRANE_TABLE_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key] !== false}
                      onChange={() => setVisibleColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                      className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                    />
                    <span className="text-gray-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleExportTemplate}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition">
            <FileDown size={15} /> ดาวน์โหลด Template
          </button>
          <label className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition cursor-pointer">
            <Upload size={15} /> Import Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition">
            <Download size={15} /> Export Excel
          </button>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition">
            <Plus size={15} /> เพิ่มรายการ
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="ค้นหาชื่อ, โครงการ, บริษัท..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
      </div>

      <div className="text-xs text-gray-400 mb-2">ทั้งหมด {trainees.length} รายการ {search && `(กรองแล้ว ${filtered.length} รายการ)`}</div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ไม่พบรายการ</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-yellow-500 text-white text-xs">
                <th className="px-3 py-2 text-left font-semibold">#</th>
                {CRANE_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) => (
                  <th key={c.key} className="px-3 py-2 text-left font-semibold">{c.label}</th>
                ))}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, idx) => (
                <tr key={t.id} className={idx % 2 === 0 ? "bg-yellow-50" : "bg-white"}>
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  {CRANE_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((col) => (
                    <td key={col.key} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {col.key === "fullName" && <span className="font-medium text-gray-800">{t.fullName}</span>}
                      {col.key === "company" && t.company}
                      {col.key === "position" && t.position}
                      {col.key === "type" && t.type}
                      {col.key === "status" && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">{t.status}</span>
                      )}
                      {col.key === "project" && t.project}
                      {col.key === "lastTrainDate" && t.lastTrainDate}
                      {col.key === "institute" && t.institute}
                      {col.key === "cer" && t.cer}
                      {col.key === "round1" && (t.round1.date || "-")}
                      {col.key === "round2" && (t.round2.date || "-")}
                      {col.key === "round3" && (t.round3.date || "-")}
                      {col.key === "remark" && t.remark}
                      {col.key === "checkDate" && t.checkDate}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="แก้ไข"><Pencil size={14} /></button>
                      <button onClick={() => onDelete(t.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_CRANE_TRAINEE: CraneTrainee = {
  id: 0, fullName: "", company: "", position: "", type: "", status: "ปฏิบัติงาน",
  project: "", course: "", lastTrainDate: "", institute: "", cer: "",
  round1: { date: "", institute: "", cer: "" },
  round2: { date: "", institute: "", cer: "" },
  round3: { date: "", institute: "", cer: "" },
  remark: "", checkDate: "",
};

function CraneTraineeForm({
  trainee,
  projectCodes,
  onCancel,
  onSave,
}: {
  trainee: CraneTrainee | null;
  projectCodes: string[];
  onCancel: () => void;
  onSave: (t: CraneTrainee) => void;
}) {
  const [form, setForm] = useState<CraneTrainee>(trainee ?? EMPTY_CRANE_TRAINEE);
  const set = (field: keyof CraneTrainee, val: any) => setForm((prev) => ({ ...prev, [field]: val }));
  const setRound = (round: "round1" | "round2" | "round3", field: keyof TrainingRecord, val: string) =>
    setForm((prev) => ({ ...prev, [round]: { ...prev[round], [field]: val } }));

  const txt = (label: string, field: keyof CraneTrainee, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
    </div>
  );

  const roundBlock = (label: string, round: "round1" | "round2" | "round3") => (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <p className="text-xs font-bold text-gray-600 mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {(["date", "institute", "cer"] as (keyof TrainingRecord)[]).map((f) => (
          <div key={f}>
            <label className="block text-xs text-gray-500 mb-1">{f === "date" ? "วันที่อบรม" : f === "institute" ? "สถาบัน" : "CER."}</label>
            <input type={f === "date" ? "date" : "text"} value={form[round][f]}
              onChange={(e) => setRound(round, f, e.target.value)}
              className="w-full border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-yellow-50 p-4 border-b border-yellow-100 flex justify-between items-center">
        <h2 className="font-bold text-yellow-900 text-lg flex items-center gap-2">
          <HardHat size={20} className="text-yellow-600" />
          {trainee ? "แก้ไขรายการ" : "เพิ่มรายการ"} — ทะเบียนผู้อบรมปั้นจั่น
        </h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {txt("ชื่อ-สกุล", "fullName")}
          {txt("ต้นสังกัด (บริษัท)", "company")}
          {txt("ตำแหน่ง", "position")}
          {txt("ประเภทปั้นจั่น", "type")}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">สถานะ</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
              <option value="ปฏิบัติงาน">ปฏิบัติงาน</option>
              <option value="พ้นสภาพ">พ้นสภาพ</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">โครงการ</label>
            <select value={form.project} onChange={(e) => set("project", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
              <option value="">-- เลือกโครงการ --</option>
              {projectCodes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {txt("หลักสูตร", "course")}
          {txt("วันที่อบรมล่าสุด", "lastTrainDate", "date")}
          {txt("สถาบันอบรม", "institute")}
          {txt("CER.", "cer")}
          {txt("หมายเหตุ", "remark")}
          {txt("วันที่เช็ค", "checkDate", "date")}
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">ประวัติการอบรม (ครั้งที่ 1-3)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {roundBlock("อบรมครั้งที่ 1", "round1")}
            {roundBlock("อบรมครั้งที่ 2", "round2")}
            {roundBlock("อบรมครั้งที่ 3", "round3")}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={() => onSave(form)}
          className="px-6 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 shadow-sm transition text-sm">
          บันทึก
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CONFINED SPACE REGISTER COMPONENTS
// ============================================================

const CONFINED_COLUMNS = [
  "ชื่อ-สกุล", "ต้นสังกัด", "ตำแหน่ง", "ประเภท", "สถานะ", "โครงการ", "หลักสูตร",
  "วันที่อบรมล่าสุด", "สถาบันอบรม", "CER.",
  "ครบรอบ3ปี_วันที่", "ครบรอบ3ปี_สถาบัน", "ครบรอบ3ปี_CER",
  "หมายเหตุ", "วันที่เช็ค",
];

const CONFINED_TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "fullName", label: "ชื่อ-สกุล" },
  { key: "company", label: "ต้นสังกัด" },
  { key: "position", label: "ตำแหน่ง" },
  { key: "type", label: "ประเภท" },
  { key: "status", label: "สถานะ" },
  { key: "project", label: "โครงการ" },
  { key: "course", label: "หลักสูตร" },
  { key: "lastTrainDate", label: "วันที่อบรมล่าสุด" },
  { key: "institute", label: "สถาบัน" },
  { key: "cer", label: "CER." },
  { key: "renewal3yrDate", label: "ครบรอบ 3 ปี (วันที่)" },
  { key: "renewal3yrCer", label: "CER. ใหม่" },
  { key: "remark", label: "หมายเหตุ" },
  { key: "checkDate", label: "วันที่เช็ค" },
];

function confinedToRow(t: ConfinedSpaceTrainee): Record<string, string> {
  return {
    "ชื่อ-สกุล": t.fullName, "ต้นสังกัด": t.company, "ตำแหน่ง": t.position,
    "ประเภท": t.type, "สถานะ": t.status, "โครงการ": t.project, "หลักสูตร": t.course,
    "วันที่อบรมล่าสุด": t.lastTrainDate, "สถาบันอบรม": t.institute, "CER.": t.cer,
    "ครบรอบ3ปี_วันที่": t.renewal3yr.date, "ครบรอบ3ปี_สถาบัน": t.renewal3yr.institute, "ครบรอบ3ปี_CER": t.renewal3yr.cer,
    "หมายเหตุ": t.remark, "วันที่เช็ค": t.checkDate,
  };
}

function rowToConfined(row: Record<string, string>, id: number): ConfinedSpaceTrainee {
  return {
    id,
    fullName: row["ชื่อ-สกุล"] || "", company: row["ต้นสังกัด"] || "",
    position: row["ตำแหน่ง"] || "", type: row["ประเภท"] || "",
    status: row["สถานะ"] || "ปฏิบัติงาน", project: row["โครงการ"] || "",
    course: row["หลักสูตร"] || "", lastTrainDate: row["วันที่อบรมล่าสุด"] || "",
    institute: row["สถาบันอบรม"] || "", cer: row["CER."] || "",
    renewal3yr: { date: row["ครบรอบ3ปี_วันที่"] || "", institute: row["ครบรอบ3ปี_สถาบัน"] || "", cer: row["ครบรอบ3ปี_CER"] || "" },
    remark: row["หมายเหตุ"] || "", checkDate: row["วันที่เช็ค"] || "",
  };
}

function ConfinedSpaceRegisterList({
  trainees,
  onAdd,
  onEdit,
  onDelete,
  onImport,
}: {
  trainees: ConfinedSpaceTrainee[];
  onAdd: () => void;
  onEdit: (t: ConfinedSpaceTrainee) => void;
  onDelete: (id: number) => void;
  onImport: (rows: ConfinedSpaceTrainee[]) => void;
}) {
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CONFINED_TABLE_COLUMNS.map((c) => [c.key, true]))
  );
  const [columnPopupOpen, setColumnPopupOpen] = useState(false);
  const columnPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (columnPopupRef.current && !columnPopupRef.current.contains(e.target as Node)) setColumnPopupOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = trainees.filter(
    (t) =>
      t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.project.toLowerCase().includes(search.toLowerCase()) ||
      t.company.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([CONFINED_COLUMNS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_confined_space_register.xlsx");
  };

  const handleExport = () => {
    const rows = trainees.map(confinedToRow);
    const ws = XLSX.utils.json_to_sheet(rows, { header: CONFINED_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ทะเบียนที่อับอากาศ");
    XLSX.writeFile(wb, "confined_space_register.xlsx");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const imported = json.map((row, i) => rowToConfined(row, Date.now() + i));
      onImport(imported);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Wind className="text-teal-500" size={22} />
          ทะเบียนรายชื่อผู้อบรมที่อับอากาศ (Confined Space)
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative" ref={columnPopupRef}>
            <button
              type="button"
              onClick={() => setColumnPopupOpen((o) => !o)}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Columns size={15} /> แสดง/ซ่อน คอลัมน์ <ChevronDown size={14} />
            </button>
            {columnPopupOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">เลือกคอลัมน์ที่ต้องการดู</div>
                {CONFINED_TABLE_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key] !== false}
                      onChange={() => setVisibleColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                      className="rounded border-gray-300 text-teal-500 focus:ring-teal-400"
                    />
                    <span className="text-gray-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleExportTemplate}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition">
            <FileDown size={15} /> ดาวน์โหลด Template
          </button>
          <label className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition cursor-pointer">
            <Upload size={15} /> Import Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition">
            <Download size={15} /> Export Excel
          </button>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition">
            <Plus size={15} /> เพิ่มรายการ
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="ค้นหาชื่อ, โครงการ, บริษัท..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
      </div>

      <div className="text-xs text-gray-400 mb-2">ทั้งหมด {trainees.length} รายการ {search && `(กรองแล้ว ${filtered.length} รายการ)`}</div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ไม่พบรายการ</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-600 text-white text-xs">
                <th className="px-3 py-2 text-left font-semibold">#</th>
                {CONFINED_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) => (
                  <th key={c.key} className="px-3 py-2 text-left font-semibold">{c.label}</th>
                ))}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, idx) => (
                <tr key={t.id} className={idx % 2 === 0 ? "bg-teal-50" : "bg-white"}>
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  {CONFINED_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((col) => (
                    <td key={col.key} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {col.key === "fullName" && <span className="font-medium text-gray-800">{t.fullName}</span>}
                      {col.key === "company" && t.company}
                      {col.key === "position" && t.position}
                      {col.key === "type" && t.type}
                      {col.key === "status" && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">{t.status}</span>
                      )}
                      {col.key === "project" && t.project}
                      {col.key === "course" && t.course}
                      {col.key === "lastTrainDate" && t.lastTrainDate}
                      {col.key === "institute" && t.institute}
                      {col.key === "cer" && t.cer}
                      {col.key === "renewal3yrDate" && (t.renewal3yr.date || "-")}
                      {col.key === "renewal3yrCer" && (t.renewal3yr.cer || "-")}
                      {col.key === "remark" && t.remark}
                      {col.key === "checkDate" && t.checkDate}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="แก้ไข"><Pencil size={14} /></button>
                      <button onClick={() => onDelete(t.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_CONFINED_TRAINEE: ConfinedSpaceTrainee = {
  id: 0, fullName: "", company: "", position: "", type: "", status: "ปฏิบัติงาน",
  project: "", course: "", lastTrainDate: "", institute: "", cer: "",
  renewal3yr: { date: "", institute: "", cer: "" },
  remark: "", checkDate: "",
};

function ConfinedSpaceTraineeForm({
  trainee,
  projectCodes,
  onCancel,
  onSave,
}: {
  trainee: ConfinedSpaceTrainee | null;
  projectCodes: string[];
  onCancel: () => void;
  onSave: (t: ConfinedSpaceTrainee) => void;
}) {
  const [form, setForm] = useState<ConfinedSpaceTrainee>(trainee ?? EMPTY_CONFINED_TRAINEE);
  const set = (field: keyof ConfinedSpaceTrainee, val: any) => setForm((prev) => ({ ...prev, [field]: val }));
  const setRenewal = (field: keyof TrainingRecord, val: string) =>
    setForm((prev) => ({ ...prev, renewal3yr: { ...prev.renewal3yr, [field]: val } }));

  const txt = (label: string, field: keyof ConfinedSpaceTrainee, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-teal-50 p-4 border-b border-teal-100 flex justify-between items-center">
        <h2 className="font-bold text-teal-900 text-lg flex items-center gap-2">
          <Wind size={20} className="text-teal-600" />
          {trainee ? "แก้ไขรายการ" : "เพิ่มรายการ"} — ทะเบียนผู้อบรมที่อับอากาศ
        </h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {txt("ชื่อ-สกุล", "fullName")}
          {txt("ต้นสังกัด (บริษัท)", "company")}
          {txt("ตำแหน่ง", "position")}
          {txt("ประเภท", "type")}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">สถานะ</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="ปฏิบัติงาน">ปฏิบัติงาน</option>
              <option value="พ้นสภาพ">พ้นสภาพ</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">โครงการ</label>
            <select value={form.project} onChange={(e) => set("project", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="">-- เลือกโครงการ --</option>
              {projectCodes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {txt("หลักสูตร", "course")}
          {txt("วันที่อบรมล่าสุด", "lastTrainDate", "date")}
          {txt("สถาบันอบรม", "institute")}
          {txt("CER.", "cer")}
          {txt("หมายเหตุ", "remark")}
          {txt("วันที่เช็ค", "checkDate", "date")}
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">ครบรอบการอบรม 3 ปี</h3>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">วันที่อบรม (ครบรอบ 3 ปี)</label>
              <input type="date" value={form.renewal3yr.date}
                onChange={(e) => setRenewal("date", e.target.value)}
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">สถาบันอบรม</label>
              <input type="text" value={form.renewal3yr.institute}
                onChange={(e) => setRenewal("institute", e.target.value)}
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CER.</label>
              <input type="text" value={form.renewal3yr.cer}
                onChange={(e) => setRenewal("cer", e.target.value)}
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={() => onSave(form)}
          className="px-6 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 shadow-sm transition text-sm">
          บันทึก
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PROJECTS COMPONENTS
// ============================================================

function ProjectsList({
  projects,
  onAdd,
  onEdit,
  onDelete,
}: {
  projects: Project[];
  onAdd: () => void;
  onEdit: (p: Project) => void;
  onDelete: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = projects.filter(
    (p) =>
      p.projectNo.toLowerCase().includes(search.toLowerCase()) ||
      p.projectName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="text-blue-600" size={22} />
          ข้อมูลโครงการ / Projects
        </h2>
        <button
          onClick={onAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition text-sm font-medium"
        >
          <Plus size={16} /> เพิ่มโครงการ
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="ค้นหาโครงการ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
          ไม่พบโครงการ
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">{p.projectNo}</span>
                    <h3 className="font-semibold text-gray-800">{p.projectName}</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 mt-2 text-sm text-gray-600">
                    <span><span className="font-medium text-gray-500">Location:</span> {p.location}</span>
                    <span><span className="font-medium text-gray-500">PM:</span> {p.projectManager}</span>
                    <span><span className="font-medium text-gray-500">CM:</span> {p.constructionManager}</span>
                    <span><span className="font-medium text-gray-500">เริ่ม:</span> {p.projectStart}</span>
                    <span><span className="font-medium text-gray-500">สิ้นสุด:</span> {p.projectFinish}</span>
                    <span><span className="font-medium text-gray-500">Client:</span> {p.clientName}</span>
                  </div>
                  {p.safetyPersons.length > 0 && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-xs bg-cyan-100 text-cyan-800 border border-cyan-200 px-2 py-0.5 rounded-full font-medium">
                        Safety Person: {p.safetyPersons.length} คน
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => onEdit(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="แก้ไข">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => onDelete(p.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition" title="ลบ">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_PROJECT: Project = {
  id: 0, projectNo: "", projectName: "", location: "", projectManager: "",
  constructionManager: "", projectStart: "", projectFinish: "",
  mainContractor: "", subContractor: "", clientName: "", projectNote: "",
  safetyPersons: [],
};

const EMPTY_SAFETY_PERSON: SafetyPerson = {
  id: 0, safetyName: "", scopeType: "", startWork: "", finishWork: "", workPattern: "Non-OT", note: "",
};

function ProjectForm({
  project,
  onCancel,
  onSave,
}: {
  project: Project | null;
  onCancel: () => void;
  onSave: (p: Project) => void;
}) {
  const [form, setForm] = useState<Project>(project ?? EMPTY_PROJECT);
  const set = (field: keyof Project, val: any) => setForm((prev) => ({ ...prev, [field]: val }));

  const txtField = (label: string, key: keyof Project, type = "text", colSpan = "") => (
    <div className={colSpan}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );

  const addSafetyPerson = () => {
    set("safetyPersons", [...form.safetyPersons, { ...EMPTY_SAFETY_PERSON, id: Date.now() }]);
  };

  const updateSafetyPerson = (id: number, field: keyof SafetyPerson, val: string) => {
    set("safetyPersons", form.safetyPersons.map((sp) => sp.id === id ? { ...sp, [field]: val } : sp));
  };

  const removeSafetyPerson = (id: number) => {
    set("safetyPersons", form.safetyPersons.filter((sp) => sp.id !== id));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
        <h2 className="font-bold text-blue-900 text-lg">
          {project ? "แก้ไขโครงการ" : "เพิ่มโครงการใหม่"}
        </h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
      </div>

      <div className="p-6 space-y-8">
        {/* A1 Project Info */}
        <div>
          <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide mb-4 pb-1 border-b border-blue-100">
            A1 ข้อมูลโครงการ
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {txtField("Project No.", "projectNo")}
            {txtField("Project Name", "projectName")}
            {txtField("Location", "location", "text", "md:col-span-2")}
            {txtField("Project Manager (PM)", "projectManager")}
            {txtField("Construction Manager (CM)", "constructionManager")}
            {txtField("Project Start", "projectStart", "date")}
            {txtField("Project Finish", "projectFinish", "date")}
            {txtField("Main Contractor", "mainContractor")}
            {txtField("Sub-Contractor", "subContractor")}
            {txtField("Client Name", "clientName", "text", "md:col-span-2")}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Note</label>
              <textarea
                value={form.projectNote}
                onChange={(e) => set("projectNote", e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        {/* A2 Safety Persons */}
        <div>
          <div className="flex justify-between items-center mb-4 pb-1 border-b border-blue-100">
            <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide">
              A2 รายการข้อมูล Safety Person
            </h3>
            <button
              onClick={addSafetyPerson}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
            >
              <Plus size={14} /> เพิ่ม Safety Person
            </button>
          </div>

          {form.safetyPersons.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              ยังไม่มีข้อมูล Safety Person — กด "เพิ่ม Safety Person" เพื่อเพิ่ม
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-cyan-600 text-white">
                    <th className="text-left px-3 py-2 font-semibold rounded-tl-lg">Safety Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Scope Type</th>
                    <th className="text-left px-3 py-2 font-semibold">Start Work</th>
                    <th className="text-left px-3 py-2 font-semibold">Finish Work</th>
                    <th className="text-left px-3 py-2 font-semibold">รูปแบบการทำงาน<br/><span className="font-normal text-xs opacity-80">(OT / Non-OT)</span></th>
                    <th className="text-left px-3 py-2 font-semibold">Note</th>
                    <th className="px-3 py-2 rounded-tr-lg"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.safetyPersons.map((sp, idx) => (
                    <tr key={sp.id} className={idx % 2 === 0 ? "bg-cyan-50" : "bg-white"}>
                      <td className="px-2 py-1.5">
                        <input type="text" value={sp.safetyName}
                          onChange={(e) => updateSafetyPerson(sp.id, "safetyName", e.target.value)}
                          className="w-full border border-gray-300 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="ชื่อ-นามสกุล" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="text" value={sp.scopeType}
                          onChange={(e) => updateSafetyPerson(sp.id, "scopeType", e.target.value)}
                          className="w-full border border-gray-300 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="เช่น Safety Officer" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={sp.startWork}
                          onChange={(e) => updateSafetyPerson(sp.id, "startWork", e.target.value)}
                          className="w-full border border-gray-300 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={sp.finishWork}
                          onChange={(e) => updateSafetyPerson(sp.id, "finishWork", e.target.value)}
                          className="w-full border border-gray-300 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={sp.workPattern}
                          onChange={(e) => updateSafetyPerson(sp.id, "workPattern", e.target.value)}
                          className="w-full border border-gray-300 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="OT">OT</option>
                          <option value="Non-OT">Non-OT</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="text" value={sp.note}
                          onChange={(e) => updateSafetyPerson(sp.id, "note", e.target.value)}
                          className="w-full border border-gray-300 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="หมายเหตุ" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeSafetyPerson(sp.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded transition">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button
          onClick={() => onSave(form)}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition text-sm"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

// ============================================================
// DAILY REPORT COMPONENTS
// ============================================================

function DailyReportList({
  reports,
  currentUser,
  hasWorkflowRole,
  onSelectReport,
  onCreateReport,
}: {
  reports: Report[];
  currentUser: User;
  hasWorkflowRole: (roleId: string) => boolean;
  onSelectReport: (r: Report) => void;
  onCreateReport: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={22} />
          Daily Report — รายงานประจำวัน
        </h2>
        {hasWorkflowRole("staff") && (
          <button
            onClick={onCreateReport}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition text-sm font-medium"
          >
            <Plus size={16} /> สร้างรายงานใหม่
          </button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
          ไม่พบรายงานที่ต้องดำเนินการในขณะนี้
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <div
              key={report.id}
              onClick={() => onSelectReport(report)}
              className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer flex justify-between items-center"
            >
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded">{getReportDocNo(report)}</span>
                  <span className="text-gray-500 text-xs flex items-center gap-1"><Clock size={12} /> {report.date}</span>
                </div>
                <h3 className="font-medium text-gray-800">{report.toolboxTopic || "No Topic"}</h3>
                <div className="text-sm text-gray-500 mt-1">โดย: {report.staffName}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={report.status} />
                {hasWorkflowRole("exec") && report.acknowledgedByExecs.includes(currentUser.name) && (
                  <span className="text-xs text-green-600 flex items-center gap-1"><Eye size={12} /> รับรู้แล้ว</span>
                )}
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SITE AUDIT COMPONENTS
// ============================================================

function SiteAuditList({
  audits,
  onAdd,
  onView,
  onEdit,
  onDelete,
}: {
  audits: SiteAudit[];
  onAdd: () => void;
  onView: (a: SiteAudit) => void;
  onEdit: (a: SiteAudit) => void;
  onDelete: (id: number) => void;
}) {
  const resultBadge: Record<string, string> = {
    pass: "bg-green-100 text-green-800 border-green-200",
    fail: "bg-red-100 text-red-800 border-red-200",
    conditional: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };
  const resultLabel: Record<string, string> = {
    pass: "ผ่าน",
    fail: "ไม่ผ่าน",
    conditional: "มีเงื่อนไข",
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="text-blue-600" size={22} />
          Site Audit Report
        </h2>
        <button
          onClick={onAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition text-sm font-medium"
        >
          <Plus size={16} /> New Audit
        </button>
      </div>

      {audits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
          ยังไม่มีรายการ Audit
        </div>
      ) : (
        <div className="grid gap-4">
          {audits.sort((a, b) => b.createdAt - a.createdAt).map((audit) => (
            <div
              key={audit.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 cursor-pointer" onClick={() => onView(audit)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded">{audit.project}</span>
                    <span className="text-gray-500 text-xs flex items-center gap-1"><Clock size={12} /> {audit.auditDate}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${resultBadge[audit.overallResult]}`}>
                      {resultLabel[audit.overallResult]}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-800">{audit.auditType}</h3>
                  <div className="text-sm text-gray-500 mt-1">
                    <span className="mr-3">ผู้ตรวจ: {audit.auditor}</span>
                    <span>พื้นที่: {audit.location}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Findings: <span className="font-medium text-orange-600">{audit.findings.filter((f) => f.status === "open").length} รายการที่ยังเปิดอยู่</span>
                    {" / "}
                    <span className="font-medium text-gray-600">{audit.findings.length} รายการทั้งหมด</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => onEdit(audit)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="แก้ไข">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => onDelete(audit.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition" title="ลบ">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_AUDIT: SiteAudit = {
  id: 0, project: "", auditDate: new Date().toISOString().split("T")[0],
  auditor: "", auditType: "", location: "", summary: "",
  findings: [], overallResult: "pass", createdAt: 0,
};

function SiteAuditForm({
  audit,
  projectCodes,
  onCancel,
  onSave,
}: {
  audit: SiteAudit | null;
  projectCodes: string[];
  onCancel: () => void;
  onSave: (a: SiteAudit) => void;
}) {
  const [form, setForm] = useState<SiteAudit>(audit ?? { ...EMPTY_AUDIT, project: projectCodes[0] ?? "" });
  const set = (field: keyof SiteAudit, val: any) => setForm((prev) => ({ ...prev, [field]: val }));

  const addFinding = () => {
    const newFinding: AuditFinding = { id: Date.now(), category: "", description: "", severity: "medium", status: "open" };
    set("findings", [...form.findings, newFinding]);
  };

  const updateFinding = (id: number, field: keyof AuditFinding, val: any) => {
    set("findings", form.findings.map((f) => f.id === id ? { ...f, [field]: val } : f));
  };

  const removeFinding = (id: number) => {
    set("findings", form.findings.filter((f) => f.id !== id));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
        <h2 className="font-bold text-blue-900 text-lg">{audit ? "แก้ไข Site Audit" : "New Site Audit Report"}</h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">โครงการ</label>
            <select
              value={form.project}
              onChange={(e) => set("project", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {projectCodes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ Audit</label>
            <input type="date" value={form.auditDate} onChange={(e) => set("auditDate", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ตรวจ (Auditor)</label>
            <input type="text" value={form.auditor} onChange={(e) => set("auditor", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทการตรวจ (Audit Type)</label>
            <input type="text" value={form.auditType} onChange={(e) => set("auditType", e.target.value)}
              placeholder="เช่น Monthly Safety Audit"
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">พื้นที่ตรวจสอบ (Location)</label>
            <input type="text" value={form.location} onChange={(e) => set("location", e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ผลการตรวจโดยรวม</label>
            <select value={form.overallResult} onChange={(e) => set("overallResult", e.target.value as SiteAudit["overallResult"])}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="pass">ผ่าน (Pass)</option>
              <option value="conditional">มีเงื่อนไข (Conditional)</option>
              <option value="fail">ไม่ผ่าน (Fail)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">สรุปผลการตรวจ</label>
            <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        {/* Findings */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><AlertTriangle size={16} className="text-orange-500" /> รายการ Findings</h3>
            <button onClick={addFinding} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
              <Plus size={14} /> เพิ่ม Finding
            </button>
          </div>
          {form.findings.length === 0 && <p className="text-sm text-gray-400 text-center py-4">ยังไม่มี Finding</p>}
          <div className="space-y-3">
            {form.findings.map((f) => (
              <div key={f.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input type="text" placeholder="หมวดหมู่ (Category)" value={f.category}
                    onChange={(e) => updateFinding(f.id, "category", e.target.value)}
                    className="border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  <select value={f.severity} onChange={(e) => updateFinding(f.id, "severity", e.target.value)}
                    className="border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <select value={f.status} onChange={(e) => updateFinding(f.id, "status", e.target.value)}
                    className="border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                  <div className="md:col-span-2">
                    <input type="text" placeholder="รายละเอียด" value={f.description}
                      onChange={(e) => updateFinding(f.id, "description", e.target.value)}
                      className="w-full border border-gray-300 rounded p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => removeFinding(f.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={() => onSave(form)} className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition text-sm">
          บันทึก
        </button>
      </div>
    </div>
  );
}

function SiteAuditDetail({
  audit,
  onBack,
  onEdit,
}: {
  audit: SiteAudit;
  onBack: () => void;
  onEdit: () => void;
}) {
  const severityBadge: Record<string, string> = {
    low: "bg-blue-100 text-blue-800 border-blue-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-red-100 text-red-800 border-red-200",
  };
  const resultBadge: Record<string, string> = {
    pass: "bg-green-100 text-green-800 border-green-200",
    fail: "bg-red-100 text-red-800 border-red-200",
    conditional: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };
  const resultLabel: Record<string, string> = { pass: "ผ่าน", fail: "ไม่ผ่าน", conditional: "มีเงื่อนไข" };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-10">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center text-gray-500 hover:text-blue-600 font-medium">
          <ChevronRight className="rotate-180" size={20} /> กลับ
        </button>
        <button onClick={onEdit} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
          <Pencil size={14} /> แก้ไข
        </button>
      </div>

      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">{audit.project}</span>
          <span className="text-gray-500 text-sm">{audit.auditDate}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${resultBadge[audit.overallResult]}`}>
            {resultLabel[audit.overallResult]}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{audit.auditType}</h1>
        <div className="text-gray-600 mb-4 text-sm flex gap-4">
          <span>ผู้ตรวจ: <b>{audit.auditor}</b></span>
          <span>พื้นที่: <b>{audit.location}</b></span>
        </div>
        {audit.summary && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-700">
            <span className="font-semibold text-gray-800 block mb-1">สรุปผล:</span>
            {audit.summary}
          </div>
        )}

        <h3 className="font-bold text-gray-900 mb-3 border-b pb-2">Findings ({audit.findings.length})</h3>
        {audit.findings.length === 0 ? (
          <p className="text-gray-400 text-sm">ไม่มี Findings</p>
        ) : (
          <div className="space-y-3">
            {audit.findings.map((f) => (
              <div key={f.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-700">{f.category || "—"}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${severityBadge[f.severity]}`}>{f.severity}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${f.status === "open" ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {f.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING_SITE_MGR: "bg-yellow-100 text-yellow-800 border-yellow-200",
    PENDING_CM: "bg-orange-100 text-orange-800 border-orange-200",
    PENDING_CMG_MGR: "bg-purple-100 text-purple-800 border-purple-200",
    APPROVED: "bg-green-100 text-green-800 border-green-200",
  };

  const labels: Record<string, string> = {
    PENDING_SITE_MGR: "รอ Site Mgr ตรวจสอบ",
    PENDING_CM: "รอ CM รับทราบ",
    PENDING_CMG_MGR: "รอ CMG Mgr อนุมัติ",
    APPROVED: "อนุมัติแล้ว",
  };

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full border font-medium ${
        styles[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

const MAX_IMAGES_PER_ITEM = 5;

function ReportForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (data: any) => void }) {
  const { firebaseUser } = useAuth();
  const [formData, setFormData] = useState<{
    date: string;
    toolboxTopic: string;
    workerCount: string;
    training: string;
    accident: string;
    checklist: Record<number, string>;
    checklistImages: Record<number, string[]>;
  }>({
    date: new Date().toISOString().split("T")[0],
    toolboxTopic: "",
    workerCount: "",
    training: "ไม่มี",
    accident: "",
    checklist: CHECKLIST_ITEMS.reduce(
      (acc, item) => ({ ...acc, [item.id]: "pass" }),
      {} as Record<number, string>
    ),
    checklistImages: {},
  });
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);

  const handleChecklistChange = (id: number, val: string) => {
    setFormData((prev) => ({
      ...prev,
      checklist: { ...prev.checklist, [id]: val },
    }));
  };

  const uploadChecklistImage = async (itemId: number, file: File): Promise<string | null> => {
    if (!storage || !firebaseUser?.uid) return null;
    const path = `daily-reports/${firebaseUser.uid}_${Date.now()}_${itemId}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytesResumable(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  };

  const handleImageSelect = async (itemId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const current = formData.checklistImages[itemId] || [];
    if (current.length >= MAX_IMAGES_PER_ITEM) return;
    setUploadingItemId(itemId);
    try {
      const file = files[0];
      const url = await uploadChecklistImage(itemId, file);
      if (url) {
        setFormData((prev) => ({
          ...prev,
          checklistImages: {
            ...prev.checklistImages,
            [itemId]: [...(prev.checklistImages[itemId] || []), url].slice(0, MAX_IMAGES_PER_ITEM),
          },
        }));
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploadingItemId(null);
      e.target.value = "";
    }
  };

  const removeChecklistImage = (itemId: number, index: number) => {
    setFormData((prev) => {
      const list = (prev.checklistImages[itemId] || []).filter((_, i) => i !== index);
      const next = { ...prev.checklistImages };
      if (list.length) next[itemId] = list;
      else delete next[itemId];
      return { ...prev, checklistImages: next };
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
        <h2 className="font-bold text-blue-900">สร้างรายงานประจำวัน</h2>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700"
        >
          ยกเลิก
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Section 2.1 - 2.3 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              วันที่รายงาน
            </label>
            <input
              type="date"
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              2.2 จำนวนคนงาน (คน)
            </label>
            <input
              type="number"
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              value={formData.workerCount}
              onChange={(e) =>
                setFormData({ ...formData, workerCount: e.target.value })
              }
              placeholder="0"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              2.1 หัวข้อ Toolbox Talk
            </label>
            <input
              type="text"
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2"
              value={formData.toolboxTopic}
              onChange={(e) =>
                setFormData({ ...formData, toolboxTopic: e.target.value })
              }
              placeholder="เช่น การทำงานบนที่สูง, การใช้ PPE"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              2.3 การจัดอบรม (ถ้ามี)
            </label>
            <textarea
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 border p-2 h-20"
              value={formData.training}
              onChange={(e) =>
                setFormData({ ...formData, training: e.target.value })
              }
            ></textarea>
          </div>
        </div>

        {/* Section 2.4 Checklist */}
        <div className="border-t pt-4">
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600" />
            2.4 การตรวจความปลอดภัยประจำวัน
          </h3>
          <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
            {CHECKLIST_ITEMS.map((item) => {
              const images = formData.checklistImages[item.id] || [];
              const canAdd = images.length < MAX_IMAGES_PER_ITEM;
              const isUploading = uploadingItemId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 border-b border-gray-200 last:border-0 pb-4 last:pb-0"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-sm text-gray-700">{item.text}</span>
                    <div className="flex gap-2 flex-shrink-0">
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name={`chk-${item.id}`}
                          checked={formData.checklist[item.id] === "pass"}
                          onChange={() => handleChecklistChange(item.id, "pass")}
                          className="text-green-600 focus:ring-green-500"
                        />
                        <span className="ml-1 text-xs text-gray-600">ปกติ</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name={`chk-${item.id}`}
                          checked={formData.checklist[item.id] === "warn"}
                          onChange={() => handleChecklistChange(item.id, "warn")}
                          className="text-yellow-600 focus:ring-yellow-500"
                        />
                        <span className="ml-1 text-xs text-gray-600">แก้ไข</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name={`chk-${item.id}`}
                          checked={formData.checklist[item.id] === "fail"}
                          onChange={() => handleChecklistChange(item.id, "fail")}
                          className="text-red-600 focus:ring-red-500"
                        />
                        <span className="ml-1 text-xs text-gray-600">อันตราย</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-2">
                    <span className="text-xs text-gray-500">อัปโหลดรูป (ไม่บังคับ สูงสุด {MAX_IMAGES_PER_ITEM} รูป)</span>
                    {canAdd && (
                      <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 bg-white text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
                        <Upload size={14} />
                        {isUploading ? "กำลังอัปโหลด..." : "เลือกรูป"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => handleImageSelect(item.id, e)}
                        />
                      </label>
                    )}
                  </div>
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-0 sm:pl-2">
                      {images.map((url, idx) => (
                        <div key={url} className="relative group">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={url} alt={`รูป ${idx + 1}`} className="w-16 h-16 object-cover rounded border border-gray-200 shadow-sm" />
                          </a>
                          <button
                            type="button"
                            onClick={() => removeChecklistImage(item.id, idx)}
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 group-hover:opacity-100 text-xs"
                            title="ลบรูป"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2.5 Accident & 2.6 Photos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
          <div>
            <label className="block text-sm font-medium text-red-700 mb-1 flex items-center gap-1">
              <AlertTriangle size={16} /> 2.5 รายงานอุบัติเหตุ
            </label>
            <textarea
              className="w-full border-red-200 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 border p-2 h-24 bg-red-50"
              value={formData.accident}
              onChange={(e) =>
                setFormData({ ...formData, accident: e.target.value })
              }
              placeholder="ระบุรายละเอียดหากมีอุบัติเหตุ (ถ้าไม่มี ให้เว้นว่าง)"
            ></textarea>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Camera size={16} /> 2.6 รูปถ่าย/เอกสารแนบ
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex flex-col justify-center items-center text-gray-400 text-sm bg-gray-50">
              <span className="mb-1">คลิกเพื่ออัพโหลดรูปภาพ</span>
              <span className="text-xs text-gray-300">(ระบบจำลอง)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
        >
          ยกเลิก
        </button>
        <button
          onClick={() => onSubmit({ ...formData, checklistImages: formData.checklistImages || {} })}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
        >
          ส่งรายงาน
        </button>
      </div>
    </div>
  );
}

function ReportDetail({
  report,
  currentUser,
  hasWorkflowRole,
  onBack,
  onUpdateStatus,
  onMarkSeen,
}: {
  report: Report;
  currentUser: User;
  hasWorkflowRole: (roleId: string) => boolean;
  onBack: () => void;
  onUpdateStatus: (id: number, status: string, label: string, roleLabel?: string) => void;
  onMarkSeen: (id: number) => void;
}) {
  // Logic to determine available actions — ใช้สิทธิ์บทบาทที่ User มี (ไม่ต้องเลือกสลับ)
  let canAction = false;
  let actionLabel = "";
  let nextStatus = "";
  let buttonColor = "";
  let actionRoleLabel = "";

  if (hasWorkflowRole("site_mgr") && report.status === "PENDING_SITE_MGR") {
    canAction = true;
    actionLabel = "รับทราบ (ส่งต่อ CM)";
    nextStatus = "PENDING_CM";
    buttonColor = "bg-blue-600 hover:bg-blue-700";
    actionRoleLabel = "Site Safety Manager";
  } else if (hasWorkflowRole("cm") && report.status === "PENDING_CM") {
    canAction = true;
    actionLabel = "รับทราบ (ส่งต่อ CMG Mgr)";
    nextStatus = "PENDING_CMG_MGR";
    buttonColor = "bg-blue-600 hover:bg-blue-700";
    actionRoleLabel = "Construction Manager (CM)";
  } else if (hasWorkflowRole("cmg_mgr") && report.status === "PENDING_CMG_MGR") {
    canAction = true;
    actionLabel = "อนุมัติ (บันทึกเข้าระบบ)";
    nextStatus = "APPROVED";
    buttonColor = "bg-green-600 hover:bg-green-700";
    actionRoleLabel = "CMG Safety Manager";
  }

  const isExec = hasWorkflowRole("exec");
  const hasSeen = report.acknowledgedByExecs.includes(currentUser.name);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-10">
      {/* Header */}
      <div className="bg-white p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center text-gray-500 hover:text-blue-600 font-medium"
        >
          <ChevronRight className="rotate-180" size={20} /> กลับ
        </button>
        <div className="flex flex-col items-end">
          <span className="text-sm text-gray-500">สถานะเอกสาร</span>
          <StatusBadge status={report.status} />
        </div>
      </div>

      <div className="p-6">
        {/* Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
              Doc No. {getReportDocNo(report)}
            </span>
            <span className="text-gray-500 text-sm">{report.date}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {report.toolboxTopic}
          </h1>
          <p className="text-gray-600 mt-1">ผู้รายงาน: {report.staffName}</p>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 bg-gray-50 p-4 rounded-lg">
          <div>
            <span className="block text-xs text-gray-400 uppercase">คนงาน</span>
            <span className="font-semibold text-lg">
              {report.workerCount} คน
            </span>
          </div>
          <div>
            <span className="block text-xs text-gray-400 uppercase">
              การอบรม
            </span>
            <span className="font-semibold">{report.training || "-"}</span>
          </div>
          <div className="col-span-2">
            <span className="block text-xs text-gray-400 uppercase">
              อุบัติเหตุ
            </span>
            <span
              className={`font-semibold ${
                report.accident && report.accident !== "ไม่มี"
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {report.accident || "ไม่มีรายงาน"}
            </span>
          </div>
        </div>

        {/* Checklist View */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-900 mb-3 border-b pb-2">
            ผลการตรวจสอบความปลอดภัย
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHECKLIST_ITEMS.map((item) => {
              const status = report.checklist[item.id] || "pass";
              const statusColors: Record<string, string> = {
                pass: "text-green-600 bg-green-50 border-green-200",
                warn: "text-yellow-600 bg-yellow-50 border-yellow-200",
                fail: "text-red-600 bg-red-50 border-red-200",
              };
              const statusIcon: Record<string, React.ReactNode> = {
                pass: <CheckCircle size={16} />,
                warn: <AlertTriangle size={16} />,
                fail: <AlertTriangle size={16} />,
              };
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded border ${statusColors[status]}`}
                >
                  <span className="text-sm font-medium">{item.category}</span>
                  {statusIcon[status]}
                </div>
              );
            })}
          </div>
          {/* รูปภาพแนบรายการ 2.4 */}
          {report.checklistImages && Object.keys(report.checklistImages).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
                <Camera size={16} /> รูปภาพแนบการตรวจความปลอดภัยประจำวัน
              </h4>
              <div className="space-y-3">
                {CHECKLIST_ITEMS.filter((item) => (report.checklistImages || {})[item.id]?.length).map((item) => (
                  <div key={item.id}>
                    <p className="text-xs text-gray-600 mb-1">{item.category}</p>
                    <div className="flex flex-wrap gap-2">
                      {(report.checklistImages![item.id] || []).map((url, idx) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={url} alt={`${item.category} ${idx + 1}`} className="w-20 h-20 object-cover rounded border border-gray-200 shadow-sm hover:opacity-90" />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Approval History */}
        <div className="border-t pt-6">
          <h3 className="font-bold text-gray-900 mb-4">ประวัติการดำเนินการ</h3>
          <div className="space-y-4">
            {report.history.map((h: HistoryEntry, idx: number) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
                  {idx !== report.history.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-200 my-1"></div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    {h.role}
                  </div>
                  <div className="text-sm text-gray-600">{h.action}</div>
                  <div className="text-xs text-gray-400">{h.time}</div>
                </div>
              </div>
            ))}

            {/* Show Exec Views */}
            {report.acknowledgedByExecs.length > 0 && (
              <div className="flex gap-3 mt-4">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    ผู้บริหารรับทราบแล้ว
                  </div>
                  <div className="text-sm text-gray-600">
                    {report.acknowledgedByExecs.join(", ")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-gray-50 p-4 border-t border-gray-200 sticky bottom-0">
        {canAction ? (
          <button
            onClick={() =>
              onUpdateStatus(report.id, nextStatus, actionLabel.split(" ")[0], actionRoleLabel)
            }
            className={`w-full py-3 rounded-lg text-white font-bold shadow-md transition-transform transform active:scale-95 ${buttonColor}`}
          >
            {actionLabel}
          </button>
        ) : isExec && report.status === "APPROVED" ? (
          <button
            onClick={() => onMarkSeen(report.id)}
            disabled={hasSeen}
            className={`w-full py-3 rounded-lg font-bold shadow-sm border transition-colors ${
              hasSeen
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-white text-blue-600 border-blue-600 hover:bg-blue-50"
            }`}
          >
            {hasSeen
              ? "คุณได้รับทราบข้อมูลแล้ว"
              : "กดเพื่อรับทราบข้อมูล (For Information Only)"}
          </button>
        ) : (
          <div className="text-center text-gray-500 text-sm">
            {report.status === "APPROVED"
              ? "เอกสารถูกอนุมัติและจัดเก็บเรียบร้อยแล้ว"
              : "รอผู้มีอำนาจดำเนินการในขั้นตอนต่อไป"}
          </div>
        )}
      </div>
    </div>
  );
}
