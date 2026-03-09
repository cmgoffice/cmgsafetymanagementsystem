import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  OrderByDirection,
} from "firebase/firestore";
import { db } from "./firebase";

const ROOT_COLLECTION = "CMG-Tool-Store-Management";
const ROOT_DOC = "root";

/**
 * Subcollection path: CMG-Tool-Store-Management / root / {categoryName}
 * All users (including anonymous) share the same data.
 */
function getSubcollectionRef(categoryName: string) {
  if (!db) return null;
  const rootRef = doc(db, ROOT_COLLECTION, ROOT_DOC);
  return collection(rootRef, categoryName);
}

/**
 * Generic real-time Firestore subcollection hook.
 * Path: CMG-Tool-Store-Management > root > {collectionName}
 * T must have an `id` field (number or string).
 */
export function useFirestoreCollection<T extends { id: number }>(
  collectionName: string,
  orderField: string = "id",
  orderDir: OrderByDirection = "asc"
): {
  items: T[];
  loading: boolean;
  saveItem: (item: T) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
} {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const colRef = getSubcollectionRef(collectionName);
    if (!colRef) {
      setItems([]);
      setLoading(false);
      return;
    }

    const q = query(colRef, orderBy(orderField, orderDir));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => d.data() as T);
        setItems(data);
        setLoading(false);
      },
      (err) => {
        console.error(`[Firestore] ${collectionName}:`, err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collectionName, orderField, orderDir]);

  const saveItem = async (item: T) => {
    if (!db) {
      console.warn("[Firestore] db not ready");
      return;
    }
    try {
      const id = item.id === 0 ? Date.now() : item.id;
      const rootRef = doc(db, ROOT_COLLECTION, ROOT_DOC);
      const docRef = doc(rootRef, collectionName, String(id));
      await setDoc(docRef, { ...item, id });
    } catch (err) {
      console.error(`[Firestore] saveItem(${collectionName}):`, err);
      alert(`บันทึกข้อมูลไม่สำเร็จ: ${(err as Error).message}`);
    }
  };

  const deleteItem = async (id: number) => {
    if (!db) return;
    try {
      const rootRef = doc(db, ROOT_COLLECTION, ROOT_DOC);
      const docRef = doc(rootRef, collectionName, String(id));
      await deleteDoc(docRef);
    } catch (err) {
      console.error(`[Firestore] deleteItem(${collectionName}):`, err);
      alert(`ลบข้อมูลไม่สำเร็จ: ${(err as Error).message}`);
    }
  };

  return { items, loading, saveItem, deleteItem };
}
