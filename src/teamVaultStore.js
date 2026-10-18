import { generateGeminiJson } from './geminiScheduleParser';
import { getLocalDateIso } from './scheduleStore';

/**
 * 📚 チームノート（会場・駐車場資料 / 体力測定記録 / コーチ助言・リンク）ストア
 * LocalStorage（メタデータ）＋ IndexedDB（PDF/画像原本バイナリ）ハイブリッド永続化
 */

export const VENUE_DOCS_KEY = 'soccer_vault_venue_docs_v1';
export const FITNESS_RECORDS_KEY = 'soccer_vault_fitness_v1';
export const COACH_NOTES_KEY = 'soccer_vault_coach_notes_v1';

const IDB_NAME = 'soccer_pickup_attachments_db';
const IDB_VERSION = 1;
const IDB_STORE = 'attachments';

// ==================== サンプルデータ定義 ====================

export const SAMPLE_VENUE_DOCS = [
  {
    id: 'sample-venue-1',
    title: '羽生市中央公園 駐車場・搬入ルール',
    venueName: '羽生市中央公園',
    docType: '駐車場ルール',
    summary: '新人戦・公式戦時の保護者駐車ルールと待機場所案内',
    parkingRules:
      'チーム割り当て5台まで（ダッシュボードにチーム名プレート掲示必須）。満車時は北側臨時Pへ。会場前の路上乗降は厳禁。',
    cautions: ['スパイクでのアスファルト歩行禁止', '観戦は指定エリアのみ', 'ゴミは各自持ち帰り'],
    dateIso: '2026-10-01',
    hasAttachment: false,
    attachmentMimeType: '',
    attachmentFileName: '',
    createdAt: 1760000000001,
  },
  {
    id: 'sample-venue-2',
    title: 'つくばFC T-Field 施設利用＆観戦ガイド',
    venueName: 'つくばFC T-Field',
    docType: '会場マップ',
    summary: '人工芝ピッチ利用上の注意と第2駐車場ルート',
    parkingRules:
      'クラブハウス前Pはチームバス・審判のみ。保護者は砂利の第2駐車場を利用。',
    cautions: ['ピッチ内は水のみ可（スポドリ禁止）', '鳴り物応援禁止'],
    dateIso: '2026-10-05',
    hasAttachment: false,
    attachmentMimeType: '',
    attachmentFileName: '',
    createdAt: 1760000000002,
  },
];

export const SAMPLE_FITNESS_RECORDS = [
  {
    id: 'sample-fit-1',
    dateIso: '2026-04-15',
    eventName: '30m走',
    value: 5.12,
    unit: '秒',
    category: 'スピード',
    notes: '春季フィジカル測定',
    hasAttachment: false,
    createdAt: 1744675200001,
  },
  {
    id: 'sample-fit-2',
    dateIso: '2026-07-20',
    eventName: '30m走',
    value: 4.98,
    unit: '秒',
    category: 'スピード',
    notes: '夏季合宿前測定（初の4秒台！）',
    hasAttachment: false,
    createdAt: 1752969600001,
  },
  {
    id: 'sample-fit-3',
    dateIso: '2026-10-10',
    eventName: '30m走',
    value: 4.85,
    unit: '秒',
    category: 'スピード',
    notes: '秋季測定・スタートダッシュ改善',
    hasAttachment: false,
    createdAt: 1760054400001,
  },
  {
    id: 'sample-fit-4',
    dateIso: '2026-04-15',
    eventName: '50m走',
    value: 8.2,
    unit: '秒',
    category: 'スピード',
    notes: '春季フィジカル測定',
    hasAttachment: false,
    createdAt: 1744675200002,
  },
  {
    id: 'sample-fit-5',
    dateIso: '2026-10-10',
    eventName: '50m走',
    value: 7.88,
    unit: '秒',
    category: 'スピード',
    notes: '秋季測定・後半の伸びが向上',
    hasAttachment: false,
    createdAt: 1760054400002,
  },
  {
    id: 'sample-fit-6',
    dateIso: '2026-04-15',
    eventName: '20mシャトルラン',
    value: 68,
    unit: '回',
    category: '持久力',
    notes: '春季測定',
    hasAttachment: false,
    createdAt: 1744675200003,
  },
  {
    id: 'sample-fit-7',
    dateIso: '2026-10-10',
    eventName: '20mシャトルラン',
    value: 82,
    unit: '回',
    category: '持久力',
    notes: '秋季測定（チーム内トップクラス）',
    hasAttachment: false,
    createdAt: 1760054400003,
  },
  {
    id: 'sample-fit-8',
    dateIso: '2026-04-15',
    eventName: 'リフティング',
    value: 120,
    unit: '回',
    category: '技術・キック',
    notes: 'インステップ・左右交互',
    hasAttachment: false,
    createdAt: 1744675200004,
  },
  {
    id: 'sample-fit-9',
    dateIso: '2026-10-10',
    eventName: 'リフティング',
    value: 245,
    unit: '回',
    category: '技術・キック',
    notes: '自己ベスト大幅更新！',
    hasAttachment: false,
    createdAt: 1760054400004,
  },
];

