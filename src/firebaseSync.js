/**
 * Firebase Firestore による家族間リアルタイムクラウド自動同期マネージャー
 */

import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, withTimeout } from './firebaseClient.js';
import {
  getSavedSchedules,
  mergeImportedEvents,
  removeDeletedSchedules,
} from './scheduleStore.js';
import {
  getVenueDocs,
  getFitnessRecords,
  getCoachNotes,
  mergeImportedVenueDocs,
  mergeImportedFitnessRecords,
  mergeImportedCoachNotes,
  removeDeletedFromVault,
} from './teamVaultStore.js';
import { safeGetItem, safeSetItem, safeRemoveItem } from './utils/storage.js';
import { getDeletedIds, mergeDeletedIds } from './utils/tombstones.js';

export const FAMILY_STORAGE_KEY = 'soccer_pickup_family_id_v1';
export const DEVICE_NAME_KEY = 'soccer_pickup_device_name_v1';

/**
 * 家族合言葉（Family ID）のバリデーション（パストラバーサル・空白・記号を禁止）
 */
export function validateFamilyId(raw) {
  const clean = String(raw ?? '').trim().toLowerCase();
  if (!clean) {
    return { valid: false, familyId: '', reason: '合言葉を入力してください。' };
  }
  if (clean.length < 4 || clean.length > 64) {
    return { valid: false, familyId: clean, reason: '合言葉は4〜64文字で指定してください。' };
  }
  if (/[/\\.\s#$\[\]]/.test(clean)) {
    return {
      valid: false,
      familyId: clean,
      reason: 'スラッシュ(/)・ドット(.)・空白・記号(#$[])は使用できません。',
    };
  }
  return { valid: true, familyId: clean, reason: '' };
}

/**
 * 推測されにくい家族合言葉を生成（例: fam-9a3f2c1b4e8d）
 */
export function generateRandomFamilyId() {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `fam-${hex}`;
}

/**
 * 保存された家族合言葉（Family ID）を取得
 */
export function getSavedFamilyId() {
  return String(safeGetItem(FAMILY_STORAGE_KEY, '')).trim();
}

/**
 * 家族合言葉（Family ID）を保存
 */
export function saveFamilyId(familyId) {
  const raw = String(familyId ?? '').trim().toLowerCase();
  if (!raw) {
    safeRemoveItem(FAMILY_STORAGE_KEY);
    return '';
  }
  const check = validateFamilyId(raw);
  if (!check.valid) return '';
  safeSetItem(FAMILY_STORAGE_KEY, check.familyId);
  return check.familyId;
}

/**
 * 端末名（ニックネーム）を取得
 */
export function getSavedDeviceName() {
  const saved = safeGetItem(DEVICE_NAME_KEY, '');
  if (saved) return saved;
  const isMobile =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const defaultName = isMobile ? 'スマホ' : 'PC';
  safeSetItem(DEVICE_NAME_KEY, defaultName);
  return defaultName;
}

/**
 * 端末名を保存
 */
export function saveDeviceName(name) {
  safeSetItem(DEVICE_NAME_KEY, (name || '').trim() || '家族');
}

/**
 * 家族招待用URLを生成（URLフラグメント #family= を使用してサーバーログやReferrer流出を防止）
 */
export function generateFamilyInviteUrl(familyId) {
  const fid = familyId || getSavedFamilyId();
  if (!fid) return '';
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://soccer-pickup-calc.web.app';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  return `${origin}${pathname}#family=${encodeURIComponent(fid)}`;
}

/**
 * URLフラグメント（#family=...）またはレガシー検索クエリ（?family=...）から招待コードを取得
 */
export function parseFamilyInviteUrl() {
  if (typeof window === 'undefined') return null;
  const hashMatch = window.location.hash.match(/[#&]family=([^&]+)/);
  const searchMatch = window.location.search.match(/[?&]family=([^&]+)/);
  const rawToken = hashMatch?.[1] || searchMatch?.[1];
  if (!rawToken) return null;
  try {
    const decoded = decodeURIComponent(rawToken).trim();
    const check = validateFamilyId(decoded);
    return check.valid ? check.familyId : null;
  } catch {
    return null;
  }
}

// 内部リッスン解除・自己送信エコー抑止用変数
let unsubscribeSnapshot = null;
let lastLocalPushedAt = 0;

/**
 * クラウド（Firestore）へ現在のローカル全データをアップロード同期
 */
export async function pushAllToCloud(familyIdParam = null) {
  const check = validateFamilyId(familyIdParam || getSavedFamilyId());
  if (!check.valid) return { success: false, reason: 'invalid-family-id', error: check.reason };
  if (!db) return { success: false, reason: 'no-db', error: 'Firestoreが初期化されていません。' };

  try {
    const schedules = getSavedSchedules();
    const venueDocs = getVenueDocs();
    const fitnessRecords = getFitnessRecords();
    const coachNotes = getCoachNotes();
    const deletedIds = getDeletedIds();
    const now = Date.now();
    lastLocalPushedAt = now;

    const familyDocRef = doc(db, 'families', check.familyId);
    await withTimeout(
      setDoc(familyDocRef, {
        schedules: schedules.slice(0, 120),
        venueDocs: venueDocs.slice(0, 50),
        fitnessRecords: fitnessRecords.slice(0, 120),
        coachNotes: coachNotes.slice(0, 50),
        deletedIds,
        updatedAt: now,
        lastUpdatedBy: getSavedDeviceName().slice(0, 50),
        schemaVersion: 2,
      }),
      7000,
      'クラウド保存がタイムアウトしました。通信状況をご確認ください。'
    );

    return { success: true };
  } catch (err) {
    console.error('Failed to push data to cloud:', err);
    return { success: false, error: err?.message || 'クラウド送信に失敗しました。' };
  }
}

/**
 * クラウド（Firestore）の最新データを一度取得してローカルにスマートマージ
 */
export async function pullFromCloud(familyIdParam = null) {
  const check = validateFamilyId(familyIdParam || getSavedFamilyId());
  if (!check.valid) return { success: false, reason: 'invalid-family-id', error: check.reason };
  if (!db) return { success: false, reason: 'no-db', error: 'Firestoreが初期化されていません。' };

  try {
    const familyDocRef = doc(db, 'families', check.familyId);
    const snap = await withTimeout(
      getDoc(familyDocRef),
      7000,
      'クラウド取得がタイムアウトしました。通信状況をご確認ください。'
    );
    if (!snap.exists()) {
      // まだクラウド上にデータがない場合は、現在のローカルデータを初プッシュ
      const pushRes = await pushAllToCloud(check.familyId);
      if (!pushRes.success) return pushRes;
      return { success: true, isNew: true };
    }

    const data = snap.data();
    return applyCloudDataToLocal(data);
  } catch (err) {
    console.error('Failed to pull from cloud:', err);
    return { success: false, error: err?.message || 'クラウド取得に失敗しました。' };
  }
}

/**
 * 手動双方向同期（必ず Pull してマージ・削除反映してから Push し、古い端末による上書き事故を防止）
 */
export async function syncBidirectional(familyIdParam = null) {
  const pullRes = await pullFromCloud(familyIdParam);
  if (!pullRes.success) {
    return pullRes;
  }
  if (pullRes.isNew) {
    return pullRes;
  }
  const pushRes = await pushAllToCloud(familyIdParam);
  if (!pushRes.success) {
    return { ...pullRes, success: false, error: pushRes.error };
  }
  return pullRes;
}

function filterAgainstTombstones(items, delMap) {
  if (!Array.isArray(items)) return [];
  if (!delMap || typeof delMap !== 'object') return items;
  return items.filter((item) => {
    if (!item || !item.id) return Boolean(item);
    const delTs = delMap[item.id];
    if (!delTs) return true;
    const itemTs = item.updatedAt || item.createdAt || 0;
    return itemTs > delTs;
  });
}

/**
 * クラウドデータを受信してLocalStorageへ削除・更新を反映しつつスマートマージ
 */
function applyCloudDataToLocal(cloudData) {
  if (!cloudData) return { success: false, error: 'クラウドデータが空です。' };

  const mergedDeleted = mergeDeletedIds(cloudData.deletedIds);
  removeDeletedSchedules(mergedDeleted.schedules);
  removeDeletedFromVault(mergedDeleted);

  let addedEvents = 0;
  let updatedEvents = 0;

  const incomingSchedules = filterAgainstTombstones(cloudData.schedules, mergedDeleted.schedules);
  if (incomingSchedules.length > 0) {
    const res = mergeImportedEvents(incomingSchedules);
    addedEvents = res.addedCount;
    updatedEvents = res.updatedCount;
  }

  const incomingVenues = filterAgainstTombstones(cloudData.venueDocs, mergedDeleted.venueDocs);
  if (incomingVenues.length > 0) {
    mergeImportedVenueDocs(incomingVenues);
  }

  const incomingFitness = filterAgainstTombstones(cloudData.fitnessRecords, mergedDeleted.fitnessRecords);
  if (incomingFitness.length > 0) {
    mergeImportedFitnessRecords(incomingFitness);
  }

  const incomingCoach = filterAgainstTombstones(cloudData.coachNotes, mergedDeleted.coachNotes);
  if (incomingCoach.length > 0) {
    mergeImportedCoachNotes(incomingCoach);
  }

  return {
    success: true,
    addedEvents,
    updatedEvents,
    lastUpdatedBy: cloudData.lastUpdatedBy || '家族',
    updatedAt: cloudData.updatedAt || Date.now(),
  };
}

/**
 * 家族ドキュメントのリアルタイム監視を開始
 */
export function startFamilyRealtimeSync({ onDataUpdated, onError }) {
  stopFamilyRealtimeSync();

  const check = validateFamilyId(getSavedFamilyId());
  if (!check.valid || !db) return;

  const familyDocRef = doc(db, 'families', check.familyId);

  unsubscribeSnapshot = onSnapshot(
    familyDocRef,
    (snapshot) => {
      if (snapshot.metadata?.hasPendingWrites) return;

      if (snapshot.exists()) {
        const data = snapshot.data();
        if (lastLocalPushedAt && data?.updatedAt === lastLocalPushedAt) {
          return;
        }
        const result = applyCloudDataToLocal(data);
        if (result.success && onDataUpdated) {
          onDataUpdated(result);
        }
      }
    },
    (err) => {
      console.warn('Realtime sync subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * リアルタイム監視を停止
 */
export function stopFamilyRealtimeSync() {
  if (unsubscribeSnapshot) {
    try {
      unsubscribeSnapshot();
    } catch {
      // ignore
    }
    unsubscribeSnapshot = null;
  }
}
