/**
 * Firestore /shares/{shareId} を使ったセキュアな共有スナップショット生成・取得
 * - 外部URL短縮サービス（da.gd / tinyurl）へ個人情報を含むペイロードを送信しない
 */

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, withTimeout } from './firebaseClient.js';

const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日間有効

export function generateSecureShareId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidShareId(shareId) {
  return (
    typeof shareId === 'string' &&
    shareId.length >= 16 &&
    shareId.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(shareId)
  );
}

/**
 * ペイロードオブジェクトを Firestore /shares/{shareId} に保存し、短い ?share= URL を返す
 */
export async function createCloudShareSnapshot(payloadObj) {
  if (!db || !payloadObj) return null;
  const payloadStr = JSON.stringify(payloadObj);
  if (!payloadStr || payloadStr.length > 120000) return null;

  const shareId = generateSecureShareId();
  const now = Date.now();
  const shareDocRef = doc(db, 'shares', shareId);

  await withTimeout(
    setDoc(shareDocRef, {
      payload: payloadStr,
      createdAt: now,
      expiresAt: now + SHARE_TTL_MS,
    }),
    6000,
    '共有リンクの作成がタイムアウトしました。'
  );

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://soccer-pickup-calc.web.app';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  return `${origin}${pathname}?share=${shareId}`;
}

/**
 * ?share= パラメータの取得元から Firestore スナップショットを取得・復元
 */
export async function fetchCloudShareSnapshot(shareId) {
  if (!db || !isValidShareId(shareId)) {
    return { success: false, reason: 'invalid-id' };
  }

  try {
    const shareDocRef = doc(db, 'shares', shareId);
    const snap = await withTimeout(
      getDoc(shareDocRef),
      7000,
      '共有データの取得がタイムアウトしました。'
    );
    if (!snap.exists()) {
      return { success: false, reason: 'not-found' };
    }
    const data = snap.data();
    if (data.expiresAt && Date.now() > data.expiresAt) {
      return { success: false, reason: 'expired' };
    }
    const parsed = JSON.parse(data.payload);
    return { success: true, payload: parsed };
  } catch (err) {
    console.error('Failed to fetch cloud share snapshot:', err);
    return { success: false, error: err?.message || String(err) };
  }
}
