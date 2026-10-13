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
