import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Key,
  Clock,
  MapPin,
  Calendar,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RotateCcw,
  Play,
  CalendarCheck,
} from 'lucide-react';
import {
  GEMINI_API_KEY_STORAGE,
  SAMPLE_SCHEDULE_EVENTS,
  fileToBase64,
  parseScheduleImageWithGemini,
  calculateMeetingTime,
} from './geminiScheduleParser';
import { mergeImportedEvents, getLocalDateIso } from './scheduleStore';

const MEETING_PRESETS = [
  { label: '2時間前集合', minutes: 120, shortLabel: '2時間前 (120分)' },
  { label: '1時間半前集合', minutes: 90, shortLabel: '1時間半前 (90分)' },
  { label: '1時間前集合', minutes: 60, shortLabel: '1時間前 (60分)' },
  { label: '45分前集合', minutes: 45, shortLabel: '45分前' },
  { label: '開始時刻そのまま', minutes: 0, shortLabel: 'そのまま (0分)' },
];

export default function ScheduleImageImporter({
  onApplySchedule,
  onSaveToSchedules,
  isOpen: controlledIsOpen,
  onToggleOpen,
}) {
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : localIsOpen;
  const toggleOpen = onToggleOpen || (() => setLocalIsOpen((prev) => !prev));

  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');
  const [apiKey, setApiKey] = useState(() => {
    const envKey = import.meta.env?.VITE_GEMINI_API_KEY || '';
    const saved = localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
    return saved.trim() || envKey.trim();
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');

  const [imagePreview, setImagePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [parsedEvents, setParsedEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [meetingLeadMinutes, setMeetingLeadMinutes] = useState(120); // デフォルト2時間前集合
  const [customLeadMinutes, setCustomLeadMinutes] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(GEMINI_API_KEY_STORAGE, apiKey);
  }, [apiKey]);

  const handleSaveApiKey = (e) => {
    e.preventDefault();
    const trimmed = tempApiKey.trim();
    setApiKey(trimmed);
    localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed);
    setShowKeyInput(false);
    setErrorMessage('');
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!apiKey) {
      setShowKeyInput(true);
      setErrorMessage('画像を解析するには、まずGemini APIキー（無料）を設定してください。');
      return;
    }

    try {
      setAnalyzing(true);
      setErrorMessage('');
      const { base64, mimeType, previewUrl } = await fileToBase64(file);
      setImagePreview(previewUrl);

      const events = await parseScheduleImageWithGemini(base64, mimeType, apiKey);
      if (events.length === 0) {
        setErrorMessage('画像から予定を検出できませんでした。別の画像をお試しいただくか、サンプルデータをお試しください。');
      } else {
        setParsedEvents(events);
        setSelectedEventId(events[0].id);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || '画像の解析中にエラーが発生しました。');
    } finally {
      setAnalyzing(false);
      // リセット
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // サンプルデータ読み込み（ユーザー提供の画像データ）
  const handleLoadSample = () => {
    setErrorMessage('');
    setImagePreview(null);
    setParsedEvents(SAMPLE_SCHEDULE_EVENTS);
    // 添付画像の「新人戦 vs ソルース 10:00@羽生中央公園」をデフォルト選択
    setSelectedEventId('sample-3');
    setMeetingLeadMinutes(120);
    if (controlledIsOpen === undefined) setLocalIsOpen(true);
  };

  const selectedEvent = parsedEvents.find((e) => e.id === selectedEventId) || null;

  // 選択中の予定の集合時刻を算出
  const effectiveMeetingLead = customLeadMinutes !== '' ? Number(customLeadMinutes) : meetingLeadMinutes;
  const calculatedMeetingTime = selectedEvent?.time
    ? calculateMeetingTime(selectedEvent.time, effectiveMeetingLead)
    : '09:00';

  // 抽出された全予定をスケジュール帳（カレンダー）に蓄積・保存
  const handleSaveAllToSchedule = () => {
    if (parsedEvents.length === 0) return;
    const result = mergeImportedEvents(parsedEvents, effectiveMeetingLead);
    setSaveSuccessMessage(`🎉 ${result.addedCount}件の新規予定を追加、${result.updatedCount}件を更新しました！`);
    if (onSaveToSchedules) {
      onSaveToSchedules(result.schedules);
    }
    setTimeout(() => {
      setSaveSuccessMessage('');
    }, 4500);
  };

  // 選択した予定をメインアプリに反映
  const handleApply = () => {
    if (!selectedEvent) return;

    onApplySchedule({
      destination: selectedEvent.venue || selectedEvent.title,
      travelDate: selectedEvent.dateIso || getLocalDateIso(),
      arrivalTime: calculatedMeetingTime,
      eventName: selectedEvent.title,
    });

    // 成功フィードバック
    if (controlledIsOpen === undefined) setLocalIsOpen(false);
  };

  return (
    <section className="bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 rounded-3xl p-4 shadow-sm border border-emerald-200/80 space-y-3">
      {/* 折りたたみヘッダー */}
      <div
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && toggleOpen()}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-black text-slate-900 leading-tight">
                日程表画像から一発逆算
              </h2>
              <span className="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                <Sparkles className="w-2.5 h-2.5" /> AI解析
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              LINEの日程スクショから予定を選んで集合時間を逆算
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {parsedEvents.length > 0 && !isOpen && (
            <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              {parsedEvents.length}件検出済
            </span>
          )}
          <button
            type="button"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
            aria-label="開閉"
          >
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 開閉コンテンツ */}
      {isOpen && (
        <div className="pt-2 space-y-3 border-t border-emerald-200/60">
          {/* APIキー設定リンク・状態 */}
          <div className="flex items-center justify-between text-[11px] px-1">
            <button
              type="button"
              onClick={() => {
                setTempApiKey(apiKey);
                setShowKeyInput(!showKeyInput);
              }}
              className="flex items-center gap-1 text-slate-600 hover:text-emerald-700 font-bold"
            >
              <Key className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {apiKey ? 'Gemini APIキー: 設定済み (変更)' : 'Gemini APIキー設定（無料）'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              className="text-emerald-700 hover:text-emerald-800 font-extrabold flex items-center gap-1 bg-white border border-emerald-300 px-2.5 py-1 rounded-xl shadow-sm transition active:scale-95"
            >
              <Play className="w-3 h-3 fill-emerald-600" />
              <span>サンプル日程表で試す</span>
            </button>
          </div>

          {/* APIキー入力フォーム */}
          {showKeyInput && (
            <form
              onSubmit={handleSaveApiKey}
              className="bg-white rounded-2xl p-3 border border-emerald-300 shadow-sm space-y-2 text-xs"
            >
              <div className="flex items-center justify-between font-extrabold text-slate-800">
                <span>Google Gemini APIキー設定</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-sky-600 hover:underline flex items-center gap-0.5"
                >
                  <span>無料でキーを取得</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] text-slate-500">
                Googleアカウントがあれば1分で無料取得できます。端末のローカル保存のみで安全に保持されます。
              </p>
              <div className="flex gap-1.5">
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3 py-1.5 rounded-xl shadow-sm"
                >
                  保存
                </button>
              </div>
            </form>
          )}

          {/* アップロードエリア */}
          <div className="bg-white rounded-2xl p-3 border-2 border-dashed border-emerald-300 flex flex-col items-center justify-center space-y-2 text-center transition hover:border-emerald-500">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="schedule-image-input"
            />
            <label
              htmlFor="schedule-image-input"
              className="cursor-pointer w-full flex flex-col items-center py-2"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1.5 shadow-inner">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-black text-slate-800">
                日程表の画像・スクショを選択 / 写真を撮る
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">
                LINEで届いた表形式の日程表・カレンダー画像など
              </span>
            </label>
          </div>

          {/* ローディング表示 */}
          {analyzing && (
            <div className="py-6 flex flex-col items-center justify-center space-y-2 bg-white/70 rounded-2xl border border-emerald-200">
              <div className="w-7 h-7 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-black text-emerald-950">
                AIが日程表から試合・予定を解析中...
              </p>
              <p className="text-[10px] text-slate-500">
                キックオフ時間・対戦相手・会場を自動抽出しています
              </p>
            </div>
          )}

          {/* エラー表示 */}
          {errorMessage && (
            <div className="bg-rose-50 text-rose-900 text-xs font-bold p-3 rounded-2xl border border-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div>{errorMessage}</div>
                {!apiKey && (
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(true)}
                    className="text-emerald-700 underline text-[11px] mt-1 font-extrabold"
                  >
                    APIキーを入力する 🔑
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 解析された予定一覧 */}
          {parsedEvents.length > 0 && (
            <div className="space-y-2.5">
              {/* 保存成功フィードバックメッセージ */}
              {saveSuccessMessage && (
                <div className="bg-emerald-600 text-white text-xs font-bold p-3 rounded-2xl shadow-md flex items-center justify-between animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-200" />
                    <span>{saveSuccessMessage}</span>
                  </div>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">保存完了</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-800 px-1">
                <span className="flex items-center gap-1">
                  <span>📅 検出された予定 ({parsedEvents.length}件)</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    タップして個別選択、または一括蓄積
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAllToSchedule}
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-[11px] px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1 transition"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>全{parsedEvents.length}件をカレンダーに蓄積</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedEvents([]);
                      setSelectedEventId(null);
                      setImagePreview(null);
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    クリア
                  </button>
                </div>
              </div>

              {/* スクロール可能なイベントカードリスト */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                {parsedEvents.map((ev) => {
                  const isSelected = selectedEventId === ev.id;
                  const isOff = ev.title === 'OFF' || ev.category === 'OFF';

                  return (
                    <div
                      key={ev.id}
                      onClick={() => !isOff && setSelectedEventId(ev.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && !isOff && setSelectedEventId(ev.id)}
                      className={`p-3 rounded-2xl border transition cursor-pointer text-left ${
                        isOff
                          ? 'bg-slate-100/70 border-slate-200 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'bg-white border-emerald-600 ring-2 ring-emerald-500 shadow-md'
                          : 'bg-white/90 hover:bg-white border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full">
                              {ev.date}
                            </span>
                            {ev.category && (
                              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md">
                                {ev.category}
                              </span>
                            )}
                            {ev.time && (
                              <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                <span>{ev.time} {ev.isKickoff ? 'KO' : ''}</span>
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-black text-slate-900 truncate">
                            {ev.title}
                          </div>

                          {ev.venue && (
                            <div className="text-[11px] font-extrabold text-emerald-700 flex items-center gap-1 mt-0.5 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">会場: {ev.venue}</span>
                            </div>
                          )}
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 選択された予定の集合時間設定＆反映パネル */}
              {selectedEvent && (
                <div className="bg-white rounded-2xl p-3.5 border-2 border-emerald-500 shadow-md space-y-3">
                  <div className="flex items-center justify-between text-xs font-black text-slate-900 pb-2 border-b border-slate-100">
                    <span className="truncate">選択中: {selectedEvent.title}</span>
                    <span className="text-emerald-700 shrink-0 ml-1">
                      {selectedEvent.date}
                    </span>
                  </div>

                  {/* 集合ルール設定 */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-black text-slate-800 mb-1.5">
                      <span>集合ルールの指定</span>
                      <span className="text-[11px] font-bold text-emerald-700">
                        {selectedEvent.time ? `${selectedEvent.time} 開始` : '時間未定'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {MEETING_PRESETS.map((p) => {
                        const active = customLeadMinutes === '' && meetingLeadMinutes === p.minutes;
                        return (
                          <button
                            key={p.minutes}
                            type="button"
                            onClick={() => {
                              setMeetingLeadMinutes(p.minutes);
                              setCustomLeadMinutes('');
                            }}
                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition ${
                              active
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {p.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 逆算された現地集合時刻サマリー */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between">
                    <div className="text-[11px] text-slate-600 font-bold">
                      <div>現地集合・到着希望時刻</div>
                      <div className="text-[10px] text-slate-400">
                        {selectedEvent.venue ? `会場: ${selectedEvent.venue}` : '会場指定なし'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-emerald-950">
                        {calculatedMeetingTime}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-extrabold">
                        {effectiveMeetingLead > 0
                          ? `(開始の${effectiveMeetingLead}分前)`
                          : '開始時刻ぴったり'}
                      </div>
                    </div>
                  </div>

                  {/* メイン計算へ反映ボタン */}
                  <button
                    type="button"
                    onClick={handleApply}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs"
                  >
                    <span>この予定で出発時刻を計算する</span>
                    <span>🚀</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
