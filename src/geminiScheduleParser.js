/**
 * Gemini API によるスケジュール画像の解析ユーティリティ
 */
import { safeGetItem, safeSetItem, safeRemoveItem } from './utils/storage.js';

export const GEMINI_API_KEY_STORAGE = 'soccer_pickup_gemini_api_key_v1';
export const GEMINI_WORKING_MODEL_STORAGE_PREFIX = 'soccer_pickup_gemini_model_v2_';
const WORKING_MODEL_TTL_MS = 24 * 60 * 60 * 1000; // 24時間
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB
const MODEL_LIST_CACHE = new Map();
const MODEL_LIST_TTL_MS = 10 * 60 * 1000;
const WORKING_MODEL_MEM_CACHE = new Map();

const FAST_MODEL_ORDER = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

const ACCURATE_MODEL_ORDER = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
];

export function getSavedGeminiApiKey() {
  const saved = String(safeGetItem(GEMINI_API_KEY_STORAGE, '')).trim();
  if (saved) return saved;
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return String(env.VITE_GEMINI_API_KEY || '').trim();
}

export function saveGeminiApiKey(key) {
  const trimmed = String(key ?? '').trim();
  if (trimmed) {
    safeSetItem(GEMINI_API_KEY_STORAGE, trimmed);
  } else {
    safeRemoveItem(GEMINI_API_KEY_STORAGE);
  }
  return trimmed;
}

function normalizeParseMode(mode) {
  return mode === 'accurate' ? 'accurate' : 'fast';
}

function getCachedWorkingModel(mode = 'fast', trimmedKey = '') {
  const normalizedMode = normalizeParseMode(mode);
  if (trimmedKey) {
    const memKey = `${trimmedKey}:${normalizedMode}`;
    const memEntry = WORKING_MODEL_MEM_CACHE.get(memKey);
    if (memEntry && Date.now() - memEntry.savedAt < WORKING_MODEL_TTL_MS) {
      return memEntry.model;
    }
    // 同一セッション内で別のAPIキーへ切り替えた場合は旧キーのキャッシュを使わない
    for (const existingKey of WORKING_MODEL_MEM_CACHE.keys()) {
      if (existingKey.endsWith(`:${normalizedMode}`) && existingKey !== memKey) {
        return '';
      }
    }
  }

  try {
    const raw = safeGetItem(`${GEMINI_WORKING_MODEL_STORAGE_PREFIX}${normalizedMode}`, '');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.model === 'string' &&
      parsed.model &&
      Date.now() - Number(parsed.savedAt || 0) < WORKING_MODEL_TTL_MS
    ) {
      if (trimmedKey) {
        WORKING_MODEL_MEM_CACHE.set(`${trimmedKey}:${normalizedMode}`, parsed);
      }
      return parsed.model;
    }
  } catch (_) {}
  return '';
}

function setCachedWorkingModel(mode = 'fast', model = '', trimmedKey = '') {
  if (!model) return;
  const normalizedMode = normalizeParseMode(mode);
  const entry = { model, savedAt: Date.now() };
  if (trimmedKey) {
    WORKING_MODEL_MEM_CACHE.set(`${trimmedKey}:${normalizedMode}`, entry);
  }
  safeSetItem(`${GEMINI_WORKING_MODEL_STORAGE_PREFIX}${normalizedMode}`, JSON.stringify(entry));
}

function clearCachedWorkingModel(mode = 'fast', trimmedKey = '') {
  const normalizedMode = normalizeParseMode(mode);
  if (trimmedKey) {
    WORKING_MODEL_MEM_CACHE.delete(`${trimmedKey}:${normalizedMode}`);
  }
  safeRemoveItem(`${GEMINI_WORKING_MODEL_STORAGE_PREFIX}${normalizedMode}`);
}

/**
 * モデルと解析モードに応じた thinkingConfig を構築
 */
