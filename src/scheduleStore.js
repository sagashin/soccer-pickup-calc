/**
 * サッカー試合スケジュール蓄積・管理ストア (LocalStorage永続化)
 */

import { getVenueDocs, getFitnessRecords, getCoachNotes } from './teamVaultStore.js';

export const SCHEDULE_STORAGE_KEY = 'soccer_pickup_schedules_v1';

/**
 * ローカル日付ヘルパー（JST朝0:00〜8:59のUTC日付ズレ防止）
 */
export function getLocalDateIso(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const CATEGORY_COLORS = {
  公式戦: {
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    border: 'border-rose-400',
  },
  新人戦: {
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    border: 'border-orange-400',
  },
  練習試合: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    border: 'border-blue-400',
  },
  練習: {
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    border: 'border-emerald-400',
  },
  その他: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
    border: 'border-slate-400',
  },
};

/**
 * 保存された全スケジュールを取得（日付順ソート）
 */
export function getSavedSchedules() {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return sortSchedules(list);
  } catch (err) {
    console.error('Failed to load schedules from localStorage:', err);
    return [];
  }
}

/**
 * 全スケジュールを保存
 */
export function saveSchedules(schedules) {
  try {
    const sorted = sortSchedules(schedules);
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(sorted));
    return sorted;
  } catch (err) {
    console.error('Failed to save schedules to localStorage:', err);
    return schedules;
  }
}

/**
 * 日付順（昇順）にソート
 */
export function sortSchedules(list) {
  return [...list].sort((a, b) => {
    const dateComp = (a.dateIso || '').localeCompare(b.dateIso || '');
    if (dateComp !== 0) return dateComp;
    return (a.meetingTime || a.time || '').localeCompare(b.meetingTime || b.time || '');
  });
}

/**
 * 新しい予定を単体で追加または更新
 */
export function upsertSchedule(event) {
  const current = getSavedSchedules();
  const existingIndex = current.findIndex((item) => item.id === event.id);

  let updated;
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = { ...updated[existingIndex], ...event, updatedAt: Date.now() };
  } else {
    const newEvent = {
      ...event,
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: event.createdAt || Date.now(),
    };
    updated = [...current, newEvent];
  }
  return saveSchedules(updated);
}

/**
 * 予定を削除
 */
export function deleteSchedule(eventId) {
  const current = getSavedSchedules();
  const updated = current.filter((item) => item.id !== eventId);
  return saveSchedules(updated);
}

/**
 * 細切れ画像の解析結果（複数予定）を蓄積（スマートマージ）
 * - 同一日・同一会場（または同一タイトル）の場合は重複とみなし上書きマージ
 * - それ以外は新規追加
 */
export function mergeImportedEvents(importedEvents, defaultMeetingLeadMinutes = 120) {
  const current = getSavedSchedules();
  let addedCount = 0;
  let updatedCount = 0;

  const updatedList = [...current];
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  importedEvents.forEach((imp) => {
    // 集合時間の計算（キックオフ時刻から引く）
    const kickoff = imp.time || imp.kickoffTime || '10:00';
    const lead = imp.meetingLeadMinutes ?? defaultMeetingLeadMinutes;
    const meetingTime = imp.meetingTime || calculateMeetingTimeFromKickoff(kickoff, lead);

    // dateLabel の整形（"2026-10-18" のままの場合は "10月18日(日)" に自動変換）
    let formattedDateLabel = imp.date || imp.dateLabel || imp.dateIso || '';
    if (imp.dateIso && (!formattedDateLabel || formattedDateLabel === imp.dateIso)) {
      const parts = imp.dateIso.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        formattedDateLabel = `${parts[1]}月${parts[2]}日(${weekdays[dt.getDay()]})`;
      }
    }

    // 重複判定：同一日かつ（タイトル完全一致 ＆ 時刻一致）または（会場一致 ＆ タイトル一致）の場合のみ上書き
    const matchIndex = updatedList.findIndex((item) => {
      if (item.dateIso !== imp.dateIso) return false;
      const itemKo = item.kickoffTime || '';
      const sameTime = itemKo === kickoff;
      const sameTitle = item.title && imp.title && item.title.trim() === imp.title.trim();
      const sameVenue = item.venue && imp.venue && item.venue.trim() === imp.venue.trim();
      // 同一日かつ（タイトル完全一致 ＆ 時刻一致）または（会場一致 ＆ タイトル一致）の場合のみ上書き
      return (sameTime && (sameTitle || sameVenue)) || (sameTitle && sameVenue);
    });

    const normalizedEvent = {
      id: matchIndex >= 0 ? updatedList[matchIndex].id : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      dateIso: imp.dateIso,
      dateLabel: formattedDateLabel,
      title: imp.title || '試合 / 練習',
      category: imp.category || '公式戦',
      kickoffTime: imp.isKickoff ? kickoff : (imp.kickoffTime || kickoff),
      isKickoff: imp.isKickoff ?? true,
      meetingTime: meetingTime,
      meetingLeadMinutes: lead,
      venue: imp.venue || '',
      venueAddress: imp.venueAddress || imp.venue || '',
      opponent: imp.opponent || '',
      notes: imp.rawText
        ? `読み取り元: ${imp.rawText}`
        : (imp.notes || (matchIndex >= 0 ? updatedList[matchIndex].notes || '' : '')),
      rawText: imp.rawText || (matchIndex >= 0 ? updatedList[matchIndex].rawText || '' : ''),
      createdAt: matchIndex >= 0 ? updatedList[matchIndex].createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    if (matchIndex >= 0) {
      updatedList[matchIndex] = { ...updatedList[matchIndex], ...normalizedEvent };
      updatedCount += 1;
    } else {
      updatedList.push(normalizedEvent);
      addedCount += 1;
    }
  });

  saveSchedules(updatedList);
  return {
    schedules: sortSchedules(updatedList),
    addedCount,
    updatedCount,
  };
}

