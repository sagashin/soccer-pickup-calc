/**
 * Firebase アプリ・Firestore シングルトン初期化 & 共通タイムアウトヘルパー
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'soccer-pickup-calc',
  appId: env.VITE_FIREBASE_APP_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};

let db = null;
try {
  if (FIREBASE_CONFIG.projectId) {
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
    db = getFirestore(app);
  }
} catch (err) {
  console.error('Failed to initialize Firebase SDK:', err);
}

export { db };

export function withTimeout(
  promise,
  ms = 7000,
  errorMsg = '通信がタイムアウトしました（Firestore接続を確認してください）。'
) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });
}