export function buildThinkingConfig(model, mode = 'fast') {
  const name = (model || '').toLowerCase();
  if (mode === 'accurate') {
    if (/gemini-3(\.\d+)?/.test(name)) {
      return { thinkingLevel: 'LOW' };
    }
    if (name.includes('gemini-2.5-flash')) {
      return { thinkingBudget: 512 };
    }
    return null;
  }

  if (
    name.includes('gemini-3.5-flash-lite') ||
    name.includes('gemini-3.6-flash') ||
    name.includes('gemini-3-flash')
  ) {
    return { thinkingLevel: 'MINIMAL' };
  }
  if (/gemini-3(\.\d+)?/.test(name)) {
    return { thinkingLevel: 'LOW' };
  }
  if (name.includes('gemini-2.5-flash')) {
    return { thinkingBudget: 0 };
  }
  return null;
}

/**
 * "YYYY-MM-DD" から "M月D日(曜)" をローカル生成（AI出力トークン削減用）
 */
export function formatDateLabelFromIso(dateIso) {
  if (!dateIso || typeof dateIso !== 'string') return '';
  const match = dateIso.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return '';
  }
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${month}月${day}日(${weekdays[dt.getDay()]})`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('AI解析がタイムアウトしました。画像を小さくするか通信環境を確認して再試行してください。');
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}

// サンプルデータ（ユーザーが提供してくれた日程表画像の再現）
export const SAMPLE_SCHEDULE_EVENTS = [
  {
    id: 'sample-1',
    date: '10月10日',
    dateIso: '2026-10-10',
    title: '関東L vs ジェファ',
    category: '公式戦',
    time: '14:20',
    isKickoff: true,
    venue: 'つくばFC T-Field (茨城県つくば市)',
    rawText: '関東Lvsジェファ14:20ko@つくばTフィールド',
  },
  {
    id: 'sample-2',
    date: '10月10日',
    dateIso: '2026-10-10',
    title: '関東L vs 鹿島ノルテ',
    category: '公式戦',
    time: '10:30',
    isKickoff: true,
    venue: 'ひたちなか市総合運動公園 (茨城県ひたちなか市)',
    rawText: '関東L vs鹿島ノルテ 10:30ko @ひたちなか総合',
  },
  {
    id: 'sample-3',
    date: '10月11日',
    dateIso: '2026-10-11',
    title: '新人戦 vs ソルース',
    category: '新人戦',
    time: '10:00',
    isKickoff: true,
    venue: '羽生市中央公園 (埼玉県羽生市)',
    rawText: '新人戦vsソルース 10:00@羽生中央公園',
  },
  {
    id: 'sample-4',
    date: '10月11日',
    dateIso: '2026-10-11',
    title: '浦和美園 B',
    category: '練習試合',
    time: '14:00',
    isKickoff: false,
    venue: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
    rawText: '浦和美園 B 14:00',
  },
  {
    id: 'sample-5',
    date: '10月11日',
    dateIso: '2026-10-11',
    title: '浦和美園 A',
    category: '練習試合',
    time: '15:30',
    isKickoff: false,
    venue: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
    rawText: '浦和美園 A 15:30',
  },
  {
    id: 'sample-6',
    date: '10月12日',
    dateIso: '2026-10-12',
    title: 'クラ選 vs プロスペリダージ',
    category: 'クラブ選手権',
    time: '17:30',
    isKickoff: true,
    venue: '浦和東高校 (埼玉県さいたま市緑区)',
    rawText: 'クラ選vsプロスペリダージ 17:30ko@浦和東高校',
  },
  {
    id: 'sample-7',
    date: '10月12日',
    dateIso: '2026-10-12',
    title: '浦和美園',
    category: '練習/試合',
    time: '13:00',
    isKickoff: false,
    venue: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
    rawText: '浦和美園 13:00',
  },
  {
    id: 'sample-8',
    date: '10月12日',
    dateIso: '2026-10-12',
    title: 'U10 アタドゥーラカップ',
    category: 'カップ戦',
    time: '',
    isKickoff: false,
    venue: '',
    rawText: 'U10アタドゥーラカップ',
  },
];

function readFileAsBase64Fallback(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        return reject(new Error('ファイルのBase64変換に失敗しました'));
      }
      const isPdf =
        file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
      const base64Index = dataUrl.indexOf(',');
      resolve({
        base64: base64Index !== -1 ? dataUrl.slice(base64Index + 1) : dataUrl,
        mimeType: isPdf ? 'application/pdf' : file.type || 'image/jpeg',
        previewUrl: dataUrl,
      });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * ファイルオブジェクトをBase64文字列に変換（PDF対応 ＆ 画像はクライアント圧縮・軽量化）
 */
export function fileToBase64(file, options = {}) {
  if (!file) return Promise.reject(new Error('ファイルが選択されていません'));
  if (file.size && file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(
      new Error('ファイルサイズが15MBを超えています。より小さい画像またはPDFを選択してください。')
    );
  }

  const maxDimension = Number(options?.maxDimension) > 0 ? Number(options.maxDimension) : 1600;
  const quality =
    typeof options?.quality === 'number' && options.quality > 0 && options.quality <= 1
      ? options.quality
      : 0.85;

  const isPdf =
    file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return readFileAsBase64Fallback(file);
  }

  const canUseObjectUrl =
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof Image !== 'undefined' &&
    typeof document !== 'undefined';

  if (!canUseObjectUrl) {
    return readFileAsBase64Fallback(file);
  }

  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (_) {
      readFileAsBase64Fallback(file).then(resolve, reject);
      return;
    }

    const revoke = () => {
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_) {}
        objectUrl = '';
      }
    };

    const img = new Image();
    img.onload = () => {
      revoke();
      try {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // 透過PNGスクショがJPEG変換時に黒背景になるのを防止
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64Index = compressedDataUrl.indexOf(',');
          if (base64Index !== -1) {
            return resolve({
              base64: compressedDataUrl.slice(base64Index + 1),
              mimeType: 'image/jpeg',
              previewUrl: compressedDataUrl,
            });
          }
        }
      } catch (_) {}

      readFileAsBase64Fallback(file).then(resolve, reject);
    };

    img.onerror = () => {
      revoke();
      readFileAsBase64Fallback(file).then(resolve, reject);
    };

    img.src = objectUrl;
  });
}

/**
 * キックオフ時刻から「○分前」の集合時刻を計算 (HH:mm)
 */
export function calculateMeetingTime(kickoffTimeStr, leadMinutes) {
  if (!kickoffTimeStr || !kickoffTimeStr.includes(':')) return kickoffTimeStr || '';
  const [hh, mm] = kickoffTimeStr.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return kickoffTimeStr;

  let totalMinutes = hh * 60 + mm - Number(leadMinutes || 0);
  while (totalMinutes < 0) totalMinutes += 24 * 60;
  totalMinutes = totalMinutes % (24 * 60);

  const outH = Math.floor(totalMinutes / 60);
  const outM = totalMinutes % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

/**
 * モデル名から世代バージョン番号を抽出（例: "gemini-3.8-flash" -> 3.8）
 */
function extractGeminiVersion(modelName) {
  const match = (modelName || '').match(/gemini-(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

const EXCLUDED_MODEL_TOKENS = [
  'embedding',
  'imagen',
  'tts',
  'audio',
  'live',
  'robotics',
  'veo',
  'lyria',
  'aqa',
  'gemma',
  '1.5',
  '2.0',
];

function sortModelsByMode(models, mode = 'fast') {
  const orderList = mode === 'accurate' ? ACCURATE_MODEL_ORDER : FAST_MODEL_ORDER;
  return [...models].sort((a, b) => {
    const idxA = orderList.indexOf(a);
    const idxB = orderList.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    const verA = extractGeminiVersion(a);
    const verB = extractGeminiVersion(b);
    if (verA !== verB) return verB - verA;

    const aUnstable = a.includes('preview') || a.includes('exp') ? 1 : 0;
    const bUnstable = b.includes('preview') || b.includes('exp') ? 1 : 0;
    if (aUnstable !== bUnstable) return aUnstable - bUnstable;

    const aLite = a.includes('flash-lite') ? 1 : 0;
    const bLite = b.includes('flash-lite') ? 1 : 0;
    if (aLite !== bLite) {
      return mode === 'fast' ? bLite - aLite : aLite - bLite;
    }
    return 0;
  });
}

async function fetchAvailableModels(trimmedKey, mode = 'fast') {
  const cachedModels = MODEL_LIST_CACHE.get(trimmedKey);
  if (cachedModels && Date.now() - cachedModels.fetchedAt < MODEL_LIST_TTL_MS) {
    return sortModelsByMode(cachedModels.models, mode);
  }

  try {
    const listRes = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta/models',
      { headers: { 'x-goog-api-key': trimmedKey } },
      10000
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData.models)) {
        const available = listData.models
          .filter((m) => {
            if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
            const name = (m.name || '').toLowerCase();
            if (!name.includes('gemini')) return false;
            return !EXCLUDED_MODEL_TOKENS.some((token) => name.includes(token));
          })
          .map((m) => m.name.replace(/^models\//, ''));

        if (available.length > 0) {
          MODEL_LIST_CACHE.set(trimmedKey, { models: available, fetchedAt: Date.now() });
          return sortModelsByMode(available, mode);
        }
      }
    } else if (listRes.status === 400 || listRes.status === 401 || listRes.status === 403) {
      const errText = await listRes.text();
      if (errText.includes('API_KEY_INVALID') || errText.includes('API key not valid')) {
        throw new Error('Gemini APIキーが無効です。Google AI Studioでキーをご確認ください。');
      }
      throw new Error(`Gemini APIキー認証エラー (${listRes.status}): ${errText}`);
    }
  } catch (err) {
    if (err.message?.includes('Gemini APIキー')) {
      throw err;
    }
    console.warn('ListModels failed, returning empty dynamic list:', err);
  }

  return [];
}

async function tryGenerateWithModel({
  model,
  apiVersion,
  parts,
  trimmedKey,
  mode,
  allowThinking = true,
}) {
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: 0.1,
  };
  const thinkingConfig =
    allowThinking && apiVersion === 'v1beta'
      ? buildThinkingConfig(model, mode)
      : null;
  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig;
  }

  const requestBody = {
    contents: [{ parts }],
    generationConfig,
  };

  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': trimmedKey,
      },
      body: JSON.stringify(requestBody),
    },
    30000
  );

  if (!res.ok) {
    const errorText = await res.text();
    // 429（レート制限）はリトライしても意味がないので即座に中断して通知
    if (res.status === 429) {
      throw new Error('Gemini APIの利用上限（レート制限）に達しました。1分ほど待ってから再試行してください。');
    }
    // キーそのものが無効な場合
    if (
      res.status === 400 &&
      (errorText.includes('API_KEY_INVALID') || errorText.includes('API key not valid'))
    ) {
      throw new Error('Gemini APIキーが無効です。Google AI Studioでキーをご確認ください。');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Gemini API認証エラー (${res.status}): APIキーをご確認ください。`);
    }
    // thinkingConfig 非対応で 400 になった場合は同一モデルから thinkingConfig を外して1回だけ再試行
    if (
      res.status === 400 &&
      allowThinking &&
      thinkingConfig &&
      /thinking/i.test(errorText)
    ) {
      return await tryGenerateWithModel({
        model,
        apiVersion,
        parts,
        trimmedKey,
        mode,
        allowThinking: false,
      });
    }
    // 404 (指定バージョンでモデル不在/廃止) や非対応モダリティエラーの場合は次の候補へ即座にフォールバック
    if (
      res.status === 404 ||
      (res.status === 400 &&
        (errorText.includes('modality is not enabled') ||
          errorText.includes('not supported') ||
          errorText.includes('responseMimeType')))
    ) {
      return {
        fallback: true,
        status: res.status,
        error: new Error(`Gemini API エラー (${res.status}): ${errorText}`),
      };
    }
    throw new Error(`Gemini API エラー (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const finishReason = data.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      'AI解析の出力が上限に達して途中で切れました（MAX_TOKENS）。画像を分割するか小さくして再試行してください。'
    );
  }
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const textPart =
    responseParts.find((p) => typeof p.text === 'string' && !p.thought) ||
    responseParts.find((p) => typeof p.text === 'string');
  const candidateText = textPart?.text || '';

  if (!candidateText) {
    throw new Error('Gemini APIからテキスト応答が得られませんでした。');
  }

  const cleanJsonStr = candidateText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanJsonStr);
  } catch (parseErr) {
    parseErr.isJsonSyntaxError = true;
    throw parseErr;
  }

  return {
    fallback: false,
    result: parsedJson,
  };
}

function isFatalGeminiError(err) {
  return Boolean(
    err?.message?.includes('利用上限') ||
      err?.message?.includes('APIキーが無効') ||
      err?.message?.includes('認証エラー') ||
      err?.message?.includes('MAX_TOKENS')
  );
}

/**
 * GeminiモデルでマルチモーダルJSON生成を行う共通関数（高速モデル優先・動的ListModelsはフォールバック時のみ）
 */
export async function generateGeminiJson({ prompt, base64Data, mimeType, apiKey, mode = 'fast' }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const normalizedMode = normalizeParseMode(mode);
  const parts = [{ text: prompt }];
  if (base64Data) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: base64Data,
      },
    });
  }

  const trimmedKey = apiKey.trim();
  const cachedWorking = getCachedWorkingModel(normalizedMode, trimmedKey);
  const baseOrder = normalizedMode === 'accurate' ? ACCURATE_MODEL_ORDER : FAST_MODEL_ORDER;
  const staticCandidates = Array.from(
    new Set([...(cachedWorking ? [cachedWorking] : []), ...baseOrder])
  );

  let lastError = null;
  let syntaxErrorCount = 0;
  const triedV1Beta = new Set();

  const handleAttemptError = (err) => {
    if (isFatalGeminiError(err)) throw err;
    if (err instanceof SyntaxError || err?.isJsonSyntaxError) {
      syntaxErrorCount += 1;
      if (syntaxErrorCount >= 2) {
        throw new Error('AI応答のJSON解析に失敗しました。画像を鮮明にするか時間をおいて再試行してください。');
      }
    }
    lastError = err;
  };

  // 1. 最速経路: ListModelsを待たずキャッシュ済みモデル/推奨モデルへ v1beta で直接送信
  for (const model of staticCandidates) {
    triedV1Beta.add(model);
    try {
      const attempt = await tryGenerateWithModel({
        model,
        apiVersion: 'v1beta',
        parts,
        trimmedKey,
        mode: normalizedMode,
        allowThinking: true,
      });
      if (!attempt.fallback) {
        setCachedWorkingModel(normalizedMode, model, trimmedKey);
        return attempt.result;
      }
      if (attempt.status === 404 && model === cachedWorking) {
        clearCachedWorkingModel(normalizedMode, trimmedKey);
      }
      lastError = attempt.error;
    } catch (err) {
      handleAttemptError(err);
    }
  }

  // 2. フォールバック経路: 静的候補が全て使えなかった場合のみ ListModels を問い合わせる
  const dynamicModels = await fetchAvailableModels(trimmedKey, normalizedMode);
  for (const model of dynamicModels) {
    if (triedV1Beta.has(model)) continue;
    triedV1Beta.add(model);
    try {
      const attempt = await tryGenerateWithModel({
        model,
        apiVersion: 'v1beta',
        parts,
        trimmedKey,
        mode: normalizedMode,
        allowThinking: true,
      });
      if (!attempt.fallback) {
        setCachedWorkingModel(normalizedMode, model, trimmedKey);
        return attempt.result;
      }
      lastError = attempt.error;
    } catch (err) {
      handleAttemptError(err);
    }
  }

  // 3. 最終フォールバック: v1beta で全て失敗した場合のみ v1 を思考設定なしで試す
  const v1Candidates = Array.from(new Set([...staticCandidates, ...dynamicModels]));
  for (const model of v1Candidates) {
    try {
      const attempt = await tryGenerateWithModel({
        model,
        apiVersion: 'v1',
        parts,
        trimmedKey,
        mode: normalizedMode,
        allowThinking: false,
      });
      if (!attempt.fallback) {
        return attempt.result;
      }
      lastError = attempt.error;
    } catch (err) {
      handleAttemptError(err);
    }
  }

  throw (
    lastError ||
    new Error('利用可能なGeminiモデルが見つかりませんでした。APIキーが有効かご確認ください。')
  );
}

/**
 * Gemini API でスケジュール画像・PDFを解析
 */
export async function parseScheduleImageWithGemini(base64Data, mimeType, apiKey, options = {}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const nowDate = new Date();
  const currentYear = nowDate.getFullYear();
  const currentMonth = nowDate.getMonth() + 1;
  const mode = normalizeParseMode(options?.mode);
  const prompt = `あなたは日本のサッカー日程表解析AIです。画像またはPDFの予定をすべて抽出し、JSONのみで返してください。

【項目仕様】
- dateIso: "YYYY-MM-DD"（年が不明な場合は現在 ${currentYear}年${currentMonth}月 を基準に補完し、現在月より大きく前の月［例: 12月に1〜3月］は翌年 ${currentYear + 1}年 として補完）
- title: 試合名・対戦相手・活動名（例: "関東L vs ジェファ", "浦和美園 B"）
- category: "公式戦" | "練習試合" | "練習" | "応援" | "カップ戦" | "OFF" など
- time: 24時間表記 "HH:mm"（時刻記載がなければ ""）
- isKickoff: "ko"/"KO"/キックオフや試合開始時刻なら true、練習や集合時間なら false
- venue: 正式なスポーツ施設・グラウンド・学校名（都道府県・市区町村付き）。不明時のみ ""
  略称補正例:
  ・@西武台第2 / 西武台第2グラウンド → 西武台高校 第2グラウンド (埼玉県新座市大和田)
  ・@ひたちなか総合 → ひたちなか市総合運動公園 (茨城県ひたちなか市)
  ・@羽生中央公園 → 羽生市中央公園 (埼玉県羽生市)
  ・@つくばTフィールド → つくばFC T-Field (茨城県つくば市)
  ・浦和美園 → J-foot浦和美園 (埼玉県さいたま市緑区)
  ・@駒沢 → 駒沢オリンピック公園総合運動場 (東京都世田谷区)
  ・@大井ふ頭 → 大井ふ頭中央海浜公園スポーツの森 (東京都品川区)
  ※高校やクラブの「第2グラウンド」「専用グラウンド」は学校本体と所在地が異なる場合があるため、判別できれば正式住所・自治体を補完。

※"OFF" などの休み情報・"応援" 情報も省略せず抽出してください。
※純粋なJSONのみを出力してください:
{"events":[{"dateIso":"${currentYear}-10-10","title":"関東L vs ジェファ","category":"公式戦","time":"14:20","isKickoff":true,"venue":"つくばFC T-Field (茨城県つくば市)"}]}`;

  const parsed = await generateGeminiJson({
    prompt,
    base64Data,
    mimeType,
    apiKey,
    mode,
  });

  const events = Array.isArray(parsed?.events) ? parsed.events : [];

  // 各イベントに一意のID・ローカル整形済みの日付ラベルを付与
  return events.map((ev, idx) => {
    const dateIso = String(ev?.dateIso || '').trim();
    const date = String(ev?.date || '').trim() || formatDateLabelFromIso(dateIso) || dateIso;
    return {
      ...ev,
      dateIso,
      date,
      title: String(ev?.title || '').trim(),
      category: String(ev?.category || '').trim(),
      time: String(ev?.time || '').trim(),
      isKickoff: Boolean(ev?.isKickoff),
      venue: String(ev?.venue || '').trim(),
      rawText: String(ev?.rawText || ''),
      id: `ai-event-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    };
  });
}
