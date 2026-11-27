/* Tend service worker (PRD M4.7 "Works offline": up to 60 minutes cached, syncs later, nothing lost).
 *
 * 1. Caches the app's static files, so a capture page that was opened once reloads with no signal.
 * 2. Uploads the IndexedDB capture queue (lib/capture/queue.ts) in the background — on Background
 *    Sync where the browser has it, and whenever a page asks — even after the tab is closed.
 * 3. Ends a capture that was ended offline, once all of its items are uploaded.
 *
 * Private pages are never cached, except capture pages (needed offline). Signing out clears them.
 * Uploads are idempotent on the server (observation + kind + seq), so the page and this worker can
 * both send the same item safely.
 */
const VERSION = 'v1';
const STATIC_CACHE = `tend-static-${VERSION}`;
const PAGE_CACHE = `tend-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

// Must match lib/capture/queue.ts.
const DB = 'tend-capture';
const DB_VERSION = 2;
const STORE = 'queue';
const ENDS = 'ends';
const SYNC_TAG = 'tend-capture';

const CAPTURE_PAGE = /^(\/(zh|ms))?\/observe\/[0-9a-f-]{36}\/?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(new Request(OFFLINE_URL, { cache: 'reload' }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tend-') && k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Sign-out: forget cached capture pages before the session goes.
  if (req.method === 'POST' && url.pathname === '/auth/signout') {
    event.respondWith(caches.delete(PAGE_CACHE).then(() => fetch(req)));
    return;
  }
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Hashed build files, MediaPipe (face blur) and fonts never change under the same URL.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/mediapipe/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    const capture = CAPTURE_PAGE.test(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (capture && res.ok && !res.redirected) caches.open(PAGE_CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (capture && (await caches.open(PAGE_CACHE).then((c) => c.match(req, { ignoreSearch: true })))) || caches.match(OFFLINE_URL)),
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(drain(true));
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'tend:drain') event.waitUntil(drain(false));
  // In-app navigation fetches RSC data, not HTML, so the capture page asks to be cached for offline reloads.
  if (d.type === 'tend:cache-page' && typeof d.url === 'string') {
    const url = new URL(d.url, self.location.origin);
    if (url.origin === self.location.origin && CAPTURE_PAGE.test(url.pathname)) {
      event.waitUntil(
        fetch(url.pathname, { credentials: 'same-origin', redirect: 'manual' })
          .then((res) => (res.ok && res.type === 'basic' ? caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, res)) : undefined))
          .catch(() => {}),
      );
    }
  }
});

// ───────────── background upload ─────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' }).createIndex('obsId', 'obsId');
      if (!db.objectStoreNames.contains(ENDS)) db.createObjectStore(ENDS, { keyPath: 'obsId' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function req(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let draining = null;

/** Upload everything queued, oldest first per observation; then send any End that is now unblocked. */
function drain(fromSync) {
  if (!draining) draining = run(fromSync).finally(() => (draining = null));
  return draining;
}

async function run(fromSync) {
  const db = await openDb();
  const items = (await req(db, STORE, 'readonly', (s) => s.getAll())).sort((a, b) => a.t - b.t || a.seq - b.seq);
  const byObs = new Map();
  for (const it of items) byObs.set(it.obsId, [...(byObs.get(it.obsId) || []), it]);
  let networkDown = false;

  for (const [obsId, list] of byObs) {
    for (const it of list) {
      const fd = new FormData();
      fd.set('kind', it.kind);
      fd.set('seq', String(it.seq));
      fd.set('t_offset_ms', String(Math.round(it.t)));
      if (it.text) fd.set('text', it.text);
      if (it.blob) fd.set('file', it.blob, `${it.kind}-${it.seq}`);
      let res;
      try {
        res = await fetch(`/api/observations/${obsId}/capture`, { method: 'POST', body: fd, credentials: 'same-origin' });
      } catch {
        networkDown = true;
        break;
      }
      if (res.ok) {
        await req(db, STORE, 'readwrite', (s) => s.delete(it.key));
      } else if (res.status >= 500) {
        await req(db, STORE, 'readwrite', (s) => s.put({ ...it, attempts: it.attempts + 1 }));
        break; // server trouble: keep the order, try later
      } else if (it.attempts >= 2) {
        await req(db, STORE, 'readwrite', (s) => s.delete(it.key)); // refused for good (same rule as the page)
      } else {
        await req(db, STORE, 'readwrite', (s) => s.put({ ...it, attempts: it.attempts + 1 }));
      }
    }
    if (networkDown) break;
  }

  if (!networkDown) {
    const ends = await req(db, ENDS, 'readonly', (s) => s.getAll());
    for (const e of ends) {
      const left = await req(db, STORE, 'readonly', (s) => s.index('obsId').count(e.obsId));
      if (left > 0) continue;
      try {
        const res = await fetch(`/api/observations/${e.obsId}/end`, { method: 'POST', credentials: 'same-origin' });
        // 409 = already ended elsewhere; any other 4xx will not get better by retrying
        if (res.ok || (res.status >= 400 && res.status < 500)) await req(db, ENDS, 'readwrite', (s) => s.delete(e.obsId));
        if (res.ok) notify(e.obsId);
      } catch {
        networkDown = true;
        break;
      }
    }
  }
  // A Background Sync event that rejects is retried by the browser later.
  if (networkDown && fromSync) throw new Error('offline');
}

async function notify(obsId) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const c of clients) c.postMessage({ type: 'tend:ended', obsId });
}
