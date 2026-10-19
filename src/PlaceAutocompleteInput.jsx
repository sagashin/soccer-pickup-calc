import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, X, Sparkles } from 'lucide-react';
import {
  getSavedGoogleMapsApiKey,
  getGooglePlacePredictions,
  getCoordsByPlaceId,
} from './googleMapsClient';
import {
  getSoccerRelevanceScore,
  findKnownVenues,
  isGsiMatchValid,
} from './geoUtils';

async function fetchPlaceSuggestions(query, signal) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // 0. ビルトイン主要サッカー会場・強豪校グラウンドのマッチング（0ms・最優先表示）
  const knownMatches = findKnownVenues(trimmed, 3);
  const results = [];
  const seenKeys = new Set();

  const addCandidate = (title, subtitle, fullQuery, lat, lon, source, score = 0) => {
    const key = `${title}|${Math.round(lat * 1000)},${Math.round(lon * 1000)}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    results.push({
      id: `${source}-${results.length}-${lat}-${lon}`,
      title,
      subtitle,
      fullQuery,
      lat,
      lon,
      source,
      score,
    });
  };

  for (const kv of knownMatches) {
    addCandidate(
      kv.displayName,
      '公式グラウンド登録・高精度',
      kv.displayName,
      kv.lat,
      kv.lon,
      'builtin',
      999
    );
  }

  const gmapsKey = getSavedGoogleMapsApiKey();

  // 1. Google Maps APIキーが設定されている場合は Google Places を最優先
  if (gmapsKey) {
    try {
      const gResults = await getGooglePlacePredictions(trimmed, gmapsKey);
      if (Array.isArray(gResults) && gResults.length > 0) {
        // ビルトイン結果とマージして返却
        const googleSlice = gResults.slice(0, 6 - results.length);
        return [...results, ...googleSlice];
      }
    } catch (e) {
      console.warn('Google Places predictions fallback to OSM:', e);
    }
  }

  // 2. キーがない場合、または失敗時はフリー地図（OSM + GSI）
  // 高校名揺らぎ（「高校」->「高等学校」）も考慮
  const schoolVariant = trimmed.includes('高校') ? trimmed.replace(/高校/g, '高等学校') : null;
  const nomQueries = [trimmed, schoolVariant].filter(Boolean);

  const [nomResList, gsiRes] = await Promise.allSettled([
    Promise.all(
      nomQueries.map((q) =>
        fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            q
          )}&countrycodes=jp&limit=8&addressdetails=1&accept-language=ja`,
          { signal, headers: { Accept: 'application/json' } }
        ).then((r) => (r.ok ? r.json() : [])).catch(() => [])
      )
    ),
    fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(trimmed)}`,
      { signal }
    ).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);

  // OpenStreetMap Nominatim
  if (nomResList.status === 'fulfilled' && Array.isArray(nomResList.value)) {
    const rawNomItems = nomResList.value.flat();
    const coreKeyword = trimmed
      .replace(/(高等学校|高校|中学校|学校|グラウンド|グランド|サッカー場|公園|スタジアム|第\d+)/g, '')
      .trim();

    const scoredItems = rawNomItems
      .map((item) => {
        const title = item.name || (item.display_name || '').split(',')[0] || '';
        let score = getSoccerRelevanceScore(title, item.class, item.type);
        if (coreKeyword.length >= 2) {
          const fullText = (item.display_name || '').toLowerCase();
          if (fullText.includes(coreKeyword.toLowerCase())) {
            score += 150;
          } else {
            score -= 300;
          }
        }
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    for (const item of scoredItems) {
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      const parts = (item.display_name || '').split(',').map((s) => s.trim());
      const title = item.name || parts[0] || trimmed;
      const addr = item.address || {};
      const prefCity = [
        addr.province || addr.state || '',
        addr.city || addr.ward || addr.town || addr.village || addr.county || '',
        addr.suburb || addr.quarter || addr.neighbourhood || '',
      ]
        .filter(Boolean)
        .join('');
      const subtitle = prefCity || parts.slice(1, 4).reverse().join(' ');
      const fullQuery = prefCity && !title.includes(prefCity) ? `${prefCity} ${title}` : title;
      const score = getSoccerRelevanceScore(title, item.class, item.type);
      addCandidate(title, subtitle || '施設・スポット', fullQuery, lat, lon, 'osm', score);
    }
  }

  // 国土地理院 AddressSearch (※北海道などの無関係な住所誤爆を厳格にフィルタリング)
  if (gsiRes.status === 'fulfilled' && Array.isArray(gsiRes.value)) {
    for (const item of gsiRes.value.slice(0, 8)) {
      const coords = item?.geometry?.coordinates;
      const title = item?.properties?.title;

      if (Array.isArray(coords) && coords.length >= 2 && title) {
        if (isGsiMatchValid(trimmed, title)) {
          const [lon, lat] = coords;
          addCandidate(title, '住所・地点データ (国土地理院)', title, lat, lon, 'gsi');
        }
      }
    }
  }

  return results.slice(0, 6);
}

export default function PlaceAutocompleteInput({
  id,
  testId,
  value,
  onChange,
  onSelectSuggestion,
  placeholder,
  className = '',
  ringColorClass = 'focus:ring-emerald-500',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef(null);
  const skipNextFetchRef = useRef(false);

  // 外側タップで候補リストを閉じる
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const trimmed = (value || '').trim();
    if (!isOpen || trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const list = await fetchPlaceSuggestions(trimmed, controller.signal);
        setSuggestions(list);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSuggestions([]);
        }
      } finally {
        setSearching(false);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, isOpen]);

  const handleInputChange = (e) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = async (item) => {
    skipNextFetchRef.current = true;
    setIsOpen(false);
    setSuggestions([]);

    let selectedCoords = item.lat && item.lon ? { lat: item.lat, lon: item.lon } : null;

    // Google Places候補でplaceIdがある場合、詳細座標を取得
    if (item.placeId && (!selectedCoords || !selectedCoords.lat)) {
      try {
        const gmapsKey = getSavedGoogleMapsApiKey();
        const details = await getCoordsByPlaceId(item.placeId, gmapsKey);
        selectedCoords = { lat: details.lat, lon: details.lon };
      } catch (e) {
        console.warn('Place details fetch failed:', e);
      }
    }

    if (onSelectSuggestion) {
      onSelectSuggestion({
        title: item.title,
        fullQuery: item.fullQuery || item.title,
        coords: selectedCoords,
      });
    } else {
      onChange(item.fullQuery || item.title);
    }
  };

  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
  };

  const isGoogleSource = getSavedGoogleMapsApiKey();

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if ((value || '').trim().length >= 2) setIsOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full ${className} ${ringColorClass} pr-9`}
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
            aria-label="入力をクリア"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
        )}
      </div>

      {/* サジェストドロップダウン */}
      {isOpen && (suggestions.length > 0 || searching) && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200/90 z-50 overflow-hidden divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 bg-slate-50/80 text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-600" />
              候補（タップして選択）
            </span>
            {isGoogleSource ? (
              <span className="text-[10px] text-blue-600 flex items-center gap-0.5 font-semibold">
                <Sparkles className="w-2.5 h-2.5" /> Google Maps 連動
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">標準地図検索</span>
            )}
          </div>

          {searching && suggestions.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-400 text-center flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              候補を検索中...
            </div>
          )}

          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/70 active:bg-emerald-100/70 transition-colors flex items-start gap-2.5 group"
            >
              <div className="mt-0.5 p-1 rounded-md bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors shrink-0">
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate group-hover:text-emerald-900">
                  {item.title}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {item.subtitle}
                </div>
              </div>
              {item.source === 'builtin' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold shrink-0 self-center border border-emerald-300">
                  公式会場
                </span>
              )}
              {item.source?.startsWith('google') && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0 self-center">
                  Google
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