/**
 * キックオフ時刻と集合前分数から集合時刻 (HH:mm) を計算
 */
export function calculateMeetingTimeFromKickoff(timeStr, leadMinutes = 120) {
  if (!timeStr || !timeStr.includes(':')) return '09:00';
  const [hh, mm] = timeStr.split(':').map(Number);
  const total = (hh || 0) * 60 + (mm || 0) - (leadMinutes || 0);
  const normalized = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calculateEndHoursStr(startTimeStr, durationHours = 4) {
  const [hh, mm] = (startTimeStr || '09:00').split(':').map(Number);
  const startMin = (hh || 9) * 60 + (mm || 0);
  const endMin = Math.min(23 * 60 + 59, startMin + durationHours * 60);
  const outH = String(Math.floor(endMin / 60)).padStart(2, '0');
  const outM = String(endMin % 60).padStart(2, '0');
  return `${outH}${outM}00`;
}

/**
 * Googleカレンダー登録用URLを生成
 */
export function generateGoogleCalendarUrl(event) {
  const title = encodeURIComponent(`⚽ ${event.title || 'サッカー試合'}`);
  const location = encodeURIComponent(event.venue || '');
  const details = encodeURIComponent(
    `【集合時刻】${event.meetingTime || ''}\n【キックオフ】${event.kickoffTime || '未定'}\n【会場】${event.venue || ''}\n${event.notes || ''}`
  );

  // 日時フォーマット YYYYMMDDTHHmmss
  const dateStr = (event.dateIso || '').replace(/-/g, '');
  const startHours = (event.meetingTime || '09:00').replace(':', '') + '00';
  const endHours = calculateEndHoursStr(event.meetingTime || '09:00', 4);

  const dates = `${dateStr}T${startHours}/${dateStr}T${endHours}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
}

/**
 * スマホ用 .ics (iCalendar) ファイルを生成してダウンロード
 */
export function exportToIcs(event) {
  const dateStr = (event.dateIso || '').replace(/-/g, '');
  const startHours = (event.meetingTime || '09:00').replace(':', '') + '00';
  const endHours = calculateEndHoursStr(event.meetingTime || '09:00', 4);

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Soccer Pickup Calc//JA',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@soccer-pickup-calc`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${dateStr}T${startHours}`,
    `DTEND:${dateStr}T${endHours}`,
    `SUMMARY:⚽ ${event.title}`,
    `LOCATION:${event.venue || ''}`,
    `DESCRIPTION:集合: ${event.meetingTime} / キックオフ: ${event.kickoffTime || ''}\\n${event.notes || ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.dateIso}_${event.title}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// UTF-8文字列をURL安全なBase64URL化（+ / = を使わないためURLエンコード時の%膨張やリダイレクト時の二重エンコード400エラーを防止）
function utf8ToBase64(str) {
  const b64 = window.btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode('0x' + p1);
  }));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Base64 / Base64URL から安全にUTF-8文字列化（新旧両形式に対応）
