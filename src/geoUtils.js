import { getSavedGoogleMapsApiKey, geocodeWithGoogleMaps } from './googleMapsClient.js';

/**
 * 地理・ジオコーディング・キャッシュユーティリティ
 */

const GEOCODE_CACHE_KEY = 'soccer_pickup_geocode_cache_v1';
const memoryCache = new Map();

/**
 * 主要なサッカー会場・強豪高校グラウンドのビルトイン座標辞書（千葉・埼玉・東京・茨城・神奈川）
 * 外部通信不要・オフラインでも0ミリ秒で100%正確な位置を特定！
 */
export const KNOWN_SOCCER_VENUES = [
  {
    keywords: ['流通経済大学付属柏', '流経大柏', '流通経済大柏', '流経柏', '流通経済大学付属柏高校', '流通経済大学付属柏高等学校', '流経'],
    lat: 35.9072516,
    lon: 139.9264238,
    displayName: '流通経済大学付属柏高等学校 グラウンド (千葉県柏市)',
  },
  {
    keywords: ['日本体育大学柏', '日体大柏', '日体柏', '日体大柏高校', '日本体育大学柏高校', '日本体育大学柏高等学校'],
    lat: 35.856544,
    lon: 139.992188,
    displayName: '日本体育大学柏高等学校 (千葉県柏市戸張)',
  },
  {
    keywords: ['市立船橋', '市船', '市立船橋高校', '市立船橋高等学校', '市船サッカー'],
    lat: 35.701063,
    lon: 139.999537,
    displayName: '市立船橋高等学校 (千葉県船橋市)',
  },
  {
    keywords: ['西武台第2', '西武台高校 第2', '西武台高校第2', '西武台高校第２', '西武台第2グラウンド', '西武台第２グラウンド', '西武台高校', '西武台'],
    lat: 35.808865,
    lon: 139.546066,
    displayName: '西武台高校 第2グラウンド (埼玉県新座市大和田)',
  },
  {
    keywords: ['zozo park', 'zozopark', 'ゾゾパーク', 'zozopark honda', 'zozo park honda football stadium'],
    lat: 35.647606,
    lon: 140.04808,
    displayName: 'ZOZOPARK HONDA FOOTBALL STADIUM (千葉県千葉市美浜区)',
  },
  {
    keywords: ['ゼットエーオリプリ', 'ゼットエー', 'ゼットエーオリプリスタジアム', 'オリプリ'],
    lat: 35.527843,
    lon: 140.071472,
    displayName: 'ゼットエーオリプリスタジアム (千葉県市原市)',
  },
  {
    keywords: ['市原スポレクパーク', 'スポレクパーク', '市原スポレク', 'スポレク'],
    lat: 35.538357,
    lon: 140.133987,
    displayName: '市原スポレクパーク (千葉県市原市菊間)',
  },
  {
    keywords: ['第一カッターフィールド', '秋津サッカー場', '第一カッター', '秋津総合運動公園'],
    lat: 35.669724,
    lon: 140.012436,
    displayName: '第一カッターフィールド / 秋津サッカー場 (千葉県習志野市)',
  },
  {
    keywords: ['柏の葉公園総合競技場', '柏の葉競技場', '柏の葉総合競技場', '柏の葉公園'],
    lat: 35.896393,
    lon: 139.937592,
    displayName: '柏の葉公園総合競技場 (千葉県柏市柏の葉)',
  },
  {
    keywords: ['三協フロンテア柏スタジアム', '日立柏サッカー場', '日立柏グラウンド', '日立台'],
    lat: 35.84972,
    lon: 139.975021,
    displayName: '三協フロンテア柏スタジアム (千葉県柏市日立台)',
  },
  {
    keywords: ['中央学院高校', '中央学院高等学校', '中央学院'],
    lat: 35.864315,
    lon: 140.059662,
    displayName: '中央学院高等学校 (千葉県我孫子市都部)',
  },
  {
    keywords: ['暁星国際高校', '暁星国際高等学校', '暁星国際'],
    lat: 35.349476,
    lon: 139.983719,
    displayName: '暁星国際高等学校 (千葉県木更津市矢那)',
  },
  {
    keywords: ['八千代松陰高校', '八千代松陰中学校・高等学校', '八千代松陰高等学校', '八千代松陰'],
    lat: 35.741547,
    lon: 140.12442,
    displayName: '八千代松陰高等学校 (千葉県八千代市村上)',
  },
  {
    keywords: ['習志野高校', '習志野市立習志野高校', '習志野市立習志野高等学校', '習志野市立習志野'],
    lat: 35.694313,
    lon: 140.064148,
    displayName: '習志野市立習志野高等学校 (千葉県習志野市東習志野)',
  },
  {
    keywords: ['八千代高校', '千葉県立八千代高校', '千葉県立八千代高等学校'],
    lat: 35.722828,
    lon: 140.106049,
    displayName: '千葉県立八千代高等学校 (千葉県八千代市萱田町)',
  },
  {
    keywords: ['専修大学松戸高校', '専大松戸高校', '専修大学松戸高等学校', '専修大松戸', '専大松戸'],
    lat: 35.798832,
    lon: 139.920105,
    displayName: '専修大学松戸高等学校 (千葉県松戸市上本郷)',
  },
  {
    keywords: ['昌平高校', '昌平高等学校', '昌平'],
    lat: 36.057735,
    lon: 139.70134,
    displayName: '昌平高等学校 (埼玉県杉戸町下野)',
  },
  {
    keywords: ['武南高校', '武南高等学校', '武南'],
    lat: 35.823086,
    lon: 139.704941,
    displayName: '武南高等学校 (埼玉県蕨市塚越)',
  },
  {
    keywords: ['浦和東高校', '浦和東高等学校', '浦和東'],
    lat: 35.906208,
    lon: 139.708603,
    displayName: '浦和東高等学校 (埼玉県さいたま市緑区寺山)',
  },
  {
    keywords: ['成立学園鷲宮グランド', '成立学園', '成立学園鷲宮', '成立鷲宮', '鷲宮グランド'],
    lat: 36.096821,
    lon: 139.698669,
    displayName: '成立学園鷲宮グラウンド (埼玉県久喜市八甫)',
  },
  {
    keywords: ['帝京高校', '帝京高等学校', '帝京高校グラウンド', '帝京'],
    lat: 35.753227,
    lon: 139.716522,
    displayName: '帝京高等学校 (東京都板橋区加賀)',
  },
  {
    keywords: ['幕張総合高校', '幕張総合', '幕張総合高等学校', '幕総', '県立幕張総合高校', '千葉県立幕張総合高等学校'],
    lat: 35.6517,
    lon: 140.0435,
    displayName: '千葉県立幕張総合高等学校 (千葉県千葉市美浜区若葉)',
  },
  {
    keywords: ['敬愛学園高校', '敬愛学園', '敬愛学園高等学校'],
    lat: 35.6322,
    lon: 140.1066,
    displayName: '敬愛学園高等学校 (千葉県千葉市稲毛区)',
  },
  {
    keywords: ['千葉明徳高校', '千葉明徳', '千葉明徳高等学校'],
    lat: 35.5675,
    lon: 140.1581,
    displayName: '千葉明徳高等学校 (千葉県千葉市中央区)',
  },
  {
    keywords: ['翔凜高校', '翔凜', '翔凜高等学校'],
    lat: 35.2952,
    lon: 139.9234,
    displayName: '翔凜高等学校 (千葉県君津市)',
  },
  {
    keywords: ['東京学館浦安高校', '東京学館浦安高等学校', '学館浦安'],
    lat: 35.6433,
    lon: 139.8972,
    displayName: '東京学館浦安高等学校 (千葉県浦安市日の出)',
  },
  {
    keywords: ['八千代東高校', '八千代東高等学校', '八千代東'],
    lat: 35.7337,
    lon: 140.1192,
    displayName: '千葉県立八千代東高等学校 (千葉県八千代市)',
  },
  {
    keywords: ['白井高校', '白井高等学校'],
    lat: 35.7891,
    lon: 140.0527,
    displayName: '千葉県立白井高等学校 (千葉県白井市)',
  },
  {
    keywords: ['高円宮記念jfa夢フィールド', 'jfa夢フィールド', '夢フィールド'],
    lat: 35.639843,
    lon: 140.036606,
    displayName: '高円宮記念JFA夢フィールド (千葉県千葉市美浜区美浜)',
  },
  {
    keywords: ['フクダ電子アリーナ', 'フクアリ', 'フクダ電子フィールド', 'フクダ電子スクエア'],
    lat: 35.574673,
    lon: 140.12413,
    displayName: 'フクダ電子アリーナ / フィールド (千葉県千葉市中央区川崎町)',
  },
  {
    keywords: ['重兵衛スポーツフィールド中台', '中台運動公園', '中台球技場'],
    lat: 35.780045,
    lon: 140.305557,
    displayName: '重兵衛スポーツフィールド中台 (千葉県成田市中台)',
  },
  {
    keywords: ['東総運動公園', '東総運動場'],
    lat: 35.711559,
    lon: 140.65123,
    displayName: '東総運動公園 (千葉県旭市ハ)',
  },
  {
    keywords: ['市原緑地運動公園', '市原緑地運動公園臨海競技場', '市原臨海競技場'],
    lat: 35.527843,
    lon: 140.071472,
    displayName: '市原緑地運動公園臨海競技場 (千葉県市原市岩崎)',
  },
  {
    keywords: ['姉崎公園サッカー場', '姉崎サッカー場', '姉崎公園'],
    lat: 35.489086,
    lon: 140.043304,
    displayName: '姉崎公園サッカー場 (千葉県市原市姉崎海岸)',
  },
  {
    keywords: ['つくばfc', 'つくばtフィールド', 't-field', 'つくばfc t-field'],
    lat: 36.06944,
    lon: 140.11389,
    displayName: 'つくばFC T-Field (茨城県つくば市)',
  },
  {
    keywords: ['ひたちなか総合', 'ひたちなか市総合運動公園'],
    lat: 36.38611,
    lon: 140.57778,
    displayName: 'ひたちなか市総合運動公園 (茨城県ひたちなか市)',
  },
  {
    keywords: ['羽生中央公園', '羽生市中央公園'],
    lat: 36.17222,
    lon: 139.54444,
    displayName: '羽生市中央公園 (埼玉県羽生市)',
  },
  {
    keywords: ['j-foot浦和美園', '浦和美園', 'ジェイフット'],
    lat: 35.90556,
    lon: 139.73056,
    displayName: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
  },
  {
    keywords: ['八千代市総合運動公園', '八千代総合運動公園'],
    lat: 35.73361,
    lon: 140.10639,
    displayName: '八千代市総合運動公園 (千葉県八千代市)',
  },
  {
    keywords: ['埼玉スタジアム2002', '埼玉スタジアム', '埼スタ', '埼玉スタジアム第2', '埼玉スタジアム第3', '埼玉スタジアム第4'],
    lat: 35.903,
    lon: 139.7175,
    displayName: '埼玉スタジアム2002 第2/第3/第4グラウンド (埼玉県さいたま市緑区)',
  },
];

