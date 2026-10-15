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
import { getCachedCoords, geocodeAddress } from './geoUtils';

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

// メモリキャッシュと進行中Promiseキャッシュ（重複リクエストの防止）
const weatherMemoryCache = new Map();
const inFlightRequests = new Map();

/**
 * 指定会場と日付の天気を取得（キャッシュ & 範囲外安全制御）
 * @param {string} venue 会場名
 * @param {string} dateIso 'YYYY-MM-DD'
 * @returns {Promise<object|null>} 天気情報またはnull
 */
export async function fetchEventWeather(venue, dateIso) {
  if (!venue || typeof venue !== 'string' || !dateIso) return null;
  const trimmedVenue = venue.trim();
  if (!trimmedVenue || trimmedVenue === '未定' || trimmedVenue === '-' || trimmedVenue === 'なし') {
    return null;
  }

  // 日付の有効性チェック（今日〜14日先までがOpen-Meteoの予報対応範囲）
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateIso + 'T00:00:00');
    if (isNaN(target.getTime())) return null;

    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 14) {
      // 過去の試合や15日以上先の予定は予報対象外
      return null;
    }
  } catch (_) {
    return null;
  }

  const cacheKey = `${trimmedVenue.toLowerCase()}_${dateIso}`;

  // 1. メモリキャッシュ確認
  if (weatherMemoryCache.has(cacheKey)) {
    return weatherMemoryCache.get(cacheKey);
  }

  // 2. 進行中の同一リクエストがある場合は合流
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const task = (async () => {
    try {
      // 座標の取得（キャッシュ優先、無ければジオコーディング）
      let coords = getCachedCoords(trimmedVenue);
      if (!coords || !coords.lat || !coords.lon) {
        coords = await geocodeAddress(trimmedVenue).catch(() => null);
      }

      if (!coords || !coords.lat || !coords.lon) {
        return null;
      }

      const lat = Number(coords.lat).toFixed(4);
      const lon = Number(coords.lon).toFixed(4);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();

      if (!data?.daily?.time || !Array.isArray(data.daily.time)) return null;

      const targetIdx = data.daily.time.indexOf(dateIso);
      if (targetIdx === -1) {
        // 日付が予報配列に含まれていない場合
        return null;
      }

      const code = data.daily.weathercode[targetIdx];
      const tempMax = Math.round(data.daily.temperature_2m_max[targetIdx]);
      const tempMin = Math.round(data.daily.temperature_2m_min[targetIdx]);
      const precipProb = data.daily.precipitation_probability_max
        ? data.daily.precipitation_probability_max[targetIdx] ?? 0
        : 0;

      const result = {
        date: dateIso,
        code,
        ...parseWeatherCode(code),
        tempMax,
        tempMin,
        precipProb,
        venue: trimmedVenue,
      };

      weatherMemoryCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('Event weather fetch warning:', err);
      return null;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, task);
  return task;
}

/**
 * 試合カード用 天気取得カスタムフック
 */
export function useEventWeather(venue, dateIso) {
  const cacheKey = venue && dateIso ? `${venue.trim().toLowerCase()}_${dateIso}` : null;
  const initialData = cacheKey ? weatherMemoryCache.get(cacheKey) || null : null;

  const [weather, setWeather] = useState(initialData);
  const [loading, setLoading] = useState(!initialData && Boolean(cacheKey));

  useEffect(() => {
    if (!venue || !dateIso) {
      setWeather(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = weatherMemoryCache.get(`${venue.trim().toLowerCase()}_${dateIso}`);
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
