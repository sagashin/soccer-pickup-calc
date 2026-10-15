import React, { useState, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Navigation,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Camera,
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  Share2,
  X,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  getSavedSchedules,
  saveSchedules,
  upsertSchedule,
  deleteSchedule,
  generateGoogleCalendarUrl,
  exportToIcs,
  calculateMeetingTimeFromKickoff,
  mergeImportedEvents,
  generateFamilyShareUrl,
  createLineShareUrl,
} from './scheduleStore';
import { SAMPLE_SCHEDULE_EVENTS } from './geminiScheduleParser';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const CATEGORY_OPTIONS = ['公式戦', '新人戦', '練習試合', '練習', 'その他'];

export default function ScheduleCalendarView({
  onSelectForCalculation,
  onOpenImageImporter,
}) {
  const [schedules, setSchedules] = useState(() => getSavedSchedules());
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  
  // 現在表示中のカレンダー年月
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // 選択された日付（カレンダー上で選択された日 'YYYY-MM-DD'）
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // 手動追加 / 編集モーダル
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState({
    dateIso: '',
    title: '',
    category: '公式戦',
    kickoffTime: '10:00',
    meetingTime: '08:00',
    venue: '',
    notes: '',
  });

  // 家族共有モーダル & コピーフィードバック
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // 家族共有の実行（LINE / Web Share）
  const handleShareToFamily = async () => {
    if (schedules.length === 0) {
      alert('共有する予定がありません。まずは日程を追加してください。');
      return;
    }

    const shareUrl = generateFamilyShareUrl(schedules);
    if (!shareUrl) return;

    const shareTitle = '⚽ サッカー試合日程の共有';
    const shareText = `チームの最新試合日程（${schedules.length}件）を共有したよ！\n下記のリンクを開くとアプリのカレンダーに自動反映されます。`;

    // スマホのネイティブ共有機能が使える場合
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // ネイティブ共有非対応の場合はモーダルを開く
    setIsShareModalOpen(true);
  };

  const handleCopyShareLink = async () => {
    const shareUrl = generateFamilyShareUrl(schedules);
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 3000);
    } catch (_) {
      window.prompt('以下の共有URLをコピーしてください:', shareUrl);
    }
  };

  // 再読み込み
  const reloadSchedules = useCallback(() => {
    setSchedules(getSavedSchedules());
  }, []);

  // サンプルデータを一括登録
  const handleLoadSamples = () => {
    const result = mergeImportedEvents(SAMPLE_SCHEDULE_EVENTS, 120);
    setSchedules(result.schedules);
  };

  // 予定削除
  const handleDelete = (id, title) => {
    if (window.confirm(`「${title}」の予定を削除してもよろしいですか？`)) {
      const updated = deleteSchedule(id);
      setSchedules(updated);
    }
  };

  // モーダルを開く（新規作成）
  const handleOpenNewModal = (defaultDate = '') => {
    const initialDate = defaultDate || selectedCalendarDate || new Date().toISOString().slice(0, 10);
    setEditingEvent(null);
    setFormData({
      dateIso: initialDate,
      title: '',
      category: '公式戦',
      kickoffTime: '10:00',
      meetingTime: '08:00',
      venue: '',
      notes: '',
    });
    setIsModalOpen(true);
  };

  // モーダルを開く（編集）
  const handleOpenEditModal = (event) => {
    setEditingEvent(event);
    setFormData({
      dateIso: event.dateIso,
      title: event.title,
      category: event.category || '公式戦',
      kickoffTime: event.kickoffTime || '10:00',
      meetingTime: event.meetingTime || '08:00',
      venue: event.venue || '',
      notes: event.notes || '',
    });
    setIsModalOpen(true);
  };

  // 保存処理
  const handleSaveEvent = (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.dateIso) {
      alert('タイトルと日付を入力してください');
      return;
    }

    const [y, m, d] = formData.dateIso.split('-');
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    const dayName = WEEKDAYS[dt.getDay()];
    const dateLabel = `${Number(m)}月${Number(d)}日(${dayName})`;

    const eventToSave = {
      ...(editingEvent || {}),
      dateIso: formData.dateIso,
      dateLabel,
      title: formData.title.trim(),
      category: formData.category,
      kickoffTime: formData.kickoffTime,
      meetingTime: formData.meetingTime,
      venue: formData.venue.trim(),
      notes: formData.notes.trim(),
    };

    const updated = upsertSchedule(eventToSave);
    setSchedules(updated);
    setIsModalOpen(false);
  };

  // カレンダーの日付生成
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-indexed

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0: Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];

    // 前月のはみ出し
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevM = month === 0 ? 12 : month;
      const prevY = month === 0 ? year - 1 : year;
      const iso = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateIso: iso, isCurrentMonth: false });
    }

    // 当月の日付
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateIso: iso, isCurrentMonth: true });
    }

    // 翌月のはみ出し (合計35マスまたは42マス)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = month === 11 ? 1 : month + 2;
      const nextY = month === 11 ? year + 1 : year;
      const iso = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateIso: iso, isCurrentMonth: false });
    }

    return days;
  }, [currentDate]);

  // 日付ごとのスケジュールマッピング
  const schedulesByDate = useMemo(() => {
    const map = {};
    schedules.forEach((evt) => {
      if (!map[evt.dateIso]) {
        map[evt.dateIso] = [];
      }
      map[evt.dateIso].push(evt);
    });
    return map;
  }, [schedules]);

  // 直近・未来の予定リスト
  const upcomingSchedules = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return schedules.filter((s) => s.dateIso >= todayIso);
  }, [schedules]);

  // 選択日の予定
  const selectedDaySchedules = useMemo(() => {
    return schedulesByDate[selectedCalendarDate] || [];
  }, [schedulesByDate, selectedCalendarDate]);

  return (
    <div className="space-y-4">
      {/* 🔝 トップアクションバー */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-emerald-600" />
              <span>チーム試合日程・カレンダー管理</span>
            </h2>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              細切れの連絡画像をアップして蓄積。ワンタップで出発時間を逆算
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 👨‍👩‍👦 家族に共有ボタン */}
            {schedules.length > 0 && (
              <button
                type="button"
                onClick={handleShareToFamily}
                className="bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 border border-emerald-300 font-extrabold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition shadow-sm"
                title="LINEで妻や息子にカレンダー日程を一発共有"
              >
                <Share2 className="w-4 h-4 text-emerald-600" />
                <span>👨‍👩‍👦 家族に共有</span>
              </button>
            )}

            {/* 📸 画像から追加ボタン */}
            <button
              type="button"
              onClick={onOpenImageImporter}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 transition"
            >
              <Camera className="w-4 h-4" />
              <span>画像から日程を追加</span>
            </button>

            {/* ＋ 手動追加ボタン */}
            <button
              type="button"
              onClick={() => handleOpenNewModal()}
              className="bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold text-xs px-3 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">手動追加</span>
            </button>
          </div>
        </div>

        {/* 表示切替タブ (カレンダー vs リスト) */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-black">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-1.5 rounded-lg transition ${
                viewMode === 'list'
                  ? 'bg-white text-emerald-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📋 直近の予定リスト ({schedules.length}件)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3.5 py-1.5 rounded-lg transition ${
                viewMode === 'calendar'
                  ? 'bg-white text-emerald-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📅 月間カレンダー
            </button>
          </div>

          {schedules.length === 0 && (
            <button
              type="button"
              onClick={handleLoadSamples}
              className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>サンプル日程を読み込む</span>
            </button>
          )}
        </div>
      </div>

      {/* 📅 カレンダー表示ビュー */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-4">
          {/* 月送りナビゲーション */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-900">
                {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
              </span>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {schedules.filter((s) => s.dateIso.startsWith(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`)).length}件の予定
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setCurrentDate(
                    new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
                  )
                }
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition"
                aria-label="前月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedCalendarDate(now.toISOString().slice(0, 10));
                }}
                className="px-2.5 py-1 text-xs font-extrabold text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                今月
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentDate(
                    new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
                  )
                }
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition"
                aria-label="翌月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* カレンダーグリッド */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-center py-2 text-xs font-black">
              {WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  className={
                    i === 0 ? 'text-rose-600' : i === 6 ? 'text-blue-600' : 'text-slate-600'
                  }
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* 日付セル */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {calendarDays.map((day) => {
                const dayEvents = schedulesByDate[day.dateIso] || [];
                const isSelected = selectedCalendarDate === day.dateIso;
                const isToday =
                  day.dateIso === new Date().toISOString().slice(0, 10);

                return (
                  <button
                    key={day.dateIso}
                    type="button"
                    onClick={() => setSelectedCalendarDate(day.dateIso)}
                    className={`min-h-[64px] sm:min-h-[76px] p-1.5 flex flex-col justify-between text-left transition relative ${
                      !day.isCurrentMonth
                        ? 'bg-slate-50/50 text-slate-400'
                        : 'bg-white text-slate-900'
                    } ${
                      isSelected
                        ? 'ring-2 ring-emerald-500 bg-emerald-50/40 z-10'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-black inline-flex items-center justify-center w-5 h-5 rounded-full ${
                          isToday
                            ? 'bg-emerald-600 text-white'
                            : isSelected
                            ? 'font-black text-emerald-800'
                            : ''
                        }`}
                      >
                        {day.dayNumber}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1 rounded">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* イベントインジケーター */}
                    <div className="space-y-0.5 mt-1 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => {
                        const style = CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.その他;
                        return (
                          <div
                            key={ev.id}
                            className={`text-[9px] font-extrabold truncate px-1 py-0.5 rounded leading-none border ${style.badge}`}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] font-bold text-slate-400">
                          +{dayEvents.length - 2}件
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 選択日の予定展開 */}
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {selectedCalendarDate} の予定 ({selectedDaySchedules.length}件)
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleOpenNewModal(selectedCalendarDate)}
                className="text-[11px] font-extrabold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>この日に追加</span>
              </button>
            </div>

            {selectedDaySchedules.length === 0 ? (
              <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs font-bold text-slate-500">この日の予定はありません</p>
                <button
                  type="button"
                  onClick={() => handleOpenNewModal(selectedCalendarDate)}
                  className="mt-2 text-xs font-extrabold text-emerald-600 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>予定を登録する</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {selectedDaySchedules.map((ev) => (
                  <ScheduleCard
                    key={ev.id}
                    event={ev}
                    onSelectForCalculation={onSelectForCalculation}
                    onEdit={handleOpenEditModal}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 📋 直近の予定リストビュー */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {schedules.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/80 shadow-sm space-y-4">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-3xl mx-auto flex items-center justify-center">
                <CalendarCheck className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-black text-slate-900">
                  スケジュールがまだ登録されていません
                </h3>
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                  チームの連絡網（LINEスクショやプリント写真）をアップロードすると、AIが日程・時間・会場を自動で抽出し、ここに蓄積されます。
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onOpenImageImporter}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>日程表画像をアップロードして追加</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadSamples}
                  className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-extrabold text-xs px-4 py-3 rounded-2xl border border-slate-200 flex items-center justify-center gap-1.5 transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>サンプル日程を読み込む</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {schedules.map((ev) => (
                <ScheduleCard
                  key={ev.id}
                  event={ev}
                  onSelectForCalculation={onSelectForCalculation}
                  onEdit={handleOpenEditModal}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ✏️ 手動追加・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-600" />
                <span>{editingEvent ? '予定の編集' : '新しい予定の追加'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-3.5">
              {/* 日付 */}
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  試合・移動日 *
                </label>
                <input
                  type="date"
                  required
                  value={formData.dateIso}
                  onChange={(e) => setFormData({ ...formData, dateIso: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* タイトル */}
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  試合タイトル・対戦カード *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 関東L vs ジェファ / TM ソルース"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* カテゴリ */}
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">種別</label>
                <div className="grid grid-cols-5 gap-1">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat })}
                      className={`py-1.5 rounded-lg text-xs font-extrabold border transition ${
                        formData.category === cat
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 時間 (キックオフ ＆ 集合) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">
                    キックオフ (KO)
                  </label>
                  <input
                    type="time"
                    value={formData.kickoffTime}
                    onChange={(e) => {
                      const newKo = e.target.value;
                      // キックオフから2時間前を集合のデフォルト自動算出
                      const autoMeeting = calculateMeetingTimeFromKickoff(newKo, 120);
                      setFormData({
                        ...formData,
                        kickoffTime: newKo,
                        meetingTime: autoMeeting,
                      });
                    }}
                    className="w-full h-10 px-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-emerald-800 block mb-1">
                    集合時刻 (目標到着) *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.meetingTime}
                    onChange={(e) =>
                      setFormData({ ...formData, meetingTime: e.target.value })
                    }
                    className="w-full h-10 px-2 bg-emerald-50/50 border border-emerald-300 rounded-xl text-sm font-bold text-center text-emerald-950 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 会場名 */}
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  試合会場・グラウンド名
                </label>
                <input
                  type="text"
                  placeholder="例: つくばFC T-Field / 羽生中央公園"
                  value={formData.venue}
                  onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* メモ */}
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  持ち物・ユニフォーム色・メモ
                </label>
                <textarea
                  rows={2}
                  placeholder="例: 白ユニ / 昼食持参 / 駐車台数制限2台"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-slate-600 hover:bg-slate-100 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow transition"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 👨‍👩‍👦 家族共有モーダル */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>👨‍👩‍👦 家族に試合日程を共有</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
              <div className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>ワンタップでカレンダー同期</span>
              </div>
              <p className="text-[11px] font-bold text-emerald-800 leading-relaxed">
                LINEで妻や息子にリンクを送ると、届いたリンクを開くだけで最新の日程（{schedules.length}件）が相手のスマホのカレンダーに一発反映されます！
              </p>
            </div>

            <div className="space-y-2 pt-1">
              {/* LINEで直接送る */}
              <a
                href={createLineShareUrl(generateFamilyShareUrl(schedules), schedules.length)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-black py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs"
              >
                <Share2 className="w-4 h-4" />
                <span>LINEで家族に送る</span>
              </a>

              {/* リンクをコピー */}
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold py-3 px-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition text-xs"
              >
                <Download className="w-4 h-4" />
                <span>{copyFeedback ? '✓ 共有リンクをコピーしました！' : '共有リンクをコピー'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 試合カードコンポーネント (リストおよびカレンダー展開用)
 */
function ScheduleCard({ event, onSelectForCalculation, onEdit, onDelete }) {
  const catStyle = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.その他;
  const isPast = event.dateIso < new Date().toISOString().slice(0, 10);

  return (
    <div
      className={`bg-white rounded-2xl p-3.5 border transition shadow-sm ${
        isPast ? 'opacity-70 bg-slate-50/50 border-slate-200' : 'border-slate-200/90 hover:border-emerald-300'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* 左側: 試合情報 */}
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
              {event.dateLabel || event.dateIso}
            </span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${catStyle.badge}`}
            >
              {event.category || '試合'}
            </span>
            {isPast && (
              <span className="text-[10px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">
                終了
              </span>
            )}
          </div>

          <h4 className="text-sm font-black text-slate-900 truncate">
            {event.title}
          </h4>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-600 flex-wrap">
            <div className="flex items-center gap-1 text-emerald-800 font-extrabold">
              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{event.meetingTime} 集合</span>
              {event.kickoffTime && (
                <span className="text-[11px] text-slate-500 font-bold ml-1">
                  ({event.kickoffTime} KO)
                </span>
              )}
            </div>

            {event.venue && (
              <div className="flex items-center gap-1 text-slate-700 truncate max-w-xs">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{event.venue}</span>
              </div>
            )}
          </div>

          {event.notes && (
            <p className="text-[11px] font-medium text-slate-500 line-clamp-1">
              {event.notes}
            </p>
          )}
        </div>

        {/* 右側: アクションボタン群 */}
        <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-end">
          {/* 🔥 メインCTA: 出発時間を計算 */}
          <button
            type="button"
            onClick={() => onSelectForCalculation(event)}
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs px-3.5 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 transition"
            title="目的地・日時・集合時間をセットしてルート逆算"
          >
            <Navigation className="w-3.5 h-3.5 fill-white" />
            <span>出発時間を計算</span>
          </button>

          {/* Googleカレンダー登録 */}
          <a
            href={generateGoogleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition border border-slate-200"
            title="Googleカレンダーに登録"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
          </a>

          {/* iCalダウンロード */}
          <button
            type="button"
            onClick={() => exportToIcs(event)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
            title="スマホのカレンダーに保存 (.ics)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* 編集 */}
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            title="編集"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          {/* 削除 */}
          <button
            type="button"
            onClick={() => onDelete(event.id, event.title)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
            title="削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
