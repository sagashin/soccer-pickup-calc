import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MapPin,
  Clock,
  Navigation,
  Plus,
  Trash2,
  Home,
  Car,
  Train,
  Footprints,
  ArrowRight,
  Check,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Calendar,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Compass,
  Edit2,
} from 'lucide-react';
import RouteMap from './RouteMap';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import NearbySpotsSection from './NearbySpotsSection';
import ScheduleImageImporter from './ScheduleImageImporter';
import MatchWeatherChecklist from './MatchWeatherChecklist';
import GoogleMapsKeyModal from './GoogleMapsKeyModal';
import { fetchNearbySpots } from './nearbySpots';
import {
  getSavedGoogleMapsApiKey,
  geocodeWithGoogleMaps,
  fetchGoogleDrivingRouteWithTraffic,
} from './googleMapsClient';
import {
  fetchGoogleTransitRoute,
  fetchNearbyStations,
  buildYahooTransitUrl,
  buildGoogleTransitUrl,
} from './transitService';
import {
  getSoccerRelevanceScore,
  getCachedCoords,
  saveCachedCoords,
} from './geoUtils';

const STORAGE_KEYS = {
  ORIGIN: 'soccer_pickup_origin_v1',
  PRESETS: 'soccer_pickup_presets_v1',
  BUFFER: 'soccer_pickup_buffer_v1',
  ARRIVAL_TIME: 'soccer_pickup_arrival_v1',
  TRAVEL_DATE: 'soccer_pickup_date_v1',
  DESTINATION: 'soccer_pickup_destination_v1',
  SELECTED_PRESET: 'soccer_pickup_selected_preset_v1',
  TRANSPORT_MODE: 'soccer_pickup_transport_mode_v1',
};

const DEFAULT_ORIGIN = '赤羽駅';
const DEFAULT_DESTINATION = '埼玉県さいたま市緑区大門2372-1';

const DEFAULT_PRESETS = [
  { id: 'preset-1', name: 'J-foot浦和美園', query: '埼玉県さいたま市緑区大門2372-1' },
  { id: 'preset-2', name: '浦和学院高等学校 (サッカー場)', query: '埼玉県さいたま市緑区代山172' },
  { id: 'preset-3', name: '味の素スタジアム (調布)', query: '東京都調布市西町376-3' },
  { id: 'preset-4', name: '駒沢オリンピック公園', query: '東京都世田谷区駒沢公園1-1' },
  { id: 'preset-5', name: '大井ふ頭中央海浜公園', query: '東京都品川区八潮4-1-19' },
  { id: 'preset-6', name: '新横浜公園 (日産フィールド)', query: '神奈川県横浜市港北区小机町3300' },
];

const BUFFER_OPTIONS = [
  { label: 'なし (0分)', value: 0 },
  { label: '5分前', value: 5 },
  { label: '10分前', value: 10 },
  { label: '15分前', value: 15 },
  { label: '20分前', value: 20 },
  { label: '30分前', value: 30 },
];

const TRAFFIC_OPTIONS = [
  { label: '日付・時間帯から自動判定', shortLabel: '自動判定', value: 'auto' },
  { label: '通常 (1.0x)', shortLabel: '通常 (1.0x)', value: 1.0 },
  { label: '少し混雑 (1.2x)', shortLabel: '少し混雑 (1.2x)', value: 1.2 },
  { label: '渋滞考慮 (1.4x)', shortLabel: '渋滞考慮 (1.4x)', value: 1.4 },
];

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getQuickDates() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // 次の土曜
  const nextSat = new Date(today);
  const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
  nextSat.setDate(today.getDate() + (today.getDay() === 6 ? 0 : daysUntilSat));

  // 次の日曜
  const nextSun = new Date(today);
  const daysUntilSun = (0 - today.getDay() + 7) % 7 || 7;
  nextSun.setDate(today.getDate() + (today.getDay() === 0 ? 0 : daysUntilSun));

  const list = [
    { id: 'today', label: '今日', dateStr: formatLocalDate(today), dayName: WEEKDAYS_JA[today.getDay()] },
    { id: 'tomorrow', label: '明日', dateStr: formatLocalDate(tomorrow), dayName: WEEKDAYS_JA[tomorrow.getDay()] },
  ];

  const satStr = formatLocalDate(nextSat);
  if (!list.some((item) => item.dateStr === satStr)) {
    list.push({ id: 'sat', label: '今度の土曜', dateStr: satStr, dayName: '土' });
  }

  const sunStr = formatLocalDate(nextSun);
  if (!list.some((item) => item.dateStr === sunStr)) {
    list.push({ id: 'sun', label: '今度の日曜', dateStr: sunStr, dayName: '日' });
  }

  return list;
}

/**
 * 時間（分）を「○時間○分」または「○分」にフォーマット（例: 90 -> 1時間30分）
 */
