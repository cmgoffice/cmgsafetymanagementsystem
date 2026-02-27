import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  OrderByDirection,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Generic real-time Firestore collection hook.
 * T must have an `id` field (number or string).
 *
 * Documents are stored as:
 *   /{collectionName}/{id}
 * with all fields of T serialised to Firestore.
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
    const q = query(
      collection(db, collectionName),
      orderBy(orderField, orderDir)
    );

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
    try {
      const id = item.id === 0 ? Date.now() : item.id;
      const docRef = doc(db, collectionName, String(id));
      await setDoc(docRef, { ...item, id });
    } catch (err) {
      console.error(`[Firestore] saveItem(${collectionName}):`, err);
      alert(`บันทึกข้อมูลไม่สำเร็จ: ${(err as Error).message}`);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await deleteDoc(doc(db, collectionName, String(id)));
    } catch (err) {
      console.error(`[Firestore] deleteItem(${collectionName}):`, err);
      alert(`ลบข้อมูลไม่สำเร็จ: ${(err as Error).message}`);
    }
  };

  return { items, loading, saveItem, deleteItem };
}
