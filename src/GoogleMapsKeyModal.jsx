import React, { useState, useEffect } from 'react';
import { Key, Sparkles, CheckCircle, AlertCircle, X, ExternalLink } from 'lucide-react';
import {
  GOOGLE_MAPS_API_KEY_STORAGE,
  getSavedGoogleMapsApiKey,
  saveGoogleMapsApiKey,
  geocodeWithGoogleMaps,
} from './googleMapsClient';

export default function GoogleMapsKeyModal({ isOpen, onClose, onKeySaved }) {
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }

  useEffect(() => {
    if (isOpen) {
      setApiKey(getSavedGoogleMapsApiKey());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    const saved = saveGoogleMapsApiKey(apiKey);
    if (onKeySaved) onKeySaved(saved);
    onClose();
  };

  const handleClear = () => {
    saveGoogleMapsApiKey('');
    setApiKey('');
    setTestResult({ success: true, message: 'Google Maps APIキーを解除しました（フリー地図モードに戻ります）。' });
    if (onKeySaved) onKeySaved('');
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'APIキーを入力してください。' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      // 「西武台第2グラウンド」を実際にGoogle Mapsでテスト検索！
      const res = await geocodeWithGoogleMaps('西武台第2グラウンド', apiKey.trim());
      if (res && res.lat && res.lon) {
        setTestResult({
          success: true,
          message: `接続成功！「西武台第2グラウンド」を埼玉県新座市（${res.lat.toFixed(4)}, ${res.lon.toFixed(4)}）として即座に特定できました！`,
        });
      } else {
        setTestResult({
          success: false,
          message: '検索結果の取得に失敗しました。キーの権限（Places API / Geocoding API）をご確認ください。',
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `接続テスト失敗: ${err.message || 'APIキーが無効か、Maps JavaScript API / Places API が有効化されていません。'}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-1.5">
                Google Maps 検索連動設定
              </h3>
              <p className="text-xs text-blue-100">
                西武台第2などのグラウンドも一発特定
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 本文 */}
        <div className="p-5 space-y-4">
          <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-3.5 text-xs text-blue-900 leading-relaxed space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-blue-800">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Google Maps APIキーを設定するメリット
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11px] pl-1">
              <li>学校の第2グラウンドや略称グラウンドが<strong>一発で正確にピンポイント特定</strong>されます。</li>
              <li>入力中の候補サジェストもGoogleの最新データベースで超高速表示。</li>
              <li>Google Cloudの<strong>毎月$200（約28,000円分）無料枠</strong>があるため、個人利用なら実質完全無料（0円）です。</li>
            </ul>
          </div>

          <form onSubmit={handleSave} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Google Maps APIキー (AIzaSy...)</span>
                <a
                  href="https://console.cloud.google.com/google/maps-apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  キーの取得ページ <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full text-xs font-mono p-3 pr-9 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
                <Key className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                ※「Maps JavaScript API」「Places API」「Geocoding API」が有効化されているキーをご使用ください。キーはお使いのブラウザ内（localStorage）にのみ安全に保存されます。
              </p>
            </div>

            {/* テスト結果通知 */}
            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 leading-snug">{testResult.message}</div>
              </div>
            )}

            {/* ボタン群 */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testing || !apiKey.trim()}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {testing ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                )}
                <span>「西武台第2」でテスト</span>
              </button>

              <button
                type="submit"
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white text-xs font-extrabold shadow-md transition"
              >
                保存して適用
              </button>
            </div>

            {apiKey && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] text-slate-400 hover:text-rose-600 transition underline"
                >
                  APIキーを削除する
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
