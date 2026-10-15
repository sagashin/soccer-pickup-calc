import { getSavedGoogleMapsApiKey, geocodeWithGoogleMaps } from './googleMapsClient';

/**
 * 地理・ジオコーディング・キャッシュユーティリティ
 */

const GEOCODE_CACHE_KEY = 'soccer_pickup_geocode_cache_v1';
const memoryCache = new Map();

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
  // 例: "つくばFC T-Field (茨城県つくば市)" -> cleanName: "つくばFC T-Field", parenText: "茨城県つくば市"
  let cleanName = trimmed.replace(/[\(（][^()（）]+[\)）]/g, '').trim();
  cleanName = cleanName.replace(/(第\d+コート|A面|B面|C面|人工芝|天然芝|グラウンド|グランド)$/i, '').trim();
  const extractedMuni = extractMunicipality(trimmed);

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
            const isJustPrefecture = /^(北海道|.+[都府県])$/.test(title);
            return !isJustPrefecture;
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
        const scored = nomData
          .map((item) => {
            const name = item.display_name.split(',')[0] || item.name || '';
            const category = item.class || item.category || '';
            const type = item.type || '';
            const score = getSoccerRelevanceScore(name, category, type);
            return {
              item,
              name,
              score,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
            };
          })
          .sort((a, b) => b.score - a.score);

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

  // 検索パターンA: カッコ除去後の施設名本体
  if (cleanName && cleanName !== trimmed) {
    finalResult = await fetchFromNominatim(cleanName);
  }

  // 検索パターンB: 入力そのまま
  if (!finalResult) {
    finalResult = await fetchFromNominatim(trimmed);
  }

  // 検索パターンC: 国土地理院（自治体＋施設名 または 入力文字列）
  if (!finalResult) {
    finalResult = await fetchFromGsi(cleanName || trimmed);
  }

  // 検索パターンD: 自治体名フォールバック（例: "茨城県つくば市", "埼玉県羽生市"）
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

  // 検索パターンE: 学校・施設の母体検索（例: "〇〇第2グラウンド" -> "〇〇高校"）
  if (!finalResult && cleanName.length >= 2) {
    const schoolQuery =
      cleanName.endsWith('高校') || cleanName.endsWith('学校')
        ? cleanName
        : `${cleanName}高校`;
    const fallbackSchool = await fetchFromNominatim(schoolQuery);
    if (fallbackSchool) {
      finalResult = {
        ...fallbackSchool,
        displayName: `${fallbackSchool.displayName} (母体施設)`,
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