/**
 * 入力文字列に対応するビルトイン会場を検索（単一）
 */
export function findKnownVenue(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.trim().toLowerCase().replace(/[\s\u3000]+/g, '');
  if (q.length < 2) return null;

  for (const venue of KNOWN_SOCCER_VENUES) {
    for (const kw of venue.keywords) {
      const cleanKw = kw.toLowerCase().replace(/[\s\u3000]+/g, '');
      if (cleanKw.length <= 2) {
        if (q.includes(cleanKw)) {
          return {
            lat: venue.lat,
            lon: venue.lon,
            displayName: venue.displayName,
            candidates: [],
            source: 'builtin',
          };
        }
      } else {
        if (q.includes(cleanKw) || cleanKw.includes(q)) {
          return {
            lat: venue.lat,
            lon: venue.lon,
            displayName: venue.displayName,
            candidates: [],
            source: 'builtin',
          };
        }
      }
    }
  }
  return null;
}

/**
 * オートコンプリート用: 入力文字列にマッチするビルトイン会場を複数検索
 */
export function findKnownVenues(query, limit = 4) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase().replace(/[\s\u3000]+/g, '');
  if (q.length < 2) return [];

  const matched = [];
  const seenNames = new Set();

  for (const venue of KNOWN_SOCCER_VENUES) {
    if (seenNames.has(venue.displayName)) continue;
    let isHit = false;

    for (const kw of venue.keywords) {
      const cleanKw = kw.toLowerCase().replace(/[\s\u3000]+/g, '');
      if (cleanKw.length <= 2) {
        if (q.includes(cleanKw) || cleanKw.includes(q)) {
          isHit = true;
          break;
        }
      } else {
        if (q.includes(cleanKw) || cleanKw.includes(q)) {
          isHit = true;
          break;
        }
      }
    }

    if (isHit) {
      seenNames.add(venue.displayName);
      matched.push({
        lat: venue.lat,
        lon: venue.lon,
        displayName: venue.displayName,
        candidates: [],
        source: 'builtin',
      });
      if (matched.length >= limit) break;
    }
  }
  return matched;
}

