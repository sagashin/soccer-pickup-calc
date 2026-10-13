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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&libraries=places&language=ja&region=JP`;
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

// ダミーコンテナ（PlacesService用）
let dummyPlacesService = null;
function getPlacesService() {
  if (!dummyPlacesService && window.google?.maps?.places?.PlacesService) {
    const dummyDiv = document.createElement('div');
    dummyPlacesService = new window.google.maps.places.PlacesService(dummyDiv);
  }
  return dummyPlacesService;
}

/**
 * Google Maps によるジオコーディング (厳格なタイムアウト＆エラーハンドリング)
 */
export async function geocodeWithGoogleMaps(query, apiKey) {
  const maps = await loadGoogleMapsScript(apiKey);
  const trimmed = query.trim();

  // 1. まず PlacesService の TextSearch で施設検索 (最大3秒タイムアウト)
  const placesResult = await new Promise((resolve) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, 3000);

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
                source: 'google-places',
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

  if (placesResult) {
    return placesResult;
  }

  // 2. Placesで見つからない場合は Geocoder でフォールバック (最大3秒タイムアウト)
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('Google Mapsジオコーディングがタイムアウトしました。'));
      }
    }, 3000);

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
 * Google Maps Autocomplete による入力サジェスト候補の取得 (タイムアウト付き)
 */
let autocompleteService = null;
export async function getGooglePlacePredictions(query, apiKey) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const maps = await loadGoogleMapsScript(apiKey);
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

          if (
            status === maps.places.PlacesServiceStatus.OK &&
            Array.isArray(predictions)
          ) {
            const list = predictions.map((p) => ({
              id: `gmap-${p.place_id}`,
              placeId: p.place_id,
              title: p.structured_formatting?.main_text || p.description,
              subtitle: p.structured_formatting?.secondary_text || 'Google マップ登録施設',
              fullQuery: p.description,
              source: 'google',
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
 * PlaceId から緯度経度を取得 (タイムアウト付き)
 */
export async function getCoordsByPlaceId(placeId, apiKey) {
  const maps = await loadGoogleMapsScript(apiKey);
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
