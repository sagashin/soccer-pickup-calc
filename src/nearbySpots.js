/**
 * 目的地周辺の駐車場・コンビニ取得ユーティリティ
 */

// 2地点間の直線距離（メートル）を計算（Haversine）
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 地球半径(m)
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// 徒歩目安時間（分）の計算（不動産基準: 80m/分）
export function getWalkMinutes(distanceMeters) {
  if (!distanceMeters || distanceMeters <= 0) return 1;
  return Math.max(1, Math.ceil(distanceMeters / 80));
}

// 駐車場の種別判定
function categorizeParking(name, rawTags = {}) {
  const n = (name || '').toLowerCase();
  const operator = (rawTags?.operator || '').toLowerCase();
  const feeTag = rawTags?.fee;

  const isParkFacility =
    n.includes('公園') ||
    n.includes('スタジアム') ||
    n.includes('競技場') ||
    n.includes('グラウンド') ||
    n.includes('運動') ||
    n.includes('体育館') ||
    n.includes('球場') ||
    n.includes('施設') ||
    n.includes('市民') ||
    n.includes('北側') ||
    n.includes('南側') ||
    n.includes('第1') ||
    n.includes('第2');

  const isCoinParking =
    n.includes('タイムズ') ||
    n.includes('times') ||
    n.includes('リパーク') ||
    n.includes('repark') ||
    n.includes('ナビパーク') ||
    n.includes('コイン') ||
    n.includes('パーキング') ||
    n.includes('npc') ||
    n.includes('名鉄協商') ||
    n.includes('ショウワ') ||
    operator.includes('タイムズ') ||
    operator.includes('三井') ||
    operator.includes('リパーク');

  let type = 'general';
  let badgeLabel = '一般駐車場';
  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';

  if (isParkFacility) {
    type = 'facility';
    badgeLabel = '公園・施設駐車場';
    badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  } else if (isCoinParking) {
    type = 'coin';
    badgeLabel = 'コインパーキング';
    badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
  }

  let feeLabel = null;
  if (feeTag === 'no') feeLabel = '無料';
  else if (feeTag === 'yes') feeLabel = '有料';
  else if (isCoinParking) feeLabel = '有料(コイン式)';

  return { type, badgeLabel, badgeColor, feeLabel };
}

// コンビニのブランド判定
function categorizeConvenience(name) {
  const n = (name || '');
  if (n.includes('セブン') || n.includes('7-Eleven') || n.includes('7-ELEVEN')) {
    return {
      brand: '7eleven',
      brandLabel: 'セブン-イレブン',
      brandColor: 'bg-orange-50 text-orange-700 border-orange-200',
      brandIconBg: 'bg-orange-500',
    };
  }
  if (n.includes('ファミリーマート') || n.includes('FamilyMart')) {
    return {
      brand: 'familymart',
      brandLabel: 'ファミリーマート',
      brandColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      brandIconBg: 'bg-emerald-500',
    };
  }
  if (n.includes('ローソン') || n.includes('LAWSON')) {
    return {
      brand: 'lawson',
      brandLabel: 'ローソン',
      brandColor: 'bg-sky-50 text-sky-700 border-sky-200',
      brandIconBg: 'bg-sky-500',
    };
  }
  if (n.includes('ミニストップ') || n.includes('MINISTOP')) {
    return {
      brand: 'ministop',
      brandLabel: 'ミニストップ',
      brandColor: 'bg-yellow-50 text-yellow-800 border-yellow-200',
      brandIconBg: 'bg-yellow-500',
    };
  }
  if (n.includes('デイリーヤマザキ') || n.includes('Daily')) {
    return {
      brand: 'daily',
      brandLabel: 'デイリーヤマザキ',
      brandColor: 'bg-red-50 text-red-700 border-red-200',
      brandIconBg: 'bg-red-500',
    };
  }
  return {
    brand: 'other',
    brandLabel: 'コンビニ',
    brandColor: 'bg-slate-50 text-slate-700 border-slate-200',
    brandIconBg: 'bg-emerald-600',
  };
}

/**
 * 目的地周辺の駐車場・コンビニ情報を検索
 */