/**
 * 国土地理院（GSI）の検索結果がクエリと妥当に一致しているか厳格チェック
 * ※「流通経済大学付属柏高校」に対して「北海道千歳市流通」がヒットするような
 *   前方2文字の誤爆住所を完全に遮断
 */
export function isGsiMatchValid(query, title) {
  if (!query || !title) return false;
  const q = query.trim();
  const t = title.trim();

  // 単なる「北海道」「青森県」等の都道府県単体は除外
  if (/^(北海道|.+[都府県])$/.test(t)) return false;

  // 都道府県名を除いた市区町村・町域部分
  const localPart = t.replace(/^(北海道|.+?[都府県])/, '');
  if (!localPart || localPart.length < 2) return false;

  // 1. クエリが市区町村・町域を含んでいるか、または住所がクエリを含んでいるか
  if (q.includes(localPart)) return true;
  if (t.includes(q)) return true;

  // 2. 市区町村名単位でチェック（例: "柏市", "船橋市", "千歳市"）
  const cityMatch = t.match(/^(?:北海道|.+?[都府県])?([^0-9\s]+?[市区町村])/);
  if (cityMatch && cityMatch[1] && cityMatch[1].length >= 2) {
    const city = cityMatch[1];
    // クエリにその市区町村名が含まれていればOK
    if (q.includes(city)) return true;
  }

  // 3. クエリが施設名（高校、大学、グラウンドなど）の場合、市区町村すら一致しなければ除外
  const isFacilityName = /(高校|高等学校|大学|中学|学園|グラウンド|グランド|サッカー|公園|スタジアム|アリーナ|fc)/i.test(q);
  if (isFacilityName) {
    return false;
  }

  return false;
}

