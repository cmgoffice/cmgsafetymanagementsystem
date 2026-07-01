import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { readAppEnv } from "./env";
import { masterDb } from "./firebase";

export type MasterEmployeeRecord = {
  employeeCode: string;
  fullName: string;
  position: string;
  status: string;
  company: string;
  department: string;
  raw: DocumentData;
};

const EMPLOYEE_CODE_FIELD = readAppEnv(
  "VITE_MASTERDATABASE_EMPLOYEE_CODE_FIELD",
  "REACT_APP_MASTERDATABASE_EMPLOYEE_CODE_FIELD"
) || "employeeCode";

const MASTER_COLLECTION_PATH = (
  readAppEnv(
    "VITE_MASTERDATABASE_COLLECTION",
    "REACT_APP_MASTERDATABASE_COLLECTION"
  ) || "employees"
)
  .split("/")
  .map((part) => part.trim())
  .filter(Boolean);

const EMPLOYEE_CODE_FIELDS = [
  EMPLOYEE_CODE_FIELD,
  "employeeId",
  "empCode",
  "code",
  "id",
];

const MASTER_COLLECTION = MASTER_COLLECTION_PATH.join("/");

function readPath(data: DocumentData, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, data);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function pickText(data: DocumentData, paths: string[]): string {
  for (const path of paths) {
    const value = asText(readPath(data, path));
    if (value) return value;
  }
  return "";
}

function normalizeEmploymentStatus(status: string): string {
  const trimmed = status.trim();
  if (trimmed === "ทำงาน") return "ปฏิบัติงาน";
  return trimmed;
}

function buildFullName(data: DocumentData): string {
  const directName = pickText(data, [
    "fullName",
    "name",
    "employeeName",
    "employeeFullName",
    "nameTH",
    "ชื่อ-สกุล",
    "ชื่อ สกุล",
    "ชื่อเต็ม",
    "profile.fullName",
  ]);
  if (directName) return directName;

  const title = pickText(data, [
    "titleName",
    "prefix",
    "ชื่อต้น",
    "คำนำหน้า",
  ]);
  const firstName = pickText(data, [
    "firstName",
    "firstname",
    "employeeFirstName",
    "ชื่อตัว",
    "ชื่อ",
    "profile.firstName",
  ]);
  const lastName = pickText(data, [
    "lastName",
    "lastname",
    "employeeLastName",
    "ชื่อสกุล",
    "นามสกุล",
    "สกุล",
    "profile.lastName",
  ]);

  return `${title}${firstName} ${lastName}`.trim();
}

function normalizeEmployee(
  data: DocumentData,
  employeeCode: string
): MasterEmployeeRecord {
  return {
    employeeCode:
      pickText(data, [
        EMPLOYEE_CODE_FIELD,
        "รหัสพนักงาน",
        "employeeId",
        "empCode",
        "code",
        "id",
      ]) || employeeCode,
    fullName: buildFullName(data),
    position: pickText(data, [
      "position",
      "jobTitle",
      "title",
      "ตำแหน่ง",
      "ตำแหน่งงาน",
      "profile.position",
    ]),
    status: normalizeEmploymentStatus(
      pickText(data, [
        "status",
        "employmentStatus",
        "workStatus",
        "สถานะพนักงาน",
        "สถานะกลุ่มงาน",
        "profile.status",
      ])
    ),
    company: pickText(data, [
      "company",
      "companyName",
      "employer",
      "บริษัท",
      "ต้นสังกัด",
      "หน่วยงาน",
      "สังกัด",
      "profile.company",
    ]),
    department: pickText(data, [
      "department",
      "dept",
      "division",
      "แผนก",
      "ฝ่าย",
      "ส่วนงาน",
      "หน่วยงาน",
      "profile.department",
    ]),
    raw: data,
  };
}

export async function findMasterEmployee(
  employeeCode: string
): Promise<MasterEmployeeRecord | null> {
  const normalizedCode = employeeCode.trim();

  if (!normalizedCode) return null;
  if (!masterDb) {
    throw new Error("MasterDatabase is not configured.");
  }
  if (!MASTER_COLLECTION) {
    throw new Error("MasterDatabase collection path is not configured.");
  }

  const directDoc = await getDoc(doc(masterDb, `${MASTER_COLLECTION}/${normalizedCode}`));
  if (directDoc.exists()) {
    return normalizeEmployee(directDoc.data(), normalizedCode);
  }

  for (const field of EMPLOYEE_CODE_FIELDS) {
    const employeeQuery = query(
      collection(masterDb, MASTER_COLLECTION),
      where(field, "==", normalizedCode),
      limit(1)
    );
    const snapshot = await getDocs(employeeQuery);
    if (!snapshot.empty) {
      return normalizeEmployee(snapshot.docs[0].data(), normalizedCode);
    }
  }

  return null;
}
