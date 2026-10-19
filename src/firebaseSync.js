/**
 * Firebase Firestore による家族間リアルタイムクラウド自動同期マネージャー
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  getSavedSchedules,
  saveSchedules,
  mergeImportedEvents,
} from './scheduleStore';
import {
  getVenueDocs,
  getFitnessRecords,
  getCoachNotes,
  saveVenueDocs,
  saveFitnessRecords,
  saveCoachNotes,
  mergeImportedVenueDocs,
  mergeImportedFitnessRecords,
  mergeImportedCoachNotes,
} from './teamVaultStore';

const FIREBASE_CONFIG = {
  projectId: 'soccer-pickup-calc',
  appId: '1:1042420843271:web:17e08946792bad06ba7ba2',
  storageBucket: 'soccer-pickup-calc.firebasestorage.app',
  apiKey: 'AIzaSyBSXCduEYpZJ_YbQAnGqb_yNX0SLQL0W8k',
  authDomain: 'soccer-pickup-calc.firebaseapp.com',
  messagingSenderId: '1042420843271',
};

export const FAMILY_STORAGE_KEY = 'soccer_pickup_family_id_v1';
export const DEVICE_NAME_KEY = 'soccer_pickup_device_name_v1';

// Firebase初期化（シングルトン）
let db = null;
try {
  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  db = getFirestore(app);
} catch (err) {
  console.error('Failed to initialize Firebase SDK:', err);
}

/**
 * 保存された家族合言葉（Family ID）を取得
 */
export function getSavedFamilyId() {
  try {
    return (localStorage.getItem(FAMILY_STORAGE_KEY) || '').trim();
  } catch (_) {
    return '';
  }
}

/**
 * 家族合言葉（Family ID）を保存
 */
export function saveFamilyId(familyId) {
  try {
    const clean = (familyId || '').trim();
    if (clean) {
      localStorage.setItem(FAMILY_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(FAMILY_STORAGE_KEY);
    }
    return clean;
  } catch (_) {
    return familyId;
  }
}

/**
 * 端末名（ニックネーム）を取得
 */
export function getSavedDeviceName() {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved) return saved;
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const defaultName = isMobile ? 'スマホ' : 'PC';
    localStorage.setItem(DEVICE_NAME_KEY, defaultName);
    return defaultName;
  } catch (_) {
    return '端末';
  }
}

/**
 * 端末名を保存
 */
export function saveDeviceName(name) {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, (name || '').trim() || '家族');
  } catch (_) {}
}

/**
 * 家族招待用URLを生成（タップするだけで合言葉入力不要でグループ自動参加）
 */
export function generateFamilyInviteUrl(familyId) {
  const fid = familyId || getSavedFamilyId();
  if (!fid) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://soccer-pickup-calc.web.app';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  return `${origin}${pathname}?family=${encodeURIComponent(fid)}`;
}

/**
 * URLクエリパラメータから家族招待コード（?family=...）を取得
 */
export function parseFamilyInviteUrl() {
  if (typeof window === 'undefined') return null;
  const match = window.location.search.match(/[?&]family=([^&]+)/);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch (_) {
    return null;
  }
}

// 内部リッスン解除用変数
let unsubscribeSnapshot = null;
let isPushingLocalChange = false;

/**
 * クラウド（Firestore）へ現在のローカル全データをアップロード同期
 */
export async function pushAllToCloud(familyIdParam = null) {
  const familyId = (familyIdParam || getSavedFamilyId()).trim().toLowerCase();
  if (!familyId || !db) return { success: false, reason: 'no-family-id' };

  try {
    isPushingLocalChange = true;
    const schedules = getSavedSchedules();
    const venueDocs = getVenueDocs();
    const fitnessRecords = getFitnessRecords();
    const coachNotes = getCoachNotes();

    const familyDocRef = doc(db, 'families', familyId);
    await setDoc(
      familyDocRef,
      {
        schedules: schedules.slice(0, 80),
        venueDocs: venueDocs.slice(0, 30),
        fitnessRecords: fitnessRecords.slice(0, 50),
        coachNotes: coachNotes.slice(0, 30),
        updatedAt: Date.now(),
        lastUpdatedBy: getSavedDeviceName(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (err) {
    console.error('Failed to push data to cloud:', err);
    return { success: false, error: err.message };
  } finally {
    // 自身がプッシュしたスナップショット通知を無視するためのディレイ
    setTimeout(() => {
      isPushingLocalChange = false;
    }, 1200);
  }
}

/**
 * クラウド（Firestore）の最新データを一度取得してローカルにスマートマージ
 */
export async function pullFromCloud(familyIdParam = null) {
  const familyId = (familyIdParam || getSavedFamilyId()).trim().toLowerCase();
  if (!familyId || !db) return { success: false, reason: 'no-family-id' };

  try {
    const familyDocRef = doc(db, 'families', familyId);
    const snap = await getDoc(familyDocRef);
    if (!snap.exists()) {
      // まだクラウド上にデータがない場合は、現在のローカルデータを初プッシュ
      await pushAllToCloud(familyId);
      return { success: true, isNew: true };
    }

    const data = snap.data();
    return applyCloudDataToLocal(data);
  } catch (err) {
    console.error('Failed to pull from cloud:', err);
    return { success: false, error: err.message };
  }
}

/**
 * クラウドデータを受信してLocalStorageへ重複なくスマートマージ
 */
function applyCloudDataToLocal(cloudData) {
  if (!cloudData) return { success: false };

  let addedEvents = 0;
  let updatedEvents = 0;

  if (Array.isArray(cloudData.schedules) && cloudData.schedules.length > 0) {
    const res = mergeImportedEvents(cloudData.schedules);
    addedEvents = res.addedCount;
    updatedEvents = res.updatedCount;
  }

  if (Array.isArray(cloudData.venueDocs) && cloudData.venueDocs.length > 0) {
    mergeImportedVenueDocs(cloudData.venueDocs);
  }

  if (Array.isArray(cloudData.fitnessRecords) && cloudData.fitnessRecords.length > 0) {
    mergeImportedFitnessRecords(cloudData.fitnessRecords);
  }

  if (Array.isArray(cloudData.coachNotes) && cloudData.coachNotes.length > 0) {
    mergeImportedCoachNotes(cloudData.coachNotes);
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
 * 他の端末（奥さんやお子さん）が更新した瞬間にローカルへ自動反映
 */
export function startFamilyRealtimeSync({ onDataUpdated, onError }) {
  // 既存の購読を解除
  stopFamilyRealtimeSync();

  const familyId = getSavedFamilyId().trim().toLowerCase();
  if (!familyId || !db) return;

  const familyDocRef = doc(db, 'families', familyId);

  unsubscribeSnapshot = onSnapshot(
    familyDocRef,
    (snapshot) => {
      // 自分が直前に送信した更新であれば無視
      if (isPushingLocalChange) return;

      if (snapshot.exists()) {
        const data = snapshot.data();
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
    } catch (_) {}
    unsubscribeSnapshot = null;
  }
}