/**
 * サッカー施設・学校グラウンドの優先度スコアリング
 */
export function getSoccerRelevanceScore(name, category, type) {
  let s = 0;
  const n = (name || '').toLowerCase();
  const c = category || '';
  const t = type || '';

  // スポーツ施設・運動公園・グラウンド・スタジアム・学校を最優先
  if (
    c === 'leisure' &&
    (t === 'park' || t === 'pitch' || t === 'sports_centre' || t === 'stadium' || t === 'track')
  ) {
    s += 100;
  }
  if (c === 'amenity' && (t === 'school' || t === 'college' || t === 'university')) {
    s += 80;
  }
  if (
    n.includes('運動公園') ||
    n.includes('グラウンド') ||
    n.includes('スタジアム') ||
    n.includes('スポーツ') ||
    n.includes('サッカー') ||
    n.includes('フィールド')
  ) {
    s += 60;
  }
  if (n.includes('公園')) s += 35;
  if (n.includes('高校') || n.includes('学校') || n.includes('中学校') || n.includes('大学')) s += 45;

  // 病院・クリニック・無関係な施設を大きく減点して除外・後回し
  if (t === 'hospital' || t === 'clinic' || n.includes('病院') || n.includes('医院') || n.includes('診療所')) {
    s -= 150;
  }
  if (t === 'hotel' || n.includes('ホテル')) s -= 50;
  if (t === 'station' || n.includes('駅')) s -= 20;

  return s;
}

