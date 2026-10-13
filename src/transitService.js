/**
 * 電車・公共交通機関（Transit）ルート検索および最寄り駅検索サービス
 */
import { loadGoogleMapsScript, getSavedGoogleMapsApiKey } from './googleMapsClient';

/**
 * Google Mapsのエンコード済みポリライン文字列を [lat, lon] の配列にデコードする
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push([lat * 1e-5, lng * 1e-5]);
  }
  return poly;
}

/**
 * Yahoo!乗換案内 URLを生成（到着時刻指定）
 * type: 4 (到着時刻指定)
 * y: 年, m: 月, d: 日, hh: 時, m1: 分の10の位, m2: 分の1の位
 */
export function buildYahooTransitUrl(origin, destination, dateStr, arrivalTimeStr) {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  const [hh, mm] = (arrivalTimeStr || '12:00').split(':').map(Number);

  const m1 = Math.floor((mm || 0) / 10);
  const m2 = (mm || 0) % 10;

  const params = new URLSearchParams({
    from: origin.trim(),
    to: destination.trim(),
    type: '4', // 到着時刻指定
    ticket: 'ic', // ICカード優先
    expkind: '1',
    ws: '3', // 少しゆっくり歩く
    s: '0', // 時間順
    al: '1', // 航空機
    shin: '1', // 新幹線
    ex: '1', // 特急
    hb: '1', // 高速バス
    lb: '1', // 路線バス
    sr: '1', // フェリー
  });

  if (y && m && d) {
    params.set('y', String(y));
    params.set('m', String(m).padStart(2, '0'));
    params.set('d', String(d).padStart(2, '0'));
    params.set('hh', String(hh || 0).padStart(2, '0'));
    params.set('m1', String(m1));
    params.set('m2', String(m2));
  }

  return `https://transit.yahoo.co.jp/search/result?${params.toString()}`;
}

/**
 * Google Maps 電車ルート URLを生成（到着時刻指定）
 */
export function buildGoogleTransitUrl(origin, destination, arrivalUnixSeconds) {
  const orig = encodeURIComponent(origin.trim());
  const dest = encodeURIComponent(destination.trim());

  if (arrivalUnixSeconds) {
    // !6e1 = 到着時刻指定, !7e2 = 時刻指定有効, !8j = UNIX秒, !3e3 = 電車・公共交通機関
    return `https://www.google.com/maps/dir/${orig}/${dest}/data=!4m6!4m5!2m3!6e1!7e2!8j${arrivalUnixSeconds}!3e3`;
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=transit`;
}

/**
 * 目的地の最寄り駅を Overpass API または OSM で検索
 */
export async function fetchNearbyStations(lat, lon, radiusMeters = 3500) {
  if (!lat || !lon) return [];

  const overpassQuery = `
    [out:json][timeout:5];
    (
      node["railway"="station"](around:${radiusMeters},${lat},${lon});
      node["railway"="halt"](around:${radiusMeters},${lat},${lon});
      node["station"="subway"](around:${radiusMeters},${lat},${lon});
    );
    out 5;
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.elements) && data.elements.length > 0) {
        const rad = Math.PI / 180;
        const R = 6371000; // 地球半径(m)

        const stations = data.elements
          .map((el) => {
            const elLat = el.lat;
            const elLon = el.lon;
            const dLat = (elLat - lat) * rad;
            const dLon = (elLon - lon) * rad;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat * rad) * Math.cos(elLat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distMeters = Math.round(R * c);

            const name = el.tags?.['name:ja'] || el.tags?.name || '最寄り駅';
            // 徒歩目安: 分速80m (1分 = 80m)
            const walkMinutes = Math.max(1, Math.round(distMeters / 80));

            return {
              id: `station-${el.id}`,
              name: name.endsWith('駅') ? name : `${name}駅`,
              lat: elLat,
              lon: elLon,
              distanceMeters: distMeters,
              walkMinutes,
              operator: el.tags?.operator || el.tags?.network || '',
            };
          })
          .sort((a, b) => a.distanceMeters - b.distanceMeters);

        // 重複除去
        const unique = [];
        const seen = new Set();
        for (const s of stations) {
          if (!seen.has(s.name)) {
            seen.add(s.name);
            unique.push(s);
          }
          if (unique.length >= 3) break;
        }
        return unique;
      }
    }
  } catch (e) {
    console.warn('Overpass stations lookup failed, skipping:', e);
  }

  return [];
}

