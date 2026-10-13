/**
 * Google Maps Platform API連携クライアント
 * - Geocoding (ジオコーディング)
 * - Places Autocomplete (場所オートコンプリート)
 * - Places FindPlace (施設検索)
 * - 認証エラー・未有効化・タイムアウト時の自動安全フォールバック
 */

export const GOOGLE_MAPS_API_KEY_STORAGE = 'soccer_pickup_gmaps_api_key_v1';

let scriptLoadingPromise = null;
let hasAuthError = false;

// Google Maps 認証失敗イベントのグローバル検知
if (typeof window !== 'undefined') {
  const originalAuthFailure = window.gm_authFailure;
  window.gm_authFailure = () => {
    console.error('Google Maps API認証エラー: APIキーが無効、または請求先・API有効化が未完了です。');
    hasAuthError = true;
    scriptLoadingPromise = null;
    if (typeof originalAuthFailure === 'function') {
      originalAuthFailure();
    }
  };
}

/**
 * 保存されているAPIキーを取得
 */
export function getSavedGoogleMapsApiKey() {
  const envKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';
  const localKey = localStorage.getItem(GOOGLE_MAPS_API_KEY_STORAGE) || '';
  return localKey.trim() || envKey.trim();
}

/**
 * APIキーを保存
 */
export function saveGoogleMapsApiKey(key) {
  const trimmed = (key || '').trim();
  localStorage.setItem(GOOGLE_MAPS_API_KEY_STORAGE, trimmed);
  hasAuthError = false;
  scriptLoadingPromise = null;
  return trimmed;
}

/**
 * Google Maps JavaScript API スクリプトを動的にロード (3.5秒タイムアウト付き)
 */
export function loadGoogleMapsScript(apiKey) {
  const key = apiKey || getSavedGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error('Google Maps APIキーが設定されていません。'));
  }

  if (hasAuthError) {
    return Promise.reject(new Error('Google Maps APIキーの認証に失敗しました（未有効化または請求先未設定）。'));
  }

  if (window.google && window.google.maps && window.google.maps.places) {
    return Promise.resolve(window.google.maps);
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    // 3.5秒でロードできなければタイムアウトして標準地図にフォールバック
    const timer = setTimeout(() => {
      scriptLoadingPromise = null;
      reject(new Error('Google Maps SDKの読み込みがタイムアウトしました。標準地図で検索します。'));
    }, 3500);

    // 既存スクリプトタグがあれば削除してリロード（キー変更時対応）
    const existing = document.getElementById('google-maps-sdk-script');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = 'google-maps-sdk-script';
    // Places API (New) をフル活用するため v=weekly を指定
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&libraries=places&language=ja&region=JP&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      clearTimeout(timer);
      if (hasAuthError) {
        scriptLoadingPromise = null;
        reject(new Error('Google Maps APIキーの認証に失敗しました。'));
        return;
      }

      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        scriptLoadingPromise = null;
        reject(new Error('Google Maps SDKの初期化に失敗しました。'));
      }
    };

    script.onerror = () => {
      clearTimeout(timer);
      scriptLoadingPromise = null;
      reject(new Error('Google Maps SDKの読み込みに失敗しました。APIキーまたはネットワークを確認してください。'));
    };

    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

// ダミーコンテナ（旧PlacesService用フォールバック）
let dummyPlacesService = null;
function getPlacesService() {
  if (!dummyPlacesService && window.google?.maps?.places?.PlacesService) {
    const dummyDiv = document.createElement('div');
    dummyPlacesService = new window.google.maps.places.PlacesService(dummyDiv);
  }
  return dummyPlacesService;
}

/**
 * Places API (New): Place.searchByText による施設検索
 */
