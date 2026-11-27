'use client';
import { useEffect } from 'react';

/**
 * Registers the offline service worker (public/sw.js, PRD M4.7) and asks it to upload any queued
 * capture items whenever the connection comes back. Production only: in development it would
 * cache build files under hot reload.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const drain = () => navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: 'tend:drain' })).catch(() => {});
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => {
        if (navigator.onLine) void drain();
      })
      .catch(() => {});
    window.addEventListener('online', drain);
    return () => window.removeEventListener('online', drain);
  }, []);
  return null;
}
