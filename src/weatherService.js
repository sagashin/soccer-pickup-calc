import { useState, useEffect } from 'react';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
} from 'lucide-react';
import { findKnownVenue, getCachedCoords, geocodeAddress } from './geoUtils.js';

/**
 * Open-Meteo 天気コードの日本語・アイコン・スタイル変換
 */
export function parseWeatherCode(code) {
  if (code === 0) return { label: '快晴', Icon: Sun, colorClass: 'text-amber-500' };
  if (code === 1 || code === 2) return { label: '晴れ / 一部曇り', Icon: CloudSun, colorClass: 'text-amber-500' };
  if (code === 3) return { label: '曇り', Icon: Cloud, colorClass: 'text-slate-400' };
  if (code === 45 || code === 48) return { label: '霧', Icon: CloudFog, colorClass: 'text-slate-400' };
  if (code === 51 || code === 53 || code === 55) return { label: '小雨・霧雨', Icon: CloudDrizzle, colorClass: 'text-sky-500' };
  if (code >= 61 && code <= 65) return { label: '雨', Icon: CloudRain, colorClass: 'text-blue-600' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: '雪', Icon: CloudSnow, colorClass: 'text-sky-300' };
  if (code >= 80 && code <= 82) return { label: 'にわか雨', Icon: CloudRain, colorClass: 'text-blue-600' };
  if (code >= 95) return { label: '雷雨', Icon: CloudLightning, colorClass: 'text-amber-600' };
  return { label: '晴れ / 曇り', Icon: CloudSun, colorClass: 'text-amber-500' };
}

// 座標 (${lat}_${lon}) 単位の16日分日次キャッシュ（N+1 APIコール完全防止）＆進行中リクエスト合流マップ
const coordForecastCache = new Map();
const inFlightCoordRequests = new Map();
const eventWeatherMemoryCache = new Map();
const FORECAST_TTL_MS = 60 * 60 * 1000; // 1時間

function isValidNumber(n) {
  return typeof n === 'number' && !Number.isNaN(n) && Number.isFinite(n);
}

function extractDayWeather(daily, dateIso, venueLabel = '') {
  if (!daily?.time || !Array.isArray(daily.time)) return null;
  const targetIdx = daily.time.indexOf(dateIso);
  if (targetIdx === -1) {
    return { unavailable: true, date: dateIso, venue: venueLabel };
  }

  const code = daily.weathercode[targetIdx];
  const tempMax = Math.round(daily.temperature_2m_max[targetIdx]);
  const tempMin = Math.round(daily.temperature_2m_min[targetIdx]);
  const precipProb = daily.precipitation_probability_max
    ? daily.precipitation_probability_max[targetIdx] ?? 0
    : 0;

  return {
    unavailable: false,
    date: dateIso,
    code,
    ...parseWeatherCode(code),
    tempMax,
    tempMin,
    precipProb,
    venue: venueLabel,
  };
}

/**
 * 座標と日付から16日予報を取得（同一座標は16日分一括キャッシュしてN+1をゼロに）
 */
export async function fetchWeatherByCoords(latNum, lonNum, dateIso, venueLabel = '') {
  if (!isValidNumber(latNum) || !isValidNumber(lonNum) || !dateIso) return null;

  const lat = Number(latNum).toFixed(4);
  const lon = Number(lonNum).toFixed(4);
  const coordKey = `${lat}_${lon}`;

  const cached = coordForecastCache.get(coordKey);
  if (cached && Date.now() - cached.fetchedAt < FORECAST_TTL_MS) {
    return extractDayWeather(cached.daily, dateIso, venueLabel);
  }

  let promise = inFlightCoordRequests.get(coordKey);
  if (!promise) {
    promise = (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=16`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.daily?.time || !Array.isArray(data.daily.time)) return null;
        coordForecastCache.set(coordKey, { daily: data.daily, fetchedAt: Date.now() });
        return data.daily;
      } catch (err) {
        console.warn('Weather forecast fetch warning:', err);
        return null;
      } finally {
        inFlightCoordRequests.delete(coordKey);
      }
    })();
    inFlightCoordRequests.set(coordKey, promise);
  }

  const daily = await promise;
  if (!daily) return null;
  return extractDayWeather(daily, dateIso, venueLabel);
}

function getTodayJstIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getCachedEventWeather(cacheKey) {
  const entry = eventWeatherMemoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt >= FORECAST_TTL_MS) {
    eventWeatherMemoryCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

/**
 * 指定会場と日付の天気を取得（キャッシュ & 範囲外安全制御）
 * @param {string} venue 会場名
 * @param {string} dateIso 'YYYY-MM-DD'
 * @returns {Promise<object|null>} 天気情報（範囲外時はnull）
 */
export async function fetchEventWeather(venue, dateIso) {
  if (!venue || typeof venue !== 'string' || !dateIso) return null;
  const trimmedVenue = venue.trim();
  if (!trimmedVenue || trimmedVenue === '未定' || trimmedVenue === '-' || trimmedVenue === 'なし') {
    return null;
  }

  // 日付の有効性チェック（Asia/Tokyo基準のYYYY-MM-DD比較: 今日〜15日先までがforecast_days=16の対応範囲）
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
    const todayJst = getTodayJstIso();
    const [ty, tm, td] = todayJst.split('-').map(Number);
    const [y, m, d] = dateIso.split('-').map(Number);
    const todayUtcMs = Date.UTC(ty, tm - 1, td);
    const targetUtcMs = Date.UTC(y, m - 1, d);
    if (Number.isNaN(targetUtcMs)) return null;

    const diffDays = Math.round((targetUtcMs - todayUtcMs) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 15) {
      return null;
    }
  } catch {
    return null;
  }

  const cacheKey = `${trimmedVenue.toLowerCase()}_${dateIso}`;
  const cachedWeather = getCachedEventWeather(cacheKey);
  if (cachedWeather) {
    return cachedWeather;
  }

  // 座標の取得（ビルトイン辞書 → キャッシュ → ジオコーディング）
  let coords = findKnownVenue(trimmedVenue) || getCachedCoords(trimmedVenue);
  if (!coords || !isValidNumber(coords.lat) || !isValidNumber(coords.lon)) {
    coords = await geocodeAddress(trimmedVenue, { silent: true }).catch(() => null);
  }
  if (!coords || !isValidNumber(coords.lat) || !isValidNumber(coords.lon)) {
    return null;
  }

  const weather = await fetchWeatherByCoords(coords.lat, coords.lon, dateIso, trimmedVenue);
  if (!weather || weather.unavailable) return null;

  eventWeatherMemoryCache.set(cacheKey, { data: weather, fetchedAt: Date.now() });
  return weather;
}

/**
 * 試合カード用 天気取得カスタムフック
 */
export function useEventWeather(venue, dateIso) {
  const cacheKey = venue && dateIso ? `${venue.trim().toLowerCase()}_${dateIso}` : null;
  const initialData = cacheKey ? getCachedEventWeather(cacheKey) : null;

  const [weather, setWeather] = useState(initialData);
  const [loading, setLoading] = useState(!initialData && Boolean(cacheKey));

  useEffect(() => {
    if (!venue || !dateIso) {
      setWeather(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = getCachedEventWeather(`${venue.trim().toLowerCase()}_${dateIso}`);
    if (currentCached) {
      setWeather(currentCached);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchEventWeather(venue, dateIso).then((data) => {
      if (isMounted) {
        setWeather(data);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [venue, dateIso]);

  return { weather, loading };
}
