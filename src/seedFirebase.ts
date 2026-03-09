import { getDoc, getDocs, setDoc, doc, collection } from "firebase/firestore";
import { db } from "./firebase";

const ROOT_COLLECTION = "CMG-Tool-Store-Management";
const ROOT_DOC = "root";

export type SeedData = {
  projects: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
  craneTrainees: Array<Record<string, unknown>>;
  confinedTrainees: Array<Record<string, unknown>>;
  trainingSignIns: Array<Record<string, unknown>>;
};

/**
 * Seed mock data to Firestore once.
 * Path: CMG-Tool-Store-Management > root > {projects|reports|audits|...}
 * Skips if root document has seeded: true.
 */
export async function seedToFirebase(data: SeedData): Promise<boolean> {
  if (!db) return false;
  const rootRef = doc(db, ROOT_COLLECTION, ROOT_DOC);

  try {
    const rootSnap = await getDoc(rootRef);
    if (rootSnap.exists() && rootSnap.data()?.seeded === true) {
      return false;
    }

    const categories: (keyof SeedData)[] = [
      "projects",
      "reports",
      "audits",
      "craneTrainees",
      "confinedTrainees",
      "trainingSignIns",
    ];

    for (const cat of categories) {
      const items = data[cat] as Array<{ id: number }>;
      if (!items || !Array.isArray(items)) continue;
      const colRef = collection(rootRef, cat);
      for (const item of items) {
        const id = item.id === 0 ? Date.now() + Math.random() : item.id;
        await setDoc(doc(colRef, String(id)), { ...item, id });
      }
    }

    await setDoc(rootRef, { seeded: true, seededAt: new Date().toISOString() });
    return true;
  } catch (err) {
    console.error("[seedFirebase]", err);
    return false;
  }
}

/**
 * ย้าย documents จาก collection ระดับบน "projects" ไปไว้ใน
 * CMG-Tool-Store-Management > root > projects (subcollection)
 * เรียกครั้งเดียวหลัง migrate แล้วลบ collection เก่าจาก Console ได้
 */
export async function migrateProjectsIntoRoot(): Promise<{ count: number; error?: string }> {
  if (!db) return { count: 0, error: "Firebase ไม่ได้เชื่อมต่อ" };
  try {
    const oldRef = collection(db, "projects");
    const snap = await getDocs(oldRef);
    const rootRef = doc(db, ROOT_COLLECTION, ROOT_DOC);
    const newRef = collection(rootRef, "projects");
    let count = 0;
    for (const d of snap.docs) {
      await setDoc(doc(newRef, d.id), d.data());
      count++;
    }
    return { count };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[migrateProjectsIntoRoot]", err);
    return { count: 0, error: msg };
  }
}