/**
 * 住所・施設名に対応するキャッシュ済み座標を取得
 */
export function getCachedCoords(address) {
  if (!address || typeof address !== 'string') return null;
  const key = address.trim().toLowerCase();
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed[key] && parsed[key].lat && parsed[key].lon) {
        memoryCache.set(key, parsed[key]);
        return parsed[key];
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * 住所・施設名の座標をキャッシュに保存
 */
export function saveCachedCoords(address, geoData) {
  if (!address || !geoData || !geoData.lat || !geoData.lon) return;
  const key = address.trim().toLowerCase();

  const toSave = {
    lat: geoData.lat,
    lon: geoData.lon,
    displayName: geoData.displayName || address.trim(),
    candidates: geoData.candidates || [],
    savedAt: Date.now(),
  };

  memoryCache.set(key, toSave);

  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[key] = toSave;

    // キャッシュが50件を超えた場合は最も古いエントリを削除
    const keys = Object.keys(parsed);
    if (keys.length > 50) {
      delete parsed[keys[0]];
    }

    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(parsed));
  } catch (e) {
    // ignore
  }
}

/**
 * 自治体名（都道府県・市区町村）の抽出
 */
export function extractMunicipality(text) {
  if (!text || typeof text !== 'string') return null;
  // カッコ内の住所: 例 "(茨城県つくば市)" -> "茨城県つくば市"
  const parenMatch = text.match(/[\(（]([^()（）]+)[\)）]/);
  if (parenMatch) {
    const inside = parenMatch[1];
    const muniMatch = inside.match(/(.{2,3}[都道府県])?([^0-9\s]+?[市区町村])/);
    if (muniMatch) return muniMatch[0];
  }
  // テキスト全体の市区町村
  const generalMatch = text.match(/(.{2,3}[都道府県])?([^0-9\s]+?[市区町村])/);
  if (generalMatch) return generalMatch[0];
  return null;
}

/**
 * 2地点の緯度経度からヒュベニの公式で直線距離(km)を計算
 */
export function calculateHubenyDistanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const radLat1 = lat1 * rad;
  const radLat2 = lat2 * rad;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = 6378137.0;
  const e2 = 0.00669437999019758;
  const meanLat = (radLat1 + radLat2) / 2;
  const w = Math.sqrt(1 - e2 * Math.sin(meanLat) * Math.sin(meanLat));
  const m = (a * (1 - e2)) / Math.pow(w, 3);
  const n = a / w;
  const dist = Math.sqrt(
    Math.pow(dLat * m, 2) + Math.pow(dLon * n * Math.cos(meanLat), 2)
  );
  return dist / 1000;
}

