import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useFirestoreCollection } from "./useFirestore";
import { seedToFirebase } from "./seedFirebase";
import { collection, doc, getDocs } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { findMasterEmployee } from "./masterDatabase";
import type { MasterEmployeeRecord } from "./masterDatabase";
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
  Award,
  Calendar,
  FileText,
  ExternalLink,
  Info,
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

type UploadedFileLink = {
  name: string;
  url: string;
};

type CertificateExpireUnit = "day" | "year";

type TrainingRecord = {
  date: string;
  institute: string;
  cer: string;
  cerFiles: UploadedFileLink[];
  certificateExpireValue: string;
  certificateExpireUnit: CertificateExpireUnit;
  remark: string;
};

type CraneTrainee = {
  id: number;
  employeeCode?: string;
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
  trainingHistory: TrainingRecord[];
  round1?: TrainingRecord;
  round2?: TrainingRecord;
  round3?: TrainingRecord;
  round4?: TrainingRecord;
  remark: string;
  checkDate?: string;
};

type ConfinedSpaceTrainee = {
  id: number;
  employeeCode?: string;
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
  trainingHistory: TrainingRecord[];
  round1?: TrainingRecord;
  round2?: TrainingRecord;
  round3?: TrainingRecord;
  round4?: TrainingRecord;
  renewal3yr?: TrainingRecord;
  remark: string;
  checkDate?: string;
};

type TrainingSignIn = {
  id: number;
  regDate: string;
  timeSlot: string;
  seq: number;
  employeeCode1?: string;
  fullName1: string;
  dept1: string;
  position1: string;
  company1: string;
  link1: string;
  link2: string;
  totalCount: number;
  employeeCode2?: string;
  fullName2: string;
  dept2: string;
  company2: string;
  link3: string;
  link4: string;
  remark: string;
};

type SidebarSection = "projects" | "daily-report" | "site-audit" | "crane-register" | "confined-space-register" | "training-signin";
type LookupFeedback = { loading: boolean; error: string; success: string };
type SidebarNavItem = { key: SidebarSection; label: string; icon: React.ReactNode; badgeCount?: number };

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-2xl">
        {children}
      </div>
    </div>
  );
}

function EmployeeCodeLookup({
  label = "รหัสพนักงาน",
  value,
  onChange,
  onCheck,
  loading,
  error,
  success,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onCheck: () => void;
  loading: boolean;
  error: string;
  success: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="กรอกรหัสพนักงาน"
        />
        <button
          type="button"
          onClick={onCheck}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && success && <p className="mt-1 text-xs text-green-600">{success}</p>}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  type = "text",
}: {
  label: string;
  value: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        readOnly
        className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
        placeholder="กด Check เพื่อดึงข้อมูล"
      />
    </div>
  );
}

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

const EMPTY_TRAINING_RECORD: TrainingRecord = {
  date: "",
  institute: "",
  cer: "",
  cerFiles: [],
  certificateExpireValue: "",
  certificateExpireUnit: "day",
  remark: "",
};

function createEmptyTrainingRecord(): TrainingRecord {
  return { ...EMPTY_TRAINING_RECORD };
}

function formatCerSummary(record?: Partial<TrainingRecord> | null): string {
  const fileCount = Array.isArray(record?.cerFiles) ? record?.cerFiles?.length ?? 0 : 0;
  if (fileCount > 0) return `แนบ ${fileCount} ไฟล์`;
  return record?.cer ?? "";
}

function normalizeTrainingRecord(record?: Partial<TrainingRecord> | null): TrainingRecord {
  return {
    date: record?.date ?? "",
    institute: record?.institute ?? "",
    cer: formatCerSummary(record),
    cerFiles: Array.isArray(record?.cerFiles)
      ? record.cerFiles
        .filter((file): file is UploadedFileLink => Boolean(file?.url))
        .map((file) => ({ name: file.name ?? file.url, url: file.url }))
      : [],
    certificateExpireValue:
      record?.certificateExpireValue !== undefined && record?.certificateExpireValue !== null
        ? String(record.certificateExpireValue)
        : "",
    certificateExpireUnit: record?.certificateExpireUnit === "year" ? "year" : "day",
    remark: record?.remark ?? "",
  };
}

function hasTrainingRecordData(record?: Partial<TrainingRecord> | null): boolean {
  return Boolean(
    record &&
    [
      record.date,
      record.institute,
      record.cer,
      record.remark,
      record.certificateExpireValue,
      Array.isArray(record.cerFiles) && record.cerFiles.length > 0 ? "has-files" : "",
    ].some((value) => (value ?? "").toString().trim() !== "")
  );
}

function getCertificateExpireDays(record?: Partial<TrainingRecord> | null): number | null {
  const value = Number(record?.certificateExpireValue ?? "");
  if (!Number.isFinite(value) || value <= 0) return null;
  return (record?.certificateExpireUnit ?? "day") === "year" ? value * 365 : value;
}

function toDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateLabel(value?: string | null): string {
  const date = toDateOnly(value);
  if (!date) return "-";
  return date.toLocaleDateString("en-US");
}