function formatMinutesLabel(minutes) {
  if (!minutes || minutes <= 0) return '0分';
  const m = Math.round(minutes);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}時間` : `${h}時間${rem}分`;
}

/**
 * 分数レンジをGoogleマップ風に「通常 1時間30分〜2時間10分」とフォーマット
 */
function formatDurationRange(minM, maxM) {
  const minText = formatMinutesLabel(minM);
  const maxText = formatMinutesLabel(maxM);
  if (minM === maxM) return minText;
  return `通常 ${minText}〜${maxText}`;
}

/**
 * 分数レンジの短縮表示（例: 1時間30分〜2時間10分）
 */
function formatMinutesRangeShort(minM, maxM) {
  const minText = formatMinutesLabel(minM);
  const maxText = formatMinutesLabel(maxM);
  if (minM === maxM) return minText;
  return `${minText}〜${maxText}`;
}

/**
 * Googleマップの統計渋滞実績（通常〜最大幅）に準拠した所要時間レンジ計算
 */
function calculateDriveDurationRange(baseMinutes, dateStr, timeStr) {
  if (!baseMinutes || baseMinutes <= 0) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay(); // 0: Sun, 6: Sat
  const isWeekend = day === 0 || day === 6;

  // 走行中間時間帯で交通状況を判定
  const midMinutes = (hh || 12) * 60 + (mm || 0) - Math.round(baseMinutes / 2);
  const hour = ((midMinutes / 60) + 24) % 24;

  let minMultiplier = 1.0;
  let maxMultiplier = 1.35;
  let situation = '通常のスムーズな交通量';

  if (isWeekend) {
    if (hour >= 7 && hour <= 11) {
      // 週末の朝: レジャー・遠征・行楽ラッシュ（最大1.65〜1.75倍）
      minMultiplier = 1.0;
      maxMultiplier = 1.72;
      situation = `${WEEKDAYS_JA[day]}曜・朝の遠征・お出かけ混雑ピーク`;
    } else if (hour >= 15.5 && hour <= 19.5) {
      // 週末の夕方: 帰宅ラッシュ
      minMultiplier = 1.05;
      maxMultiplier = 1.75;
      situation = `${WEEKDAYS_JA[day]}曜・夕方の帰宅混雑ピーク`;
    } else if (hour > 11 && hour < 15.5) {
      minMultiplier = 1.0;
      maxMultiplier = 1.45;
      situation = `${WEEKDAYS_JA[day]}曜・日中のお出かけ交通量`;
    } else {
      minMultiplier = 1.0;
      maxMultiplier = 1.25;
      situation = `${WEEKDAYS_JA[day]}曜・早朝/夜間（スムーズ）`;
    }
  } else {
    if (hour >= 7 && hour <= 9.5) {
      // 平日朝: 通勤・通学・物流ラッシュ（最大1.70倍）
      minMultiplier = 1.0;
      maxMultiplier = 1.72;
      situation = `平日 (${WEEKDAYS_JA[day]})・朝の通勤混雑ピーク`;
    } else if (hour >= 16.5 && hour <= 19.5) {
      // 平日夕方: 送迎・帰宅混雑
      minMultiplier = 1.05;
      maxMultiplier = 1.70;
      situation = `平日 (${WEEKDAYS_JA[day]})・夕方の送迎・帰宅混雑ピーク`;
    } else if (hour > 9.5 && hour < 16.5) {
      minMultiplier = 1.0;
      maxMultiplier = 1.38;
      situation = `平日 (${WEEKDAYS_JA[day]})・日中通常交通量`;
    } else {
      minMultiplier = 1.0;
      maxMultiplier = 1.25;
      situation = `平日 (${WEEKDAYS_JA[day]})・早朝/夜間（スムーズ）`;
    }
  }

  const minM = Math.max(1, Math.round(baseMinutes * minMultiplier));
  const maxM = Math.max(minM + (baseMinutes >= 20 ? 10 : 5), Math.round(baseMinutes * maxMultiplier));
  const standardM = Math.round((minM + maxM) / 2);

  return {
    minMinutes: minM,
    maxMinutes: maxM,
    standardMinutes: standardM,
    situation,
    formattedRange: formatDurationRange(minM, maxM),
    formattedShort: formatMinutesRangeShort(minM, maxM),
  };
}

function getAutoTrafficInfo(dateStr, timeStr, estimatedMinutes = 35) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay(); // 0: Sun, 6: Sat
  const isWeekend = day === 0 || day === 6;

  // 走行中の中間時間帯（現地到着目標時刻 - 想定走行時間の半分）でラッシュを判定
  const midTotalMinutes = (hh || 12) * 60 + (mm || 0) - Math.round((estimatedMinutes || 35) / 2);
  const hourDecimal = ((midTotalMinutes / 60) + 24) % 24;

  if (isWeekend) {
    if (hourDecimal >= 8 && hourDecimal <= 18.5) {
      return { multiplier: 1.25, reason: `${WEEKDAYS_JA[day]}曜・日中お出かけ混雑見込み (1.25x)` };
    }
    return { multiplier: 1.0, reason: `${WEEKDAYS_JA[day]}曜・早朝/夜間スムーズ (1.0x)` };
  } else {
    if (hourDecimal >= 7 && hourDecimal <= 9.5) {
      return { multiplier: 1.35, reason: `平日 (${WEEKDAYS_JA[day]})・朝ラッシュ考慮 (1.35x)` };
    }
    if (hourDecimal >= 16.5 && hourDecimal <= 19.5) {
      return { multiplier: 1.35, reason: `平日 (${WEEKDAYS_JA[day]})・夕方送迎ラッシュ考慮 (1.35x)` };
    }
    return { multiplier: 1.1, reason: `平日 (${WEEKDAYS_JA[day]})・日中通常交通量 (1.1x)` };
  }
}

async function geocodeAddress(address) {
  const trimmed = address.trim();
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

function calculateHubenyDistanceKm(lat1, lon1, lat2, lon2) {
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

async function fetchOsrmRoute(originCoords, destCoords) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        const route = data.routes[0];
        // OSRMの生durationは信号のない理想最高速基準。
        // 日本の市街地・一般道は信号待ち（約400〜500m毎）や右折待ちがあるため、
        // 実効平均速度は時速約20〜28km/h（OSRM理論値の約1.35〜1.45倍の時間）となる。
        const distanceKm = route.distance / 1000;
        const rawSpeedKmh = route.duration > 0 ? distanceKm / (route.duration / 3600) : 30;
        // 高速道路区間（時速70km以上）は1.12倍、郊外幹線道（45〜70km）は1.28倍、市街地一般道は1.42倍
        const japanRealTrafficFactor =
          rawSpeedKmh >= 70 ? 1.12 : rawSpeedKmh >= 45 ? 1.28 : 1.42;
        const adjustedSeconds = Math.round(route.duration * japanRealTrafficFactor);

        return {
          durationSeconds: adjustedSeconds,
          distanceMeters: route.distance,
          geometry: route.geometry,
        };
      }
    }
  } catch (e) {
    console.warn('OSRM router error or timeout, falling back to estimated distance:', e);
  }

  // サーバーエラーやタイムアウト時は、直線距離 × 1.35 (実道係数) + 平均時速32kmで即座に概算
  const straightKm = calculateHubenyDistanceKm(
    originCoords.lat,
    originCoords.lon,
    destCoords.lat,
    destCoords.lon
  );
  const roadKm = Math.max(0.8, straightKm * 1.35);
  const durationSeconds = Math.round((roadKm / 32) * 3600);

  return {
    durationSeconds,
    distanceMeters: Math.round(roadKm * 1000),
    geometry: {
      type: 'LineString',
      coordinates: [
        [originCoords.lon, originCoords.lat],
        [destCoords.lon, destCoords.lat],
      ],
    },
    isEstimatedFallback: true,
  };
}

function subtractMinutesFromTime(timeStr, totalMinutesToSubtract) {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  let totalMinutes = hours * 60 + minutes - totalMinutesToSubtract;
  let dayOffset = 0;

  while (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    dayOffset -= 1;
  }
  totalMinutes = totalMinutes % (24 * 60);

  const outHours = Math.floor(totalMinutes / 60);
  const outMinutes = totalMinutes % 60;

  return {
    formatted: `${String(outHours).padStart(2, '0')}:${String(outMinutes).padStart(2, '0')}`,
    hours: outHours,
    minutes: outMinutes,
    dayOffset,
  };
}

function formatJapaneseDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const w = WEEKDAYS_JA[dt.getDay()];
  return `${m}月${d}日(${w})`;
}

export default function App() {
  const [origin, setOrigin] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ORIGIN);
    // 以前のデフォルト値「二子玉川駅」や特定の番地が保存されていた場合も新しいデフォルトに更新
    if (!saved || saved === '二子玉川駅' || saved.includes('神谷2-45-7')) {
      return DEFAULT_ORIGIN;
    }
    return saved;
  });
  const [originSavedToast, setOriginSavedToast] = useState(false);

  const [presets, setPresets] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRESETS);
      if (!saved) return DEFAULT_PRESETS;
      const parsed = JSON.parse(saved);
      // 以前の初期プリセット（味の素スタジアムが先頭だった場合）は新デフォルトに移行
      if (Array.isArray(parsed) && parsed[0]?.name === '味の素スタジアム (調布)') {
        return DEFAULT_PRESETS;
      }
      return parsed;
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  const [destination, setDestination] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DESTINATION);
    if (!saved || saved === '東京都調布市西町376-3') {
      return DEFAULT_DESTINATION;
    }
    return saved;
  });
  const [selectedPresetId, setSelectedPresetId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_PRESET);
    if (saved === null || saved === 'preset-1') return 'preset-1';
    return saved || null; // 空文字 = 未選択
  });
  const [destinationCandidates, setDestinationCandidates] = useState([]);

  const [travelDate, setTravelDate] = useState(() => {
    const todayStr = formatLocalDate(new Date());
    const saved = localStorage.getItem(STORAGE_KEYS.TRAVEL_DATE);
    // 保存された日付が未設定、または過去日の場合は今日に自動リセット
    if (!saved || saved < todayStr) {
      return todayStr;
    }
    return saved;
  });

  const [arrivalTime, setArrivalTime] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.ARRIVAL_TIME) || '17:00';
  });

  const [bufferMinutes, setBufferMinutes] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BUFFER);
    return saved !== null ? parseInt(saved, 10) : 15;
  });

  // 移動手段モード: 'car' (車) | 'train' (電車・公共交通機関)
  const [transportMode, setTransportMode] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.TRANSPORT_MODE) || 'car';
  });

  // デフォルトは日付・曜日・時間帯から自動判定 ('auto')、または手動の分数指定もサポート
  const [trafficMode, setTrafficMode] = useState('auto');
  // Googleマップで確認した実際の所要時間を直接入力して上書きできるオプション (車)
  const [manualDriveMinutes, setManualDriveMinutes] = useState('');
  // 乗換案内で確認した電車の所要時間を直接入力して上書きできるオプション (電車)
  const [manualTransitMinutes, setManualTransitMinutes] = useState('');
  // 電車ルートの詳細ステップ展開ステート
  const [showTransitDetails, setShowTransitDetails] = useState(false);

  // プリセット追加フォーム用
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetQuery, setNewPresetQuery] = useState('');

  // ルート計算結果ステート (車 & 電車)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [transitResult, setTransitResult] = useState(null);
  const [nearbyStations, setNearbyStations] = useState([]);

  // 目的地周辺スポット (駐車場 & コンビニ) ステート
  const [nearbyParkings, setNearbyParkings] = useState([]);
  const [nearbyConveniences, setNearbyConveniences] = useState([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotsError, setSpotsError] = useState('');
  const [spotFilter, setSpotFilter] = useState('all');
  const [selectedSpotId, setSelectedSpotId] = useState(null);

  // Google Maps API設定モーダル
  const [isGmapsModalOpen, setIsGmapsModalOpen] = useState(false);
  const [gmapsApiKey, setGmapsApiKey] = useState(() => getSavedGoogleMapsApiKey());

  // UIタブ切り替え ('calc' | 'spots' | 'checklist')
  const [activeTab, setActiveTab] = useState('calc');
  // 自宅住所のインライン編集展開ステート
  const [isOriginEditing, setIsOriginEditing] = useState(false);

  const quickDates = useMemo(() => getQuickDates(), []);

  // 地図マーカーが毎回作り直されないよう、参照を固定したハンドラ
  const handleSelectSpot = useCallback((spot) => setSelectedSpotId(spot.id), []);

  // 非同期処理の競合対策: 最新リクエスト以外の結果は破棄する
  const routeRequestIdRef = useRef(0);
  const spotsAbortRef = useRef(null);

  // 周辺スポット検索処理
  const loadNearbySpots = useCallback(async (destGeo, destName) => {
    if (!destGeo?.lat || !destGeo?.lon) return;

    // 実行中の古い検索を中断
    if (spotsAbortRef.current) spotsAbortRef.current.abort();
    const controller = new AbortController();
    spotsAbortRef.current = controller;

    setSpotsLoading(true);
    setSpotsError('');
    setSelectedSpotId(null);
    setNearbyParkings([]);
    setNearbyConveniences([]);
    try {
      const { parkings, conveniences } = await fetchNearbySpots({
        lat: destGeo.lat,
        lon: destGeo.lon,
        destName: destName || destGeo.displayName,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setNearbyParkings(parkings);
      setNearbyConveniences(conveniences);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn('周辺スポット取得エラー:', err);
      setSpotsError('周辺スポットの取得中に一時的な通信エラーが発生しました。');
    } finally {
      if (spotsAbortRef.current === controller) {
        setSpotsLoading(false);
      }
    }
  }, []);

  // 会場最寄り駅検索処理
  const loadNearbyStations = useCallback(async (destGeo) => {
    if (!destGeo?.lat || !destGeo?.lon) return;
    try {
      const stations = await fetchNearbyStations(destGeo.lat, destGeo.lon);
      setNearbyStations(stations);
    } catch (e) {
      console.warn('最寄り駅取得スキップ:', e);
    }
  }, []);

  // ローカルストレージへの自動保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ORIGIN, origin);
  }, [origin]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRAVEL_DATE, travelDate);
  }, [travelDate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ARRIVAL_TIME, arrivalTime);
  }, [arrivalTime]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BUFFER, String(bufferMinutes));
  }, [bufferMinutes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DESTINATION, destination);
  }, [destination]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_PRESET, selectedPresetId || '');
  }, [selectedPresetId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSPORT_MODE, transportMode);
  }, [transportMode]);

  const calculateRoute = useCallback(async (targetOrigin, targetDest, modeToUse = transportMode) => {
    const o = (targetOrigin ?? origin).trim();
    const d = (targetDest ?? destination).trim();

    if (!o || !d) {
      setError('出発地と目的地の両方を入力してください。');
      return;
    }

    const requestId = ++routeRequestIdRef.current;
    let timedOut = false;
    const isStale = () => timedOut || requestId !== routeRequestIdRef.current;

    setLoading(true);
    setError('');

    // セーフティガード：万一通信がハングしても最大8秒でローディングを必ず解除し以降の反映を無効化
    const safetyTimer = setTimeout(() => {
      if (requestId === routeRequestIdRef.current) {
        timedOut = true;
        setLoading(false);
        setError('ルート計算がタイムアウトしました。電波状況またはAPI設定を確認してください。');
      }
    }, 8000);

    try {
      const [originGeo, destGeo] = await Promise.all([
        geocodeAddress(o),
        geocodeAddress(d),
      ]);
      if (isStale()) return;

      if (destGeo?.candidates && destGeo.candidates.length > 0) {
        setDestinationCandidates(destGeo.candidates);
      } else {
        setDestinationCandidates([]);
      }

      // 目的地の周辺スポット（駐車場・コンビニ）および最寄り駅も並行して取得
      loadNearbySpots(destGeo, d);
      loadNearbyStations(destGeo);

      // 車ルート計算 (OSRM標準ルートを並行準備)
      const osrmPromise = fetchOsrmRoute(originGeo, destGeo);

      // Google Maps APIキーがある場合の処理 (車: 渋滞予測 / 電車: ダイヤ検索)
      const gKey = getSavedGoogleMapsApiKey();
      let transitData = null;
      let googleDriveData = null;

      if (gKey) {
        // 集合時刻ではなく、目標到着時刻（集合時刻 - バッファ分前）を基準に逆算
        const targetArr = subtractMinutesFromTime(arrivalTime, bufferMinutes);
        const [y, m, day] = travelDate.split('-').map(Number);
        const arrDate = new Date(
          y,
          (m || 1) - 1,
          day || 1,
          targetArr.hours,
          targetArr.minutes,
          0
        );

        // 🚗 車ルート: Google Directions API による最悪渋滞想定 (PESSIMISTIC) の自動逆算取得
        const drivePromise = fetchGoogleDrivingRouteWithTraffic({
          origin: o,
          destination: d,
          originCoords: originGeo?.lat && originGeo?.lon ? { lat: originGeo.lat, lon: originGeo.lon } : null,
          destCoords: destGeo?.lat && destGeo?.lon ? { lat: destGeo.lat, lon: destGeo.lon } : null,
          arrivalDate: arrDate,
          apiKey: gKey,
        }).catch((gDriveErr) => {
          console.warn('Google Driving Traffic API error or fallback to OSRM:', gDriveErr);
          return null;
        });

        // 🚃 電車ルート: Google Transit ダイヤ取得
        const transitPromise = fetchGoogleTransitRoute({
          origin: o,
          destination: d,
          arrivalDate: arrDate,
          apiKey: gKey,
        }).catch((tErr) => {
          console.warn('Google Transit API error or fallback:', tErr);
          return null;
        });

        [googleDriveData, transitData] = await Promise.all([drivePromise, transitPromise]);
      }

      const osrm = await osrmPromise;
      if (isStale()) return;

      if (googleDriveData) {
        // Google Maps 公式の渋滞予測データ（通常時間・最大渋滞時間）を反映
        setRouteResult({
          originGeo,
          destGeo,
          baseDurationMinutes: googleDriveData.minMinutes,
          maxDurationMinutes: googleDriveData.maxMinutes,
          distanceKm: googleDriveData.distanceKm,
          geometry: googleDriveData.geometry || osrm.geometry,
          isGoogleRealtime: true,
          calculatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        // フリー地図（OSRM + 統計渋滞モデル）でフォールバック
        setRouteResult({
          originGeo,
          destGeo,
          baseDurationMinutes: Math.max(1, Math.round(osrm.durationSeconds / 60)),
          distanceKm: (osrm.distanceMeters / 1000).toFixed(1),
          geometry: osrm.geometry,
          isGoogleRealtime: false,
          calculatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        });
      }

      if (transitData) {
        setTransitResult({
          ...transitData,
          calculatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        // 電車APIキーがない、または結果がない場合、概算所要時間を設定
        const distKm = parseFloat((osrm.distanceMeters / 1000).toFixed(1));
        // 一般的な都市間電車＋徒歩: 約25〜30km/h + 乗り換え・徒歩等で約1.2倍
        const estimatedTransit = Math.max(15, Math.round((distKm / 28) * 60) + 10);
        setTransitResult({
          totalMinutes: estimatedTransit,
          distanceKm: distKm.toFixed(1),
          steps: [],
          transitStepsCount: 1,
          isEstimate: true,
          summary: '最寄り駅経由の標準ルート (乗換案内リンクをご活用ください)',
          calculatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (err) {
      if (!isStale()) {
        setError(err.message || 'ルート計算中にエラーが発生しました。');
      }
    } finally {
      clearTimeout(safetyTimer);
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [origin, destination, transportMode, travelDate, arrivalTime, bufferMinutes, loadNearbySpots, loadNearbyStations]);

  // 初回マウント時に、保存済みの出発地・目的地で自動計算
  useEffect(() => {
    calculateRoute(origin || DEFAULT_ORIGIN, destination || DEFAULT_DESTINATION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 電車モード時：日付・集合時刻・バッファ変更時にGoogle APIキーがあれば最新ダイヤで再計算
  useEffect(() => {
    if (transportMode === 'train' && routeResult?.destGeo && getSavedGoogleMapsApiKey()) {
      calculateRoute(origin, destination, 'train');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelDate, arrivalTime, bufferMinutes, transportMode]);

  const handleSelectPreset = (preset) => {
    setSelectedPresetId(preset.id);
    setDestination(preset.query);
    setManualDriveMinutes('');
    setManualTransitMinutes('');
    calculateRoute(origin, preset.query);
  };

  const handleApplySchedule = ({ destination: newDest, travelDate: newDate, arrivalTime: newTime }) => {
    if (newDest) {
      setDestination(newDest);
      setSelectedPresetId(null);
    }
    if (newDate) {
      setTravelDate(newDate);
    }
    if (newTime) {
      setArrivalTime(newTime);
    }
    setManualDriveMinutes('');
    setManualTransitMinutes('');
    calculateRoute(origin, newDest || destination);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddPreset = (e) => {
    e.preventDefault();
    const name = newPresetName.trim();
    const query = newPresetQuery.trim();
    if (!name || !query) return;

    const newItem = {
      id: `preset-${Date.now()}`,
      name,
      query,
    };
    const updated = [...presets, newItem];
    setPresets(updated);
    setNewPresetName('');
    setNewPresetQuery('');
    setShowAddPreset(false);
    handleSelectPreset(newItem);
  };

  const handleDeletePreset = (id, e) => {
    e.stopPropagation();
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    if (selectedPresetId === id) {
      setSelectedPresetId(null);
    }
  };

  const handleSaveOriginFeedback = () => {
    localStorage.setItem(STORAGE_KEYS.ORIGIN, origin);
    setOriginSavedToast(true);
    setTimeout(() => setOriginSavedToast(false), 2000);
  };

  // 現地到着目標時刻（集合時刻 - バッファ）
  const targetArrivalMinusBuffer = subtractMinutesFromTime(arrivalTime, bufferMinutes);

  // 指定した移動日＋現地到着目安時刻（集合-バッファ）のUNIXタイムスタンプ（秒）
  const targetArrivalUnixSeconds = useMemo(() => {
    const [y, m, d] = travelDate.split('-').map(Number);
    const dt = new Date(
      y,
      (m || 1) - 1,
      d || 1,
      targetArrivalMinusBuffer.hours,
      targetArrivalMinusBuffer.minutes,
      0
    );
    if (targetArrivalMinusBuffer.dayOffset < 0) {
      dt.setDate(dt.getDate() + targetArrivalMinusBuffer.dayOffset);
    }
    return Math.floor(dt.getTime() / 1000);
  }, [travelDate, targetArrivalMinusBuffer]);

  // --- 🚗 車モードの逆算ロジック (通常〜最大レンジ対応) ---
  const autoTraffic = getAutoTrafficInfo(
    travelDate,
    targetArrivalMinusBuffer.formatted,
    routeResult?.baseDurationMinutes || 35
  );
  const activeMultiplier = trafficMode === 'auto' ? autoTraffic.multiplier : Number(trafficMode);

  const parsedManualMinutes = parseInt(manualDriveMinutes, 10);
  const hasManualOverride = !Number.isNaN(parsedManualMinutes) && parsedManualMinutes > 0;

  // Googleマップ風の「通常〜最大」所要時間レンジ（Google公式予測または統計モデル）
  const driveRange = useMemo(() => {
    if (!routeResult?.baseDurationMinutes) return null;
    const baseM = routeResult.baseDurationMinutes;
    if (hasManualOverride) {
      return {
        minMinutes: parsedManualMinutes,
        maxMinutes: parsedManualMinutes,
        standardMinutes: parsedManualMinutes,
        situation: 'Googleマップ確認時間（手動入力）',
        formattedRange: formatMinutesLabel(parsedManualMinutes),
        formattedShort: formatMinutesLabel(parsedManualMinutes),
      };
    }
    // Google Maps APIキーがあり、Google Directions APIから最大渋滞予測が直接取得できている場合
    if (routeResult.isGoogleRealtime && routeResult.maxDurationMinutes) {
      return {
        minMinutes: routeResult.baseDurationMinutes,
        maxMinutes: routeResult.maxDurationMinutes,
        standardMinutes: Math.round((routeResult.baseDurationMinutes + routeResult.maxDurationMinutes) / 2),
        situation: 'Googleマップ公式渋滞予測（PESSIMISTIC最大時間）',
        formattedRange: formatDurationRange(routeResult.baseDurationMinutes, routeResult.maxDurationMinutes),
        formattedShort: formatMinutesRangeShort(routeResult.baseDurationMinutes, routeResult.maxDurationMinutes),
        isGoogleRealtime: true,
      };
    }
    return calculateDriveDurationRange(
      baseM,
      travelDate,
      targetArrivalMinusBuffer.formatted
    );
  }, [routeResult, hasManualOverride, parsedManualMinutes, travelDate, targetArrivalMinusBuffer]);

  // 最大時間（渋滞・ピーク時）想定: 遅刻厳禁の安全出発時刻
  const maxDriveMinutes = hasManualOverride
    ? parsedManualMinutes
    : driveRange?.maxMinutes || (routeResult ? Math.round(routeResult.baseDurationMinutes * activeMultiplier) : null);

  // 通常時間（スムーズ時）想定
  const minDriveMinutes = hasManualOverride
    ? parsedManualMinutes
    : driveRange?.minMinutes || (routeResult ? routeResult.baseDurationMinutes : null);

  // 推奨標準時間
  const estimatedDriveMinutes = hasManualOverride
    ? parsedManualMinutes
    : driveRange?.maxMinutes // 安全第一で最大時間をデフォルトに設定
    ? driveRange.maxMinutes
    : routeResult
    ? Math.max(1, Math.round(routeResult.baseDurationMinutes * activeMultiplier))
    : null;

  // 出発時刻: 最大渋滞想定（遅くともこの時刻）
  const latestDepartureInfo = maxDriveMinutes !== null
    ? subtractMinutesFromTime(arrivalTime, maxDriveMinutes + bufferMinutes)
    : null;

  // 出発時刻: 通常スムーズ想定
  const earliestDepartureInfo = minDriveMinutes !== null
    ? subtractMinutesFromTime(arrivalTime, minDriveMinutes + bufferMinutes)
    : null;

  // 統合された車モード出発情報 (遅くとも出発すべき安全時刻)
  const departureInfo = latestDepartureInfo;

  // 車用 Googleマップ URL
  const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin.trim()
  )}&destination=${encodeURIComponent(destination.trim())}&travelmode=driving`;

  const googleMapsTrafficCheckUrl = `https://www.google.com/maps/dir/${encodeURIComponent(
    origin.trim()
  )}/${encodeURIComponent(
    destination.trim()
  )}/data=!4m6!4m5!2m3!6e1!7e2!8j${targetArrivalUnixSeconds}!3e0`;

  // --- 🚃 電車モードの逆算ロジック ---
  const parsedManualTransit = parseInt(manualTransitMinutes, 10);
  const hasManualTransitOverride = !Number.isNaN(parsedManualTransit) && parsedManualTransit > 0;

  const estimatedTransitMinutes = hasManualTransitOverride
    ? parsedManualTransit
    : transitResult?.totalMinutes
    ? transitResult.totalMinutes
    : routeResult
    ? Math.max(15, Math.round(routeResult.baseDurationMinutes * 1.15))
    : null;

  const totalTransitLeadMinutes = estimatedTransitMinutes !== null
    ? estimatedTransitMinutes + bufferMinutes
    : null;

  const transitDepartureInfo = totalTransitLeadMinutes !== null
    ? subtractMinutesFromTime(arrivalTime, totalTransitLeadMinutes)
    : null;

  // 電車用 URL (Yahoo!乗換案内 & Google Maps)
  const yahooTransitUrl = buildYahooTransitUrl(
    origin,
    destination,
    travelDate,
    targetArrivalMinusBuffer.formatted
  );

  const googleMapsTransitCheckUrl = buildGoogleTransitUrl(
    origin,
    destination,
    targetArrivalUnixSeconds
  );

  const googleMapsTransitNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin.trim()
  )}&destination=${encodeURIComponent(destination.trim())}&travelmode=transit`;

  // 現在アクティブなモードに基づく統合情報
  const isTrainMode = transportMode === 'train';
  const activeDepartureInfo = isTrainMode ? transitDepartureInfo : departureInfo;
  const activeEstimatedMinutes = isTrainMode ? estimatedTransitMinutes : estimatedDriveMinutes;

  const formattedDateLabel = formatJapaneseDateLabel(travelDate);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-start pb-12">
      {/* スマホ幅コンテナ */}
      <div className="w-full max-w-md bg-slate-50 min-h-screen shadow-xl flex flex-col">
        {/* ヘッダー (車: エメラルド, 電車: インディゴ) */}
        <header
          className={`text-white px-5 pt-5 pb-4 shadow-md sticky top-0 z-30 transition-colors duration-300 ${
            isTrainMode
              ? 'bg-gradient-to-r from-indigo-800 to-indigo-600'
              : 'bg-gradient-to-r from-emerald-700 to-emerald-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shadow-inner">
                <span className="text-xl" role="img" aria-label="icon">
                  {isTrainMode ? '🚃' : '⚽'}
                </span>
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight leading-tight">
                  サッカー送迎 出発逆算ナビ
                </h1>
                <p className={`text-[11px] font-medium ${isTrainMode ? 'text-indigo-200' : 'text-emerald-100'}`}>
                  {isTrainMode ? '移動日・電車乗換案内連携' : '移動日・Googleマップ渋滞予測連携'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsGmapsModalOpen(true)}
                className={`px-2.5 py-1.5 rounded-xl transition flex items-center gap-1 text-[11px] font-bold shadow-sm ${
                  gmapsApiKey
                    ? 'bg-blue-500/30 text-blue-100 hover:bg-blue-500/40 border border-blue-300/40'
                    : 'bg-white/15 hover:bg-white/25 text-white/90'
                }`}
                title="Google Maps API設定"
              >
                <Sparkles className={`w-3.5 h-3.5 ${gmapsApiKey ? 'text-amber-300' : 'text-emerald-200'}`} />
                <span>{gmapsApiKey ? 'Google連動' : '地図設定'}</span>
              </button>
              <button
                type="button"
                onClick={() => calculateRoute(origin, destination)}
                disabled={loading}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition flex items-center gap-1 text-xs font-bold"
                title="再計算"
              >
                <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>再計算</span>
              </button>
            </div>
          </div>
        </header>

        {/* 📱 3つの目的別タブバー（逆算ナビ / 駐車場・周辺 / 持ち物・天気） */}
        <nav
          className={`text-white px-2 py-1.5 shadow-md sticky top-[68px] z-20 flex items-center justify-around gap-1 transition-colors duration-300 ${
            isTrainMode ? 'bg-indigo-900' : 'bg-emerald-800'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('calc')}
            className={`flex-1 py-2 px-1 text-center rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
              activeTab === 'calc'
                ? isTrainMode
                  ? 'bg-white text-indigo-950 shadow-md scale-[1.02]'
                  : 'bg-white text-emerald-950 shadow-md scale-[1.02]'
                : isTrainMode
                ? 'text-indigo-200 hover:bg-white/10'
                : 'text-emerald-100 hover:bg-white/10'
            }`}
          >
            {isTrainMode ? <Train className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
            <span>逆算ナビ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('spots')}
            className={`flex-1 py-2 px-1 text-center rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
              activeTab === 'spots'
                ? isTrainMode
                  ? 'bg-white text-indigo-950 shadow-md scale-[1.02]'
                  : 'bg-white text-emerald-950 shadow-md scale-[1.02]'
                : isTrainMode
                ? 'text-indigo-200 hover:bg-white/10'
                : 'text-emerald-100 hover:bg-white/10'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isTrainMode ? '駅・周辺施設' : '駐車場・周辺'}</span>
            {(nearbyParkings.length > 0 || nearbyStations.length > 0) && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'spots'
                    ? isTrainMode
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-emerald-100 text-emerald-800'
                    : isTrainMode
                    ? 'bg-indigo-950 text-indigo-200'
                    : 'bg-emerald-900 text-emerald-200'
                }`}
              >
                {isTrainMode ? nearbyStations.length : nearbyParkings.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`flex-1 py-2 px-1 text-center rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
              activeTab === 'checklist'
                ? isTrainMode
                  ? 'bg-white text-indigo-950 shadow-md scale-[1.02]'
                  : 'bg-white text-emerald-950 shadow-md scale-[1.02]'
                : isTrainMode
                ? 'text-indigo-200 hover:bg-white/10'
                : 'text-emerald-100 hover:bg-white/10'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>持ち物・天気</span>
          </button>
        </nav>

        <main className="flex-1 px-4 py-4 space-y-4 pb-28">
          {/* ==================== タブ 1: 逆算ナビ ==================== */}
          {activeTab === 'calc' && (
            <>
              {/* 🚗 車 / 🚃 電車 移動手段モードセレクター */}
              <div
                data-testid="transport-mode-selector"
                className="bg-slate-200/90 p-1 rounded-2xl flex items-center gap-1 shadow-inner border border-slate-300/60"
              >
                <button
                  type="button"
                  data-testid="mode-select-car"
                  onClick={() => setTransportMode('car')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
                    !isTrainMode
                      ? 'bg-emerald-700 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>🚗 車で送迎</span>
                </button>
                <button
                  type="button"
                  data-testid="mode-select-train"
                  onClick={() => setTransportMode('train')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
                    isTrainMode
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Train className="w-4 h-4" />
                  <span>🚃 電車で行く</span>
                </button>
              </div>

              {/* 1. 最重要: 出発時刻 逆算結果カード */}
              <section
                aria-label="出発時刻の逆算結果"
                className={`text-white rounded-3xl p-5 shadow-lg relative overflow-hidden transition-all duration-300 ${
                  isTrainMode
                    ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900'
                    : 'bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900'
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-bold mb-1 ${
                    isTrainMode ? 'text-indigo-200' : 'text-emerald-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${isTrainMode ? 'text-indigo-300' : 'text-emerald-300'}`} />
                    <span data-testid="summary-date-label">{formattedDateLabel}</span>
                    <span>{arrivalTime}集合（{bufferMinutes}分前着）</span>
                  </span>
                  {routeResult && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] shrink-0 border ${
                        isTrainMode
                          ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60'
                          : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                      }`}
                    >
                      {isTrainMode ? '🚃 電車ルート' : `約 ${routeResult.distanceKm} km`}
                    </span>
                  )}
                </div>

                {loading ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-2">
                    <div
                      className={`w-8 h-8 border-4 border-t-transparent rounded-full animate-spin ${
                        isTrainMode ? 'border-indigo-300' : 'border-emerald-300'
                      }`}
                    />
                    <p className={`text-sm font-bold ${isTrainMode ? 'text-indigo-100' : 'text-emerald-100'}`}>
                      {isTrainMode ? '最寄り駅と電車ルートを計算中...' : '最適ルートと所要時間を計算中...'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        routeRequestIdRef.current += 1;
                        setLoading(false);
                        setError('計算を一時停止しました。「再計算」ボタンで再試行できます。');
                      }}
                      className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-[11px] text-white/80 font-bold transition"
                    >
                      遅い場合はスキップ
                    </button>
                  </div>
                ) : activeDepartureInfo ? (
                  <div className="mt-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold tracking-wider ${
                          isTrainMode ? 'text-indigo-200' : 'text-emerald-200'
                        }`}
                      >
                        {isTrainMode
                          ? 'おすすめの自宅出発時刻'
                          : '遅くともこの時刻に出発（最大混雑想定）'}
                      </span>
                      <span className="text-[11px] font-bold text-amber-200/90 truncate ml-2">
                        {isTrainMode
                          ? hasManualTransitOverride
                            ? '乗換案内確認時間を反映中'
                            : transitResult?.summary || '電車・徒歩移動'
                          : hasManualOverride
                          ? 'Googleマップ確認時間を反映中'
                          : driveRange?.situation || autoTraffic.reason}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 my-1">
                      <span
                        id="departure-time-display"
                        data-testid="departure-time-display"
                        className="text-5xl font-black tracking-tight text-amber-300 drop-shadow-sm"
                      >
                        {activeDepartureInfo.formatted}
                      </span>
                      <span className="text-base sm:text-lg font-extrabold text-white">
                        に出発してください
                      </span>
                    </div>
                    {activeDepartureInfo.dayOffset < 0 && (
                      <p className="text-xs text-amber-200 font-bold">※前日の出発時刻です</p>
                    )}

                    {/* 🚗 Googleマップ風 所要時間レンジ ＆ 出発目安インフォバー */}
                    {!isTrainMode && driveRange && (
                      <div className="mt-2.5 bg-black/30 backdrop-blur-sm border border-white/20 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2.5 shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
                            <Car className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-amber-300 flex items-center gap-1.5 flex-wrap">
                              <span>{driveRange.formattedRange}</span>
                              {routeResult?.distanceKm && (
                                <span className="text-slate-300 text-[11px] font-normal">
                                  ({routeResult.distanceKm} km)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-200 truncate mt-0.5">
                              出発目安:{' '}
                              <strong className="text-white">
                                {earliestDepartureInfo && earliestDepartureInfo.formatted !== latestDepartureInfo.formatted
                                  ? `${latestDepartureInfo.formatted} 〜 ${earliestDepartureInfo.formatted} 頃`
                                  : `${activeDepartureInfo.formatted} 頃`}
                              </strong>
                              <span className="text-amber-200/90 ml-1">
                                （遅くとも {latestDepartureInfo.formatted} 発）
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-400 text-slate-950 shrink-0 whitespace-nowrap shadow-xs">
                          {driveRange.isGoogleRealtime ? 'Google公式・最大渋滞想定' : '最大時間想定'}
                        </span>
                      </div>
                    )}

                    {/* 電車モード時の最寄り駅クイックインフォ */}
                    {isTrainMode && nearbyStations.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-indigo-100 font-bold">
                        <span className="bg-indigo-500/30 px-2 py-0.5 rounded-md border border-indigo-400/30">
                          🚉 会場最寄り駅: <strong>{nearbyStations[0].name}</strong> (徒歩約{nearbyStations[0].walkMinutes}分)
                        </span>
                      </div>
                    )}

                    {/* 内訳バッジ */}
                    <div className="mt-3 pt-3 border-t border-white/15 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white/10 rounded-xl p-2">
                        <div className={`text-[10px] ${isTrainMode ? 'text-indigo-200' : 'text-emerald-200'}`}>
                          {isTrainMode
                            ? hasManualTransitOverride
                              ? '電車移動（指定）'
                              : '電車移動（目安）'
                            : hasManualOverride
                            ? '車移動（指定）'
                            : '車移動（通常〜最大）'}
                        </div>
                        <div
                          id="drive-duration-display"
                          data-testid="drive-duration-display"
                          className="text-xs sm:text-sm font-extrabold text-white truncate"
                        >
                          {isTrainMode
                            ? `約${activeEstimatedMinutes}分`
                            : driveRange
                            ? driveRange.formattedShort
                            : `約${activeEstimatedMinutes}分`}
                        </div>
                      </div>
                      <div className="bg-white/10 rounded-xl p-2">
                        <div className={`text-[10px] ${isTrainMode ? 'text-indigo-200' : 'text-emerald-200'}`}>
                          {isTrainMode ? '駅徒歩・余裕' : '事前バッファ'}
                        </div>
                        <div className="text-base font-extrabold text-white">
                          +{bufferMinutes}分
                        </div>
                      </div>
                      <div className="bg-white/10 rounded-xl p-2">
                        <div className={`text-[10px] ${isTrainMode ? 'text-indigo-200' : 'text-emerald-200'}`}>現地到着目安</div>
                        <div
                          className={`text-base font-extrabold ${
                            isTrainMode ? 'text-indigo-300' : 'text-emerald-300'
                          }`}
                        >
                          {targetArrivalMinusBuffer.formatted}
                        </div>
                      </div>
                    </div>

                    {/* 電車モード: Google Transit 詳細ステップアコーディオン */}
                    {isTrainMode && transitResult?.steps && transitResult.steps.length > 0 && (
                      <div className="mt-3 bg-white/10 rounded-2xl p-2.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setShowTransitDetails(!showTransitDetails)}
                          className="w-full flex items-center justify-between text-indigo-200 font-bold hover:text-white"
                        >
                          <span className="flex items-center gap-1.5">
                            <Train className="w-3.5 h-3.5" />
                            <span>乗換ルート詳細 ({transitResult.steps.length}区間)</span>
                            {transitResult.fare && <span className="text-amber-300 font-black">({transitResult.fare})</span>}
                          </span>
                          {showTransitDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showTransitDetails && (
                          <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2">
                            {transitResult.steps.map((st, idx) => (
                              <div key={st.id || idx} className="flex items-start gap-2 text-slate-100">
                                <div className="mt-0.5 shrink-0">
                                  {st.isTransit ? (
                                    <span className="w-5 h-5 rounded bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black">
                                      電
                                    </span>
                                  ) : (
                                    <span className="w-5 h-5 rounded bg-slate-500/80 text-white flex items-center justify-center text-[10px] font-black">
                                      歩
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1 leading-snug">
                                  {st.isTransit ? (
                                    <div>
                                      <div className="font-extrabold text-amber-200 text-xs">
                                        {st.lineName} {st.headsign ? `(${st.headsign}方面)` : ''}
                                      </div>
                                      <div className="text-[11px] text-indigo-100">
                                        {st.departureStop} 発 ➔ {st.arrivalStop} 着
                                        {st.numStops > 0 && ` (${st.numStops}駅)`} • 約{st.durationMinutes}分
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-slate-200">
                                      <span>{st.instructions || '徒歩移動'}</span>
                                      <span className="ml-1 text-slate-300">({st.durationText})</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-5 text-center text-white/80 text-sm">
                    目的地を入力して「ルート・出発時間を計算」を押してください
                  </div>
                )}

                {/* エラー表示 */}
                {error && (
                  <div className="mt-3 bg-rose-500/95 text-white text-xs font-bold p-3 rounded-xl flex items-start gap-2 shadow">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 連携ボタン群 (車 vs 電車) */}
                <div className="mt-4 space-y-2.5">
                  {isTrainMode ? (
                    <>
                      {/* 🟣 Yahoo!乗換案内 到着指定連携ボタン */}
                      <a
                        id="yahoo-transit-btn"
                        data-testid="yahoo-transit-btn"
                        href={yahooTransitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-white hover:bg-indigo-50 active:scale-[0.99] text-indigo-950 font-black py-3 px-4 rounded-2xl shadow-md flex items-center justify-between transition text-xs border border-indigo-200"
                      >
                        <div className="flex items-center gap-2 text-left">
                          <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-black text-sm shrink-0">
                            Y!
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-900">
                              Yahoo!乗換案内で「{formattedDateLabel} {targetArrivalMinusBuffer.formatted}着」を調べる
                            </div>
                            <div className="text-[10px] font-bold text-slate-500">
                              ダイヤ・乗り換え番線・定期代対応の直通便
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-indigo-700 shrink-0 ml-1" />
                      </a>

                      {/* 🔵 Googleマップ 電車ルート連携ボタン */}
                      <a
                        id="google-maps-transit-btn"
                        data-testid="google-maps-transit-btn"
                        href={googleMapsTransitCheckUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 text-white font-black py-3 px-4 rounded-2xl border border-indigo-300/40 flex items-center justify-between transition text-xs"
                      >
                        <div className="flex items-center gap-2 text-left">
                          <div className="w-7 h-7 rounded-lg bg-white/20 text-indigo-200 flex items-center justify-center shrink-0">
                            <Train className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-black text-white">
                              Googleマップで電車ルート・地図を確認
                            </div>
                            <div className="text-[10px] font-medium text-indigo-200">
                              徒歩ルート・駅構内図を含めて表示
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-indigo-200 shrink-0 ml-1" />
                      </a>

                      {/* 🟡 Googleマップ 今すぐ電車ナビ開始 */}
                      <a
                        id="google-maps-nav-btn"
                        data-testid="google-maps-nav-btn"
                        href={googleMapsTransitNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-black py-3.5 px-4 rounded-2xl shadow-md flex items-center justify-center gap-2 transition text-base"
                      >
                        <Navigation className="w-5 h-5 fill-slate-950" />
                        <span>Googleマップで今すぐ乗換案内を開始</span>
                        <ChevronRight className="w-5 h-5" />
                      </a>
                    </>
                  ) : (
                    <>
                      {/* 車モード: 渋滞予測 & ナビ */}
                      <a
                        id="google-maps-traffic-btn"
                        data-testid="google-maps-traffic-btn"
                        href={googleMapsTrafficCheckUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-white hover:bg-emerald-50 active:scale-[0.99] text-emerald-950 font-black py-3 px-4 rounded-2xl shadow-md flex items-center justify-between transition text-xs border border-emerald-200"
                      >
                        <div className="flex items-center gap-2 text-left">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-900">
                              Googleマップで「{formattedDateLabel} {targetArrivalMinusBuffer.formatted}着」の渋滞予測を見る
                            </div>
                            <div className="text-[10px] font-bold text-slate-500">
                              指定日時のGoogle統計渋滞・所要時間レンジを直接確認
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-emerald-700 shrink-0 ml-1" />
                      </a>

                      <a
                        id="google-maps-nav-btn"
                        data-testid="google-maps-nav-btn"
                        href={googleMapsNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-black py-3.5 px-4 rounded-2xl shadow-md flex items-center justify-center gap-2 transition text-base"
                      >
                        <Navigation className="w-5 h-5 fill-slate-950" />
                        <span>Googleマップで今すぐナビ開始</span>
                        <ChevronRight className="w-5 h-5" />
                      </a>
                    </>
                  )}
                </div>
              </section>

              {/* 📸 日程表画像から一発逆算（AI解析） */}
              <ScheduleImageImporter onApplySchedule={handleApplySchedule} />

              {/* 2. 目的地 ＆ 集合日時 入力フォーム */}
              <section className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-4 overflow-hidden">
                {/* 目的地入力 */}
                <div>
                  <label htmlFor="destination-input" className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>目的地・会場（キーワード検索・候補選択）</span>
                  </label>
                  <PlaceAutocompleteInput
                    id="destination-input"
                    testId="destination-input"
                    value={destination}
                    onChange={(val) => {
                      setDestination(val);
                      setSelectedPresetId(null);
                    }}
                    onSelectSuggestion={(item) => {
                      setDestination(item.fullQuery);
                      setSelectedPresetId(null);
                      setManualDriveMinutes('');
                      setManualTransitMinutes('');
                      calculateRoute(origin, item.fullQuery);
                    }}
                    placeholder="会場名・公園名・学校名を入力（例: 西武台第2グラウンド、埼スタ）"
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900"
                    ringColorClass="focus:ring-emerald-500"
                  />

                  {destinationCandidates && destinationCandidates.length > 0 && (
                    <div className="mt-2 p-2.5 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl space-y-1.5">
                      <div className="text-[11px] font-extrabold text-emerald-900 flex items-center gap-1">
                        <span>🏟️ 会場候補（もしかして？タップで切替）:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {destinationCandidates.map((c, idx) => (
                          <button
                            key={`${c.name}-${idx}`}
                            type="button"
                            onClick={() => {
                              setDestination(c.name);
                              setSelectedPresetId(null);
                              setManualDriveMinutes('');
                              setManualTransitMinutes('');
                              calculateRoute(origin, c.name);
                            }}
                            className="text-xs bg-white hover:bg-emerald-100 text-slate-800 font-bold px-2.5 py-1.5 rounded-xl border border-emerald-300 shadow-sm transition active:scale-95 text-left"
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 会場クイック選択チップ（横スクロール） */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      よく行く会場（タップで即選択）
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddPreset(!showAddPreset)}
                      className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> 会場を追加
                    </button>
                  </div>

                  {/* プリセット登録フォーム展開 */}
                  {showAddPreset && (
                    <form
                      onSubmit={handleAddPreset}
                      className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2.5 mb-2.5"
                    >
                      <div className="text-xs font-extrabold text-emerald-900">
                        新しいグラウンド・会場をプリセット登録
                      </div>
                      <input
                        id="new-preset-name"
                        type="text"
                        placeholder="表示名（例：〇〇第2グラウンド）"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                        required
                      />
                      <PlaceAutocompleteInput
                        id="new-preset-query"
                        placeholder="住所や施設名で検索"
                        value={newPresetQuery}
                        onChange={(val) => setNewPresetQuery(val)}
                        onSelectSuggestion={(item) => {
                          setNewPresetQuery(item.fullQuery);
                          if (!newPresetName.trim()) setNewPresetName(item.title);
                        }}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                        ringColorClass="focus:ring-emerald-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 bg-emerald-600 text-white text-xs font-extrabold py-2 rounded-xl"
                        >
                          登録して選択
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddPreset(false)}
                          className="px-3 bg-white border border-slate-300 text-slate-600 text-xs font-bold py-2 rounded-xl"
                        >
                          キャンセル
                        </button>
                      </div>
                    </form>
                  )}

                  <div
                    className="flex items-center gap-1.5 overflow-x-auto pb-1"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {presets.map((p) => {
                      const isSelected = selectedPresetId === p.id || destination === p.query;
                      return (
                        <div key={p.id} className="relative group shrink-0 flex items-center">
                          <button
                            type="button"
                            onClick={() => handleSelectPreset(p)}
                            className={`pl-3 pr-2 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition border active:scale-95 flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                            }`}
                          >
                            <span>{p.name}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`${p.name}を削除`}
                              onClick={(e) => handleDeletePreset(p.id, e)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleDeletePreset(p.id, e);
                                }
                              }}
                              className={`p-0.5 rounded-full transition ${
                                isSelected
                                  ? 'text-emerald-200 hover:text-white hover:bg-emerald-700/60'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title="この会場を削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* 移動日 & 集合時刻（スマホ完全対応: 2カラム均等・重なり＆はみ出し完全防止） */}
                <div className="w-full min-w-0">
                  <div className="grid grid-cols-2 gap-2.5 w-full min-w-0">
                    {/* 移動日入力 */}
                    <div className="min-w-0 overflow-hidden">
                      <label
                        htmlFor="travel-date-input"
                        className="text-xs font-extrabold text-slate-700 mb-1.5 flex items-center gap-1 truncate"
                      >
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">移動日（試合日）</span>
                      </label>
                      <input
                        id="travel-date-input"
                        type="date"
                        value={travelDate}
                        onChange={(e) => setTravelDate(e.target.value)}
                        className="w-full min-w-0 max-w-full h-11 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-900 text-sm font-bold rounded-xl px-2 py-0 text-center flex items-center justify-center leading-none focus:ring-2 focus:ring-emerald-500 focus:outline-none transition box-border"
                      />
                    </div>

                    {/* 集合・到着時刻入力 */}
                    <div className="min-w-0 overflow-hidden">
                      <label
                        htmlFor="arrival-time-input"
                        className="text-xs font-extrabold text-slate-700 mb-1.5 flex items-center gap-1 truncate"
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">集合・到着時刻</span>
                      </label>
                      <input
                        id="arrival-time-input"
                        type="time"
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                        className="w-full min-w-0 max-w-full h-11 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-900 text-sm font-bold rounded-xl px-2 py-0 text-center flex items-center justify-center leading-none focus:ring-2 focus:ring-emerald-500 focus:outline-none transition box-border"
                      />
                    </div>
                  </div>

                  {/* クイック日付ボタン（横スクロールで親枠のはみ出しを確実に防止） */}
                  <div
                    className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-2.5 mt-0.5"
                    style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                  >
                    {quickDates.map((qd) => {
                      const active = travelDate === qd.dateStr;
                      return (
                        <button
                          key={qd.id}
                          type="button"
                          onClick={() => setTravelDate(qd.dateStr)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 transition active:scale-95 ${
                            active
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          {qd.label} ({qd.dayName})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 到着バッファ選択 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold text-slate-700">
                      {isTrainMode
                        ? '現地到着バッファ（改札・駅徒歩・集合余裕）'
                        : '現地到着バッファ（準備・駐車時間）'}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        isTrainMode ? 'text-indigo-700' : 'text-emerald-700'
                      }`}
                    >
                      {bufferMinutes}分前着
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {BUFFER_OPTIONS.map((opt) => {
                      const active = bufferMinutes === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setBufferMinutes(opt.value)}
                          className={`py-1.5 rounded-lg text-[11px] font-bold border transition ${
                            active
                              ? isTrainMode
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {opt.value}分
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 所要時間の手動上書き入力 (車 / 電車) */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {isTrainMode
                          ? '乗換案内の所要時間で上書き (任意)'
                          : 'Googleマップ実測所要時間で上書き (任意)'}
                      </span>
                    </span>
                    {(isTrainMode ? manualTransitMinutes : manualDriveMinutes) && (
                      <button
                        type="button"
                        onClick={() =>
                          isTrainMode ? setManualTransitMinutes('') : setManualDriveMinutes('')
                        }
                        className="text-[10px] text-rose-600 font-bold hover:underline"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="360"
                      placeholder={
                        isTrainMode
                          ? '例: 45 (YahooやGoogleで調べた所要時間)'
                          : '例: 130 (Googleマップの最大時間などを手動反映)'
                      }
                      value={isTrainMode ? manualTransitMinutes : manualDriveMinutes}
                      onChange={(e) =>
                        isTrainMode
                          ? setManualTransitMinutes(e.target.value)
                          : setManualDriveMinutes(e.target.value)
                      }
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-600 shrink-0">分</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {isTrainMode
                      ? '※YahooやGoogleで確認した正確な電車移動分数を入力すると、即座に出発時刻が再計算されます'
                      : '※Googleマップで調べた最大所要時間（例: 2時間10分なら130分）を入力すれば、その最大時間に合わせて出発時刻を再計算できます'}
                  </p>
                </div>

                <hr className="border-slate-100" />

                {/* 出発地（自宅）スマート折りたたみ */}
                <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                        <Home className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-sky-700">出発地（自宅）</div>
                        <div className="text-xs font-bold text-slate-800 truncate">{origin}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOriginEditing(!isOriginEditing)}
                      className="ml-2 text-xs font-bold text-sky-700 hover:text-sky-900 bg-white px-2.5 py-1 rounded-xl border border-sky-200 shrink-0 flex items-center gap-1 shadow-sm"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>{isOriginEditing ? '閉じる' : '変更'}</span>
                    </button>
                  </div>

                  {isOriginEditing && (
                    <div className="mt-3 pt-3 border-t border-sky-200/60 space-y-2 animate-in fade-in duration-150">
                      <PlaceAutocompleteInput
                        id="origin-input"
                        testId="origin-input"
                        value={origin}
                        onChange={(val) => setOrigin(val)}
                        onSelectSuggestion={(item) => {
                          setOrigin(item.fullQuery);
                          calculateRoute(item.fullQuery, destination);
                        }}
                        placeholder="自宅の住所・駅名・目印を入力"
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                        ringColorClass="focus:ring-sky-500"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">※次回以降も自動で記憶されます</span>
                        <button
                          type="button"
                          onClick={() => {
                            handleSaveOriginFeedback();
                            setIsOriginEditing(false);
                          }}
                          className="text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 px-3 py-1 rounded-lg"
                        >
                          決定
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 計算実行ボタン */}
                <button
                  type="button"
                  id="calculate-route-btn"
                  data-testid="calculate-route-btn"
                  onClick={() => calculateRoute(origin, destination)}
                  disabled={loading}
                  className={`w-full active:scale-[0.99] disabled:opacity-50 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-sm flex items-center justify-center gap-2 transition text-sm ${
                    isTrainMode
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {isTrainMode ? <Train className="w-4 h-4" /> : <Car className="w-4 h-4" />}
                  <span>
                    {loading
                      ? 'ルート計算中...'
                      : isTrainMode
                      ? '電車ルート・出発時間を計算する'
                      : '車ルート・出発時間を計算する'}
                  </span>
                </button>
              </section>

              {/* 3. 会場の最寄り駅案内 (電車モード時または駅がある場合に大きく表示) */}
              {nearbyStations && nearbyStations.length > 0 && (
                <section className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-extrabold text-indigo-900 flex items-center gap-1.5">
                      <Train className="w-4 h-4 text-indigo-600" />
                      <span>{destination} の最寄り駅・徒歩ルート</span>
                    </h2>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {nearbyStations.length}駅ヒット
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {nearbyStations.map((station, sIdx) => (
                      <div
                        key={station.id || sIdx}
                        className="bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-200/80 rounded-2xl p-3 flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                            🚉
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-slate-900 truncate">
                              {station.name}
                            </div>
                            <div className="text-[11px] font-bold text-indigo-800">
                              会場まで 徒歩約 <strong>{station.walkMinutes}分</strong> (約{station.distanceMeters}m)
                            </div>
                          </div>
                        </div>

                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                            origin
                          )}&destination=${encodeURIComponent(station.name)}&travelmode=transit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 bg-white text-indigo-700 hover:bg-indigo-100 rounded-xl text-[11px] font-extrabold border border-indigo-200 shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <span>乗換案内</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 4. ルートマップ (Googleマップ 渋滞レイヤー / 路線図対応) */}
              <section className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                    <MapPin className={`w-4 h-4 ${isTrainMode ? 'text-indigo-600' : 'text-emerald-600'}`} />
                    <span>
                      {isTrainMode ? '電車・路線ルートマップ' : '車ルートマップ (Google渋滞レイヤー対応)'}
                    </span>
                  </h2>
                  {(isTrainMode ? transitResult?.calculatedAt : routeResult?.calculatedAt) && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      {(isTrainMode ? transitResult?.calculatedAt : routeResult?.calculatedAt)} 時点
                    </span>
                  )}
                </div>

                <RouteMap
                  originCoords={routeResult?.originGeo}
                  destCoords={routeResult?.destGeo}
                  routeGeometry={
                    isTrainMode && transitResult?.coordinates && transitResult.coordinates.length > 0
                      ? { coordinates: transitResult.coordinates, isLatLng: true }
                      : routeResult?.geometry
                  }
                  nearbyParkings={nearbyParkings}
                  nearbyConveniences={nearbyConveniences}
                  nearbyStations={nearbyStations}
                  spotFilter={spotFilter}
                  selectedSpotId={selectedSpotId}
                  onSelectSpot={handleSelectSpot}
                  transportMode={transportMode}
                />
              </section>
            </>
          )}

          {/* ==================== タブ 2: 🅿️ 駐車場・周辺スポット / 🚉 駅・周辺施設 ==================== */}
          {activeTab === 'spots' && (
            <div className="space-y-4">
              {/* ルートマップ（スポット連動表示） */}
              <section className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                    <MapPin className={`w-4 h-4 ${isTrainMode ? 'text-indigo-600' : 'text-emerald-600'}`} />
                    <span>
                      {destination} 周辺の{isTrainMode ? '最寄り駅＆コンビニ' : '駐車場＆コンビニ'}
                    </span>
                  </h2>
                </div>
                <RouteMap
                  originCoords={routeResult?.originGeo}
                  destCoords={routeResult?.destGeo}
                  routeGeometry={
                    isTrainMode && transitResult?.coordinates && transitResult.coordinates.length > 0
                      ? { coordinates: transitResult.coordinates, isLatLng: true }
                      : routeResult?.geometry
                  }
                  nearbyParkings={nearbyParkings}
                  nearbyConveniences={nearbyConveniences}
                  nearbyStations={nearbyStations}
                  spotFilter={spotFilter}
                  selectedSpotId={selectedSpotId}
                  onSelectSpot={handleSelectSpot}
                  transportMode={transportMode}
                />
              </section>

              {/* 最寄り駅リストカード (タブ2でも常時確認可能) */}
              {nearbyStations && nearbyStations.length > 0 && (
                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-3xl p-4 space-y-2">
                  <div className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                    <Train className="w-4 h-4 text-indigo-600" />
                    <span>会場の最寄り駅一覧（徒歩連絡）</span>
                  </div>
                  <div className="space-y-1.5">
                    {nearbyStations.map((st, i) => (
                      <div key={st.id || i} className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-indigo-100">
                        <div>
                          <div className="text-xs font-black text-slate-900">{st.name}</div>
                          <div className="text-[11px] font-bold text-slate-500">
                            会場まで約{st.distanceMeters}m (徒歩約{st.walkMinutes}分)
                          </div>
                        </div>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                            origin
                          )}&destination=${encodeURIComponent(st.name)}&travelmode=transit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border border-indigo-200 flex items-center gap-1"
                        >
                          <span>乗換</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 駐車場・コンビニ詳細リスト */}
              {routeResult?.destGeo ? (
                <NearbySpotsSection
                  destGeo={routeResult.destGeo}
                  destName={destination}
                  parkings={nearbyParkings}
                  conveniences={nearbyConveniences}
                  loading={spotsLoading}
                  error={spotsError}
                  onRefresh={() => loadNearbySpots(routeResult.destGeo, destination)}
                  activeFilter={spotFilter}
                  setActiveFilter={setSpotFilter}
                  selectedSpotId={selectedSpotId}
                  onSelectSpot={handleSelectSpot}
                />
              ) : (
                <div className="bg-white rounded-3xl p-8 text-center text-slate-400 text-xs">
                  「逆算ナビ」タブで目的地を決定すると、周辺駐車場・コンビニが自動検索されます。
                </div>
              )}
            </div>
          )}

          {/* ==================== タブ 3: 🎒 持ち物・天気 ==================== */}
          {activeTab === 'checklist' && (
            <div className="space-y-4">
              <MatchWeatherChecklist
                destGeo={routeResult?.destGeo}
                destName={destination}
                travelDate={travelDate}
                transportMode={transportMode}
              />
            </div>
          )}

          {/* スマホホーム画面追加のミニヒント */}
          <footer className="text-center text-xs text-slate-400 pt-2 pb-6 space-y-1">
            <p className="font-bold text-slate-500">
              📱 スマホの「ホーム画面に追加」でアプリとして使えます
            </p>
            <p className="text-[11px]">
              iPhone (Safari): 共有ボタン →「ホーム画面に追加」
            </p>
          </footer>
        </main>

        {/* 📱 スマホ用 固定ボトムナビゲーションバー（親指片手操作対応） */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 py-1.5 px-3 flex items-center justify-around max-w-md mx-auto shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('calc');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition ${
              activeTab === 'calc'
                ? isTrainMode
                  ? 'text-indigo-700 font-extrabold'
                  : 'text-emerald-700 font-extrabold'
                : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            {isTrainMode ? (
              <Train className={`w-5 h-5 ${activeTab === 'calc' ? 'stroke-[2.5]' : ''}`} />
            ) : (
              <Car className={`w-5 h-5 ${activeTab === 'calc' ? 'stroke-[2.5]' : ''}`} />
            )}
            <span className="text-[10px]">逆算ナビ</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('spots');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition relative ${
              activeTab === 'spots'
                ? isTrainMode
                  ? 'text-indigo-700 font-extrabold'
                  : 'text-emerald-700 font-extrabold'
                : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <MapPin className={`w-5 h-5 ${activeTab === 'spots' ? 'stroke-[2.5]' : ''}`} />
            <span className="text-[10px]">{isTrainMode ? '駅・周辺' : '駐車場・周辺'}</span>
            {(nearbyParkings.length > 0 || nearbyStations.length > 0) && (
              <span
                className={`absolute top-1 right-[25%] w-2 h-2 rounded-full ${
                  isTrainMode ? 'bg-indigo-500' : 'bg-emerald-500'
                }`}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('checklist');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition ${
              activeTab === 'checklist'
                ? isTrainMode
                  ? 'text-indigo-700 font-extrabold'
                  : 'text-emerald-700 font-extrabold'
                : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <CheckSquare className={`w-5 h-5 ${activeTab === 'checklist' ? 'stroke-[2.5]' : ''}`} />
            <span className="text-[10px]">持ち物・天気</span>
          </button>
        </div>

        {/* Google Maps APIキー設定モーダル */}
        <GoogleMapsKeyModal
          isOpen={isGmapsModalOpen}
          onClose={() => setIsGmapsModalOpen(false)}
          onKeySaved={(k) => {
            setGmapsApiKey(k);
            if (k) {
              calculateRoute(origin, destination);
            }
          }}
        />
      </div>
    </div>
  );
}