// Nominatim のレート制限（429 Too Many Requests）回避用シリアライズキュー
let nominatimQueue = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchNominatimThrottled(queryToSearch) {
  return new Promise((resolve) => {
    nominatimQueue = nominatimQueue
      .then(async () => {
        try {
          const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            queryToSearch
          )}&countrycodes=jp&limit=8&addressdetails=1&accept-language=ja`;
          const res = await fetch(nomUrl, {
            headers: { Accept: 'application/json' },
          });
          await sleep(350); // レート制限安全インターバル
          if (!res.ok) {
            resolve(null);
            return;
          }
          const data = await res.json();
          resolve(data);
        } catch (e) {
          console.warn('Nominatim throttled fetch error:', e);
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });
}

/**
 * 住所・施設名の住所ジオコーディング（キャッシュ + Google Maps + 国土地理院 + Nominatim + 自治体フォールバック）
 */
export async function geocodeAddress(address, options = {}) {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim();
  if (!trimmed) return null;

  const coordMatch = trimmed.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    return {
      lat: parseFloat(coordMatch[1]),
      lon: parseFloat(coordMatch[3]),
      displayName: `${coordMatch[1]}, ${coordMatch[3]}`,
      candidates: [],
    };
  }

  // 0. キャッシュに保存されている場合は外部通信なしで即座に返却（超高速）
  const cached = getCachedCoords(trimmed);
  if (cached) {
    return cached;
  }

  // カッコや補足のクレンジング
  // 例: "つくばFC T-Field (茨城県つくば市)" -> cleanName: "つくばFC T-Field"
  let cleanName = trimmed.replace(/[\(（][^()（）]+[\)）]/g, '').trim();
  cleanName = cleanName.replace(/(第\d+コート|A面|B面|C面|人工芝|天然芝|第\d+グラウンド|グラウンド|グランド|サッカー場|球技場)$/i, '').trim();
  const extractedMuni = extractMunicipality(trimmed);

  // 0-a. 主要サッカー施設・強豪校グラウンドのビルトイン辞書マッチング（外部通信不要・オフラインでも0msで超高精度）
  const knownVenue = findKnownVenue(trimmed) || (cleanName ? findKnownVenue(cleanName) : null);
  if (knownVenue) {
    saveCachedCoords(trimmed, knownVenue);
    return knownVenue;
  }

  // 1. Google Maps APIキーが設定されている場合は Google Maps を最優先実行！
  const gmapsKey = getSavedGoogleMapsApiKey();
  if (gmapsKey) {
    try {
      const gResult = await geocodeWithGoogleMaps(trimmed, gmapsKey);
      if (gResult) {
        saveCachedCoords(trimmed, gResult);
        return gResult;
      }
    } catch (e) {
      console.warn('Google Maps geocoding error, falling back:', e);
    }
  }

  // 2. 国土地理院 GSI API（レート制限なし・完全無料・日本の住所に強い）
  const fetchFromGsi = async (query) => {
    if (!query || query.length < 2) return null;
    try {
      const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`;
      const gsiRes = await fetch(gsiUrl);
      if (gsiRes.ok) {
        const gsiData = await gsiRes.json();
        if (Array.isArray(gsiData) && gsiData.length > 0) {
          const validItems = gsiData.filter((item) => {
            const title = item?.properties?.title || '';
            return isGsiMatchValid(query, title);
          });

          if (validItems.length > 0) {
            const matched = validItems[0];
            const [lon, lat] = matched.geometry.coordinates;
            return {
              lat,
              lon,
              displayName: matched.properties.title || query,
              candidates: [],
            };
          }
        }
      }
    } catch (e) {
      console.warn('GSI geocoding error:', e);
    }
    return null;
  };

  // 3. Nominatim (OSM) 検索（直列キューでレート制限回避）
  const fetchFromNominatim = async (queryToSearch) => {
    if (!queryToSearch || queryToSearch.length < 2) return null;
    try {
      const nomData = await fetchNominatimThrottled(queryToSearch);
      if (Array.isArray(nomData) && nomData.length > 0) {
        const coreKeyword = queryToSearch
          .replace(/(高等学校|高校|中学校|学校|グラウンド|グランド|サッカー場|公園|スタジアム|第\d+)/g, '')
          .trim();

        const scored = nomData
          .map((item) => {
            const name = item.display_name.split(',')[0] || item.name || '';
            const category = item.class || item.category || '';
            const type = item.type || '';
            let score = getSoccerRelevanceScore(name, category, type);

            // コアキーワードがある場合、名前またはdisplay_nameに含まれていなければ除外/大幅減点
            if (coreKeyword.length >= 2) {
              const fullText = (item.display_name || '').toLowerCase();
              const lowerKw = coreKeyword.toLowerCase();
              if (fullText.includes(lowerKw)) {
                score += 150;
              } else {
                score -= 300;
              }
            }

            return {
              item,
              name,
              score,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
            };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);

        if (scored.length === 0) return null;

        const best = scored[0];
        const uniqueCandidates = [];
        const seen = new Set([best.name]);
        for (let i = 1; i < scored.length; i++) {
          const candName = scored[i].name;
          if (!seen.has(candName) && candName.trim().length > 0) {
            seen.add(candName);
            uniqueCandidates.push({
              name: candName,
              lat: scored[i].lat,
              lon: scored[i].lon,
            });
            if (uniqueCandidates.length >= 3) break;
          }
        }

        return {
          lat: best.lat,
          lon: best.lon,
          displayName: best.name || queryToSearch,
          candidates: uniqueCandidates,
        };
      }
    } catch (e) {
      console.warn('Nominatim geocoding error:', e);
    }
    return null;
  };

  let finalResult = null;

  // 高校名揺らぎ（「高校」->「高等学校」）のバリエーションを生成
  const schoolVariant = cleanName.includes('高校')
    ? cleanName.replace(/高校/g, '高等学校')
    : trimmed.includes('高校')
    ? trimmed.replace(/高校/g, '高等学校')
    : null;

  // 検索パターンA: 高校正式名称バリエーション（例: "流通経済大学付属柏高校" -> "流通経済大学付属柏高等学校"）
  if (schoolVariant) {
    finalResult = await fetchFromNominatim(schoolVariant);
  }

  // 検索パターンB: カッコ除去後の施設名本体
  if (!finalResult && cleanName && cleanName !== trimmed) {
    finalResult = await fetchFromNominatim(cleanName);
  }

  // 検索パターンC: 入力そのまま
  if (!finalResult) {
    finalResult = await fetchFromNominatim(trimmed);
  }

  // 検索パターンD: 国土地理院（住所として厳格に一致する場合のみ採用）
  if (!finalResult) {
    finalResult = await fetchFromGsi(cleanName || trimmed);
  }

  // 検索パターンE: 自治体名フォールバック（例: "茨城県つくば市", "千葉県柏市"）
  // 天気予報や概算距離の算出には十分な精度を発揮！
  if (!finalResult && extractedMuni) {
    finalResult = await fetchFromGsi(extractedMuni);
    if (!finalResult) {
      finalResult = await fetchFromNominatim(extractedMuni);
    }
    if (finalResult) {
      finalResult = {
        ...finalResult,
        displayName: `${finalResult.displayName} (地域代表)`,
      };
    }
  }

  // 検索パターンF: 学校・施設の母体検索（例: "〇〇第2グラウンド" -> "〇〇高校" / "〇〇高等学校"）
  if (!finalResult && cleanName.length >= 2) {
    const schoolQuery =
      cleanName.endsWith('高校') || cleanName.endsWith('学校') || cleanName.endsWith('高等学校')
        ? cleanName
        : `${cleanName}高校`;
    finalResult = await fetchFromNominatim(schoolQuery);
    if (!finalResult) {
      finalResult = await fetchFromNominatim(schoolQuery.replace(/高校/g, '高等学校'));
    }
    if (finalResult) {
      finalResult = {
        ...finalResult,
        displayName: `${finalResult.displayName} (母体施設)`,
      };
    }
  }

  if (finalResult) {
    saveCachedCoords(trimmed, finalResult);
    return finalResult;
  }

  if (options.silent) {
    return null;
  }

  throw new Error(
    `「${trimmed}」の場所が見つかりませんでした。Google Maps APIキーを設定するか、市区町村名を含めて入力してください。`
  );
}

/**
 * 試合日程カード用: 超高速・数学的出発時間（仮）の概算計算
 * 外部ルートAPIを一切叩かず、ブラウザ内0.001秒で算出（処理負荷ゼロ）
 * @param {object} event 試合予定
 * @param {string} originAddress 出発地住所
 * @returns {object|null}
 */
export function calculateFastEstimateDeparture(event, originAddress) {
  if (!event) return null;

  const isOfficial =
    event.category === '公式戦' ||
    event.category === '新人戦' ||
    (event.title && (event.title.includes('公式') || event.title.includes('新人')));

  // 1. 到着目標時刻の決定
  // ユーザー要件: 公式戦の場合は暫定で「2時間30分前（150分前）到着前提」
  let targetArrivalMin = null;
  let targetArrivalStr = '';
  let reasonText = '';

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const formatMinutesToTime = (totalMin) => {
    let normalized = totalMin;
    while (normalized < 0) normalized += 24 * 60;
    normalized = normalized % (24 * 60);
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const kickoffMin = parseTimeToMinutes(event.kickoffTime);
  const meetingMin = parseTimeToMinutes(event.meetingTime);

  if (isOfficial) {
    if (kickoffMin !== null) {
      // キックオフの150分前 (2時間30分前)
      targetArrivalMin = kickoffMin - 150;
      targetArrivalStr = formatMinutesToTime(targetArrivalMin);
      reasonText = `KO ${event.kickoffTime} の 2時間30分前`;
    } else if (meetingMin !== null) {
      targetArrivalMin = meetingMin;
      targetArrivalStr = formatMinutesToTime(targetArrivalMin);
      reasonText = `集合 ${event.meetingTime}`;
    }
  } else {
    // 公式戦以外は集合時間ベース
    if (meetingMin !== null) {
      targetArrivalMin = meetingMin;
      targetArrivalStr = formatMinutesToTime(targetArrivalMin);
      reasonText = `集合 ${event.meetingTime}`;
    }
  }

  if (targetArrivalMin === null) return null;

  // 2. 移動所要時間の数学的算出（キャッシュ済み座標を使用）
  const destCoords = event.venue ? getCachedCoords(event.venue) : null;
  const originCoords = originAddress ? getCachedCoords(originAddress) : null;

  let travelDurationMin = 40; // デフォルトの推定所要時間（40分）
  let isDistanceEstimated = false;

  if (destCoords?.lat && destCoords?.lon && originCoords?.lat && originCoords?.lon) {
    const directDistKm = calculateHubenyDistanceKm(
      originCoords.lat,
      originCoords.lon,
      destCoords.lat,
      destCoords.lon
    );
    // 道路迂回係数 1.35
    const roadDistKm = directDistKm * 1.35;
    // 平均移動速度（近距離は市街地26km/h、遠距離はバイパス・高速混在36km/h）
    const avgSpeed = roadDistKm > 25 ? 36 : 26;
    const rawDrivingMin = Math.round((roadDistKm / avgSpeed) * 60);
    const bufferMin = 15; // 駐車・集合前ゆとり15分
    travelDurationMin = rawDrivingMin + bufferMin;
    isDistanceEstimated = true;
  }

  // 5分単位に切り上げ/丸め（例: 06:43 -> 06:40発 または 06:45発）
  const departureTotalMin = targetArrivalMin - travelDurationMin;
  const roundedDepartureMin = Math.floor(departureTotalMin / 5) * 5;
  const departureTimeStr = formatMinutesToTime(roundedDepartureMin);

  return {
    isOfficial,
    targetArrival: targetArrivalStr,
    departureTime: departureTimeStr,
    durationMin: travelDurationMin,
    reasonText,
    isDistanceEstimated,
    hasOriginCoords: Boolean(originCoords?.lat),
  };
}
