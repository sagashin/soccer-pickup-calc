import { safeGetItem, safeSetItem } from './storage.js';

/**
 * 削除済みアイテムID（トゥームストーン）管理
 * - 複数端末でのクラウド同期時に、削除したアイテムが他端末のプッシュで復活するのを防止する
 */

export const TOMBSTONES_STORAGE_KEY = 'soccer_pickup_deleted_ids_v1';
const COLLECTIONS = ['schedules', 'venueDocs', 'fitnessRecords', 'coachNotes'];
const MAX_TOMBSTONES_PER_COLLECTION = 200;
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90日

function createEmptyMap() {
  return {
    schedules: {},
    venueDocs: {},
    fitnessRecords: {},
    coachNotes: {},
  };
}

function pruneCollectionMap(mapObj, now = Date.now()) {
  if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) return {};
  const cutoff = now - TOMBSTONE_TTL_MS;
  const entries = Object.entries(mapObj)
    .filter(([id, ts]) => Boolean(id) && typeof ts === 'number' && !Number.isNaN(ts) && ts >= cutoff)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOMBSTONES_PER_COLLECTION);
  return Object.fromEntries(entries);
}

export function getDeletedIds() {
  const empty = createEmptyMap();
  const raw = safeGetItem(TOMBSTONES_STORAGE_KEY, null);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    const now = Date.now();
    const out = createEmptyMap();
    for (const col of COLLECTIONS) {
      out[col] = pruneCollectionMap(parsed[col], now);
    }
    return out;
  } catch {
    return empty;
  }
}

function saveDeletedIds(map) {
  safeSetItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(map));
}

export function markDeleted(collection, id, ts = Date.now()) {
  if (!COLLECTIONS.includes(collection) || !id) return;
  const current = getDeletedIds();
  const prevTs = current[collection][id] || 0;
  current[collection][id] = Math.max(prevTs, ts);
  current[collection] = pruneCollectionMap(current[collection], ts);
  saveDeletedIds(current);
}

export function clearDeleted(collection, id) {
  if (!COLLECTIONS.includes(collection) || !id) return;
  const current = getDeletedIds();
  if (Object.prototype.hasOwnProperty.call(current[collection], id)) {
    delete current[collection][id];
    saveDeletedIds(current);
  }
}

export function mergeDeletedIds(remoteMap) {
  const local = getDeletedIds();
  if (!remoteMap || typeof remoteMap !== 'object') return local;
  const now = Date.now();
  const merged = createEmptyMap();
  for (const col of COLLECTIONS) {
    const combined = { ...(local[col] || {}) };
    const remoteCol = remoteMap[col];
    if (remoteCol && typeof remoteCol === 'object' && !Array.isArray(remoteCol)) {
      for (const [id, ts] of Object.entries(remoteCol)) {
        if (!id || typeof ts !== 'number' || Number.isNaN(ts)) continue;
        combined[id] = Math.max(combined[id] || 0, ts);
      }
    }
    merged[col] = pruneCollectionMap(combined, now);
  }
  saveDeletedIds(merged);
  return merged;
}