function base64ToUtf8(str) {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  return decodeURIComponent(Array.prototype.map.call(window.atob(normalized), (c) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}

// 短縮URLのキャッシュ（同一JSONデータの再短縮を避ける）
const shortUrlCache = new Map();

/**
 * 家族連携用の共有URLを生成（v2全データ一括パック形式対応）
 * 試合日程・会場駐車場資料・体力測定・コーチ助言を超軽量タプル配列化して1本のURLに圧縮
 */
export function generateFamilyShareUrl(schedulesInput, options = {}) {
  const defaultOptions = {
    includeSchedules: true,
    includeVenue: true,
    includeFitness: true,
    includeCoach: true,
  };
  const opt = { ...defaultOptions, ...options };

  // 常にLocalStorageの最新データを優先取得（引数がある場合は最新データと照合）
  const latestSaved = getSavedSchedules();
  const schedules = latestSaved.length > 0 ? latestSaved : (schedulesInput || []);

  let sTuples = [];
  if (opt.includeSchedules && Array.isArray(schedules) && schedules.length > 0) {
    const todayIso = getLocalDateIso();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = getLocalDateIso(cutoff);
    const recentCreatedThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000; // 直近7日以内に追加・編集された予定は日付に関わらず必ず含める

    // 1. 今日以降の予定、または直近追加・更新された予定、または過去30日以内の予定を優先順に並べる
    const prioritized = [...schedules]
      .filter((s) => {
        const isRecentlyTouched = (s.updatedAt || s.createdAt || 0) >= recentCreatedThreshold;
        return isRecentlyTouched || (s.dateIso && s.dateIso >= cutoffIso);
      })
      .sort((a, b) => {
        const aFuture = (a.dateIso || '') >= todayIso ? 1 : 0;
        const bFuture = (b.dateIso || '') >= todayIso ? 1 : 0;
        // 未来・当日の予定を過去の予定より優先
        if (aFuture !== bFuture) return bFuture - aFuture;
        // 直近で追加・編集された予定を優先しつつ日付順にソート
        return (a.dateIso || '').localeCompare(b.dateIso || '');
      })
      .slice(0, 35);

    // もし全件が30日以上前の場合でも、直近追加されたものから最大35件を含める
    const targetList = prioritized.length > 0 ? prioritized : schedules.slice(-35);

    // 日付順に整列してタプル化
    const sortedTarget = sortSchedules(targetList);

    sTuples = sortedTarget.map((s) => {
      const rawNote = (s.notes || '').trim();
      const cleanNote = rawNote.startsWith('読み取り元:') ? '' : rawNote.slice(0, 60);
      return [
        s.dateIso || '',
        s.category || '公式戦',
        s.meetingTime || '09:00',
        s.kickoffTime || '',
        s.venue || '',
        s.title || '',
        cleanNote,
      ];
    });
  }

  let vTuples = [];
  if (opt.includeVenue) {
    const venueDocs = getVenueDocs().slice(0, 10);
    vTuples = venueDocs.map((doc) => [
      (doc.title || '').trim(),
      (doc.venueName || '').trim(),
      doc.docType || '駐車場ルール',
      (doc.summary || '').slice(0, 80),
      (doc.parkingRules || '').slice(0, 120),
      (doc.cautions || []).slice(0, 4),
      doc.dateIso || '',
    ]);
  }

  let fTuples = [];
  if (opt.includeFitness) {
    const fitnessRecords = getFitnessRecords().slice(0, 25);
    fTuples = fitnessRecords.map((rec) => [
      rec.dateIso || '',
      rec.eventName || '',
      typeof rec.value === 'number' ? rec.value : parseFloat(rec.value) || 0,
      rec.unit || '秒',
      rec.category || 'スピード',
      (rec.notes || '').slice(0, 40),
    ]);
  }

  let cTuples = [];
  if (opt.includeCoach) {
    const coachNotes = getCoachNotes().slice(0, 10);
    cTuples = coachNotes.map((note) => [
      note.dateIso || '',
      (note.title || '').trim(),
      note.category || '個人課題',
      (note.content || '').slice(0, 140),
      (note.actionItems || []).slice(0, 4),
      (note.links || []).slice(0, 2).map((l) => [l.title || '', l.url || '']),
    ]);
  }

  if (sTuples.length === 0 && vTuples.length === 0 && fTuples.length === 0 && cTuples.length === 0) {
    return '';
  }

  const payload = { v: 2 };
  if (sTuples.length > 0) payload.s = sTuples;
  if (vTuples.length > 0) payload.d = vTuples;
  if (fTuples.length > 0) payload.f = fTuples;
  if (cTuples.length > 0) payload.c = cTuples;

  try {
    const json = JSON.stringify(payload);
    const encoded = utf8ToBase64(json);
    const base = window.location.origin + window.location.pathname;
    return `${base}#sync=${encoded}`;
  } catch (err) {
    console.error('Failed to generate family share url:', err);
    return '';
  }
}

/**
 * URLハッシュまたはパラメータから共有データを解析して復元
 * （v2一括パック形式 {v:2, s, d, f, c} と旧タプル形式/旧オブジェクト形式の双方に完全対応）
 */
export function parseFamilyShareUrl(hashOrQuery) {
  try {
    const raw = hashOrQuery || (typeof window !== 'undefined' ? (window.location.hash || window.location.search) : '');
    const match = raw.match(/[#?&]sync=([^&]+)/);
    if (!match || !match[1]) return null;

    const base64Str = decodeURIComponent(match[1]);
    const jsonStr = base64ToUtf8(base64Str);
    const parsed = JSON.parse(jsonStr);

    if (!parsed) return null;

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const formatLabel = (iso) => {
      if (!iso) return '';
      const parts = String(iso).split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        return `${parts[1]}月${parts[2]}日(${weekdays[dt.getDay()]})`;
      }
      return iso;
    };

    // 【旧形式】デコード結果が配列の場合（試合日程タプルまたは旧オブジェクトの配列）
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return null;
      const schedules = parsed.map((item) => {
        if (Array.isArray(item)) {
          const [d, c, m, k, v, t, n] = item;
          return {
            dateIso: d,
            dateLabel: formatLabel(d),
            category: c || '公式戦',
            meetingTime: m || '09:00',
            kickoffTime: k || '',
            isKickoff: Boolean(k),
            venue: v || '',
            title: t || 'サッカー試合',
            notes: n || '',
          };
        } else {
          return {
            dateIso: item.d,
            dateLabel: formatLabel(item.d),
            title: item.t,
            category: item.c || '公式戦',
            meetingTime: item.m,
            kickoffTime: item.k,
            isKickoff: Boolean(item.k),
            venue: item.v,
            notes: item.n,
          };
        }
      });
      // 後方互換性のため配列自身にプロパティを付与して返却
      schedules.schedules = schedules;
      schedules.venueDocs = [];
      schedules.fitnessRecords = [];
      schedules.coachNotes = [];
      schedules.totalCount = schedules.length;
      return schedules;
    }

    // 【新v2形式】デコード結果がオブジェクトの場合
    if (typeof parsed === 'object') {
      const sList = Array.isArray(parsed.s) ? parsed.s : [];
      const dList = Array.isArray(parsed.d) ? parsed.d : (Array.isArray(parsed.v) ? parsed.v : []);
      const fList = Array.isArray(parsed.f) ? parsed.f : [];
      const cList = Array.isArray(parsed.c) ? parsed.c : [];

      const schedules = sList.map((item) => {
        const [d, c, m, k, v, t, n] = item;
        return {
          dateIso: d,
          dateLabel: formatLabel(d),
          category: c || '公式戦',
          meetingTime: m || '09:00',
          kickoffTime: k || '',
          isKickoff: Boolean(k),
          venue: v || '',
          title: t || 'サッカー試合',
          notes: n || '',
        };
      });

      const venueDocs = dList.map((item) => {
        const [title, venueName, docType, summary, parkingRules, cautions, dateIso] = item;
        return {
          title: title || '',
          venueName: venueName || '',
          docType: docType || '駐車場ルール',
          summary: summary || '',
          parkingRules: parkingRules || '',
          cautions: Array.isArray(cautions) ? cautions : [],
          dateIso: dateIso || getLocalDateIso(),
        };
      });

      const fitnessRecords = fList.map((item) => {
        const [dateIso, eventName, value, unit, category, notes] = item;
        return {
          dateIso: dateIso || getLocalDateIso(),
          eventName: eventName || '',
          value: typeof value === 'number' ? value : parseFloat(value) || 0,
          unit: unit || '秒',
          category: category || 'スピード',
          notes: notes || '',
        };
      });

      const coachNotes = cList.map((item) => {
        const [dateIso, title, category, content, actionItems, links] = item;
        return {
          dateIso: dateIso || getLocalDateIso(),
          title: title || '',
          category: category || '個人課題',
          content: content || '',
          actionItems: Array.isArray(actionItems) ? actionItems : [],
          links: Array.isArray(links)
            ? links.map((l) => (Array.isArray(l) ? { title: l[0], url: l[1] } : l))
            : [],
        };
      });

      const totalCount = schedules.length + venueDocs.length + fitnessRecords.length + coachNotes.length;

      return {
        v: 2,
        schedules,
        venueDocs,
        fitnessRecords,
        coachNotes,
        totalCount,
      };
    }

    return null;
  } catch (err) {
    console.error('Failed to parse family share url:', err);
    return null;
  }
}

/**
 * LINEで送るメッセージ用リンクを生成
 * スマホ端末では line:// スキームで直接LINEアプリを起動（Webサーバーを介さず400 Bad Requestを完全回避）
 * PC環境では文字数制限を安全にハンドリング
 */
export function createLineShareUrl(shareUrl, summaryInfo) {
  let message = '';
  if (typeof summaryInfo === 'string') {
    message = `⚽ サッカー家族共有データ（${summaryInfo}）を送ったよ！\n👇タップして開くとカレンダー＆チームノートに一発反映\n${shareUrl}`;
  } else {
    message = `⚽ サッカー試合日程（${summaryInfo || 0}件）を共有したよ！\n👇タップして開くとカレンダーに自動反映\n${shareUrl}`;
  }
  const encodedMessage = encodeURIComponent(message);

  // スマホ端末（iOS / Android）の判定
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    // スマホ環境: LINEアプリ直接起動スキーム (line://msg/text/...)
    // Webサーバー（line.me や nginx）を経由しないため、HTTP 400 Bad Request を完全回避
    return `line://msg/text/${encodedMessage}`;
  }

  // PC環境:
  // URLエンコード後の長さが2,000文字以内の場合は line.me/R/share?text= を使用
  if (encodedMessage.length <= 2000) {
    return `https://line.me/R/share?text=${encodedMessage}`;
  }

  // 万が一長大URLのままの場合は公式ソーシャルプラグインURLにフォールバック（400エラー画面を防止）
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`;
}

/**
 * 短縮URLを取得（POSTリクエスト & 直接リダイレクト型プロバイダでLINE内400エラーを完全防止）
 */
export async function getShortFamilyShareUrl(schedules, options = {}) {
  const longUrl = generateFamilyShareUrl(schedules, options);
  if (!longUrl) return '';

  // すでにキャッシュがあれば即座に返却
  if (shortUrlCache.has(longUrl)) {
    return shortUrlCache.get(longUrl);
  }

  // 1. 自前バックエンドAPI (/api/shorten) を POST で呼び出し（URL長制限を回避）
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.shortUrl && data.shortUrl.startsWith('http') && !data.fallback) {
        shortUrlCache.set(longUrl, data.shortUrl);
        return data.shortUrl;
      }
    }
  } catch (err) {
    console.warn('POST /api/shorten failed, trying client-side fallback:', err?.message || err);
  }

  // 2. クライアント側から直接 da.gd API を試行（CORS対応・Viglinkを経由せず直接302転送されるため400エラーにならない）
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const dagdRes = await fetch(
      `https://da.gd/s?url=${encodeURIComponent(longUrl)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (dagdRes.ok) {
      const short = (await dagdRes.text()).trim();
      if (short.startsWith('https://da.gd/')) {
        shortUrlCache.set(longUrl, short);
        return short;
      }
    }
  } catch (_) {}

  // 3. クライアント側から直接 TinyURL API を試行（2,500文字以内の安全な長さの場合のみ）
  if (longUrl.length <= 2500) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const tinyRes = await fetch(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (tinyRes.ok) {
        const short = (await tinyRes.text()).trim();
        if (short.startsWith('http')) {
          shortUrlCache.set(longUrl, short);
          return short;
        }
      }
    } catch (_) {}
  }

  // すべて失敗した場合は軽量化された元のURLを返却
  return longUrl;
}