export const SAMPLE_COACH_NOTES = [
  {
    id: 'sample-coach-1',
    dateIso: '2026-10-11',
    title: 'パスを受ける前の首振り（スキャン）と半身の作り方',
    category: '個人課題',
    content:
      'ボールが移動している間に周囲をスキャンし、相手と味方の位置を把握して半身で受けること。ファーストタッチを前向きに置けばシュートやスルーパスの選択肢が一気に広がる。',
    actionItems: ['味方が蹴る瞬間に首を振る', '利き足の前方にファーストタッチを置く'],
    links: [
      {
        title: 'YouTube: 中盤の首振りと半身の作り方解説',
        url: 'https://www.youtube.com/results?search_query=サッカー+首振り+体の向き',
      },
    ],
    hasAttachment: false,
    attachmentMimeType: '',
    createdAt: 1760140800001,
  },
  {
    id: 'sample-coach-2',
    dateIso: '2026-10-08',
    title: '試合当日の補食・エネルギー補給ルーティン',
    category: '自主練メニュー',
    content:
      '公式戦の2時間半前までに消化の良い炭水化物（おにぎり・うどん等）を摂り、試合1時間前はエネルギーゼリーやバナナで補給。',
    actionItems: ['試合1時間前にゼリーまたはバナナ', '試合後30分以内にタンパク質＋糖質補給'],
    links: [],
    hasAttachment: false,
    attachmentMimeType: '',
    createdAt: 1759881600001,
  },
];

// ==================== IndexedDB ヘルパー ====================

function openAttachmentDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported'));
    }
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error || new Error('IndexedDB open failed'));
    } catch (err) {
      reject(err);
    }
  });
}