async function searchWithPlacesNew(query, maps) {
  try {
    if (typeof maps.importLibrary === 'function') {
      const placesLib = await maps.importLibrary('places');
      const PlaceClass = placesLib?.Place;
      if (PlaceClass && typeof PlaceClass.searchByText === 'function') {
        const response = await PlaceClass.searchByText({
          textQuery: query,
          fields: ['displayName', 'location', 'formattedAddress', 'id'],
          language: 'ja',
          region: 'jp',
          maxResultCount: 5,
        });

        if (response?.places && Array.isArray(response.places) && response.places.length > 0) {
          const first = response.places[0];
          const lat =
            typeof first.location?.lat === 'function' ? first.location.lat() : first.location?.lat;
          const lon =
            typeof first.location?.lng === 'function' ? first.location.lng() : first.location?.lng;

          if (lat !== undefined && lon !== undefined) {
            const candidates = response.places.slice(1, 4).map((p) => {
              const pLat =
                typeof p.location?.lat === 'function' ? p.location.lat() : p.location?.lat;
              const pLon =
                typeof p.location?.lng === 'function' ? p.location.lng() : p.location?.lng;
              return {
                name: p.displayName || p.formattedAddress || query,
                lat: pLat,
                lon: pLon,
              };
            });

            return {
              lat,
              lon,
              displayName: first.displayName || first.formattedAddress || query,
              formattedAddress: first.formattedAddress || '',
              candidates,
              source: 'google-places-new',
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Places API (New) searchByText fallback:', err);
  }
  return null;
}

/**
 * Google Maps によるジオコーディング (Places API New ➔ 旧Places ➔ Geocoderの順でフォールバック)
 */
export async function geocodeWithGoogleMaps(query, apiKey) {
  const maps = await loadGoogleMapsScript(apiKey);
  const trimmed = query.trim();

  // 1. 【Places API (New)】を最優先実行！ (Google CloudでPlaces API (New)のみ有効な場合も一発動作)
  const newPlacesResult = await searchWithPlacesNew(trimmed, maps);
  if (newPlacesResult) {
    return newPlacesResult;
  }

  // 2. 従来の PlacesService.textSearch (旧API有効時用フォールバック、最大2.5秒タイムアウト)
  const legacyPlacesResult = await new Promise((resolve) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, 2500);

    try {
      const service = getPlacesService();
      if (!service) {
        clearTimeout(timeout);
        return resolve(null);
      }

      service.textSearch(
        {
          query: trimmed,
        },
        (results, status) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);

          if (
            status === maps.places.PlacesServiceStatus.OK &&
            Array.isArray(results) &&
            results.length > 0
          ) {
            const first = results[0];
            const loc = first.geometry?.location;
            if (loc) {
              const candidates = results.slice(1, 4).map((r) => ({
                name: r.name || r.formatted_address,
                lat: r.geometry.location.lat(),
                lon: r.geometry.location.lng(),
              }));

              return resolve({
                lat: loc.lat(),
                lon: loc.lng(),
                displayName: first.name || first.formatted_address || trimmed,
                formattedAddress: first.formatted_address || '',
                candidates,
                source: 'google-places-legacy',
              });
            }
          }
          resolve(null);
        }
      );
    } catch (e) {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve(null);
      }
    }
  });

  if (legacyPlacesResult) {
    return legacyPlacesResult;
  }

  // 3. Geocoder (Geocoding API) でフォールバック (最大2.5秒タイムアウト)
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('Google Mapsジオコーディングがタイムアウトしました。'));
      }
    }, 2500);

    try {
      const geocoder = new maps.Geocoder();
      geocoder.geocode(
        {
          address: trimmed,
          region: 'JP',
        },
        (results, status) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);

          if (status === maps.GeocoderStatus.OK && Array.isArray(results) && results.length > 0) {
            const first = results[0];
            const loc = first.geometry?.location;
            if (loc) {
              const candidates = results.slice(1, 4).map((r) => ({
                name: r.formatted_address,
                lat: r.geometry.location.lat(),
                lon: r.geometry.location.lng(),
              }));

              return resolve({
                lat: loc.lat(),
                lon: loc.lng(),
                displayName: first.formatted_address || trimmed,
                formattedAddress: first.formatted_address || '',
                candidates,
                source: 'google-geocoder',
              });
            }
          }
          reject(new Error(`Google Mapsで「${trimmed}」の場所が見つかりませんでした (ステータス: ${status})。`));
        }
      );
    } catch (err) {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        reject(err);
      }
    }
  });
}

/**
 * Places API (New): AutocompleteSuggestion による入力サジェスト候補の取得
 */
