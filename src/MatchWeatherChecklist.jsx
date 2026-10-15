import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CheckSquare,
  Square,
  Shirt,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Thermometer,
  Umbrella,
} from 'lucide-react';
import { parseWeatherCode } from './weatherService';

const STORAGE_KEYS = {
  CHECKED_ITEMS: 'soccer_checklist_checked_v1',
  CUSTOM_ITEMS: 'soccer_checklist_custom_v1',
  UNIFORM_PREF: 'soccer_uniform_preference_v1',
};

export default function MatchWeatherChecklist({
  destGeo,
  destName,
  travelDate,
  transportMode = 'car',
  defaultExpanded = true,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');

  // ユニフォーム設定
  const [uniformMode, setUniformMode] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.UNIFORM_PREF);
      return saved ? JSON.parse(saved) : { type: 'both', note1st: '白 (1st)', note2nd: '青 (2nd)' };
    } catch {
      return { type: 'both', note1st: '白 (1st)', note2nd: '青 (2nd)' };
    }
  });

  // チェック済みアイテムIDのSet
  const [checkedItems, setCheckedItems] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHECKED_ITEMS);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 自由追加カスタムアイテム
  const [customItems, setCustomItems] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_ITEMS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newCustomText, setNewCustomText] = useState('');

  // ユニフォーム設定の保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.UNIFORM_PREF, JSON.stringify(uniformMode));
  }, [uniformMode]);

  // チェック状態の保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CHECKED_ITEMS, JSON.stringify(Array.from(checkedItems)));
  }, [checkedItems]);

  // カスタム持ち物の保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_ITEMS, JSON.stringify(customItems));
  }, [customItems]);

  // Open-Meteo APIから目的地の指定日の天気を取得
  useEffect(() => {
    if (!destGeo?.lat || !destGeo?.lon) return;

    let isMounted = true;
    setWeatherLoading(true);
    setWeatherError('');

    const fetchWeather = async () => {
      try {
        const lat = destGeo.lat.toFixed(4);
        const lon = destGeo.lon.toFixed(4);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('天気予報の取得に失敗しました');
        const data = await res.json();
        if (!isMounted) return;

        if (data?.daily?.time && Array.isArray(data.daily.time)) {
          // travelDate と一致するインデックスを探す。なければ先頭（今日）
          let targetIdx = data.daily.time.indexOf(travelDate);
          if (targetIdx === -1) {
            targetIdx = 0; // 該当がなければ当日の予報
          }

          const code = data.daily.weathercode[targetIdx];
          const tempMax = Math.round(data.daily.temperature_2m_max[targetIdx]);
          const tempMin = Math.round(data.daily.temperature_2m_min[targetIdx]);
          const precipProb = data.daily.precipitation_probability_max
            ? data.daily.precipitation_probability_max[targetIdx] ?? 0
            : 0;

          setWeatherData({
            date: data.daily.time[targetIdx],
            isDateMatched: targetIdx === data.daily.time.indexOf(travelDate),
            code,
            ...parseWeatherCode(code),
            tempMax,
            tempMin,
            precipProb,
          });
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('Weather fetch error:', err);
        setWeatherError('天気を取得できませんでした');
      } finally {
        if (isMounted) setWeatherLoading(false);
      }
    };

    fetchWeather();

    return () => {
      isMounted = false;
    };
  }, [destGeo?.lat, destGeo?.lon, travelDate]);

  // 天候・気温に応じたアドバイス
  const weatherAdvices = useMemo(() => {
    if (!weatherData) return [];
    const list = [];

    const isRainy =
      weatherData.precipProb >= 35 ||
      [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherData.code);

    if (isRainy) {
      list.push({
        type: 'rain',
        icon: '☔',
        title: '雨・泥汚れ対策',
        desc: `降水確率 ${weatherData.precipProb}%。雨用ピステ・替え靴下・大きいゴミ袋を忘れずに！`,
      });
    }

    if (weatherData.tempMax >= 25) {
      list.push({
        type: 'hot',
        icon: '☀️',
        title: '暑さ・熱中症対策',
        desc: `最高気温 ${weatherData.tempMax}℃。水筒(2L〜)・保冷剤/氷のう・塩分タブレット・多めの着替えを持参しましょう。`,
      });
    }

    if (weatherData.tempMin <= 13) {
      list.push({
        type: 'cold',
        icon: '❄️',
        title: '防寒・冷え対策',
        desc: `最低気温 ${weatherData.tempMin}℃。ベンチコート・ピステ・手袋・ネックウォーマー・温かい飲み物を準備！`,
      });
    }

    if (weatherData.tempMax - weatherData.tempMin >= 10) {
      list.push({
        type: 'diff',
        icon: '🌡️',
        title: '寒暖差注意',
        desc: `気温差 ${weatherData.tempMax - weatherData.tempMin}℃。体温調整しやすい着脱可能な上着がおすすめです。`,
      });
    }

    return list;
  }, [weatherData]);

  // 天候連動で組み立てる持ち物リスト
  const computedPackingList = useMemo(() => {
    const isRainy =
      weatherData &&
      (weatherData.precipProb >= 35 ||
        [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherData.code));
    const isHot = weatherData && weatherData.tempMax >= 25;
    const isCold = weatherData && weatherData.tempMin <= 13;

    const sections = [];

    // 1. サッカー基本装備
    const basicItems = [
      { id: 'b-spikes', label: 'スパイク / トレーニングシューズ', req: true },
      { id: 'b-shinguard', label: 'すね当て (レガース)', req: true },
      {
        id: 'b-uniform',
        label: `公式ユニフォーム (${
          uniformMode.type === '1st'
            ? `1st: ${uniformMode.note1st}`
            : uniformMode.type === '2nd'
            ? `2nd: ${uniformMode.note2nd}`
            : `正副両方持参: ${uniformMode.note1st} & ${uniformMode.note2nd}`
        })`,
        req: true,
      },
      { id: 'b-ball', label: 'サッカーボール (空気圧確認)', req: false },
      { id: 'b-food', label: '補食 (おにぎり・ゼリー・バナナ)', req: true },
      { id: 'b-card', label: '保険証コピー / 診察券', req: true },
      { id: 'b-nail', label: '爪切り (試合前の爪チェック用)', req: false },
    ];

    if (transportMode === 'train') {
      basicItems.push(
        { id: 'b-ic-card', label: '💳 交通系ICカード (Suica/PASMO 残高確認) または切符代', req: true },
        { id: 'b-bag', label: '🎒 移動用リュック / ボールネット (両手を空ける)', req: false }
      );
    }

    sections.push({
      title: '⚽ サッカー基本必須アイテム',
      badge: '基本',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      items: basicItems,
    });

    // 2. 天候・気温対策装備（天候に応じて自動追加）
    const weatherItems = [];
    if (isRainy) {
      weatherItems.push(
        { id: 'w-rainwear', label: '☔ レインウェア / 雨用ピステ', req: true },
        { id: 'w-socks', label: '🧦 替えの靴下・下着 (2〜3足)', req: true },
        { id: 'w-towel', label: '🧺 タオル (大・小 複数枚)', req: true },
        { id: 'w-trashbag', label: '🗑️ 大きいゴミ袋 (荷物の雨よけ・泥物入れ)', req: true },
        { id: 'w-changeshoes', label: '👟 帰りのスニーカー / サンダル', req: false }
      );
    }

    if (isHot) {
      weatherItems.push(
        { id: 'w-ice', label: '🧊 保冷剤 / 氷のう (アイシング・冷却用)', req: true },
        { id: 'w-water', label: '💧 水筒 大容量 (2L〜) ＋ スポーツ飲料', req: true },
        { id: 'w-salt', label: '🍬 塩分チャージタブレット', req: true },
        { id: 'w-tees', label: '👕 着替えTシャツ・インナー (多め)', req: true },
        { id: 'w-sunscreen', label: '🧴 日焼け止め', req: false }
      );
    }

    if (isCold) {
      weatherItems.push(
        { id: 'w-benchcoat', label: '🧥 ベンチコート / ロングダウン', req: true },
        { id: 'w-piste', label: '🧤 ピステ上下 / 防寒手袋', req: true },
        { id: 'w-neck', label: '🧣 ネックウォーマー', req: true },
        { id: 'w-kairo', label: '🔥 貼るカイロ / ポケットカイロ', req: false },
        { id: 'w-thermos', label: '☕ 保温ボトル (温かい麦茶等)', req: false }
      );
    }

    if (weatherItems.length > 0) {
      sections.push({
        title: '🌦️ 天候・気温連動の推奨アイテム',
        badge: '天候連動',
        badgeColor: 'bg-sky-100 text-sky-800',
        items: weatherItems,
      });
    }

    // 3. 自由追加アイテム
    if (customItems.length > 0) {
      sections.push({
        title: '➕ カスタム追加アイテム',
        badge: '自分用',
        badgeColor: 'bg-purple-100 text-purple-800',
        items: customItems.map((c) => ({
          id: c.id,
          label: c.label,
          req: false,
          isCustom: true,
        })),
      });
    }

    return sections;
  }, [weatherData, uniformMode, customItems]);

  // 全アイテム数とチェック済み数の集計
  const totalItemsCount = useMemo(() => {
    return computedPackingList.reduce((acc, sec) => acc + sec.items.length, 0);
  }, [computedPackingList]);

  const checkedCount = useMemo(() => {
    let count = 0;
    computedPackingList.forEach((sec) => {
      sec.items.forEach((item) => {
        if (checkedItems.has(item.id)) count++;
      });
    });
    return count;
  }, [computedPackingList, checkedItems]);

  const progressPercent = totalItemsCount > 0 ? Math.round((checkedCount / totalItemsCount) * 100) : 0;

  const toggleItem = useCallback((id) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCheckAll = () => {
    const allIds = [];
    computedPackingList.forEach((sec) => sec.items.forEach((item) => allIds.push(item.id)));
    setCheckedItems(new Set(allIds));
  };

  const handleResetCheck = () => {
    setCheckedItems(new Set());
  };

  const handleAddCustomItem = (e) => {
    e.preventDefault();
    const text = newCustomText.trim();
    if (!text) return;
    const newItem = { id: `custom-${Date.now()}`, label: text };
    setCustomItems((prev) => [...prev, newItem]);
    setNewCustomText('');
  };

  const handleDeleteCustomItem = (id, e) => {
    e.stopPropagation();
    setCustomItems((prev) => prev.filter((item) => item.id !== id));
    setCheckedItems((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <section className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3.5">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-left group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-extrabold text-slate-800">
                遠征・試合 持ち物チェックリスト
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                Open-Meteo天気連動
              </span>
            </div>
            <div className="text-[11px] font-bold text-slate-500">
              {destName ? `${destName} の当日の天候・気温に合わせて自動調整` : '目的地の天候に合わせて自動最適化'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={() => setCheckedItems(new Set())}
              className="text-[10px] text-slate-400 hover:text-rose-600 font-bold px-1.5 py-0.5 rounded transition"
              title="チェックをすべてリセット"
            >
              リセット
            </button>
          )}
          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
            {checkedCount} / {totalItemsCount} 準備済
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
            aria-label={isExpanded ? '折りたたむ' : '展開する'}
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 進捗プログレスバー */}
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            progressPercent === 100
              ? 'bg-emerald-500'
              : progressPercent >= 50
              ? 'bg-sky-500'
              : 'bg-amber-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-1">
          {/* 🌤️ 天気予報バッジカード */}
          <div className="bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50/40 rounded-2xl p-3.5 border border-sky-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {weatherLoading ? (
                  <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                ) : weatherData ? (
                  <weatherData.Icon className={`w-6 h-6 ${weatherData.colorClass}`} />
                ) : (
                  <Sun className="w-6 h-6 text-amber-500" />
                )}
                <div>
                  <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {weatherData
                        ? `${weatherData.date} の目的地天気: ${weatherData.label}`
                        : '目的地周辺の天気予報'}
                    </span>
                    {weatherData && (
                      <span className="text-[10px] font-bold text-slate-500">
                        (降水確率 {weatherData.precipProb}%)
                      </span>
                    )}
                    {weatherData && !weatherData.isDateMatched && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                        ※直近参考
                      </span>
                    )}
                  </div>
                  {weatherData && (
                    <div className="text-[11px] font-bold text-slate-600 flex items-center gap-2 mt-0.5">
                      <span className="text-rose-600">最高 {weatherData.tempMax}℃</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-sky-600">最低 {weatherData.tempMin}℃</span>
                      {!weatherData.isDateMatched && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          (7日以上先のため本日の参考値)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {weatherData && (
                <div className="text-right">
                  <span className="inline-block text-[11px] font-black px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm">
                    {weatherData.tempMax >= 25 ? '☀️ 夏日注意' : weatherData.tempMin <= 12 ? '❄️ 防寒必須' : '🌤️ 快適'}
                  </span>
                </div>
              )}
            </div>

            {weatherError && (
              <div className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{weatherError}</span>
              </div>
            )}

            {/* 天候アドバイスアラート */}
            {weatherAdvices.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {weatherAdvices.map((adv, idx) => (
                  <div
                    key={idx}
                    className="bg-white/80 border border-slate-200/90 rounded-xl p-2 flex items-start gap-2 text-xs"
                  >
                    <span className="text-sm shrink-0">{adv.icon}</span>
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-800">{adv.title}</div>
                      <div className="text-[11px] font-bold text-slate-600">{adv.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 👕 今日のユニフォーム指定（1st / 2nd / 両方） */}
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Shirt className="w-4 h-4 text-indigo-600" />
                <span>当日のユニフォーム色指定</span>
              </label>
              <span className="text-[10px] font-bold text-slate-500">LINE確認の手間をカット</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { type: '1st', label: '1st (正のみ)' },
                { type: '2nd', label: '2nd (副のみ)' },
                { type: 'both', label: '正・副 両方' },
              ].map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setUniformMode((prev) => ({ ...prev, type: opt.type }))}
                  className={`py-1.5 px-2 rounded-xl text-xs font-black transition border text-center ${
                    uniformMode.type === opt.type
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[10px] font-bold text-slate-500">1stカラー名:</span>
                <input
                  type="text"
                  value={uniformMode.note1st}
                  onChange={(e) =>
                    setUniformMode((prev) => ({ ...prev, note1st: e.target.value }))
                  }
                  placeholder="例: 白"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500">2ndカラー名:</span>
                <input
                  type="text"
                  value={uniformMode.note2nd}
                  onChange={(e) =>
                    setUniformMode((prev) => ({ ...prev, note2nd: e.target.value }))
                  }
                  placeholder="例: 青"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* 持ち物リストセクション群 */}
          <div className="space-y-3">
            {computedPackingList.map((sec, sIdx) => (
              <div key={sIdx} className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-extrabold text-slate-800">{sec.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${sec.badgeColor}`}>
                    {sec.badge}
                  </span>
                </div>
                <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-2 divide-y divide-slate-200/60">
                  {sec.items.map((item) => {
                    const isChecked = checkedItems.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && toggleItem(item.id)}
                        className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer select-none active:scale-[0.99] ${
                          isChecked
                            ? 'bg-emerald-50/90 text-slate-400 line-through'
                            : 'hover:bg-white text-slate-900 font-extrabold'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400 shrink-0" />
                          )}
                          <span
                            className={`text-xs ${
                              isChecked ? 'line-through text-slate-400' : 'text-slate-800'
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>

                        {item.isCustom && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomItem(item.id, e)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition"
                            aria-label="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 自由追加フォーム */}
          <form onSubmit={handleAddCustomItem} className="flex gap-2">
            <input
              type="text"
              placeholder="自分用の持ち物を追加（例: モバイルバッテリー）"
              value={newCustomText}
              onChange={(e) => setNewCustomText(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={!newCustomText.trim()}
              className="bg-sky-600 hover:bg-sky-500 active:scale-95 disabled:opacity-50 text-white text-xs font-extrabold px-3 py-2 rounded-xl shadow-sm flex items-center gap-1 transition"
            >
              <Plus className="w-4 h-4" />
              <span>追加</span>
            </button>
          </form>

          {/* 一括操作ボタン */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              onClick={handleCheckAll}
              className="text-sky-700 hover:text-sky-800 font-extrabold py-1 px-2.5 rounded-lg hover:bg-sky-50 transition"
            >
              全項目をチェック済みにする
            </button>
            <button
              type="button"
              onClick={handleResetCheck}
              className="text-slate-500 hover:text-rose-600 font-bold py-1 px-2.5 rounded-lg hover:bg-rose-50 flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>チェックをリセット</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