export async function saveAttachmentToIdb(id, { dataUrl, mimeType, fileName }) {
  if (!id || !dataUrl) return false;
  try {
    const db = await openAttachmentDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({
        id,
        dataUrl,
        mimeType: mimeType || 'application/octet-stream',
        fileName: fileName || '',
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB save warning:', err);
    return false;
  }
}

export async function getAttachmentFromIdb(id) {
  if (!id) return null;
  try {
    const db = await openAttachmentDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('IndexedDB get warning:', err);
    return null;
  }
}

export async function deleteAttachmentFromIdb(id) {
  if (!id) return false;
  try {
    const db = await openAttachmentDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB delete warning:', err);
    return false;
  }
}

// ==================== 1. 会場・駐車場資料 CRUD ====================

export function getVenueDocs() {
  try {
    const raw = localStorage.getItem(VENUE_DOCS_KEY);
    if (raw === null) {
      // 初回アクセス時はサンプルを入れておくことで会場ルール通知を即座に体験可能にする
      localStorage.setItem(VENUE_DOCS_KEY, JSON.stringify(SAMPLE_VENUE_DOCS));
      return [...SAMPLE_VENUE_DOCS];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function saveVenueDocs(list) {
  try {
    localStorage.setItem(VENUE_DOCS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save venue docs:', e);
  }
}

export function upsertVenueDoc(doc) {
  const list = getVenueDocs();
  const id = doc.id || `vdoc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const normalized = {
    id,
    title: (doc.title || doc.venueName || '会場資料').trim(),
    venueName: (doc.venueName || '').trim(),
    docType: doc.docType || '駐車場ルール',
    summary: (doc.summary || '').trim(),
    parkingRules: (doc.parkingRules || '').trim(),
    cautions: Array.isArray(doc.cautions)
      ? doc.cautions.map((c) => String(c).trim()).filter(Boolean)
      : [],
    dateIso: doc.dateIso || getLocalDateIso(),
    hasAttachment: Boolean(doc.hasAttachment),
    attachmentMimeType: doc.attachmentMimeType || '',
    attachmentFileName: doc.attachmentFileName || '',
    createdAt: doc.createdAt || Date.now(),
  };

  const idx = list.findIndex((item) => item.id === id);
  let next;
  if (idx >= 0) {
    next = [...list];
    next[idx] = normalized;
  } else {
    next = [normalized, ...list];
  }
  saveVenueDocs(next);
  return { list: next, savedItem: normalized };
}

export function deleteVenueDoc(id) {
  const list = getVenueDocs().filter((item) => item.id !== id);
  saveVenueDocs(list);
  deleteAttachmentFromIdb(id);
  return list;
}

// ==================== 2. 体力測定・記録 CRUD ＆ 成長比較 ====================

export function getFitnessRecords() {
  try {
    const raw = localStorage.getItem(FITNESS_RECORDS_KEY);
    if (raw === null) {
      localStorage.setItem(FITNESS_RECORDS_KEY, JSON.stringify(SAMPLE_FITNESS_RECORDS));
      return [...SAMPLE_FITNESS_RECORDS];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function saveFitnessRecords(list) {
  try {
    localStorage.setItem(FITNESS_RECORDS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save fitness records:', e);
  }
}

export function upsertFitnessRecord(record) {
  const list = getFitnessRecords();
  const id = record.id || `fit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const numVal = parseFloat(record.value);
  const normalized = {
    id,
    dateIso: record.dateIso || getLocalDateIso(),
    eventName: (record.eventName || '30m走').trim(),
    value: Number.isNaN(numVal) ? 0 : numVal,
    unit: (record.unit || '秒').trim(),
    category: record.category || 'スピード',
    notes: (record.notes || '').trim(),
    hasAttachment: Boolean(record.hasAttachment),
    createdAt: record.createdAt || Date.now(),
  };

  const idx = list.findIndex((item) => item.id === id);
  let next;
  if (idx >= 0) {
    next = [...list];
    next[idx] = normalized;
  } else {
    next = [normalized, ...list];
  }
  saveFitnessRecords(next);
  return { list: next, savedItem: normalized };
}

export function deleteFitnessRecord(id) {
  const list = getFitnessRecords().filter((item) => item.id !== id);
  saveFitnessRecords(list);
  deleteAttachmentFromIdb(id);
  return list;
}

/**
 * 同じ種目（eventName）の中で自己ベスト（PB）と前回比（diffFromPrev）を計算して付与
 * 秒数系（unit.includes('秒')）は数値が小さいほどPB、それ以外は大きいほどPB
 */
export function analyzeFitnessProgress(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // 種目ごとにグループ化
  const byEvent = new Map();
  records.forEach((rec) => {
    const key = (rec.eventName || '').trim();
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(rec);
  });

  const enrichedMap = new Map();

  byEvent.forEach((group) => {
    // 日付昇順（古い順）に並べて前回比を算出
    const chronological = [...group].sort((a, b) => {
      const cmp = (a.dateIso || '').localeCompare(b.dateIso || '');
      if (cmp !== 0) return cmp;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const isTimeBased = (chronological[0]?.unit || '').includes('秒');
    const values = chronological.map((r) => Number(r.value)).filter((v) => !Number.isNaN(v));
    const bestValue =
      values.length > 0
        ? isTimeBased
          ? Math.min(...values)
          : Math.max(...values)
        : null;

    chronological.forEach((rec, idx) => {
      const val = Number(rec.value);
      const prev = idx > 0 ? Number(chronological[idx - 1].value) : null;
      let diffFromPrev = null;
      if (prev !== null && !Number.isNaN(val) && !Number.isNaN(prev)) {
        diffFromPrev = Number((val - prev).toFixed(2));
      }
      const isPersonalBest =
        bestValue !== null && !Number.isNaN(val) && Math.abs(val - bestValue) < 1e-6;

      enrichedMap.set(rec.id, {
        ...rec,
        isPersonalBest,
        diffFromPrev,
        isTimeBased,
      });
    });
  });

  // 表示用には新しい日付順（降順）で返す
  return records
    .map((r) => enrichedMap.get(r.id) || r)
    .sort((a, b) => {
      const cmp = (b.dateIso || '').localeCompare(a.dateIso || '');
      if (cmp !== 0) return cmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

// ==================== 3. コーチ助言・リンク CRUD ====================

export function getCoachNotes() {
  try {
    const raw = localStorage.getItem(COACH_NOTES_KEY);
    if (raw === null) {
      localStorage.setItem(COACH_NOTES_KEY, JSON.stringify(SAMPLE_COACH_NOTES));
      return [...SAMPLE_COACH_NOTES];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function saveCoachNotes(list) {
  try {
    localStorage.setItem(COACH_NOTES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save coach notes:', e);
  }
}

export function upsertCoachNote(note) {
  const list = getCoachNotes();
  const id = note.id || `cnote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const normalized = {
    id,
    dateIso: note.dateIso || getLocalDateIso(),
    title: (note.title || 'コーチからのアドバイス').trim(),
    category: note.category || '個人課題',
    content: (note.content || '').trim(),
    actionItems: Array.isArray(note.actionItems)
      ? note.actionItems.map((a) => String(a).trim()).filter(Boolean)
      : [],
    links: Array.isArray(note.links)
      ? note.links
          .map((l) => ({
            title: String(l?.title || l?.url || '参考リンク').trim(),
            url: String(l?.url || '').trim(),
          }))
          .filter((l) => l.url)
      : [],
    hasAttachment: Boolean(note.hasAttachment),
    attachmentMimeType: note.attachmentMimeType || '',
    createdAt: note.createdAt || Date.now(),
  };

  const idx = list.findIndex((item) => item.id === id);
  let next;
  if (idx >= 0) {
    next = [...list];
    next[idx] = normalized;
  } else {
    next = [normalized, ...list];
  }
  saveCoachNotes(next);
  return { list: next, savedItem: normalized };
}

export function deleteCoachNote(id) {
  const list = getCoachNotes().filter((item) => item.id !== id);
  saveCoachNotes(list);
  deleteAttachmentFromIdb(id);
  return list;
}

// ==================== サンプル一括読込 ====================

export function loadSampleVaultData() {
  const existingVenue = getVenueDocs();
  const venueIds = new Set(existingVenue.map((v) => v.id));
  const nextVenue = [
    ...existingVenue,
    ...SAMPLE_VENUE_DOCS.filter((v) => !venueIds.has(v.id)),
  ];
  saveVenueDocs(nextVenue);

  const existingFit = getFitnessRecords();
  const fitIds = new Set(existingFit.map((f) => f.id));
  const nextFit = [
    ...existingFit,
    ...SAMPLE_FITNESS_RECORDS.filter((f) => !fitIds.has(f.id)),
  ];
  saveFitnessRecords(nextFit);

  const existingCoach = getCoachNotes();
  const coachIds = new Set(existingCoach.map((c) => c.id));
  const nextCoach = [
    ...existingCoach,
    ...SAMPLE_COACH_NOTES.filter((c) => !coachIds.has(c.id)),
  ];
  saveCoachNotes(nextCoach);

  return {
    venueDocs: nextVenue,
    fitnessRecords: nextFit,
    coachNotes: nextCoach,
  };
}

// ==================== 会場名マッチング ====================

function normalizeVenueCore(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\(（][^()（）]*[\)）]/g, '') // カッコ内の自治体名を除去
    .replace(/(埼玉県|茨城県|東京都|千葉県|神奈川県|栃木県|群馬県)/g, '')
    .replace(/(県立|市立|町立|村立|市営|県営|都立)/g, '')
    .replace(/[市町村区]/g, '')
    .replace(/[\s　・\-－]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 目的地文字列と一致する登録済み会場・駐車場資料を検索
 */
export function findMatchingVenueDocs(destinationStr) {
  if (!destinationStr || typeof destinationStr !== 'string') return [];
  const coreDest = normalizeVenueCore(destinationStr);
  if (coreDest.length < 2) return [];

  const docs = getVenueDocs();
  return docs.filter((doc) => {
    const coreVenue = normalizeVenueCore(doc.venueName);
    const coreTitle = normalizeVenueCore(doc.title);
    if (coreVenue.length >= 2 && (coreDest.includes(coreVenue) || coreVenue.includes(coreDest))) {
      return true;
    }
    if (coreTitle.length >= 2 && (coreDest.includes(coreTitle) || coreTitle.includes(coreDest))) {
      return true;
    }
    return false;
  });
}

// ==================== Gemini AI によるPDF/画像/テキスト解析 ====================

export async function parseVaultDocumentWithGemini({ text, base64, mimeType, targetMode, apiKey }) {
  const todayIso = getLocalDateIso();
  const hasText = Boolean(text && text.trim());

  let prompt = '';
  if (targetMode === 'venue') {
    prompt = `あなたはジュニア・ユースサッカーチームの運営・遠征サポートAIです。
提供された${hasText ? 'テキスト連絡（LINE、メール、案内文など）' : 'ファイル（会場案内PDF、駐車場ルール画像、大会要項、チーム連絡プリント等）'}を解析し、保護者が送迎時に最も知りたい「会場名」「駐車ルール・台数制限」「会場での注意事項」を構造化JSONで抽出してください。
${hasText ? `\n【入力テキスト】\n${text.trim()}\n` : ''}
出力は必ず以下のJSONスキーマのみとし、Markdown記法や余計な説明を含めないでください：
{
  "title": "資料のわかりやすいタイトル（例: 〇〇公園 駐車場・観戦ルール）",
  "venueName": "会場・グラウンド・施設名（例: 羽生市中央公園）",
  "docType": "駐車場ルール" | "会場マップ" | "大会要項" | "チーム連絡" のいずれか1つ,
  "summary": "資料の要点（1〜2文）",
  "parkingRules": "駐車可能台数、指定駐車場の場所、乗降禁止エリア、周辺コインパーキング案内などの詳細",
  "cautions": ["注意事項1（例: スパイク歩行禁止）", "注意事項2（例: 観戦エリア指定）"]
}`;
  } else if (targetMode === 'fitness') {
    prompt = `あなたはサッカー選手のフィジカル・体力測定データ解析AIです。
提供された${hasText ? 'テキスト連絡（測定結果一覧、タイム連絡文など）' : 'ファイル（体力測定結果表、記録カード画像、PDF等）'}を解析し、含まれているすべての測定種目・記録を構造化JSONで一括抽出してください。
複数の種目（例: 30m走、50m走、シャトルラン、リフティング等）や複数回の記録がある場合はすべて配列に含めてください。日付が不明な場合は "${todayIso}" を設定してください。
${hasText ? `\n【入力テキスト】\n${text.trim()}\n` : ''}
出力は必ず以下のJSONスキーマのみとし、Markdown記法や余計な説明を含めないでください：
{
  "records": [
    {
      "dateIso": "YYYY-MM-DD",
      "eventName": "種目名（例: 30m走, 50m走, 20mシャトルラン, リフティング, ロングキック, 身長, 体重）",
      "value": 4.85,
      "unit": "単位（秒, 回, m, cm, kg など）",
      "category": "スピード" | "持久力" | "技術・キック" | "アジリティ" | "体格" のいずれか1つ,
      "notes": "補足メモ（コンディションやコメントがあれば）"
    }
  ]
}`;
  } else {
    prompt = `あなたはジュニア・ユースサッカーの育成コーチング解析AIです。
提供された${hasText ? 'テキスト連絡（コーチからのアドバイス、LINEメッセージ、練習振り返りメモ等）' : 'ファイル（コーチからの配布プリント、戦術ボード・ホワイトボードの写真、練習メニュー表、試合総評メモ、PDF等）'}を解析し、選手が振り返るべき要点を構造化JSONで抽出してください。
${hasText ? `\n【入力テキスト】\n${text.trim()}\n` : ''}
出力は必ず以下のJSONスキーマのみとし、Markdown記法や余計な説明を含めないでください：
{
  "title": "ノートのタイトル（例: パスを受ける前の首振りと半身の作り方）",
  "category": "個人課題" | "戦術・動き方" | "自主練メニュー" | "試合総評" | "参考動画" のいずれか1つ,
  "content": "アドバイスや戦術・総評の詳しい内容整理",
  "actionItems": ["次の練習・試合で意識する具体的アクション1", "アクション2"],
  "links": [
    {
      "title": "記載されている参考URLやYouTube検索タイトル（なければ空配列）",
      "url": "https://..."
    }
  ]
}`;
  }

  return await generateGeminiJson({
    prompt,
    base64Data: base64,
    mimeType,
    apiKey,
  });
}