async function getSuggestionsWithPlacesNew(query, maps) {
  try {
    if (typeof maps.importLibrary === 'function') {
      const placesLib = await maps.importLibrary('places');
      const AutoClass = placesLib?.AutocompleteSuggestion;
      if (AutoClass && typeof AutoClass.fetchAutocompleteSuggestions === 'function') {
        const response = await AutoClass.fetchAutocompleteSuggestions({
          input: query,
          region: 'jp',
        });

        if (response?.suggestions && Array.isArray(response.suggestions) && response.suggestions.length > 0) {
          return response.suggestions
            .filter((s) => s.placePrediction)
            .map((s) => {
              const pred = s.placePrediction;
              const title = pred.mainText?.toString() || pred.text?.toString() || query;
              const subtitle = pred.secondaryText?.toString() || 'Google マップ登録施設';
              const fullQuery = pred.text?.toString() || query;
              return {
                id: `gmap-${pred.placeId}`,
                placeId: pred.placeId,
                title,
                subtitle,
                fullQuery,
                source: 'google-new',
              };
            });
        }
      }
    }
  } catch (err) {
    console.warn('Places API (New) Autocomplete fallback:', err);
  }
  return null;
}

/**
 * Google Maps Autocomplete による入力サジェスト候補の取得 (New ➔ Legacyの順で試行)
 */
let autocompleteService = null;
export async function getGooglePlacePredictions(query, apiKey) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const maps = await loadGoogleMapsScript(apiKey);

    // 1. 【Places API (New)】を最優先実行！
    const newSuggestions = await getSuggestionsWithPlacesNew(trimmed, maps);
    if (Array.isArray(newSuggestions) && newSuggestions.length > 0) {
      return newSuggestions;
    }

    // 2. 従来の AutocompleteService (旧API有効時用フォールバック)
    if (!autocompleteService && maps.places?.AutocompleteService) {
      autocompleteService = new maps.places.AutocompleteService();
    }

    if (!autocompleteService) return [];

    return new Promise((resolve) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          resolve([]);
        }
      }, 2000);

      autocompleteService.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: 'jp' },
        },
        (predictions, status) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);

          if (status === maps.places.PlacesServiceStatus.OK && Array.isArray(predictions)) {
            const list = predictions.map((p) => ({
              id: `gmap-${p.place_id}`,
              placeId: p.place_id,
              title: p.structured_formatting?.main_text || p.description,
              subtitle: p.structured_formatting?.secondary_text || 'Google マップ登録施設',
              fullQuery: p.description,
              source: 'google-legacy',
            }));
            resolve(list);
          } else {
            resolve([]);
          }
        }
      );
    });
  } catch (err) {
    return [];
  }
}

/**
 * PlaceId から緯度経度を取得 (New ➔ Legacyの順でフォールバック)
 */
export async function getCoordsByPlaceId(placeId, apiKey) {
  const maps = await loadGoogleMapsScript(apiKey);

  // 1. 【Places API (New)】Place クラスでの取得
  try {
    if (typeof maps.importLibrary === 'function') {
      const placesLib = await maps.importLibrary('places');
      const PlaceClass = placesLib?.Place;
      if (PlaceClass) {
        const place = new PlaceClass({ id: placeId });
        await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress'] });
        const lat =
          typeof place.location?.lat === 'function' ? place.location.lat() : place.location?.lat;
        const lon =
          typeof place.location?.lng === 'function' ? place.location.lng() : place.location?.lng;

        if (lat !== undefined && lon !== undefined) {
          return {
            lat,
            lon,
            displayName: place.displayName || place.formattedAddress,
            formattedAddress: place.formattedAddress || '',
          };
        }
      }
    }
  } catch (e) {
    console.warn('Places API (New) Place.fetchFields fallback to legacy:', e);
  }

  // 2. 従来の PlacesService での取得フォールバック
  const service = getPlacesService();
  if (!service) throw new Error('PlacesServiceが利用できません');

  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('場所の詳細取得がタイムアウトしました'));
      }
    }, 2500);

    service.getDetails(
      {
        placeId,
        fields: ['name', 'geometry', 'formatted_address'],
      },
      (place, status) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);

        if (status === maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          resolve({
            lat: place.geometry.location.lat(),
            lon: place.geometry.location.lng(),
            displayName: place.name || place.formatted_address,
            formattedAddress: place.formatted_address || '',
          });
        } else {
          reject(new Error('場所の詳細座標を取得できませんでした'));
        }
      }
    );
  });
}