/**
 * Google Maps DirectionsService による電車ルート検索
 */
export async function fetchGoogleTransitRoute({ origin, destination, arrivalDate, apiKey }) {
  const key = apiKey || getSavedGoogleMapsApiKey();
  if (!key) {
    throw new Error('Google Maps APIキーが設定されていません。');
  }

  const maps = await loadGoogleMapsScript(key);
  if (!maps.DirectionsService) {
    throw new Error('DirectionsService が利用できません。');
  }

  const directionsService = new maps.DirectionsService();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('電車ルートの検索がタイムアウトしました。'));
    }, 5000);

    const request = {
      origin,
      destination,
      travelMode: maps.TravelMode.TRANSIT,
      transitOptions: {
        arrivalTime: arrivalDate instanceof Date ? arrivalDate : new Date(arrivalDate),
        routingPreference: maps.TransitRoutePreference?.FEWER_TRANSFERS || undefined,
      },
      region: 'JP',
    };

    directionsService.route(request, (response, status) => {
      clearTimeout(timer);

      if (status === maps.DirectionsStatus.OK && response?.routes?.length > 0) {
        const route = response.routes[0];
        const leg = route.legs[0];

        // 各ステップの解析（電車・徒歩・バス）
        const steps = (leg.steps || []).map((step, idx) => {
          const isTransit = step.travel_mode === 'TRANSIT';
          const transitDetails = step.transit;

          let lineName = '';
          let vehicleType = 'TRAIN';
          let departureStop = '';
          let arrivalStop = '';
          let numStops = 0;
          let headsign = '';

          if (isTransit && transitDetails) {
            lineName = transitDetails.line?.short_name || transitDetails.line?.name || '';
            vehicleType = transitDetails.line?.vehicle?.type || 'TRAIN';
            departureStop = transitDetails.departure_stop?.name || '';
            arrivalStop = transitDetails.arrival_stop?.name || '';
            numStops = transitDetails.num_stops || 0;
            headsign = transitDetails.headsign || '';
          }

          return {
            id: `step-${idx}`,
            instructions: step.instructions ? step.instructions.replace(/<[^>]+>/g, '') : '',
            distanceText: step.distance?.text || '',
            durationText: step.duration?.text || '',
            durationMinutes: Math.round((step.duration?.value || 0) / 60),
            travelMode: step.travel_mode,
            isTransit,
            lineName,
            vehicleType,
            departureStop,
            arrivalStop,
            numStops,
            headsign,
            departureTimeText: transitDetails?.departure_time?.text || '',
            arrivalTimeText: transitDetails?.arrival_time?.text || '',
          };
        });

        // ポリラインの展開
        let coordinates = [];
        if (route.overview_polyline) {
          const raw = typeof route.overview_polyline === 'string'
            ? route.overview_polyline
            : route.overview_polyline.points;
          coordinates = decodePolyline(raw);
        }

        const totalMinutes = Math.round((leg.duration?.value || 0) / 60);
        const distanceKm = ((leg.distance?.value || 0) / 1000).toFixed(1);

        // 乗車駅と降車駅の抽出
        const transitSteps = steps.filter((s) => s.isTransit);
        const firstBoardingStop = transitSteps[0]?.departureStop || '';
        const lastAlightingStop = transitSteps[transitSteps.length - 1]?.arrivalStop || '';

        resolve({
          totalMinutes,
          distanceKm,
          departureTimeText: leg.departure_time?.text || '',
          arrivalTimeText: leg.arrival_time?.text || '',
          steps,
          transitStepsCount: transitSteps.length,
          firstBoardingStop,
          lastAlightingStop,
          summary: route.summary || `${transitSteps.map(s => s.lineName).filter(Boolean).join(' ➔ ') || '電車ルート'}`,
          fare: leg.fare?.text || '',
          coordinates, // [ [lat, lon], ... ]
          source: 'google-transit',
        });
      } else {
        reject(
          new Error(
            status === 'ZERO_RESULTS'
              ? '指定された区間の電車・バスルートが見つかりませんでした。最寄り駅リンクをご確認ください。'
              : `電車ルート検索に失敗しました (${status})`
          )
        );
      }
    });
  });
}