function getTrainingExpiryDate(record?: Partial<TrainingRecord> | null): string {
  const trainingDate = toDateOnly(record?.date ?? "");
  const expireDays = getCertificateExpireDays(record);
  if (!trainingDate || expireDays === null) return "";
  const expiryDate = new Date(trainingDate);
  expiryDate.setDate(expiryDate.getDate() + expireDays);
  const year = expiryDate.getFullYear();
  const month = String(expiryDate.getMonth() + 1).padStart(2, "0");
  const day = String(expiryDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTrainingRemainingDays(record?: Partial<TrainingRecord> | null): number | null {
  const expiryDate = toDateOnly(getTrainingExpiryDate(record));
  if (!expiryDate) return null;
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((expiryDate.getTime() - todayDateOnly.getTime()) / 86400000);
}

function getTrainingExpiryStatus(record?: Partial<TrainingRecord> | null): { label: string; tone: string } | null {
  const remainingDays = getTrainingRemainingDays(record);
  const expiryDate = getTrainingExpiryDate(record);
  if (remainingDays === null || !expiryDate) return null;
  if (remainingDays < 0) {
    return {
      label: `หมดอายุแล้ว ${Math.abs(remainingDays)} วัน (${formatDateLabel(expiryDate)})`,
      tone: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (remainingDays <= 30) {
    return {
      label: `เหลือ ${remainingDays} วัน (${formatDateLabel(expiryDate)})`,
      tone: "bg-amber-100 text-amber-800 border-amber-200",
    };
  }
  return {
    label: `เหลือ ${remainingDays} วัน (${formatDateLabel(expiryDate)})`,
    tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
}

async function uploadCraneCertificateFiles(
  files: File[],
  userId: string,
  traineeId: number | string,
  recordDate: string
): Promise<UploadedFileLink[]> {
  const activeStorage = storage;
  if (!activeStorage || files.length === 0) return [];

  const uploads = files.map(async (file, index) => {
    const safeName = file.name.replace(/\s+/g, "_");
    const path = `crane-certificates/${userId}/${traineeId}_${recordDate || "undated"}_${Date.now()}_${index}_${safeName}`;
    const storageRef = ref(activeStorage, path);
    await uploadBytesResumable(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { name: file.name, url };
  });

  return Promise.all(uploads);
}

async function uploadConfinedCertificateFiles(
  files: File[],
  userId: string,
  traineeId: number | string,
  recordDate: string
): Promise<UploadedFileLink[]> {
  const activeStorage = storage;
  if (!activeStorage || files.length === 0) return [];

  const uploads = files.map(async (file, index) => {
    const safeName = file.name.replace(/\s+/g, "_");
    const path = `confined-space-certificates/${userId}/${traineeId}_${recordDate || "undated"}_${Date.now()}_${index}_${safeName}`;
    const storageRef = ref(activeStorage, path);
    await uploadBytesResumable(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { name: file.name, url };
  });

  return Promise.all(uploads);
}

function getCraneTrainingHistory(trainee?: Partial<CraneTrainee> | null): TrainingRecord[] {
  const directHistory = Array.isArray(trainee?.trainingHistory) ? trainee?.trainingHistory ?? [] : [];
  const legacyHistory = [trainee?.round1, trainee?.round2, trainee?.round3, trainee?.round4];
  const latestTrainingFallback = [
    {
      date: trainee?.lastTrainDate ?? "",
      institute: trainee?.institute ?? "",
      cer: trainee?.cer ?? "",
      cerFiles: [],
      certificateExpireValue: "",
      certificateExpireUnit: "day" as CertificateExpireUnit,
      remark: trainee?.remark ?? "",
    },
  ];
  const source = directHistory.length > 0
    ? directHistory
    : legacyHistory.some((record) => hasTrainingRecordData(record))
      ? legacyHistory
      : latestTrainingFallback;

  return source
    .map((record) => normalizeTrainingRecord(record))
    .filter((record) => hasTrainingRecordData(record));
}

function getCraneTrainingRound(trainee: Partial<CraneTrainee>, index: number): TrainingRecord {
  return getCraneTrainingHistory(trainee)[index] ?? createEmptyTrainingRecord();
}

const CRANE_COURSE_OPTIONS = [
  "ผู้บังคับปั้นจั่น",
  "ผู้ควบคุมการใช้ปั้นจั่น",
  "ผู้ให้สัญญาณแก่ผู้บังคับปั้นจั่น",
  "ผู้ยึดเกาะวัสดุ",
] as const;

const CRANE_COURSE_COLOR_MAP: Record<
  (typeof CRANE_COURSE_OPTIONS)[number],
  {
    optionIdle: string;
    optionActive: string;
    tableSelected: string;
    tableEmpty: string;
    checkSelected: string;
    checkEmpty: string;
  }
> = {
  "ผู้บังคับปั้นจั่น": {
    optionIdle: "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300 hover:bg-amber-100",
    optionActive: "border-amber-400 bg-amber-200 text-amber-950 shadow-sm",
    tableSelected: "border-amber-200 bg-amber-50 text-amber-900",
    tableEmpty: "border-amber-100 bg-amber-50/40 text-amber-200",
    checkSelected: "border-amber-300 bg-amber-200 text-amber-900",
    checkEmpty: "border-amber-200 bg-white text-transparent",
  },
  "ผู้ควบคุมการใช้ปั้นจั่น": {
    optionIdle: "border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-300 hover:bg-sky-100",
    optionActive: "border-sky-400 bg-sky-200 text-sky-950 shadow-sm",
    tableSelected: "border-sky-200 bg-sky-50 text-sky-900",
    tableEmpty: "border-sky-100 bg-sky-50/40 text-sky-200",
    checkSelected: "border-sky-300 bg-sky-200 text-sky-900",
    checkEmpty: "border-sky-200 bg-white text-transparent",
  },
  "ผู้ให้สัญญาณแก่ผู้บังคับปั้นจั่น": {
    optionIdle: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100",
    optionActive: "border-emerald-400 bg-emerald-200 text-emerald-950 shadow-sm",
    tableSelected: "border-emerald-200 bg-emerald-50 text-emerald-900",
    tableEmpty: "border-emerald-100 bg-emerald-50/40 text-emerald-200",
    checkSelected: "border-emerald-300 bg-emerald-200 text-emerald-900",
    checkEmpty: "border-emerald-200 bg-white text-transparent",
  },
  "ผู้ยึดเกาะวัสดุ": {
    optionIdle: "border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-300 hover:bg-rose-100",
    optionActive: "border-rose-400 bg-rose-200 text-rose-950 shadow-sm",
    tableSelected: "border-rose-200 bg-rose-50 text-rose-900",
    tableEmpty: "border-rose-100 bg-rose-50/40 text-rose-200",
    checkSelected: "border-rose-300 bg-rose-200 text-rose-900",
    checkEmpty: "border-rose-200 bg-white text-transparent",
  },
};

function normalizeCraneCourseSelections(course: string): string[] {
  const legacyCourseMap: Record<string, (typeof CRANE_COURSE_OPTIONS)[number]> = {
    "Crane Operator": "ผู้บังคับปั้นจั่น",
    "Crane Controller": "ผู้ควบคุมการใช้ปั้นจั่น",
    "Signal Person": "ผู้ให้สัญญาณแก่ผู้บังคับปั้นจั่น",
    Rigger: "ผู้ยึดเกาะวัสดุ",
  };

  const normalized = course
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => legacyCourseMap[item] || item);

  return CRANE_COURSE_OPTIONS.filter((option) => normalized.includes(option));
}

function formatCraneCourseSelections(selections: string[]): string {
  return CRANE_COURSE_OPTIONS.filter((option) => selections.includes(option)).join(", ");
}

function getCraneCourseOptionClasses(course: string, selected: boolean): string {
  const colors = CRANE_COURSE_COLOR_MAP[course as (typeof CRANE_COURSE_OPTIONS)[number]] ?? {
    optionIdle: "border-gray-200 bg-white text-gray-700 hover:border-yellow-300 hover:bg-yellow-50",
    optionActive: "border-yellow-400 bg-yellow-100 text-yellow-900 shadow-sm",
  };

  return selected ? colors.optionActive : colors.optionIdle;
}

function getCraneCourseTableClasses(course: (typeof CRANE_COURSE_OPTIONS)[number], selected: boolean) {
  const colors = CRANE_COURSE_COLOR_MAP[course];

  return {
    wrapper: selected ? colors.tableSelected : colors.tableEmpty,
    check: selected ? colors.checkSelected : colors.checkEmpty,
  };
}

function getCraneTableColumnClasses(column: { courseOption?: (typeof CRANE_COURSE_OPTIONS)[number] }) {
  return column.courseOption ? "w-24 min-w-[6rem]" : "";
}

function getCraneStatusDotClasses(status: string) {
  if (status === "ปฏิบัติงาน") {
    return "border-green-200 bg-green-500";
  }

  if (status === "พ้นสภาพ" || status === "ลาออก") {
    return "border-red-200 bg-red-500";
  }

  return "border-slate-200 bg-slate-400";
}

function getCraneExpireDateCell(record?: Partial<TrainingRecord> | null): { label: string; classes: string } {
  const remainingDays = getTrainingRemainingDays(record);

  if (remainingDays === null) {
    return {
      label: "-",
      classes: "border-slate-200 bg-slate-50 text-slate-400",
    };
  }

  if (remainingDays < 0) {
    return {
      label: `หมด ${Math.abs(remainingDays)} วัน`,
      classes: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (remainingDays <= 30) {
    return {
      label: `เหลือ ${remainingDays} วัน`,
      classes: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: `เหลือ ${remainingDays} วัน`,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

const INITIAL_CRANE_TRAINEES: CraneTrainee[] = [
  {
    id: 1, fullName: "นายสมชาย ใจดี", company: "บริษัท ก่อสร้างไทย", position: "Rigger", type: "ปั้นจั่นเหนือเมียง", status: "ปฏิบัติงาน",
    project: "J-01", course: "Crane Operator", lastTrainDate: "2023-05-15", institute: "Direction Training", cer: "CR-001",
    trainingHistory: [
      { date: "2021-05-15", institute: "Direction Training", cer: "CR-001-1", cerFiles: [], certificateExpireValue: "365", certificateExpireUnit: "day", remark: "" },
      { date: "2023-05-15", institute: "Direction Training", cer: "CR-001-2", cerFiles: [], certificateExpireValue: "1", certificateExpireUnit: "year", remark: "" },
    ],
    round1: { date: "2021-05-15", institute: "Direction Training", cer: "CR-001-1", cerFiles: [], certificateExpireValue: "365", certificateExpireUnit: "day", remark: "" },
    round2: { date: "2023-05-15", institute: "Direction Training", cer: "CR-001-2", cerFiles: [], certificateExpireValue: "1", certificateExpireUnit: "year", remark: "" },
    round3: createEmptyTrainingRecord(),
    round4: createEmptyTrainingRecord(),
    remark: "", checkDate: "2024-01-10",
  },
];

const INITIAL_CONFINED_TRAINEES: ConfinedSpaceTrainee[] = [
  {
    id: 1, fullName: "นายวิชัย สุขใจ", company: "บริษัท โครงสร้างเหล็ก", position: "Supervisor", type: "ทำงานอยู่", status: "ปฏิบัติงาน",
    project: "J-02", course: "ผู้ควบคุม, ผู้ช่วยเหลือ", lastTrainDate: "2025-11-05", institute: "Direction Training", cer: "CS-001-2",
    trainingHistory: [
      { date: "2022-11-05", institute: "Direction Training", cer: "CS-001-1", cerFiles: [], certificateExpireValue: "3", certificateExpireUnit: "year", remark: "" },
      { date: "2025-11-05", institute: "Direction Training", cer: "CS-001-2", cerFiles: [], certificateExpireValue: "3", certificateExpireUnit: "year", remark: "" },
    ],
    round1: { date: "2022-11-05", institute: "Direction Training", cer: "CS-001-1", cerFiles: [], certificateExpireValue: "3", certificateExpireUnit: "year", remark: "" },
    round2: { date: "2025-11-05", institute: "Direction Training", cer: "CS-001-2", cerFiles: [], certificateExpireValue: "3", certificateExpireUnit: "year", remark: "" },
    round3: createEmptyTrainingRecord(),
    round4: createEmptyTrainingRecord(),
    renewal3yr: createEmptyTrainingRecord(),
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
  const { userProfile, logout } = useAuth();
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<SidebarSection>("daily-report");

  // Daily Report state — Firestore
  const { items: reports, loading: loadingReports, saveItem: saveReport, deleteItem: deleteReportFS } = useFirestoreCollection<Report>("reports", "id", "desc");
  const [reportView, setReportView] = useState<"list" | "create">("list");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

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
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.id - a.id;
      });
  }, [reports, workflowRoles, allowedProjectCodes]);

  const dailyReportActionCount = useMemo(() => {
    let count = 0;

    for (const report of reports) {
      if (
        workflowRoles.includes("site_mgr") &&
        allowedProjectCodes.includes(report.project) &&
        report.status === "PENDING_SITE_MGR"
      ) {
        count += 1;
        continue;
      }

      if (
        workflowRoles.includes("cm") &&
        allowedProjectCodes.includes(report.project) &&
        report.status === "PENDING_CM"
      ) {
        count += 1;
        continue;
      }

      if (workflowRoles.includes("cmg_mgr") && report.status === "PENDING_CMG_MGR") {
        count += 1;
        continue;
      }

      if (
        workflowRoles.includes("exec") &&
        report.status === "APPROVED" &&
        !report.acknowledgedByExecs.includes(currentUser.name)
      ) {
        count += 1;
      }
    }

    return count;
  }, [reports, workflowRoles, allowedProjectCodes, currentUser.name]);
  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

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

  const navItems: SidebarNavItem[] = [
    { key: "projects", label: "โครงการ / Projects", icon: <Building2 size={18} /> },
    { key: "daily-report", label: "Daily Report", icon: <ClipboardList size={18} />, badgeCount: dailyReportActionCount },
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
                <span className="flex-1 text-left">{item.label}</span>
                {item.badgeCount ? (
                  <span
                    className={`min-w-[1.5rem] h-6 px-1.5 rounded-full flex items-center justify-center text-xs font-bold ${
                      activeSection === item.key
                        ? "bg-white/20 text-white"
                        : "bg-red-500 text-white"
                    }`}
                  >
                    {item.badgeCount}
                  </span>
                ) : null}
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

          <div className="mx-auto w-full max-w-[1320px]">
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
                  onSelectReport={(r) => setSelectedReportId(r.id)}
                  onCreateReport={() => setReportView("create")}
                />
              )}
              {reportView === "create" && (
                <ReportForm
                  onCancel={() => setReportView("list")}
                  onSubmit={handleCreateReport}
                />
              )}
              {selectedReport && (
                <ModalShell onClose={() => setSelectedReportId(null)}>
                  <ReportDetail
                    report={selectedReport}
                    currentUser={currentUser}
                    hasWorkflowRole={hasWorkflowRole}
                    onBack={() => setSelectedReportId(null)}
                    onUpdateStatus={updateStatus}
                    onMarkSeen={markAsSeen}
                  />
                </ModalShell>
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
              <CraneRegisterList
                trainees={craneTrainees}
                projectCodes={projectCodes}
                onAdd={() => { setEditingCrane(null); setCraneView("form"); }}
                onEdit={(t: CraneTrainee) => { setEditingCrane(t); setCraneView("form"); }}
                onDelete={handleDeleteCrane}
                onImport={(rows: CraneTrainee[]) => rows.forEach((r) => saveCraneFS(r.id === 0 ? { ...r, id: Date.now() } : r))}
              />
              {craneView === "form" && (
                <ModalShell onClose={() => { setCraneView("list"); setEditingCrane(null); }}>
                  <CraneTraineeForm
                    trainee={editingCrane}
                    projectCodes={projectCodes}
                    onCancel={() => { setCraneView("list"); setEditingCrane(null); }}
                    onSave={handleSaveCrane}
                  />
                </ModalShell>
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
                <ModalShell onClose={() => { setConfinedView("list"); setEditingConfined(null); }}>
                  <ConfinedSpaceTraineeForm
                    trainee={editingConfined}
                    projectCodes={projectCodes}
                    onCancel={() => { setConfinedView("list"); setEditingConfined(null); }}
                    onSave={handleSaveConfined}
                  />
                </ModalShell>
              )}
            </>
          )}

          </div>
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
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="text-blue-600" size={22} />
          CMG — ใบลงชื่อเข้ารับการอบรม
        </h2>
        <div className="text-sm text-slate-500">เธ—เธฑเนเธเธซเธกเธ” {records.length} เธฃเธฒเธขเธเธฒเธฃ {search && `(เธเธฃเธญเธเนเธฅเนเธง ${filtered.length} เธฃเธฒเธขเธเธฒเธฃ)`}</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[24px] p-4 sm:p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative" ref={columnPopupRef}>
            <button
              type="button"
              onClick={() => setColumnPopupOpen((o) => !o)}
              className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3.5 py-2.5 rounded-xl text-sm font-medium transition"
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
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3.5 py-2.5 rounded-xl text-sm font-medium transition">
            <FileDown size={15} /> ดาวน์โหลด Template
          </button>
          <label className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition cursor-pointer">
            <Upload size={15} /> Import Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3.5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
            <Download size={15} /> Export Excel
          </button>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 bg-[#183b6b] hover:bg-[#122f55] text-white px-3.5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
            <Plus size={15} /> เพิ่มรายการ
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="ค้นหาชื่อ, บริษัท, วันที่..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
  employeeCode1: "",
  employeeCode2: "",
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
  const [form, setForm] = useState<TrainingSignIn>({
    ...EMPTY_TRAINING_SIGNIN,
    ...(record ?? {}),
    employeeCode1: record?.employeeCode1 ?? "",
    employeeCode2: record?.employeeCode2 ?? "",
  });
  const [employeeCode1, setEmployeeCode1] = useState(record?.employeeCode1 ?? "");
  const [employeeCode2, setEmployeeCode2] = useState(record?.employeeCode2 ?? "");
  const [lookup1, setLookup1] = useState<LookupFeedback>({ loading: false, error: "", success: "" });
  const [lookup2, setLookup2] = useState<LookupFeedback>({ loading: false, error: "", success: "" });

  const set = (field: keyof TrainingSignIn, val: string | number) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  const handleEmployeeCode1Change = (value: string) => {
    setEmployeeCode1(value);
    setLookup1({ loading: false, error: "", success: "" });
    setForm((prev) => ({
      ...prev,
      employeeCode1: value,
      fullName1: "",
      dept1: "",
      position1: "",
      company1: "",
    }));
  };

  const handleEmployeeCode2Change = (value: string) => {
    setEmployeeCode2(value);
    setLookup2({ loading: false, error: "", success: "" });
    setForm((prev) => ({
      ...prev,
      employeeCode2: value,
      fullName2: "",
      dept2: "",
      company2: "",
    }));
  };

  const applyEmployeeToPerson1 = (employee: MasterEmployeeRecord | null, code: string) => {
    setForm((prev) => ({
      ...prev,
      employeeCode1: code,
      fullName1: employee?.fullName || "",
      dept1: employee?.department || "",
      position1: employee?.position || "",
      company1: employee?.company || "",
    }));
  };

  const applyEmployeeToPerson2 = (employee: MasterEmployeeRecord | null, code: string) => {
    setForm((prev) => ({
      ...prev,
      employeeCode2: code,
      fullName2: employee?.fullName || "",
      dept2: employee?.department || "",
      company2: employee?.company || "",
    }));
  };

  const handleLookup1 = async () => {
    const code = employeeCode1.trim();
    if (!code) {
      setLookup1({ loading: false, error: "กรุณากรอกรหัสพนักงาน", success: "" });
      applyEmployeeToPerson1(null, "");
      return;
    }

    setLookup1({ loading: true, error: "", success: "" });
    try {
      const employee = await findMasterEmployee(code);
      if (!employee) {
        applyEmployeeToPerson1(null, code);
        setLookup1({ loading: false, error: "ไม่พบข้อมูลพนักงานจาก MasterDatabase", success: "" });
        return;
      }
      applyEmployeeToPerson1(employee, code);
      setLookup1({ loading: false, error: "", success: "พบข้อมูลพนักงานแล้ว" });
    } catch (error) {
      applyEmployeeToPerson1(null, code);
      setLookup1({
        loading: false,
        error: error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อ MasterDatabase ได้",
        success: "",
      });
    }
  };

  const handleLookup2 = async () => {
    const code = employeeCode2.trim();
    if (!code) {
      setLookup2({ loading: false, error: "กรุณากรอกรหัสพนักงาน", success: "" });
      applyEmployeeToPerson2(null, "");
      return;
    }

    setLookup2({ loading: true, error: "", success: "" });
    try {
      const employee = await findMasterEmployee(code);
      if (!employee) {
        applyEmployeeToPerson2(null, code);
        setLookup2({ loading: false, error: "ไม่พบข้อมูลพนักงานจาก MasterDatabase", success: "" });
        return;
      }
      applyEmployeeToPerson2(employee, code);
      setLookup2({ loading: false, error: "", success: "พบข้อมูลพนักงานแล้ว" });
    } catch (error) {
      applyEmployeeToPerson2(null, code);
      setLookup2({
        loading: false,
        error: error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อ MasterDatabase ได้",
        success: "",
      });
    }
  };

  const txt = (label: string, field: keyof TrainingSignIn, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
  );

  const handleSave = () => {
    if (!form.fullName1.trim()) {
      alert("กรุณากรอกรหัสพนักงานคนที่ 1 และกด Check");
      return;
    }
    if (employeeCode2.trim() && !form.fullName2.trim()) {
      alert("กรุณากด Check สำหรับรหัสพนักงานคนที่ 2");
      return;
    }

    onSave({
      ...form,
      employeeCode1: employeeCode1.trim(),
      employeeCode2: employeeCode2.trim(),
    });
  };

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

        <div>
          <h3 className="text-sm font-bold text-blue-700 mb-3 border-b border-blue-100 pb-1">ข้อมูลผู้อบรม คนที่ 1</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EmployeeCodeLookup
              value={employeeCode1}
              onChange={handleEmployeeCode1Change}
              onCheck={handleLookup1}
              loading={lookup1.loading}
              error={lookup1.error}
              success={lookup1.success}
            />
            <ReadOnlyField label="ชื่อ-นามสกุล" value={form.fullName1} />
            <ReadOnlyField label="สังกัด" value={form.dept1} />
            <ReadOnlyField label="ตำแหน่ง" value={form.position1} />
            <ReadOnlyField label="บริษัท" value={form.company1} />
            {txt("Link ใบลงชื่อ (Google Drive)", "link1")}
            {txt("Link ใบรับรอง (Google Drive)", "link2")}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-indigo-700 mb-3 border-b border-indigo-100 pb-1">ข้อมูลผู้อบรม คนที่ 2</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EmployeeCodeLookup
              value={employeeCode2}
              onChange={handleEmployeeCode2Change}
              onCheck={handleLookup2}
              loading={lookup2.loading}
              error={lookup2.error}
              success={lookup2.success}
            />
            <ReadOnlyField label="ชื่อ-นามสกุล" value={form.fullName2} />
            <ReadOnlyField label="สังกัด" value={form.dept2} />
            <ReadOnlyField label="บริษัท" value={form.company2} />
            {txt("Link ใบลงชื่อ (Google Drive)", "link3")}
            {txt("Link ใบรับรอง (Google Drive)", "link4")}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={handleSave}
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

const CRANE_BASE_COLUMNS = [
  "ชื่อ-สกุล", "ต้นสังกัด", "ตำแหน่ง", "ประเภทปั้นจั่น", "สถานะ", "โครงการ", "หลักสูตร",
  "วันที่อบรมล่าสุด", "สถาบันอบรม", "CER.",
];

const CRANE_TRAILING_COLUMNS = [
  "หมายเหตุ", "วันที่เช็ค",
];

function getCraneHistoryColumns(historyCount: number): string[] {
  return Array.from({ length: Math.max(1, historyCount) }, (_, index) => {
    const round = index + 1;
    return [
      `อบรมครั้งที่${round}_วันที่`,
      `อบรมครั้งที่${round}_สถาบัน`,
      `อบรมครั้งที่${round}_CER`,
      `อบรมครั้งที่${round}_CERไฟล์`,
      `อบรมครั้งที่${round}_CertificateExpire`,
      `อบรมครั้งที่${round}_CertificateExpireUnit`,
      `อบรมครั้งที่${round}_วันหมดอายุ`,
      `อบรมครั้งที่${round}_คงเหลือวัน`,
      `อบรมครั้งที่${round}_หมายเหตุ`,
    ];
  }).flat();
}

function getCraneExportColumns(historyCount: number): string[] {
  return [...CRANE_BASE_COLUMNS, ...getCraneHistoryColumns(historyCount), ...CRANE_TRAILING_COLUMNS];
}

function craneToRow(t: CraneTrainee): Record<string, string> {
  const trainingHistory = getCraneTrainingHistory(t);
  const row: Record<string, string> = {
    "ชื่อ-สกุล": t.fullName,
    "ต้นสังกัด": t.company,
    "ตำแหน่ง": t.position,
    "ประเภทปั้นจั่น": t.type,
    "สถานะ": t.status,
    "โครงการ": t.project,
    "หลักสูตร": t.course,
    "วันที่อบรมล่าสุด": t.lastTrainDate,
    "สถาบันอบรม": t.institute,
    "CER.": t.cer,
    "หมายเหตุ": t.remark,
    "วันที่เช็ค": t.checkDate || "",
  };

  trainingHistory.forEach((record, index) => {
    const round = index + 1;
    row[`อบรมครั้งที่${round}_วันที่`] = record.date;
    row[`อบรมครั้งที่${round}_สถาบัน`] = record.institute;
    row[`อบรมครั้งที่${round}_CER`] = formatCerSummary(record);
    row[`อบรมครั้งที่${round}_CERไฟล์`] = record.cerFiles.map((file) => `${file.name}|${file.url}`).join("\n");
    row[`อบรมครั้งที่${round}_CertificateExpire`] = record.certificateExpireValue;
    row[`อบรมครั้งที่${round}_CertificateExpireUnit`] = record.certificateExpireUnit === "year" ? "ปี" : "วัน";
    row[`อบรมครั้งที่${round}_วันหมดอายุ`] = getTrainingExpiryDate(record);
    row[`อบรมครั้งที่${round}_คงเหลือวัน`] = getTrainingRemainingDays(record)?.toString() ?? "";
    row[`อบรมครั้งที่${round}_หมายเหตุ`] = record.remark;
  });

  return row;
}

function rowToCrane(row: Record<string, string>, id: number): CraneTrainee {
  const historyIndexes = Array.from(
    new Set(
      Object.keys(row)
        .map((key) => key.match(/^อบรมครั้งที่(\d+)_/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => Number(match[1]))
        .filter((index) => Number.isInteger(index) && index > 0)
    )
  ).sort((a, b) => a - b);

  const fallbackIndexes = historyIndexes.length > 0 ? historyIndexes : [1, 2, 3];

  const trainingHistory = fallbackIndexes
    .map((index) => ({
      date: row[`อบรมครั้งที่${index}_วันที่`] || "",
      institute: row[`อบรมครั้งที่${index}_สถาบัน`] || "",
      cer: row[`อบรมครั้งที่${index}_CER`] || "",
      cerFiles: (row[`อบรมครั้งที่${index}_CERไฟล์`] || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [name, ...urlParts] = item.split("|");
          const url = urlParts.join("|");
          return { name: name || url, url: url || name };
        })
        .filter((file) => Boolean(file.url)),
      certificateExpireValue: row[`อบรมครั้งที่${index}_CertificateExpire`] || "",
      certificateExpireUnit: (["ปี", "year"].includes((row[`อบรมครั้งที่${index}_CertificateExpireUnit`] || "").toLowerCase()) ? "year" : "day") as CertificateExpireUnit,
      remark: row[`อบรมครั้งที่${index}_หมายเหตุ`] || "",
    }))
    .map((record) => normalizeTrainingRecord(record))
    .filter((record) => hasTrainingRecordData(record));

  return syncCraneTrainingHistory({
    id,
    fullName: row["ชื่อ-สกุล"] || "", company: row["ต้นสังกัด"] || "",
    position: row["ตำแหน่ง"] || "", type: row["ประเภทปั้นจั่น"] || "",
    status: row["สถานะ"] || "ปฏิบัติงาน", project: row["โครงการ"] || "",
    course: row["หลักสูตร"] || "", lastTrainDate: row["วันที่อบรมล่าสุด"] || "",
    institute: row["สถาบันอบรม"] || "", cer: row["CER."] || "",
    trainingHistory,
    round1: trainingHistory[0] || createEmptyTrainingRecord(),
    round2: trainingHistory[1] || createEmptyTrainingRecord(),
    round3: trainingHistory[2] || createEmptyTrainingRecord(),
    round4: trainingHistory[3] || createEmptyTrainingRecord(),
    remark: row["หมายเหตุ"] || "", checkDate: row["วันที่เช็ค"] || "",
  }, trainingHistory);
}

const CRANE_TABLE_COLUMNS: { key: string; label: string; courseOption?: (typeof CRANE_COURSE_OPTIONS)[number] }[] = [
  { key: "fullName", label: "ชื่อ-สกุล" },
  { key: "company", label: "ต้นสังกัด" },
  { key: "position", label: "ตำแหน่ง" },
  { key: "type", label: "ประเภทปั้นจั่น" },
  { key: "status", label: "สถานะ" },
  { key: "project", label: "โครงการ" },
  { key: "courseOperator", label: "ผู้บังคับปั้นจั่น", courseOption: "ผู้บังคับปั้นจั่น" },
  { key: "courseController", label: "ผู้ควบคุมการใช้ปั้นจั่น", courseOption: "ผู้ควบคุมการใช้ปั้นจั่น" },
  { key: "courseSignalPerson", label: "ผู้ให้สัญญาณแก่ผู้บังคับปั้นจั่น", courseOption: "ผู้ให้สัญญาณแก่ผู้บังคับปั้นจั่น" },
  { key: "courseRigger", label: "ผู้ยึดเกาะวัสดุ", courseOption: "ผู้ยึดเกาะวัสดุ" },
  { key: "trainingCount", label: "จำนวนครั้ง" },
  { key: "expireDate", label: "Expire Date" },
];

function CraneRegisterList({
  trainees,
  projectCodes,
  onAdd,
  onEdit,
  onDelete,
  onImport,
}: {
  trainees: CraneTrainee[];
  projectCodes: string[];
  onAdd: () => void;
  onEdit: (t: CraneTrainee) => void;
  onDelete: (id: number) => void;
  onImport: (rows: CraneTrainee[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedTrainee, setSelectedTrainee] = useState<CraneTrainee | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    CRANE_TABLE_COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {})
  );
  const [columnPopupOpen, setColumnPopupOpen] = useState(false);
  const columnPopupRef = useRef<HTMLDivElement>(null);
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...projectCodes, ...trainees.map((t) => t.project)]
            .map((project) => project.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [projectCodes, trainees]
  );

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
    (t) => {
      const matchesProject = !projectFilter || t.project === projectFilter;
      const matchesSearch =
        t.fullName.toLowerCase().includes(search.toLowerCase()) ||
        t.project.toLowerCase().includes(search.toLowerCase()) ||
        t.company.toLowerCase().includes(search.toLowerCase());

      return matchesProject && matchesSearch;
    }
  );
  const maxHistoryCount = Math.max(1, ...trainees.map((t) => getCraneTrainingHistory(t).length));

  const handleExportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([getCraneExportColumns(maxHistoryCount)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_crane_register.xlsx");
  };

  const handleExport = () => {
    const rows = trainees.map(craneToRow);
    const ws = XLSX.utils.json_to_sheet(rows, { header: getCraneExportColumns(maxHistoryCount) });
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
        <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <HardHat className="text-yellow-500" size={22} />
          ทะเบียนรายชื่อผู้อบรมปั้นจั่น (Crane)
        </h2>
        <div className="text-sm text-slate-500">ทั้งหมด {filtered.length} รายการ</div>
        </div>
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

      <div className="bg-white border border-slate-200 rounded-[24px] p-4 sm:p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="ค้นหาชื่อ, โครงการ, บริษัท..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          >
            <option value="">ทุกโครงการ</option>
            {projectOptions.map((project) => (
              <option key={project} value={project}>{project}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-2">
        ทั้งหมด {trainees.length} รายการ {(search || projectFilter) && `(กรองแล้ว ${filtered.length} รายการ)`}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">ไม่พบรายการ</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-yellow-500 text-white text-xs">
                <th className="px-3 py-2 text-left font-semibold">#</th>
                {CRANE_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) => (
                  <th key={c.key} className={`px-3 py-2 text-left font-semibold ${getCraneTableColumnClasses(c)}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, idx) => (
                (() => {
                  const trainingHistory = getCraneTrainingHistory(t);
                  const selectedCourses = normalizeCraneCourseSelections(t.course);
                  const trainingCount = trainingHistory.length;
                  const latestTrainingRecord = trainingHistory[trainingHistory.length - 1];
                  const expireDateCell = getCraneExpireDateCell(latestTrainingRecord);

                  return (
                    <tr
                      key={t.id}
                      className={`${idx % 2 === 0 ? "bg-yellow-50" : "bg-white"} cursor-pointer transition hover:bg-yellow-100/80`}
                      onClick={() => setSelectedTrainee(t)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTrainee(t);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      {CRANE_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((col) => (
                        <td key={col.key} className={`px-3 py-2 text-gray-600 whitespace-nowrap ${getCraneTableColumnClasses(col)}`}>
                          {col.courseOption && (() => {
                            const isSelected = selectedCourses.includes(col.courseOption!);
                            const courseClasses = getCraneCourseTableClasses(col.courseOption!, isSelected);

                            return (
                              <span className={`inline-flex items-center justify-center rounded-lg border px-2 py-1.5 ${courseClasses.wrapper}`}>
                                <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${courseClasses.check}`}>
                                  <CheckCircle size={11} />
                                </span>
                              </span>
                            );
                          })()}
                          {col.key === "fullName" && <span className="font-medium text-gray-800">{t.fullName}</span>}
                          {col.key === "company" && t.company}
                          {col.key === "position" && t.position}
                          {col.key === "type" && t.type}
                          {col.key === "status" && (
                            <span
                              className="inline-flex w-full items-center justify-center"
                              title={t.status}
                              aria-label={t.status}
                            >
                              <span className={`inline-flex h-3.5 w-3.5 rounded-full border ${getCraneStatusDotClasses(t.status)}`} />
                            </span>
                          )}
                          {col.key === "project" && t.project}
                          {col.key === "trainingCount" && (
                            <span className="inline-flex min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                              {trainingCount}
                            </span>
                          )}
                          {col.key === "expireDate" && (
                            <span className={`inline-flex min-w-[92px] items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${expireDateCell.classes}`}>
                              {expireDateCell.label}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTrainee && (
        <CraneTraineeDetailModal
          trainee={selectedTrainee}
          onClose={() => setSelectedTrainee(null)}
          onEdit={(trainee) => {
            setSelectedTrainee(null);
            onEdit(trainee);
          }}
          onDelete={(id) => {
            setSelectedTrainee(null);
            onDelete(id);
          }}
        />
      )}
    </div>
  );
}

function CraneTraineeDetailModal({
  trainee,
  onClose,
  onEdit,
  onDelete,
}: {
  trainee: CraneTrainee;
  onClose: () => void;
  onEdit: (trainee: CraneTrainee) => void;
  onDelete: (id: number) => void;
}) {
  const selectedCourses = normalizeCraneCourseSelections(trainee.course);
  const trainingHistory = getCraneTrainingHistory(trainee);

  const infoItems = [
    { label: "รหัสพนักงาน", value: trainee.employeeCode || "-" },
    { label: "ชื่อ-สกุล", value: trainee.fullName || "-" },
    { label: "ต้นสังกัด", value: trainee.company || "-" },
    { label: "ตำแหน่ง", value: trainee.position || "-" },
    { label: "ประเภทปั้นจั่น", value: trainee.type || "-" },
    { label: "สถานะ", value: trainee.status || "-" },
    { label: "โครงการ", value: trainee.project || "-" },
    { label: "จำนวนครั้งอบรม", value: String(trainingHistory.length) },
  ];

  return (
    <ModalShell onClose={onClose}>
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-yellow-100 bg-yellow-50 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <HardHat size={20} className="text-yellow-600" />
              รายละเอียดผู้เข้าอบรมปั้นจั่น
            </h3>
            <p className="mt-1 text-sm text-slate-500">{trainee.fullName || "-"}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="text-sm font-bold text-slate-800">ข้อมูลทั่วไป</h4>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {infoItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-white bg-white px-3 py-2.5 shadow-sm">
                  <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-900">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h4 className="text-sm font-bold text-slate-800">บทบาทที่อบรม</h4>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {CRANE_COURSE_OPTIONS.map((course) => {
                const isSelected = selectedCourses.includes(course);
                const courseClasses = getCraneCourseTableClasses(course, isSelected);

                return (
                  <div key={course} className={`rounded-xl border p-3 ${courseClasses.wrapper}`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${courseClasses.check}`}>
                        <CheckCircle size={11} />
                      </span>
                      <span className="text-xs font-semibold leading-tight">{course}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-slate-800">ประวัติการอบรม</h4>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                ทั้งหมด {trainingHistory.length} ครั้ง
              </span>
            </div>

            {trainingHistory.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
                ยังไม่มีประวัติการอบรม
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {trainingHistory.map((record, index) => {
                  const expiryStatus = getTrainingExpiryStatus(record);
                  const expiryDate = getTrainingExpiryDate(record);

                  return (
                    <div key={`${record.date}-${index}`} className="relative overflow-hidden rounded-2xl border border-yellow-100 bg-gradient-to-br from-yellow-50/20 to-white p-5 shadow-sm transition hover:shadow-md">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500" />
                      
                      <div className="flex flex-wrap items-center justify-between gap-3 pl-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-50 text-yellow-600 border border-yellow-100 shadow-sm">
                            <Award size={20} />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-800">การอบรมครั้งที่ {index + 1}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-505">
                              <Calendar size={13} className="text-slate-400" />
                              <span className="text-slate-505 text-slate-500">{formatDateLabel(record.date)}</span>
                            </div>
                          </div>
                        </div>
                        {expiryStatus && (
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${expiryStatus.tone}`}>
                            {expiryStatus.tone.includes("red") && <AlertTriangle size={13} className="animate-pulse" />}
                            {expiryStatus.tone.includes("amber") && <AlertTriangle size={13} />}
                            {expiryStatus.tone.includes("emerald") && <ShieldCheck size={13} />}
                            {expiryStatus.label}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 pl-2 sm:grid-cols-2 md:grid-cols-4">
                        <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                          <Building2 size={16} className="mt-0.5 text-yellow-600 shrink-0" />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">สถาบันฝึกอบรม</div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-700">{record.institute || "-"}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                          <FileText size={16} className="mt-0.5 text-yellow-600 shrink-0" />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">เลขที่ใบรับรอง</div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-700">{formatCerSummary(record) || "-"}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                          <Clock size={16} className="mt-0.5 text-yellow-600 shrink-0" />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">วันหมดอายุ</div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-700">{formatDateLabel(expiryDate) || "-"}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                          <Upload size={16} className="mt-0.5 text-yellow-600 shrink-0" />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ไฟล์ใบรับรอง</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {record.cerFiles && record.cerFiles.length > 0 ? (
                                record.cerFiles.map((file, fileIndex) => (
                                  <a
                                    key={`${file.url}-${fileIndex}`}
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-md border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-800 hover:bg-yellow-100 transition-all shadow-sm"
                                  >
                                    <ExternalLink size={10} />
                                    {file.name || `ไฟล์ ${fileIndex + 1}`}
                                  </a>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {record.remark && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/20 p-3 ml-2">
                          <Info size={16} className="mt-0.5 text-slate-400 shrink-0" />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">หมายเหตุ</div>
                            <div className="mt-0.5 text-xs text-slate-600 leading-relaxed">{record.remark}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`ต้องการลบรายการ ${trainee.fullName || ""} ใช่หรือไม่?`)) {
                onDelete(trainee.id);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <Trash2 size={15} />
            ลบรายการ
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => onEdit(trainee)}
              className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-yellow-600"
            >
              <Pencil size={15} />
              แก้ไขรายการ
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

const EMPTY_CRANE_TRAINEE: CraneTrainee = {
  employeeCode: "",
  id: 0, fullName: "", company: "", position: "", type: "", status: "ปฏิบัติงาน",
  project: "", course: "", lastTrainDate: "", institute: "", cer: "",
  trainingHistory: [],
  round1: createEmptyTrainingRecord(),
  round2: createEmptyTrainingRecord(),
  round3: createEmptyTrainingRecord(),
  round4: createEmptyTrainingRecord(),
  remark: "", checkDate: "",
};
function syncCraneTrainingHistory(trainee: CraneTrainee, history: TrainingRecord[]): CraneTrainee {
  const normalizedHistory = history
    .map((record) => normalizeTrainingRecord(record))
    .filter((record) => hasTrainingRecordData(record));
  const latestRecord = normalizedHistory[normalizedHistory.length - 1];

  return {
    ...trainee,
    lastTrainDate: latestRecord?.date ?? "",
    institute: latestRecord?.institute ?? "",
    cer: latestRecord ? formatCerSummary(latestRecord) : "",
    remark: latestRecord?.remark ?? "",
    trainingHistory: normalizedHistory,
    round1: normalizedHistory[0] ?? createEmptyTrainingRecord(),
    round2: normalizedHistory[1] ?? createEmptyTrainingRecord(),
    round3: normalizedHistory[2] ?? createEmptyTrainingRecord(),
    round4: normalizedHistory[3] ?? createEmptyTrainingRecord(),
  };
}

function normalizeCraneTrainee(trainee: CraneTrainee | null): CraneTrainee {
  return syncCraneTrainingHistory(
    {
      ...EMPTY_CRANE_TRAINEE,
      ...(trainee ?? {}),
      employeeCode: trainee?.employeeCode ?? "",
      checkDate: trainee?.checkDate ?? "",
    },
    getCraneTrainingHistory(trainee)
  );
}

function CraneTrainingHistoryModal({
  title,
  record,
  traineeKey,
  onClose,
  onSave,
}: {
  title: string;
  record: TrainingRecord;
  traineeKey: string;
  onClose: () => void;
  onSave: (record: TrainingRecord) => void;
}) {
  const [form, setForm] = useState<TrainingRecord>(normalizeTrainingRecord(record));
  const [uploading, setUploading] = useState(false);
  const { firebaseUser } = useAuth();
  const expiryStatus = getTrainingExpiryStatus(form);
  const expiryDate = getTrainingExpiryDate(form);
  const expireDays = getCertificateExpireDays(form);

  const set = (field: keyof TrainingRecord, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (!firebaseUser?.uid || !storage) {
      alert("ไม่สามารถอัปโหลดไฟล์ได้ในขณะนี้");
      event.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploadedFiles = await uploadCraneCertificateFiles(files, firebaseUser.uid, traineeKey, form.date);
      setForm((prev) => {
        const nextFiles = [...prev.cerFiles, ...uploadedFiles];
        return {
          ...prev,
          cerFiles: nextFiles,
          cer: nextFiles.length > 0 ? `แนบ ${nextFiles.length} ไฟล์` : "",
        };
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removeCerFile = (index: number) => {
    setForm((prev) => {
      const nextFiles = prev.cerFiles.filter((_, fileIndex) => fileIndex !== index);
      return {
        ...prev,
        cerFiles: nextFiles,
        cer: nextFiles.length > 0 ? `แนบ ${nextFiles.length} ไฟล์` : "",
      };
    });
  };

  const handleSave = () => {
    if (!form.date.trim()) {
      alert("กรุณากรอกวันที่อบรมล่าสุด");
      return;
    }

    onSave(normalizeTrainingRecord({
      ...form,
      cer: form.cerFiles.length > 0 ? `แนบ ${form.cerFiles.length} ไฟล์` : form.cer,
    }));
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-2xl mx-auto">
        <div className="bg-yellow-50 p-4 border-b border-yellow-100 flex justify-between items-center">
          <h3 className="font-bold text-yellow-900 text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">วันที่อบรมล่าสุด</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <p className="mt-1 text-[11px] text-gray-400">mm/dd/yyyy</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">สถาบันอบรม</label>
              <input
                type="text"
                value={form.institute}
                onChange={(e) => set("institute", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Certificate Expire</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={form.certificateExpireValue}
                  onChange={(e) => set("certificateExpireValue", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="เช่น 1 หรือ 365"
                />
                <select
                  value={form.certificateExpireUnit}
                  onChange={(e) => setForm((prev) => ({ ...prev, certificateExpireUnit: e.target.value as CertificateExpireUnit }))}
                  className="w-32 border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  <option value="day">วัน</option>
                  <option value="year">ปี</option>
                </select>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                {expireDays === null ? "ยังไม่ได้กำหนดวันหมดอายุ" : `${expireDays} วัน (${form.certificateExpireUnit === "year" ? "คำนวณจากปี x 365 วัน" : "กำหนดเป็นวันโดยตรง"})`}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
              <input
                type="text"
                value={form.remark}
                onChange={(e) => set("remark", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">CER.</label>
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-100 transition">
                  <Upload size={15} />
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์ CER"}
                  <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                </label>
                <span className="text-xs text-gray-500">อัปโหลดได้มากกว่า 1 ไฟล์ และไม่จำกัดขนาด</span>
              </div>

              {form.cerFiles.length === 0 ? (
                <div className="text-sm text-gray-500">ยังไม่มีไฟล์ CER</div>
              ) : (
                <div className="space-y-2">
                  {form.cerFiles.map((file, index) => (
                    <div key={`${file.url}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                        {file.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeCerFile(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                        title="ลบไฟล์"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-bold text-slate-800">สถานะใบรับรอง</span>
              {expiryStatus ? (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${expiryStatus.tone}`}>
                  {expiryStatus.label}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  รอข้อมูลวันอบรมและ Certificate Expire
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-600">
              <div><span className="font-medium text-slate-800">วันที่อบรม:</span> {formatDateLabel(form.date)}</div>
              <div><span className="font-medium text-slate-800">วันหมดอายุ:</span> {formatDateLabel(expiryDate)}</div>
              <div><span className="font-medium text-slate-800">CER:</span> {formatCerSummary(form) || "-"}</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={uploading} className="px-6 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 disabled:bg-yellow-300 shadow-sm transition text-sm">บันทึก</button>
        </div>
      </div>
    </ModalShell>
  );
}

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
  const [form, setForm] = useState<CraneTrainee>(() => normalizeCraneTrainee(trainee));
  const [employeeCode, setEmployeeCode] = useState(trainee?.employeeCode ?? "");
  const [lookup, setLookup] = useState<LookupFeedback>({ loading: false, error: "", success: "" });
  const [historyModalState, setHistoryModalState] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const set = (field: keyof CraneTrainee, val: any) => setForm((prev) => ({ ...prev, [field]: val }));
  const selectedCourses = normalizeCraneCourseSelections(form.course);
  const trainingHistory = getCraneTrainingHistory(form);

  const updateTrainingHistory = (updater: (history: TrainingRecord[]) => TrainingRecord[]) => {
    setForm((prev) => syncCraneTrainingHistory(prev, updater(getCraneTrainingHistory(prev))));
  };

  const handleEmployeeCodeChange = (value: string) => {
    setEmployeeCode(value);
    setLookup({ loading: false, error: "", success: "" });
    setForm((prev) => ({
      ...prev,
      employeeCode: value,
      fullName: "",
      status: "",
    }));
  };

  const handleLookup = async () => {
    const code = employeeCode.trim();
    if (!code) {
      setLookup({ loading: false, error: "กรุณากรอกรหัสพนักงาน", success: "" });
      return;
    }

    setLookup({ loading: true, error: "", success: "" });
    try {
      const employee = await findMasterEmployee(code);
      if (!employee) {
        setForm((prev) => ({ ...prev, employeeCode: code, fullName: "", status: "" }));
        setLookup({ loading: false, error: "ไม่พบข้อมูลพนักงานจาก MasterDatabase", success: "" });
        return;
      }
      setForm((prev) => ({
        ...prev,
        employeeCode: code,
        fullName: employee.fullName,
        status: employee.status,
      }));
      setLookup({ loading: false, error: "", success: "พบข้อมูลพนักงานแล้ว" });
    } catch (error) {
      setLookup({
        loading: false,
        error: error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อ MasterDatabase ได้",
        success: "",
      });
    }
  };

  const toggleCourse = (course: (typeof CRANE_COURSE_OPTIONS)[number]) => {
    const nextSelections = selectedCourses.includes(course)
      ? selectedCourses.filter((item) => item !== course)
      : [...selectedCourses, course];

    set("course", formatCraneCourseSelections(nextSelections));
  };

  const txt = (label: string, field: keyof CraneTrainee, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
      {field === "lastTrainDate" && <p className="mt-1 text-[11px] text-gray-400">mm/dd/yyyy</p>}
    </div>
  );

  const openHistoryModal = (index: number | null = null) => setHistoryModalState({ open: true, index });
  const closeHistoryModal = () => setHistoryModalState({ open: false, index: null });

  const handleSaveHistory = (record: TrainingRecord) => {
    updateTrainingHistory((history) => {
      if (historyModalState.index === null) {
        return [...history, record];
      }

      return history.map((item, index) => (index === historyModalState.index ? record : item));
    });
    closeHistoryModal();
  };

  const handleDeleteHistory = (index: number) => {
    updateTrainingHistory((history) => history.slice(0, index));
  };

  const handleSave = () => {
    if (!employeeCode.trim() || !form.fullName.trim()) {
      alert("กรุณากรอกรหัสพนักงานและกด Check ก่อนบันทึก");
      return;
    }

    onSave(syncCraneTrainingHistory({ ...form, employeeCode: employeeCode.trim() }, trainingHistory));
  };

  const modalRecord =
    historyModalState.index === null ? createEmptyTrainingRecord() : trainingHistory[historyModalState.index] ?? createEmptyTrainingRecord();

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
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">ข้อมูลทั่วไป</h3>
            <p className="text-xs text-slate-500 mt-1">ข้อมูลพนักงานและรายละเอียดพื้นฐานของผู้เข้าอบรม</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EmployeeCodeLookup
              value={employeeCode}
              onChange={handleEmployeeCodeChange}
              onCheck={handleLookup}
              loading={lookup.loading}
              error={lookup.error}
              success={lookup.success}
            />
            <ReadOnlyField label="ชื่อ-สกุล" value={form.fullName} />
            {txt("ต้นสังกัด (บริษัท)", "company")}
            {txt("ตำแหน่ง", "position")}
            {txt("ประเภทปั้นจั่น", "type")}
            <ReadOnlyField label="สถานะ" value={form.status} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">โครงการ</label>
              <select
                value={form.project}
                onChange={(e) => set("project", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">-- เลือกโครงการ --</option>
                {projectCodes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-2">หลักสูตร</label>
              <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white p-3">
                <div className="flex min-w-max justify-center gap-3">
                  {CRANE_COURSE_OPTIONS.map((course) => {
                    const isSelected = selectedCourses.includes(course);

                    return (
                      <label
                        key={course}
                        className={`flex min-w-[220px] flex-shrink-0 items-center justify-center gap-3 rounded-xl border px-4 py-3 text-base font-medium cursor-pointer transition ${getCraneCourseOptionClasses(course, isSelected)}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCourse(course)}
                          className="h-5 w-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                        />
                        <span className="whitespace-nowrap text-center leading-tight">{course}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-yellow-200 bg-yellow-50/70 p-5">
          <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="text-sm font-bold text-gray-800">การอบรม</h4>
                <p className="text-xs text-gray-500 mt-1">จัดการผ่านปุ่มเพิ่มการอบรม และระบบจะอัปเดตข้อมูลอบรมล่าสุดให้อัตโนมัติ</p>
              </div>
              <button
                type="button"
                onClick={() => openHistoryModal(null)}
                className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition"
              >
                <Plus size={15} /> Add การอบรม
              </button>
            </div>

            {trainingHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                ยังไม่มีประวัติการอบรม
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {trainingHistory.map((record, index) => (
                  <div key={`${record.date}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    {(() => {
                      const expiryStatus = getTrainingExpiryStatus(record);
                      const expiryDate = getTrainingExpiryDate(record);

                      return (
                        <>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">ครั้งที่ {index + 1}</p>
                        <p className="text-xs text-gray-500">{record.date || "-"}</p>
                        {expiryStatus && (
                          <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${expiryStatus.tone}`}>
                            {expiryStatus.label}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openHistoryModal(index)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="แก้ไข"><Pencil size={14} /></button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(index)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                          title="ลบ"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div><span className="font-medium text-gray-800">สถาบัน:</span> {record.institute || "-"}</div>
                      <div><span className="font-medium text-gray-800">CER.:</span> {formatCerSummary(record) || "-"}</div>
                      <div><span className="font-medium text-gray-800">Certificate Expire:</span> {record.certificateExpireValue ? `${record.certificateExpireValue} ${record.certificateExpireUnit === "year" ? "ปี" : "วัน"}` : "-"}</div>
                      <div><span className="font-medium text-gray-800">วันหมดอายุ:</span> {formatDateLabel(expiryDate)}</div>
                      {record.cerFiles.length > 0 && (
                        <div className="space-y-1">
                          <div><span className="font-medium text-gray-800">ไฟล์ CER:</span> {record.cerFiles.length} ไฟล์</div>
                          <div className="flex flex-col gap-1">
                            {record.cerFiles.map((file, fileIndex) => (
                              <a key={`${file.url}-${fileIndex}`} href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                                {file.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      <div><span className="font-medium text-gray-800">หมายเหตุ:</span> {record.remark || "-"}</div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={handleSave}
          className="px-6 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 shadow-sm transition text-sm">
          บันทึก
        </button>
      </div>

      {historyModalState.open && (
        <CraneTrainingHistoryModal
          title={historyModalState.index === null ? "เพิ่มประวัติการอบรม" : "แก้ไขประวัติการอบรม"}
          record={modalRecord}
          traineeKey={form.employeeCode || String(form.id || "new")}
          onClose={closeHistoryModal}
          onSave={handleSaveHistory}
        />
      )}
    </div>
  );
}

// ============================================================
// CONFINED SPACE REGISTER COMPONENTS
// ============================================================

const CONFINED_BASE_COLUMNS = [
  "ชื่อ-สกุล", "ต้นสังกัด", "ตำแหน่ง", "ประเภท", "สถานะ", "โครงการ", "หลักสูตร",
  "วันที่อบรมล่าสุด", "สถาบันอบรม", "CER.",
];

const CONFINED_TRAILING_COLUMNS = [
  "หมายเหตุ", "วันที่เช็ค",
];

function getConfinedHistoryColumns(historyCount: number): string[] {
  return Array.from({ length: Math.max(1, historyCount) }, (_, index) => {
    const round = index + 1;
    return [
      `อบรมครั้งที่${round}_วันที่`,
      `อบรมครั้งที่${round}_สถาบัน`,
      `อบรมครั้งที่${round}_CER`,
      `อบรมครั้งที่${round}_CERไฟล์`,
      `อบรมครั้งที่${round}_CertificateExpire`,
      `อบรมครั้งที่${round}_CertificateExpireUnit`,
      `อบรมครั้งที่${round}_วันหมดอายุ`,
      `อบรมครั้งที่${round}_คงเหลือวัน`,
      `อบรมครั้งที่${round}_หมายเหตุ`,
    ];
  }).flat();
}

function getConfinedExportColumns(historyCount: number): string[] {
  return [...CONFINED_BASE_COLUMNS, ...getConfinedHistoryColumns(historyCount), ...CONFINED_TRAILING_COLUMNS];
}

const CONFINED_COURSE_OPTIONS = [
  "ผู้อนุญาต",
  "ผู้ควบคุม",
  "ผู้ช่วยเหลือ",
  "ผู้ปฏิบัติงาน",
] as const;

const CONFINED_COURSE_COLOR_MAP: Record<
  (typeof CONFINED_COURSE_OPTIONS)[number],
  {
    optionIdle: string;
    optionActive: string;
    tableSelected: string;
    tableEmpty: string;
    checkSelected: string;
    checkEmpty: string;
  }
> = {
  "ผู้อนุญาต": {
    optionIdle: "border-cyan-200 bg-cyan-50 text-cyan-900 hover:border-cyan-300 hover:bg-cyan-100",
    optionActive: "border-cyan-400 bg-cyan-200 text-cyan-950 shadow-sm",
    tableSelected: "border-cyan-200 bg-cyan-50 text-cyan-900",
    tableEmpty: "border-cyan-100 bg-cyan-50/40 text-cyan-200",
    checkSelected: "border-cyan-300 bg-cyan-200 text-cyan-900",
    checkEmpty: "border-cyan-200 bg-white text-transparent",
  },
  "ผู้ควบคุม": {
    optionIdle: "border-teal-200 bg-teal-50 text-teal-900 hover:border-teal-300 hover:bg-teal-100",
    optionActive: "border-teal-400 bg-teal-200 text-teal-950 shadow-sm",
    tableSelected: "border-teal-200 bg-teal-50 text-teal-900",
    tableEmpty: "border-teal-100 bg-teal-50/40 text-teal-200",
    checkSelected: "border-teal-300 bg-teal-200 text-teal-900",
    checkEmpty: "border-teal-200 bg-white text-transparent",
  },
  "ผู้ช่วยเหลือ": {
    optionIdle: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100",
    optionActive: "border-emerald-400 bg-emerald-200 text-emerald-950 shadow-sm",
    tableSelected: "border-emerald-200 bg-emerald-50 text-emerald-900",
    tableEmpty: "border-emerald-100 bg-emerald-50/40 text-emerald-200",
    checkSelected: "border-emerald-300 bg-emerald-200 text-emerald-900",
    checkEmpty: "border-emerald-200 bg-white text-transparent",
  },
  "ผู้ปฏิบัติงาน": {
    optionIdle: "border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300 hover:bg-blue-100",
    optionActive: "border-blue-400 bg-blue-200 text-blue-950 shadow-sm",
    tableSelected: "border-blue-200 bg-blue-50 text-blue-900",
    tableEmpty: "border-blue-100 bg-blue-50/40 text-blue-200",
    checkSelected: "border-blue-300 bg-blue-200 text-blue-900",
    checkEmpty: "border-blue-200 bg-white text-transparent",
  },
};

function normalizeConfinedCourseSelections(course: string): string[] {
  const legacyCourseMap: Record<string, (typeof CONFINED_COURSE_OPTIONS)[number]> = {
    "Confined Space Safety": "ผู้ปฏิบัติงาน",
  };

  const normalized = course
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => legacyCourseMap[item] || item);

  return CONFINED_COURSE_OPTIONS.filter((option) => normalized.includes(option));
}

function formatConfinedCourseSelections(selections: string[]): string {
  return CONFINED_COURSE_OPTIONS.filter((option) => selections.includes(option)).join(", ");
}

function getConfinedCourseOptionClasses(course: string, selected: boolean): string {
  const colors = CONFINED_COURSE_COLOR_MAP[course as (typeof CONFINED_COURSE_OPTIONS)[number]] ?? {
    optionIdle: "border-gray-200 bg-white text-gray-700 hover:border-teal-300 hover:bg-teal-50",
    optionActive: "border-teal-400 bg-teal-100 text-teal-900 shadow-sm",
  };

  return selected ? colors.optionActive : colors.optionIdle;
}

function getConfinedCourseTableClasses(course: (typeof CONFINED_COURSE_OPTIONS)[number], selected: boolean) {
  const colors = CONFINED_COURSE_COLOR_MAP[course];

  return {
    wrapper: selected ? colors.tableSelected : colors.tableEmpty,
    check: selected ? colors.checkSelected : colors.checkEmpty,
  };
}

function getConfinedTableColumnClasses(column: { courseOption?: (typeof CONFINED_COURSE_OPTIONS)[number] }) {
  return column.courseOption ? "w-24 min-w-[6rem]" : "";
}

function getConfinedStatusDotClasses(status: string) {
  if (status === "ปฏิบัติงาน") {
    return "border-green-200 bg-green-500";
  }

  if (status === "พ้นสภาพ" || status === "ลาออก") {
    return "border-red-200 bg-red-500";
  }

  return "border-slate-200 bg-slate-400";
}

function getConfinedExpireDateCell(record?: Partial<TrainingRecord> | null): { label: string; classes: string } {
  const remainingDays = getTrainingRemainingDays(record);

  if (remainingDays === null) {
    return {
      label: "-",
      classes: "border-slate-200 bg-slate-50 text-slate-400",
    };
  }

  if (remainingDays < 0) {
    return {
      label: `หมด ${Math.abs(remainingDays)} วัน`,
      classes: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (remainingDays <= 30) {
    return {
      label: `เหลือ ${remainingDays} วัน`,
      classes: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: `เหลือ ${remainingDays} วัน`,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function getConfinedTrainingHistory(trainee?: Partial<ConfinedSpaceTrainee> | null): TrainingRecord[] {
  const directHistory = Array.isArray(trainee?.trainingHistory) ? trainee?.trainingHistory ?? [] : [];
  const legacyHistory = [trainee?.round1, trainee?.round2, trainee?.round3, trainee?.round4];
  const latestTrainingFallback = [
    {
      date: trainee?.lastTrainDate ?? "",
      institute: trainee?.institute ?? "",
      cer: trainee?.cer ?? "",
      cerFiles: [],
      certificateExpireValue: "",
      certificateExpireUnit: "day" as CertificateExpireUnit,
      remark: trainee?.remark ?? "",
    },
  ];
  const renewalFallback = trainee?.renewal3yr ? [trainee.renewal3yr] : [];
  const source = directHistory.length > 0
    ? directHistory
    : legacyHistory.some((record) => hasTrainingRecordData(record))
      ? legacyHistory
      : latestTrainingFallback.some((record) => hasTrainingRecordData(record))
        ? latestTrainingFallback
        : renewalFallback;

  return source
    .map((record) => normalizeTrainingRecord(record))
    .filter((record) => hasTrainingRecordData(record));
}

function confinedToRow(t: ConfinedSpaceTrainee): Record<string, string> {
  const trainingHistory = getConfinedTrainingHistory(t);
  const row: Record<string, string> = {
    "ชื่อ-สกุล": t.fullName,
    "ต้นสังกัด": t.company,
    "ตำแหน่ง": t.position,
    "ประเภท": t.type,
    "สถานะ": t.status,
    "โครงการ": t.project,
    "หลักสูตร": t.course,
    "วันที่อบรมล่าสุด": t.lastTrainDate,
    "สถาบันอบรม": t.institute,
    "CER.": t.cer,
    "หมายเหตุ": t.remark,
    "วันที่เช็ค": t.checkDate || "",
  };

  trainingHistory.forEach((record, index) => {
    const round = index + 1;
    row[`อบรมครั้งที่${round}_วันที่`] = record.date;
    row[`อบรมครั้งที่${round}_สถาบัน`] = record.institute;
    row[`อบรมครั้งที่${round}_CER`] = formatCerSummary(record);
    row[`อบรมครั้งที่${round}_CERไฟล์`] = record.cerFiles.map((file) => `${file.name}|${file.url}`).join("\n");
    row[`อบรมครั้งที่${round}_CertificateExpire`] = record.certificateExpireValue;
    row[`อบรมครั้งที่${round}_CertificateExpireUnit`] = record.certificateExpireUnit === "year" ? "ปี" : "วัน";
    row[`อบรมครั้งที่${round}_วันหมดอายุ`] = getTrainingExpiryDate(record);
    row[`อบรมครั้งที่${round}_คงเหลือวัน`] = getTrainingRemainingDays(record)?.toString() ?? "";
    row[`อบรมครั้งที่${round}_หมายเหตุ`] = record.remark;
  });

  return row;
}

function rowToConfined(row: Record<string, string>, id: number): ConfinedSpaceTrainee {
  const historyIndexes = Array.from(
    new Set(
      Object.keys(row)
        .map((key) => key.match(/^อบรมครั้งที่(\d+)_/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => Number(match[1]))
        .filter((index) => Number.isInteger(index) && index > 0)
    )
  ).sort((a, b) => a - b);

  const trainingHistory = historyIndexes
    .map((index) => ({
      date: row[`อบรมครั้งที่${index}_วันที่`] || "",
      institute: row[`อบรมครั้งที่${index}_สถาบัน`] || "",
      cer: row[`อบรมครั้งที่${index}_CER`] || "",
      cerFiles: (row[`อบรมครั้งที่${index}_CERไฟล์`] || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [name, ...urlParts] = item.split("|");
          const url = urlParts.join("|");
          return { name: name || url, url: url || name };
        })
        .filter((file) => Boolean(file.url)),
      certificateExpireValue: row[`อบรมครั้งที่${index}_CertificateExpire`] || "",
      certificateExpireUnit: (["ปี", "year"].includes((row[`อบรมครั้งที่${index}_CertificateExpireUnit`] || "").toLowerCase()) ? "year" : "day") as CertificateExpireUnit,
      remark: row[`อบรมครั้งที่${index}_หมายเหตุ`] || "",
    }))
    .map((record) => normalizeTrainingRecord(record))
    .filter((record) => hasTrainingRecordData(record));

  const legacyRenewal = normalizeTrainingRecord({
    date: row["ครบรอบ3ปี_วันที่"] || "",
    institute: row["ครบรอบ3ปี_สถาบัน"] || "",
    cer: row["ครบรอบ3ปี_CER"] || "",
  });

  const fallbackLatestRecord = normalizeTrainingRecord({
    date: row["วันที่อบรมล่าสุด"] || "",
    institute: row["สถาบันอบรม"] || "",
    cer: row["CER."] || "",
    remark: row["หมายเหตุ"] || "",
  });

  const normalizedHistory = trainingHistory.length > 0
    ? trainingHistory
    : hasTrainingRecordData(fallbackLatestRecord)
      ? [fallbackLatestRecord]
      : hasTrainingRecordData(legacyRenewal)
        ? [legacyRenewal]
        : [];

  return syncConfinedTrainingHistory({
    id,
    fullName: row["ชื่อ-สกุล"] || "",
    company: row["ต้นสังกัด"] || "",
    position: row["ตำแหน่ง"] || "",
    type: row["ประเภท"] || "",
    status: row["สถานะ"] || "ปฏิบัติงาน",
    project: row["โครงการ"] || "",
    course: row["หลักสูตร"] || "",
    lastTrainDate: row["วันที่อบรมล่าสุด"] || "",
    institute: row["สถาบันอบรม"] || "",
    cer: row["CER."] || "",
    trainingHistory: normalizedHistory,
    round1: normalizedHistory[0] || createEmptyTrainingRecord(),
    round2: normalizedHistory[1] || createEmptyTrainingRecord(),
    round3: normalizedHistory[2] || createEmptyTrainingRecord(),
    round4: normalizedHistory[3] || createEmptyTrainingRecord(),
    renewal3yr: legacyRenewal,
    remark: row["หมายเหตุ"] || "",
    checkDate: row["วันที่เช็ค"] || "",
  }, normalizedHistory);
}

const CONFINED_TABLE_COLUMNS: { key: string; label: string; courseOption?: (typeof CONFINED_COURSE_OPTIONS)[number] }[] = [
  { key: "fullName", label: "ชื่อ-สกุล" },
  { key: "company", label: "ต้นสังกัด" },
  { key: "position", label: "ตำแหน่ง" },
  { key: "type", label: "ประเภท" },
  { key: "status", label: "สถานะ" },
  { key: "project", label: "โครงการ" },
  { key: "coursePermit", label: "ผู้อนุญาต", courseOption: "ผู้อนุญาต" },
  { key: "courseSupervisor", label: "ผู้ควบคุม", courseOption: "ผู้ควบคุม" },
  { key: "courseRescuer", label: "ผู้ช่วยเหลือ", courseOption: "ผู้ช่วยเหลือ" },
  { key: "courseWorker", label: "ผู้ปฏิบัติงาน", courseOption: "ผู้ปฏิบัติงาน" },
  { key: "trainingCount", label: "จำนวนครั้ง" },
  { key: "expireDate", label: "Expire Date" },
];

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
  const [selectedTrainee, setSelectedTrainee] = useState<ConfinedSpaceTrainee | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    CONFINED_TABLE_COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {})
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
  const maxHistoryCount = Math.max(1, ...trainees.map((t) => getConfinedTrainingHistory(t).length));

  const handleExportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([getConfinedExportColumns(maxHistoryCount)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_confined_space_register.xlsx");
  };

  const handleExport = () => {
    const rows = trainees.map(confinedToRow);
    const ws = XLSX.utils.json_to_sheet(rows, { header: getConfinedExportColumns(maxHistoryCount) });
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
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wind className="text-teal-500" size={22} />
            ทะเบียนรายชื่อผู้อบรมที่อับอากาศ (Confined Space)
          </h2>
          <div className="text-sm text-slate-500">ทั้งหมด {filtered.length} โครงการ</div>
        </div>
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

      <div className="bg-white border border-slate-200 rounded-[24px] p-4 sm:p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="ค้นหาชื่อ, โครงการ, บริษัท..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
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
                  <th key={c.key} className={`px-3 py-2 text-left font-semibold ${getConfinedTableColumnClasses(c)}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, idx) => (
                (() => {
                  const trainingHistory = getConfinedTrainingHistory(t);
                  const selectedCourses = normalizeConfinedCourseSelections(t.course);
                  const trainingCount = trainingHistory.length;
                  const latestTrainingRecord = trainingHistory[trainingHistory.length - 1];
                  const expireDateCell = getConfinedExpireDateCell(latestTrainingRecord);

                  return (
                    <tr
                      key={t.id}
                      className={`${idx % 2 === 0 ? "bg-teal-50" : "bg-white"} cursor-pointer transition hover:bg-teal-100/80`}
                      onClick={() => setSelectedTrainee(t)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTrainee(t);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      {CONFINED_TABLE_COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((col) => (
                        <td key={col.key} className={`px-3 py-2 text-gray-600 whitespace-nowrap ${getConfinedTableColumnClasses(col)}`}>
                          {col.courseOption && (() => {
                            const isSelected = selectedCourses.includes(col.courseOption!);
                            const courseClasses = getConfinedCourseTableClasses(col.courseOption!, isSelected);

                            return (
                              <span className={`inline-flex items-center justify-center rounded-lg border px-2 py-1.5 ${courseClasses.wrapper}`}>
                                <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${courseClasses.check}`}>
                                  <CheckCircle size={11} />
                                </span>
                              </span>
                            );
                          })()}
                          {!col.courseOption && col.key === "fullName" && <span className="font-medium text-gray-800">{t.fullName}</span>}
                          {!col.courseOption && col.key === "company" && t.company}
                          {!col.courseOption && col.key === "position" && t.position}
                          {!col.courseOption && col.key === "type" && t.type}
                          {!col.courseOption && col.key === "status" && (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex h-3.5 w-3.5 rounded-full border ${getConfinedStatusDotClasses(t.status)}`} />
                              <span>{t.status || "-"}</span>
                            </div>
                          )}
                          {!col.courseOption && col.key === "project" && t.project}
                          {!col.courseOption && col.key === "trainingCount" && (
                            <span className="inline-flex min-w-[2.5rem] justify-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                              {trainingCount}
                            </span>
                          )}
                          {!col.courseOption && col.key === "expireDate" && (
                            <span className={`inline-flex min-w-[5rem] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${expireDateCell.classes}`}>
                              {expireDateCell.label}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTrainee && (
        <ConfinedSpaceTraineeDetailModal
          trainee={selectedTrainee}
          onClose={() => setSelectedTrainee(null)}
          onEdit={(trainee) => {
            setSelectedTrainee(null);
            onEdit(trainee);
          }}
          onDelete={(id) => {
            setSelectedTrainee(null);
            onDelete(id);
          }}
        />
      )}
    </div>
  );
}

function ConfinedSpaceTraineeDetailModal({
  trainee,
  onClose,
  onEdit,
  onDelete,
}: {
  trainee: ConfinedSpaceTrainee;
  onClose: () => void;
  onEdit: (trainee: ConfinedSpaceTrainee) => void;
  onDelete: (id: number) => void;
}) {
  const selectedCourses = normalizeConfinedCourseSelections(trainee.course);
  const trainingHistory = getConfinedTrainingHistory(trainee);

  const infoItems = [
    { label: "รหัสพนักงาน", value: trainee.employeeCode || "-" },
    { label: "ชื่อ-สกุล", value: trainee.fullName || "-" },
    { label: "ต้นสังกัด", value: trainee.company || "-" },
    { label: "ตำแหน่ง", value: trainee.position || "-" },
    { label: "ประเภท", value: trainee.type || "-" },
    { label: "สถานะ", value: trainee.status || "-" },
    { label: "โครงการ", value: trainee.project || "-" },
    { label: "จำนวนครั้งอบรม", value: String(trainingHistory.length) },
  ];

  return (
    <ModalShell onClose={onClose}>
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-teal-100 bg-teal-50 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Wind size={20} className="text-teal-600" />
              รายละเอียดผู้เข้าอบรมที่อับอากาศ
            </h3>
            <p className="mt-1 text-sm text-slate-500">{trainee.fullName || "-"}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <h4 className="text-sm font-bold text-slate-800">ข้อมูลทั่วไป</h4>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {infoItems.map((item) => (
                  <div key={item.label} className="rounded-lg border border-white bg-white px-3 py-2.5 shadow-sm">
                    <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-900">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h4 className="text-sm font-bold text-slate-800">บทบาทที่อบรม</h4>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {CONFINED_COURSE_OPTIONS.map((course) => {
                  const isSelected = selectedCourses.includes(course);
                  const courseClasses = getConfinedCourseTableClasses(course, isSelected);

                  return (
                    <div key={course} className={`rounded-xl border p-3 ${courseClasses.wrapper}`}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${courseClasses.check}`}>
                          <CheckCircle size={11} />
                        </span>
                        <span className="text-xs font-semibold leading-tight">{course}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-slate-800">ประวัติการอบรม</h4>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  ทั้งหมด {trainingHistory.length} ครั้ง
                </span>
              </div>

              {trainingHistory.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
                  ยังไม่มีประวัติการอบรม
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {trainingHistory.map((record, index) => {
                    const expiryStatus = getTrainingExpiryStatus(record);
                    const expiryDate = getTrainingExpiryDate(record);

                    return (
                      <div key={`${record.date}-${index}`} className="relative overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/20 to-white p-5 shadow-sm transition hover:shadow-md">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-500" />
                        
                        <div className="flex flex-wrap items-center justify-between gap-3 pl-2">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 border border-teal-100 shadow-sm">
                              <Award size={20} />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-800">การอบรมครั้งที่ {index + 1}</div>
                              <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-505">
                                <Calendar size={13} className="text-slate-400" />
                                <span className="text-slate-500">{formatDateLabel(record.date)}</span>
                              </div>
                            </div>
                          </div>
                          {expiryStatus && (
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${expiryStatus.tone}`}>
                              {expiryStatus.tone.includes("red") && <AlertTriangle size={13} className="animate-pulse" />}
                              {expiryStatus.tone.includes("amber") && <AlertTriangle size={13} />}
                              {expiryStatus.tone.includes("emerald") && <ShieldCheck size={13} />}
                              {expiryStatus.label}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 pl-2 sm:grid-cols-2 md:grid-cols-4">
                          <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                            <Building2 size={16} className="mt-0.5 text-teal-600 shrink-0" />
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">สถาบันฝึกอบรม</div>
                              <div className="mt-0.5 text-xs font-semibold text-slate-700">{record.institute || "-"}</div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                            <FileText size={16} className="mt-0.5 text-teal-600 shrink-0" />
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">เลขที่ใบรับรอง</div>
                              <div className="mt-0.5 text-xs font-semibold text-slate-700">{formatCerSummary(record) || "-"}</div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                            <Clock size={16} className="mt-0.5 text-teal-600 shrink-0" />
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">วันหมดอายุ</div>
                              <div className="mt-0.5 text-xs font-semibold text-slate-700">{formatDateLabel(expiryDate) || "-"}</div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                            <Upload size={16} className="mt-0.5 text-teal-600 shrink-0" />
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ไฟล์ใบรับรอง</div>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {record.cerFiles && record.cerFiles.length > 0 ? (
                                  record.cerFiles.map((file, fileIndex) => (
                                    <a
                                      key={`${file.url}-${fileIndex}`}
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 hover:bg-teal-100 transition-all shadow-sm"
                                    >
                                      <ExternalLink size={10} />
                                      {file.name || `ไฟล์ ${fileIndex + 1}`}
                                    </a>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {record.remark && (
                          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/20 p-3 ml-2">
                            <Info size={16} className="mt-0.5 text-slate-400 shrink-0" />
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">หมายเหตุ</div>
                              <div className="mt-0.5 text-xs text-slate-600 leading-relaxed">{record.remark}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`ต้องการลบรายการ ${trainee.fullName || ""} ใช่หรือไม่?`)) {
                onDelete(trainee.id);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <Trash2 size={15} />
            ลบรายการ
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => onEdit(trainee)}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
            >
              <Pencil size={15} />
              แก้ไขรายการ
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

const EMPTY_CONFINED_TRAINEE: ConfinedSpaceTrainee = {
  employeeCode: "",
  id: 0, fullName: "", company: "", position: "", type: "", status: "ปฏิบัติงาน",
  project: "", course: "", lastTrainDate: "", institute: "", cer: "",
  trainingHistory: [],
  round1: createEmptyTrainingRecord(),
  round2: createEmptyTrainingRecord(),
  round3: createEmptyTrainingRecord(),
  round4: createEmptyTrainingRecord(),
  renewal3yr: createEmptyTrainingRecord(),
  remark: "", checkDate: "",
};

function syncConfinedTrainingHistory(trainee: ConfinedSpaceTrainee, history: TrainingRecord[]): ConfinedSpaceTrainee {
  const normalizedHistory = history
    .map((record) => normalizeTrainingRecord(record))
    .filter((record) => hasTrainingRecordData(record));
  const latestRecord = normalizedHistory[normalizedHistory.length - 1];

  return {
    ...trainee,
    lastTrainDate: latestRecord?.date ?? "",
    institute: latestRecord?.institute ?? "",
    cer: latestRecord ? formatCerSummary(latestRecord) : "",
    remark: latestRecord?.remark ?? trainee.remark ?? "",
    trainingHistory: normalizedHistory,
    round1: normalizedHistory[0] ?? createEmptyTrainingRecord(),
    round2: normalizedHistory[1] ?? createEmptyTrainingRecord(),
    round3: normalizedHistory[2] ?? createEmptyTrainingRecord(),
    round4: normalizedHistory[3] ?? createEmptyTrainingRecord(),
  };
}

function normalizeConfinedTrainee(trainee: ConfinedSpaceTrainee | null): ConfinedSpaceTrainee {
  return syncConfinedTrainingHistory(
    {
      ...EMPTY_CONFINED_TRAINEE,
      ...(trainee ?? {}),
      employeeCode: trainee?.employeeCode ?? "",
      checkDate: trainee?.checkDate ?? "",
    },
    getConfinedTrainingHistory(trainee)
  );
}

function ConfinedSpaceTrainingHistoryModal({
  title,
  record,
  traineeKey,
  onClose,
  onSave,
}: {
  title: string;
  record: TrainingRecord;
  traineeKey: string;
  onClose: () => void;
  onSave: (record: TrainingRecord) => void;
}) {
  const [form, setForm] = useState<TrainingRecord>(normalizeTrainingRecord(record));
  const [uploading, setUploading] = useState(false);
  const { firebaseUser } = useAuth();
  const expiryStatus = getTrainingExpiryStatus(form);
  const expiryDate = getTrainingExpiryDate(form);
  const expireDays = getCertificateExpireDays(form);

  const set = (field: keyof TrainingRecord, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (!firebaseUser?.uid || !storage) {
      alert("ไม่สามารถอัปโหลดไฟล์ได้ในขณะนี้");
      event.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploadedFiles = await uploadConfinedCertificateFiles(files, firebaseUser.uid, traineeKey, form.date);
      setForm((prev) => {
        const nextFiles = [...prev.cerFiles, ...uploadedFiles];
        return {
          ...prev,
          cerFiles: nextFiles,
          cer: nextFiles.length > 0 ? `แนบ ${nextFiles.length} ไฟล์` : "",
        };
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removeCerFile = (index: number) => {
    setForm((prev) => {
      const nextFiles = prev.cerFiles.filter((_, fileIndex) => fileIndex !== index);
      return {
        ...prev,
        cerFiles: nextFiles,
        cer: nextFiles.length > 0 ? `แนบ ${nextFiles.length} ไฟล์` : "",
      };
    });
  };

  const handleSave = () => {
    if (!form.date.trim()) {
      alert("กรุณากรอกวันที่อบรมล่าสุด");
      return;
    }

    onSave(normalizeTrainingRecord({
      ...form,
      cer: form.cerFiles.length > 0 ? `แนบ ${form.cerFiles.length} ไฟล์` : form.cer,
    }));
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-2xl mx-auto">
        <div className="bg-teal-50 p-4 border-b border-teal-100 flex justify-between items-center">
          <h3 className="font-bold text-teal-900 text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">วันที่อบรมล่าสุด</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <p className="mt-1 text-[11px] text-gray-400">mm/dd/yyyy</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">สถาบันอบรม</label>
              <input
                type="text"
                value={form.institute}
                onChange={(e) => set("institute", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Certificate Expire</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={form.certificateExpireValue}
                  onChange={(e) => set("certificateExpireValue", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="เช่น 3 หรือ 1095"
                />
                <select
                  value={form.certificateExpireUnit}
                  onChange={(e) => setForm((prev) => ({ ...prev, certificateExpireUnit: e.target.value as CertificateExpireUnit }))}
                  className="w-32 border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="day">วัน</option>
                  <option value="year">ปี</option>
                </select>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                {expireDays === null ? "ยังไม่ได้กำหนดวันหมดอายุ" : `${expireDays} วัน (${form.certificateExpireUnit === "year" ? "คำนวณจากปี x 365 วัน" : "กำหนดเป็นวันโดยตรง"})`}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
              <input
                type="text"
                value={form.remark}
                onChange={(e) => set("remark", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">CER.</label>
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-100 transition">
                  <Upload size={15} />
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์ CER"}
                  <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                </label>
                <span className="text-xs text-gray-500">อัปโหลดได้มากกว่า 1 ไฟล์ และไม่จำกัดขนาด</span>
              </div>

              {form.cerFiles.length === 0 ? (
                <div className="text-sm text-gray-500">ยังไม่มีไฟล์ CER</div>
              ) : (
                <div className="space-y-2">
                  {form.cerFiles.map((file, index) => (
                    <div key={`${file.url}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                        {file.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeCerFile(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                        title="ลบไฟล์"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-bold text-slate-800">สถานะใบรับรอง</span>
              {expiryStatus ? (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${expiryStatus.tone}`}>
                  {expiryStatus.label}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  รอข้อมูลวันอบรมและ Certificate Expire
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-600">
              <div><span className="font-medium text-slate-800">วันที่อบรม:</span> {formatDateLabel(form.date)}</div>
              <div><span className="font-medium text-slate-800">วันหมดอายุ:</span> {formatDateLabel(expiryDate)}</div>
              <div><span className="font-medium text-slate-800">CER:</span> {formatCerSummary(form) || "-"}</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={uploading} className="px-6 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 disabled:bg-teal-300 shadow-sm transition text-sm">บันทึก</button>
        </div>
      </div>
    </ModalShell>
  );
}

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
  const [form, setForm] = useState<ConfinedSpaceTrainee>(() => normalizeConfinedTrainee(trainee));
  const [employeeCode, setEmployeeCode] = useState(trainee?.employeeCode ?? "");
  const [lookup, setLookup] = useState<LookupFeedback>({ loading: false, error: "", success: "" });
  const [historyModalState, setHistoryModalState] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const set = (field: keyof ConfinedSpaceTrainee, val: any) => setForm((prev) => ({ ...prev, [field]: val }));
  const selectedCourses = normalizeConfinedCourseSelections(form.course);
  const trainingHistory = getConfinedTrainingHistory(form);

  const updateTrainingHistory = (updater: (history: TrainingRecord[]) => TrainingRecord[]) => {
    setForm((prev) => syncConfinedTrainingHistory(prev, updater(getConfinedTrainingHistory(prev))));
  };

  const handleEmployeeCodeChange = (value: string) => {
    setEmployeeCode(value);
    setLookup({ loading: false, error: "", success: "" });
    setForm((prev) => ({
      ...prev,
      employeeCode: value,
      fullName: "",
      company: "",
      position: "",
      status: "",
    }));
  };

  const handleLookup = async () => {
    const code = employeeCode.trim();
    if (!code) {
      setLookup({ loading: false, error: "กรุณากรอกรหัสพนักงาน", success: "" });
      return;
    }

    setLookup({ loading: true, error: "", success: "" });
    try {
      const employee = await findMasterEmployee(code);
      if (!employee) {
        setForm((prev) => ({ ...prev, employeeCode: code, fullName: "", company: "", position: "", status: "" }));
        setLookup({ loading: false, error: "ไม่พบข้อมูลพนักงานจาก MasterDatabase", success: "" });
        return;
      }

      if (!employee.fullName.trim()) {
        setForm((prev) => ({ ...prev, employeeCode: code, fullName: "", company: employee.company || "", position: employee.position || "", status: employee.status || "" }));
        setLookup({ loading: false, error: "พบข้อมูลพนักงาน แต่ชื่อ-สกุลใน MasterDatabase ยังไม่ครบ", success: "" });
        return;
      }

      setForm((prev) => ({
        ...prev,
        employeeCode: code,
        fullName: employee.fullName,
        company: employee.company || prev.company,
        position: employee.position || prev.position,
        status: employee.status,
      }));
      setLookup({ loading: false, error: "", success: "พบข้อมูลพนักงานแล้ว" });
    } catch (error) {
      setLookup({
        loading: false,
        error: error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อ MasterDatabase ได้",
        success: "",
      });
    }
  };

  const toggleCourse = (course: (typeof CONFINED_COURSE_OPTIONS)[number]) => {
    const nextSelections = selectedCourses.includes(course)
      ? selectedCourses.filter((item) => item !== course)
      : [...selectedCourses, course];

    set("course", formatConfinedCourseSelections(nextSelections));
  };

  const txt = (label: string, field: keyof ConfinedSpaceTrainee, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
      {field === "lastTrainDate" && <p className="mt-1 text-[11px] text-gray-400">mm/dd/yyyy</p>}
    </div>
  );

  const openHistoryModal = (index: number | null = null) => setHistoryModalState({ open: true, index });
  const closeHistoryModal = () => setHistoryModalState({ open: false, index: null });

  const handleSaveHistory = (record: TrainingRecord) => {
    updateTrainingHistory((history) => {
      if (historyModalState.index === null) {
        return [...history, record];
      }

      return history.map((item, index) => (index === historyModalState.index ? record : item));
    });
    closeHistoryModal();
  };

  const handleDeleteHistory = (index: number) => {
    updateTrainingHistory((history) => history.slice(0, index));
  };

  const handleSave = () => {
    if (!employeeCode.trim() || !form.fullName.trim()) {
      alert("กรุณากรอกรหัสพนักงานและกด Check ก่อนบันทึก");
      return;
    }

    onSave(syncConfinedTrainingHistory({ ...form, employeeCode: employeeCode.trim() }, trainingHistory));
  };

  const modalRecord =
    historyModalState.index === null ? createEmptyTrainingRecord() : trainingHistory[historyModalState.index] ?? createEmptyTrainingRecord();

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
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">ข้อมูลทั่วไป</h3>
            <p className="text-xs text-slate-500 mt-1">ข้อมูลพนักงานและรายละเอียดพื้นฐานของผู้เข้าอบรม</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EmployeeCodeLookup
              value={employeeCode}
              onChange={handleEmployeeCodeChange}
              onCheck={handleLookup}
              loading={lookup.loading}
              error={lookup.error}
              success={lookup.success}
            />
            <ReadOnlyField label="ชื่อ-สกุล" value={form.fullName} />
            {txt("ต้นสังกัด (บริษัท)", "company")}
            {txt("ตำแหน่ง", "position")}
            {txt("ประเภท", "type")}
            <ReadOnlyField label="สถานะ" value={form.status} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">โครงการ</label>
              <select
                value={form.project}
                onChange={(e) => set("project", e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="">-- เลือกโครงการ --</option>
                {projectCodes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-2">หลักสูตร</label>
              <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white p-3">
                <div className="flex min-w-max justify-center gap-3">
                  {CONFINED_COURSE_OPTIONS.map((course) => {
                    const isSelected = selectedCourses.includes(course);

                    return (
                      <label
                        key={course}
                        className={`flex min-w-[220px] flex-shrink-0 items-center justify-center gap-3 rounded-xl border px-4 py-3 text-base font-medium cursor-pointer transition ${getConfinedCourseOptionClasses(course, isSelected)}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCourse(course)}
                          className="h-5 w-5 rounded border-gray-300 text-teal-500 focus:ring-teal-400"
                        />
                        <span className="whitespace-nowrap text-center leading-tight">{course}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-5">
          <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="text-sm font-bold text-gray-800">การอบรม</h4>
                <p className="text-xs text-gray-500 mt-1">จัดการผ่านปุ่มเพิ่มการอบรม และระบบจะอัปเดตข้อมูลอบรมล่าสุดให้อัตโนมัติ</p>
              </div>
              <button
                type="button"
                onClick={() => openHistoryModal(null)}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition"
              >
                <Plus size={15} /> Add การอบรม
              </button>
            </div>

            {trainingHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                ยังไม่มีประวัติการอบรม
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {trainingHistory.map((record, index) => (
                  <div key={`${record.date}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    {(() => {
                      const expiryStatus = getTrainingExpiryStatus(record);
                      const expiryDate = getTrainingExpiryDate(record);

                      return (
                        <>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <p className="text-sm font-bold text-gray-800">ครั้งที่ {index + 1}</p>
                              <p className="text-xs text-gray-500">{record.date || "-"}</p>
                              {expiryStatus && (
                                <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${expiryStatus.tone}`}>
                                  {expiryStatus.label}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => openHistoryModal(index)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="แก้ไข"><Pencil size={14} /></button>
                              <button
                                type="button"
                                onClick={() => handleDeleteHistory(index)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                                title="ลบ"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm text-gray-600">
                            <div><span className="font-medium text-gray-800">สถาบัน:</span> {record.institute || "-"}</div>
                            <div><span className="font-medium text-gray-800">CER.:</span> {formatCerSummary(record) || "-"}</div>
                            <div><span className="font-medium text-gray-800">Certificate Expire:</span> {record.certificateExpireValue ? `${record.certificateExpireValue} ${record.certificateExpireUnit === "year" ? "ปี" : "วัน"}` : "-"}</div>
                            <div><span className="font-medium text-gray-800">วันหมดอายุ:</span> {formatDateLabel(expiryDate)}</div>
                            {record.cerFiles.length > 0 && (
                              <div className="space-y-1">
                                <div><span className="font-medium text-gray-800">ไฟล์ CER:</span> {record.cerFiles.length} ไฟล์</div>
                                <div className="flex flex-col gap-1">
                                  {record.cerFiles.map((file, fileIndex) => (
                                    <a key={`${file.url}-${fileIndex}`} href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                                      {file.name}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div><span className="font-medium text-gray-800">หมายเหตุ:</span> {record.remark || "-"}</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
        <button onClick={handleSave}
          className="px-6 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 shadow-sm transition text-sm">
          บันทึก
        </button>
      </div>

      {historyModalState.open && (
        <ConfinedSpaceTrainingHistoryModal
          title={historyModalState.index === null ? "เพิ่มประวัติการอบรม" : "แก้ไขประวัติการอบรม"}
          record={modalRecord}
          traineeKey={form.employeeCode || String(form.id || "new")}
          onClose={closeHistoryModal}
          onSave={handleSaveHistory}
        />
      )}
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
      <div className="flex flex-wrap justify-between items-end gap-3">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="text-blue-600" size={22} />
          ข้อมูลโครงการ / Projects
        </h2>
        <button
          onClick={onAdd}
          className="bg-[#183b6b] hover:bg-[#122f55] text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition text-sm font-medium"
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
          className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[24px] border border-dashed border-slate-300 text-slate-400">
          ไม่พบโครงการ
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-[24px] shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] border border-slate-200 p-4 hover:shadow-lg transition">
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
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={22} />
          Daily Report — รายงานประจำวัน
        </h2>
        <div className="text-sm text-slate-500">{reports.length} รายการที่พร้อมดำเนินการ</div>
        </div>
        {hasWorkflowRole("staff") && (
          <button
            onClick={onCreateReport}
            className="bg-[#183b6b] hover:bg-[#122f55] text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition text-sm font-medium"
          >
            <Plus size={16} /> สร้างรายงานใหม่
          </button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[24px] border border-dashed border-slate-300 text-slate-400">
          ไม่พบรายงานที่ต้องดำเนินการในขณะนี้
        </div>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-slate-200">
              <colgroup>
                <col className="w-[100px]" />
                <col className="w-[150px]" />
                <col className="w-[100px]" />
                <col />
                <col className="w-[96px]" />
                <col className="w-[160px]" />
                <col className="w-[120px]" />
                <col className="w-[92px]" />
              </colgroup>
              <thead className="bg-slate-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-3 py-2 whitespace-nowrap">วันที่</th>
                  <th className="px-3 py-2 whitespace-nowrap">เลขที่เอกสาร</th>
                  <th className="px-3 py-2 whitespace-nowrap">โครงการ</th>
                  <th className="px-3 py-2 whitespace-nowrap">หัวข้อ</th>
                  <th className="px-3 py-2 whitespace-nowrap text-center">คนงาน</th>
                  <th className="px-3 py-2 whitespace-nowrap">ผู้รายงาน</th>
                  <th className="px-3 py-2 whitespace-nowrap text-center">สถานะ</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((report) => {
                  const acknowledged = hasWorkflowRole("exec") && report.acknowledgedByExecs.includes(currentUser.name);
                  return (
                    <tr
                      key={report.id}
                      onClick={() => onSelectReport(report)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectReport(report);
                        }
                      }}
                      tabIndex={0}
                      className="cursor-pointer transition hover:bg-blue-50/70 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <td className="px-3 py-2 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[13px] font-medium leading-none text-slate-800 whitespace-nowrap">
                          <Clock size={12} className="text-slate-400" />
                          {report.date}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap">
                        <span className="block truncate rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold leading-tight text-blue-800">
                          {getReportDocNo(report)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap text-[13px] text-slate-600">
                        {report.project.slice(-4)}
                      </td>
                      <td className="px-3 py-2 align-middle text-[13px] font-medium text-slate-800">
                        <span className="block truncate">{report.toolboxTopic || "-"}</span>
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap text-center text-[13px] text-slate-600">{report.workerCount || 0}</td>
                      <td className="px-3 py-2 align-middle text-[13px] text-slate-600 whitespace-nowrap">
                        <span className="block truncate">{report.staffName}</span>
                        {acknowledged && (
                          <span className="ml-1.5 inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-none text-green-600">
                            <Eye size={10} /> รับรู้แล้ว
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap text-center">
                        <StatusBadge status={report.status} compact />
                      </td>
                      <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] font-medium leading-none text-blue-700">
                          ดู <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="text-blue-600" size={22} />
          Site Audit Report
        </h2>
        <div className="text-sm text-slate-500">{audits.length} audit records</div>
        </div>
        <button
          onClick={onAdd}
          className="bg-[#183b6b] hover:bg-[#122f55] text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition text-sm font-medium"
        >
          <Plus size={16} /> New Audit
        </button>
      </div>

      {audits.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[24px] border border-dashed border-slate-300 text-slate-400">
          ยังไม่มีรายการ Audit
        </div>
      ) : (
        <div className="grid gap-3">
          {audits.sort((a, b) => b.createdAt - a.createdAt).map((audit) => (
            <div
              key={audit.id}
              className="bg-white rounded-[24px] shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] border border-slate-200 p-4 hover:shadow-lg transition"
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

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
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
  const compactLabels: Record<string, string> = {
    PENDING_SITE_MGR: "รอ Site Mgr",
    PENDING_CM: "รอ CM",
    PENDING_CMG_MGR: "รอ CMG Mgr",
    APPROVED: "อนุมัติ",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border font-medium ${
        compact ? "px-1.5 py-0.5 text-[10px] leading-none" : "px-2 py-1 text-xs"
      } ${
        styles[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {(compact ? compactLabels[status] : labels[status]) || status}
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
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-2">
              {CHECKLIST_ITEMS.map((item) => {
                const status = report.checklist[item.id] || "pass";
                const statusColors: Record<string, string> = {
                  pass: "text-green-700 bg-green-50 border-green-200",
                  warn: "text-yellow-700 bg-yellow-50 border-yellow-200",
                  fail: "text-red-700 bg-red-50 border-red-200",
                };
                const statusIcon: Record<string, React.ReactNode> = {
                  pass: <CheckCircle size={12} />,
                  warn: <AlertTriangle size={12} />,
                  fail: <AlertTriangle size={12} />,
                };
                const statusLabel: Record<string, string> = {
                  pass: "ผ่าน",
                  warn: "เฝ้าระวัง",
                  fail: "ไม่ผ่าน",
                };
                return (
                  <div
                    key={item.id}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium leading-none ${statusColors[status]}`}
                    title={`${item.category}: ${statusLabel[status]}`}
                  >
                    {statusIcon[status]}
                    <span className="max-w-[180px] truncate">{item.category}</span>
                  </div>
                );
              })}
            </div>
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
        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-bold text-gray-900">ประวัติการดำเนินการ</h3>
          <div className="space-y-1.5">
            {report.history.map((h: HistoryEntry, idx: number) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[11px] leading-none"
              >
                <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-semibold text-gray-800">{h.role}</span>
                    <span className="truncate text-gray-600">{h.action}</span>
                  </div>
                </div>
                <div className="whitespace-nowrap text-[10px] text-gray-400">{h.time}</div>
              </div>
            ))}

            {/* Show Exec Views */}
            {report.acknowledgedByExecs.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-2.5 py-1.5 text-[11px] leading-none">
                <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500"></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-semibold text-gray-800">ผู้บริหารรับทราบแล้ว</span>
                    <span className="truncate text-gray-600">
                      {report.acknowledgedByExecs.join(", ")}
                    </span>
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
