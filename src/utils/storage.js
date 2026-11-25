/**
 * localStorage の安全ラッパー（SSR / Node環境 / Safariプライベートモード / 容量超過対応）
 */

function isStorageAvailable() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function safeGetItem(key, fallback = null) {
  if (!isStorageAvailable()) return fallback;
  try {
    const val = localStorage.getItem(key);
    return val === null ? fallback : val;
  } catch {
    return fallback;
  }
}

let lastStorageErrorNotifiedAt = 0;
const STORAGE_ERROR_THROTTLE_MS = 3000;

function notifyStorageError(key, err) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  const now = Date.now();
  if (now - lastStorageErrorNotifiedAt < STORAGE_ERROR_THROTTLE_MS) return;
  lastStorageErrorNotifiedAt = now;
  try {
    window.dispatchEvent(
      new CustomEvent('soccer-pickup-storage-error', {
        detail: { key, name: err?.name || 'StorageError' },
      })
    );
  } catch {
    // ignore
  }
}

export function safeSetItem(key, value) {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch (err) {
    console.warn(`localStorage.setItem failed for "${key}":`, err);
    notifyStorageError(key, err);
    return false;
  }
}

export function safeRemoveItem(key) {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