export async function fetchNearbySpots({ lat, lon, destName = '', signal }) {
  if (!lat || !lon) return { parkings: [], conveniences: [] };

  // 約1.2km範囲のBounding Box計算
  const radiusMeters = 1300;
  const deltaLat = radiusMeters / 111000;
  const deltaLon = radiusMeters / (111000 * Math.cos((lat * Math.PI) / 180));

  const s = (lat - deltaLat).toFixed(5);
  const w = (lon - deltaLon).toFixed(5);
  const n = (lat + deltaLat).toFixed(5);
  const e = (lon + deltaLon).toFixed(5);

  const fetchNominatim = async (query) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&viewbox=${w},${n},${e},${s}&bounded=1&limit=15&addressdetails=1&extratags=1&accept-language=ja`;
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`Nominatim search failed for ${query}:`, err);
      }
      return [];
    }
  };

  const [parkingList, coinList, convList] = await Promise.all([
    fetchNominatim('駐車場'),
    fetchNominatim('コインパーキング'),
    fetchNominatim('コンビニ'),
  ]);

  // 重複排除キー用
  const seenParkingCoord = new Set();
  const parkings = [];

  const rawParkings = [...parkingList, ...coinList];
  for (const item of rawParkings) {
    const itemLat = parseFloat(item.lat);
    const itemLon = parseFloat(item.lon);
    if (isNaN(itemLat) || isNaN(itemLon)) continue;

    const coordKey = `${itemLat.toFixed(4)},${itemLon.toFixed(4)}`;
    if (seenParkingCoord.has(coordKey)) continue;
    seenParkingCoord.add(coordKey);

    const distMeters = calculateDistanceMeters(lat, lon, itemLat, itemLon);
    if (distMeters > radiusMeters) continue;

    const parts = (item.display_name || '').split(',').map((x) => x.trim());
    let name = item.name || '';
    if (!name || name === '駐車場' || name === 'parking') {
      // 道路名や地域名を補完
      const roadOrArea = parts[0] || '施設周辺';
      name = `${roadOrArea} 駐車場`;
    }

    const { type, badgeLabel, badgeColor, feeLabel } = categorizeParking(
      name,
      item.extratags
    );

    const address = parts.slice(1, 4).reverse().join(' ') || item.display_name;

    parkings.push({
      id: `parking-${item.osm_id || parkings.length}-${coordKey}`,
      category: 'parking',
      type,
      name,
      badgeLabel,
      badgeColor,
      feeLabel,
      lat: itemLat,
      lon: itemLon,
      distanceMeters: distMeters,
      walkMinutes: getWalkMinutes(distMeters),
      address,
      googleNavUrl: `https://www.google.com/maps/dir/?api=1&destination=${itemLat},${itemLon}&travelmode=driving`,
    });
  }

  // 距離順でソート (上位12件)
  parkings.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // コンビニの重複排除 & 距離ソート
  const seenConvCoord = new Set();
  const conveniences = [];

  for (const item of convList) {
    const itemLat = parseFloat(item.lat);
    const itemLon = parseFloat(item.lon);
    if (isNaN(itemLat) || isNaN(itemLon)) continue;

    const coordKey = `${itemLat.toFixed(4)},${itemLon.toFixed(4)}`;
    if (seenConvCoord.has(coordKey)) continue;
    seenConvCoord.add(coordKey);

    const distMeters = calculateDistanceMeters(lat, lon, itemLat, itemLon);
    if (distMeters > radiusMeters) continue;

    const parts = (item.display_name || '').split(',').map((x) => x.trim());
    let name = item.name || parts[0] || 'コンビニ';

    const brandInfo = categorizeConvenience(name);
    const address = parts.slice(1, 4).reverse().join(' ') || item.display_name;

    conveniences.push({
      id: `conv-${item.osm_id || conveniences.length}-${coordKey}`,
      category: 'convenience',
      name,
      ...brandInfo,
      lat: itemLat,
      lon: itemLon,
      distanceMeters: distMeters,
      walkMinutes: getWalkMinutes(distMeters),
      address,
      googleNavUrl: `https://www.google.com/maps/dir/?api=1&destination=${itemLat},${itemLon}&travelmode=driving`,
    });
  }

  conveniences.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    parkings: parkings.slice(0, 12),
    conveniences: conveniences.slice(0, 10),
  };
}

/**
 * 外部のリアルタイム駐車場・コンビニ検索URL生成
 */
export function getExternalSpotSearchUrls(lat, lon, destName = '') {
  if (!lat || !lon) return {};
  const queryDest = destName.trim() || '目的地';

  return {
    // 1. Googleマップでリアルタイム駐車場・コインパーキング検索 (満空・料金クチコミ確認)
    gmapParking: `https://www.google.com/maps/search/駐車場/@${lat},${lon},16z`,
    gmapCoinParking: `https://www.google.com/maps/search/コインパーキング/@${lat},${lon},16z`,
    // 2. Googleマップでコンビニ検索 (徒歩ルート・品揃え)
    gmapConvenience: `https://www.google.com/maps/search/コンビニ/@${lat},${lon},16z`,
    // 3. タイムズ駐車場リアルタイム満空マップ
    timesMap: `https://times-info.net/map/?latitude=${lat}&longitude=${lon}`,
    // 4. akippa（予約できる駐車場 - サッカー大会・公園満車時に便利）
    akippaSearch: `https://www.akippa.com/search?keyword=${encodeURIComponent(queryDest)}`,
    // 5. 特P（安価な事前予約パーキング）
    tokuPSearch: `https://toku-p.earth-car.com/search?q=${encodeURIComponent(queryDest)}`,
  };
}
