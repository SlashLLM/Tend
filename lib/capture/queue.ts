/**
 * Offline-first capture queue (PRD M4.7). Every capture item is written to IndexedDB
 * BEFORE upload, then uploaded in order with retries. Nothing is lost if the signal drops
 * or the tab reloads; up to 60 minutes of audio fits comfortably.
 */
export type QueuedItem = {
  key: string; // `${obsId}:${kind}:${seq}`
  obsId: string;
  kind: 'audio_chunk' | 'photo' | 'note' | 'moment' | 'video';
  seq: number;
  t: number;
  text?: string;
  blob?: Blob;
  attempts: number;
};

const DB = 'tend-capture';
const STORE = 'queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' }).createIndex('obsId', 'obsId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const keyOf = (obsId: string, kind: string, seq: number) => `${obsId}:${kind}:${seq}`;

export async function enqueue(item: Omit<QueuedItem, 'key' | 'attempts'>) {
  await tx('readwrite', (s) => s.put({ ...item, key: keyOf(item.obsId, item.kind, item.seq), attempts: 0 }));
}

export async function pending(obsId: string): Promise<QueuedItem[]> {
  const all = await tx<QueuedItem[]>('readonly', (s) => s.index('obsId').getAll(obsId));
  return all.sort((a, b) => a.t - b.t || a.seq - b.seq);
}

export async function remove(key: string) {
  await tx('readwrite', (s) => s.delete(key));
}

async function bump(item: QueuedItem) {
  await tx('readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1 }));
}

export type Uploaded = { key: string; transcript: string | null };
export type Dropped = { key: string; kind: QueuedItem['kind']; error: string };

/**
 * Upload everything pending for an observation, in order. Stops at the first network failure.
 * An item the server keeps refusing (4xx) is dropped so the queue never jams — and reported through
 * `onDropped`, so the person is told instead of seeing "All saved".
 */
export async function flush(
  obsId: string,
  onUploaded?: (u: Uploaded) => void,
  onDropped?: (d: Dropped) => void,
): Promise<{ sent: number; left: number }> {
  let sent = 0;
  const items = await pending(obsId);
  for (const it of items) {
    const fd = new FormData();
    fd.set('kind', it.kind);
    fd.set('seq', String(it.seq));
    fd.set('t_offset_ms', String(Math.round(it.t)));
    if (it.text) fd.set('text', it.text);
    if (it.blob) fd.set('file', it.blob, `${it.kind}-${it.seq}`);
    try {
      const res = await fetch(`/api/observations/${obsId}/capture`, { method: 'POST', body: fd });
      if (res.status >= 500 || res.status === 0) throw new Error(`server ${res.status}`);
      if (!res.ok) {
        // 4xx: permanent (e.g. capture already ended) — drop after a few tries so the queue never jams
        if (it.attempts >= 2) {
          const error = await res.json().then((b: { error?: string }) => b.error ?? `HTTP ${res.status}`).catch(() => `HTTP ${res.status}`);
          await remove(it.key);
          onDropped?.({ key: it.key, kind: it.kind, error });
        } else await bump(it);
        continue;
      }
      const body = (await res.json()) as { transcript?: string | null };
      await remove(it.key);
      sent++;
      onUploaded?.({ key: it.key, transcript: body.transcript ?? null });
    } catch {
      await bump(it);
      break; // offline — try again later
    }
  }
  return { sent, left: (await pending(obsId)).length };
}