/**
 * Google Maps DirectionsService による車ルート & 渋滞最大時間（PESSIMISTIC）自動取得
 * - 指定の目標到着日時から仮の出発時間を算出して問い合わせ
 * - Google公式の最悪渋滞想定（trafficModel: PESSIMISTIC）による所要時間を取得し真の出発時刻へ反復補正
 */
export async function fetchGoogleDrivingRouteWithTraffic({
  origin,
  destination,
  originCoords,
  destCoords,
  arrivalDate,
  apiKey,
}) {
  const maps = await loadGoogleMapsScript(apiKey);
  if (!maps?.DirectionsService) {
    throw new Error('DirectionsService が利用できません。');
  }

  const directionsService = new maps.DirectionsService();

  // 目標到着時刻
  const targetDate = arrivalDate instanceof Date ? arrivalDate : new Date(arrivalDate);
  const now = new Date();

  // 初期仮説: 目標到着時刻の約60分前を出発時間とする（未来日時でなければ現在+3分後に安全補正）
  let depTime = new Date(targetDate.getTime() - 60 * 60 * 1000);
  if (depTime.getTime() <= now.getTime()) {
    depTime = new Date(now.getTime() + 3 * 60 * 1000);
  }

  // 座標がある場合は google.maps.LatLng を使用（住所文字列解決の失敗・クォータ制限を完全回避）
  const originParam =
    originCoords?.lat && originCoords?.lon
      ? new maps.LatLng(originCoords.lat, originCoords.lon)
      : origin;

  const destParam =
    destCoords?.lat && destCoords?.lon
      ? new maps.LatLng(destCoords.lat, destCoords.lon)
      : destination;

  const queryRoute = (departureDate) => {
    return new Promise((resolve, reject) => {
      const request = {
        origin: originParam,
        destination: destParam,
        travelMode: maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: departureDate,
          trafficModel: maps.TrafficModel.PESSIMISTIC, // 最大渋滞・最悪想定！
        },
      };

      directionsService.route(request, (result, status) => {
        if (status === maps.DirectionsStatus.OK && result?.routes?.[0]?.legs?.[0]) {
          const leg = result.routes[0].legs[0];
          const normalSec = leg.duration?.value || 0;
          const trafficSec = leg.duration_in_traffic?.value || normalSec;
          const distanceMeters = leg.distance?.value || 0;

          const points = (result.routes[0].overview_path || []).map((latLng) => [
            latLng.lat(),
            latLng.lng(),
          ]);

          resolve({
            minMinutes: Math.max(1, Math.round(normalSec / 60)),
            maxMinutes: Math.max(1, Math.round(trafficSec / 60)),
            distanceKm: (distanceMeters / 1000).toFixed(1),
            geometry:
              points.length > 0
                ? {
                    type: 'LineString',
                    coordinates: points.map(([lat, lng]) => [lng, lat]),
                  }
                : null,
            summary: result.routes[0].summary || '',
          });
        } else {
          reject(new Error(`Google Directions 車ルート取得失敗: ${status}`));
        }
      });
    });
  };

  // 1回目のクエリ（仮の出発時刻）
  const firstPass = await queryRoute(depTime);

  // 反復補正: 初回の最大時間と仮定（60分）の差が15分以上あり、未来日時の場合、
  // その最大時間に合わせて正確な出発時刻で再クエリ
  const diffMinutes = Math.abs(firstPass.maxMinutes - 60);
  if (diffMinutes >= 15 && targetDate.getTime() > now.getTime()) {
    const refinedDepTime = new Date(targetDate.getTime() - firstPass.maxMinutes * 60 * 1000);
    if (refinedDepTime.getTime() > now.getTime()) {
      try {
        const secondPass = await queryRoute(refinedDepTime);
        return {
          ...secondPass,
          standardMinutes: Math.round((secondPass.minMinutes + secondPass.maxMinutes) / 2),
          isGoogleRealtime: true,
        };
      } catch (e) {
        // 再クエリ失敗時は初回の結果を採用
      }
    }
  }

  return {
    ...firstPass,
    standardMinutes: Math.round((firstPass.minMinutes + firstPass.maxMinutes) / 2),
    isGoogleRealtime: true,
  };
}

