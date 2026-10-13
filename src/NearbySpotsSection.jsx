import React from 'react';
import {
  Car,
  ShoppingBag,
  Navigation,
  ExternalLink,
  MapPin,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  Layers,
} from 'lucide-react';
import { getExternalSpotSearchUrls } from './nearbySpots';

export default function NearbySpotsSection({
  destGeo,
  destName,
  parkings = [],
  conveniences = [],
  loading = false,
  error = '',
  onRefresh,
  activeFilter = 'all',
  setActiveFilter,
  selectedSpotId,
  onSelectSpot,
}) {
  if (!destGeo) return null;

  const externalUrls = getExternalSpotSearchUrls(
    destGeo.lat,
    destGeo.lon,
    destName || destGeo.displayName
  );

  const displayedSpots = (() => {
    if (activeFilter === 'parking') return parkings;
    if (activeFilter === 'convenience') return conveniences;
    // 'all' の場合は両方を距離順にインターリーブ・ソート
    return [...parkings, ...conveniences].sort(
      (a, b) => a.distanceMeters - b.distanceMeters
    );
  })();

  const parkCount = parkings.length;
  const convCount = conveniences.length;
  const totalCount = parkCount + convCount;

  return (
    <section className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3.5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shadow-inner">
            🅿️
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 leading-tight flex items-center gap-1.5">
              <span>目的地周辺スポット</span>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                計{totalCount}件
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">
              公園併設駐車場・コインパーキング・コンビニ
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs font-bold text-slate-600 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-xl transition flex items-center gap-1 active:scale-95"
          title="周辺スポットを再取得"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">更新</span>
        </button>
      </div>

      {/* リアルタイム外部検索クイックハブ */}
      <div className="bg-gradient-to-r from-slate-50 to-emerald-50/50 border border-slate-200/90 rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>リアルタイム満空・料金比較（外部ワンタップ検索）</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <a
            href={externalUrls.gmapParking}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-bold shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span>🅿️</span>
              <span className="truncate">Google 駐車場検索</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 ml-1" />
          </a>

          <a
            href={externalUrls.timesMap}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-300 text-amber-900 text-[11px] font-bold shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-4 h-4 rounded bg-amber-500 text-black text-[9px] font-black flex items-center justify-center shrink-0">T</span>
              <span className="truncate">タイムズ空きマップ</span>
            </span>
            <ExternalLink className="w-3 h-3 text-amber-700 shrink-0 ml-1" />
          </a>

          <a
            href={externalUrls.gmapConvenience}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-bold shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span>🏪</span>
              <span className="truncate">近くのコンビニ</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 ml-1" />
          </a>

          <a
            href={externalUrls.akippaSearch}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-300 text-emerald-900 text-[11px] font-bold shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span>🅿️</span>
              <span className="truncate">akippa 予約駐車場</span>
            </span>
            <ExternalLink className="w-3 h-3 text-emerald-700 shrink-0 ml-1" />
          </a>
        </div>
      </div>

      {/* カテゴリ切り替えタブ */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-extrabold transition ${
            activeFilter === 'all'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          すべて ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('parking')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1 ${
            activeFilter === 'parking'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🅿️ 駐車場</span>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
            {parkCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('convenience')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1 ${
            activeFilter === 'convenience'
              ? 'bg-white text-sky-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🏪 コンビニ</span>
          <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded-full">
            {convCount}
          </span>
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-amber-50 text-amber-900 text-xs font-bold p-3 rounded-xl border border-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <div>{error}</div>
            <div className="text-[10px] text-amber-700 font-normal mt-0.5">
              上の「Google 駐車場検索」や「タイムズ」ボタンから最新状況を直接ご確認いただけます。
            </div>
          </div>
        </div>
      )}

      {/* ローディング */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center space-y-2">
          <div className="w-7 h-7 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500">目的地周辺の駐車場・コンビニを検索中...</p>
        </div>
      ) : displayedSpots.length === 0 ? (
        <div className="py-6 px-3 bg-slate-50 rounded-2xl text-center space-y-2 border border-dashed border-slate-200">
          <p className="text-xs font-bold text-slate-600">
            周辺1.2km以内に該当スポットが見つかりませんでした
          </p>
          <p className="text-[11px] text-slate-400">
            広域のパーキングやコンビニはGoogleマップ検索から確認できます
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <a
              href={externalUrls.gmapParking}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold bg-white border border-slate-300 px-3 py-1.5 rounded-xl shadow-sm hover:bg-slate-100 text-slate-700"
            >
              🅿️ Googleマップで探す
            </a>
            <a
              href={externalUrls.gmapConvenience}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold bg-white border border-slate-300 px-3 py-1.5 rounded-xl shadow-sm hover:bg-slate-100 text-slate-700"
            >
              🏪 コンビニを探す
            </a>
          </div>
        </div>
      ) : (
        /* スポットカード一覧 */
        <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
          {displayedSpots.map((spot) => {
            const isSelected = selectedSpotId === spot.id;
            const isParking = spot.category === 'parking';

            return (
              <div
                key={spot.id}
                className={`p-3 rounded-2xl border transition ${
                  isSelected
                    ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-slate-50/80 hover:bg-slate-100/90 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* バッジ行 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {isParking ? (
                        <>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${spot.badgeColor}`}
                          >
                            {spot.badgeLabel}
                          </span>
                          {spot.feeLabel && (
                            <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                              {spot.feeLabel}
                            </span>
                          )}
                        </>
                      ) : (
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${spot.brandColor}`}
                        >
                          🏪 {spot.brandLabel}
                        </span>
                      )}

                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                        徒歩 約{spot.walkMinutes}分 (約{spot.distanceMeters}m)
                      </span>
                    </div>

                    {/* スポット名 */}
                    <div className="text-xs font-black text-slate-900 truncate">
                      {spot.name}
                    </div>

                    {/* 住所・周辺情報 */}
                    {spot.address && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {spot.address}
                      </div>
                    )}
                  </div>
                </div>

                {/* アクションボタン群 */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectSpot(spot)}
                    className="text-[11px] font-extrabold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 px-2.5 py-1 rounded-xl shadow-sm transition flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    <span>地図で位置を確認</span>
                  </button>

                  <a
                    href={spot.googleNavUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded-xl shadow-sm transition flex items-center gap-1"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>ここへ案内</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
