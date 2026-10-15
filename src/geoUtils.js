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
 * 住所・施設名の住所ジオコーディング（キャッシュ + Google Maps + 国土地理院 + Nominatim）
 */
export async function geocodeAddress(address) {
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

  // 0. キャッシュに保存されている場合は外部通信なしで即座に返却（高速化 & API節約）
  const cached = getCachedCoords(trimmed);
  if (cached) {
    return cached;
  }

  // 1. Google Maps APIキーが設定されている場合は Google Maps を最優先実行！ (西武台第2なども一発特定)
  const gmapsKey = getSavedGoogleMapsApiKey();
  if (gmapsKey) {
    try {
      const gResult = await geocodeWithGoogleMaps(trimmed, gmapsKey);
      if (gResult) {
        saveCachedCoords(trimmed, gResult);
        return gResult;
      }
    } catch (e) {
      console.warn('Google Maps geocoding error, falling back to OSM:', e);
    }
  }

  // 2. キーがない場合、または失敗時はフリー地図（OSM + GSI安全版）
  const hasMunicipality = /[都道府県市区町村]/.test(trimmed);
  const coreQuery = trimmed
    .replace(/(第\d+)?(グラウンド|グランド|公園|運動公園|スタジアム|フィールド|スポーツ|学校|中学|高校|FC|SC)$/i, '')
    .trim();

  const fetchFromGsi = async (requireMatch = true) => {
    try {
      const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(trimmed)}`;
      const gsiRes = await fetch(gsiUrl);
      if (gsiRes.ok) {
        const gsiData = await gsiRes.json();
        if (Array.isArray(gsiData) && gsiData.length > 0) {
          // 防御: 「北海道」「青森県」等の無関係な都道府県リストは徹底除外
          const validItems = gsiData.filter((item) => {
            const title = item?.properties?.title || '';
            const isJustPrefecture = /^(北海道|.+[都府県])$/.test(title);
            if (isJustPrefecture) return false;
            if (!requireMatch) return true;
            return coreQuery.length >= 2
              ? title.includes(coreQuery) || coreQuery.includes(title)
              : title.includes(trimmed);
          });

          if (validItems.length > 0) {
            const matched = validItems[0];
            const [lon, lat] = matched.geometry.coordinates;
            return {
              lat,
              lon,
              displayName: matched.properties.title || trimmed,
              candidates: [],
            };
          }
        }
      }
    } catch (e) {
      console.warn('GSI geocoding fallback:', e);
    }
    return null;
  };

  const fetchFromNominatim = async (queryToSearch = trimmed) => {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        queryToSearch
      )}&countrycodes=jp&limit=8&addressdetails=1&accept-language=ja`;
      const nomRes = await fetch(nomUrl, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (nomRes.ok) {
        const nomData = await nomRes.json();
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
      }
    } catch (e) {
      console.warn('Nominatim geocoding fallback:', e);
    }
    return null;
  };

  const looksLikeFacility = /(総合|運動|公園|グラウンド|スタジアム|フィールド|スポーツ|学校|中学|高校|FC|SC)/i.test(
    trimmed
  );

  let finalResult = null;
  if (looksLikeFacility) {
    finalResult = await fetchFromNominatim(trimmed);
    if (!finalResult) finalResult = await fetchFromGsi(true);
  } else if (hasMunicipality) {
    finalResult = await fetchFromGsi(false);
    if (!finalResult) finalResult = await fetchFromNominatim(trimmed);
  } else {
    finalResult = await fetchFromGsi(true);
    if (!finalResult) finalResult = await fetchFromNominatim(trimmed);
  }

  // 3. 学校名＋グラウンド等のフォールバック分解 (例: 「西武台第2グラウンド」→「西武台高校」で本校を検索)
  if (!finalResult && coreQuery.length >= 2 && coreQuery !== trimmed) {
    const schoolQuery =
      coreQuery.endsWith('高校') || coreQuery.endsWith('学校')
        ? coreQuery
        : `${coreQuery}高校`;
    const fallbackNom = await fetchFromNominatim(schoolQuery);
    if (fallbackNom) {
      finalResult = {
        ...fallbackNom,
        displayName: `${fallbackNom.displayName} (母体施設)`,
      };
    }
  }

  if (finalResult) {
    saveCachedCoords(trimmed, finalResult);
    return finalResult;
  }

  throw new Error(
    `「${trimmed}」の場所が見つかりませんでした。Google Maps APIキーを設定するか、市区町村名を含めて入力してください。`
  );
}
