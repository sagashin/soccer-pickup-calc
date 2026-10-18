import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  FileText,
  Trophy,
  MessageSquare,
  Upload,
  ClipboardPaste,
  Plus,
  Search,
  Key,
  Sparkles,
  Trash2,
  Edit2,
  ExternalLink,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Eye,
  Download,
  X,
  Loader2,
  MapPin,
  ParkingCircle,
  Link as LinkIcon,
  Share2,
  Copy,
} from 'lucide-react';
import {
  GEMINI_API_KEY_STORAGE,
  fileToBase64,
} from './geminiScheduleParser';
import {
  getVenueDocs,
  upsertVenueDoc,
  deleteVenueDoc,
  getFitnessRecords,
  upsertFitnessRecord,
  deleteFitnessRecord,
  analyzeFitnessProgress,
  getCoachNotes,
  upsertCoachNote,
  deleteCoachNote,
  loadSampleVaultData,
  saveAttachmentToIdb,
  getAttachmentFromIdb,
  parseVaultDocumentWithGemini,
} from './teamVaultStore';
import {
  getLocalDateIso,
  getShortFamilyShareUrl,
  generateFamilyShareUrl,
  createLineShareUrl,
} from './scheduleStore';
import { saveCachedCoords } from './geoUtils';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';

const VENUE_DOC_TYPES = ['すべて', '駐車場ルール', '会場マップ', '大会要項', 'チーム連絡'];
const COACH_CATEGORIES = ['すべて', '個人課題', '戦術・動き方', '自主練メニュー', '試合総評', '参考動画'];

const FITNESS_PRESETS = [
  { eventName: '30m走', unit: '秒', category: 'スピード', placeholder: '4.85' },
  { eventName: '50m走', unit: '秒', category: 'スピード', placeholder: '7.80' },
  { eventName: '20mシャトルラン', unit: '回', category: '持久力', placeholder: '85' },
  { eventName: 'リフティング', unit: '回', category: '技術・キック', placeholder: '250' },
  { eventName: 'ロングキック', unit: 'm', category: '技術・キック', placeholder: '35' },
  { eventName: '反復横跳び', unit: '回', category: 'アジリティ', placeholder: '52' },
  { eventName: '身長', unit: 'cm', category: '体格', placeholder: '152.5' },
  { eventName: '体重', unit: 'kg', category: '体格', placeholder: '42.0' },
];

const SAMPLE_PASTE_TEXTS = {
  venue: `【今週末の練習試合 会場＆駐車場連絡】
会場：羽生市中央公園 多目的広場（埼玉県羽生市）
集合時間：8:30

■ 駐車場ルール
・チーム割当は各学年5台までです。
・指定の第1駐車場をご利用ください。
・ダッシュボードに「チーム名プレート」を必ず掲示してください。
・路上での乗り降りや荷下ろしは近隣住民の迷惑になるため厳禁です。
・満車の場合は北側臨時駐車場をご利用ください。

■ 会場利用の注意事項
・アスファルト通路はスパイク歩行禁止です（必ず運動靴に履き替え）。
・応援エリアはネット外側の指定エリアのみ。
・ゴミは各自で必ず持ち帰ってください。`,
  fitness: `【秋季フィジカル測定結果】
測定日：2026-10-15
選手名：佐藤 翔太

・30m走：4.82秒
・50m走：7.65秒
・20mシャトルラン：92回
・リフティング：320回
・ロングキック：34m
・反復横跳び：54回

コメント：前回の春測定より30m走が0.2秒短縮。初速の加速が格段に良くなっています。`,
  coach: `【コーチからの試合総評と次回への課題】
日付：2026-10-18
タイトル：中盤での首振りと視野の確保について

本日のTMお疲れ様でした。全体的にパスがつながる場面が増えてきましたが、中盤でボールを受ける選手に以下の点を意識してほしいです。

1. ボールを受ける前に必ず首を左右に振って確認（敵の位置と味方の空きスペースを把握）
2. 常に半身の姿勢を作り、前を向けるファーストタッチを置く
3. 詰まったときは無理せず逆サイドへの大きなサイドチェンジを選択する

次回練習でのアクション：
・パスを受ける1秒前に首を振る癖をつける
・利き足の前に置くファーストタッチを反復練習する

参考リンク：
https://www.youtube.com/watch?v=sample-vision サッカーの首振り視野確保トレーニング`,
};


export default function TeamVaultView({
  onApplyVenueToCalc,
  initialSubTab = 'venue',
  highlightVenueName = '',
  onVaultChanged,
  refreshTrigger,
}) {
  const [subTab, setSubTab] = useState(initialSubTab);

  // 3つのデータストア
  const [venueDocs, setVenueDocs] = useState(() => getVenueDocs());
  const [fitnessRecords, setFitnessRecords] = useState(() => getFitnessRecords());
  const [coachNotes, setCoachNotes] = useState(() => getCoachNotes());

  useEffect(() => {
    setVenueDocs(getVenueDocs());
    setFitnessRecords(getFitnessRecords());
    setCoachNotes(getCoachNotes());
  }, [refreshTrigger]);

  // Gemini APIキー管理
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(GEMINI_API_KEY_STORAGE) || '');
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  // 👨‍👩‍👦 家族一括共有モーダル状態
  const [isFamilyShareModalOpen, setIsFamilyShareModalOpen] = useState(false);
  const [shareOptions, setShareOptions] = useState({
    includeSchedules: true,
    includeVenue: true,
    includeFitness: true,
    includeCoach: true,
  });
  const [isGeneratingShortUrl, setIsGeneratingShortUrl] = useState(false);
  const [shareCopyFeedback, setShareCopyFeedback] = useState(false);

  // AI解析状態
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatusMsg, setAiStatusMsg] = useState('');
  const [aiError, setAiError] = useState('');
  const fileInputRef = useRef(null);

  // フィルタ状態
  const [venueTypeFilter, setVenueTypeFilter] = useState('すべて');
  const [venueSearch, setVenueSearch] = useState('');
  const [fitnessEventFilter, setFitnessEventFilter] = useState('すべて');
  const [coachCategoryFilter, setCoachCategoryFilter] = useState('すべて');
  const [coachSearch, setCoachSearch] = useState('');

  // 添付プレビューモーダル
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 手動追加・編集モーダル状態
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);
  const [editingVenueDoc, setEditingVenueDoc] = useState(null);
  const [venueForm, setVenueForm] = useState({
    title: '',
    venueName: '',
    docType: '駐車場ルール',
    summary: '',
    parkingRules: '',
    cautionsText: '',
    dateIso: getLocalDateIso(),
  });
  const [venueAttachmentFile, setVenueAttachmentFile] = useState(null);

  const [isFitnessModalOpen, setIsFitnessModalOpen] = useState(false);
  const [editingFitness, setEditingFitness] = useState(null);
  const [fitnessForm, setFitnessForm] = useState({
    dateIso: getLocalDateIso(),
    eventName: '30m走',
    value: '',
    unit: '秒',
    category: 'スピード',
    notes: '',
  });

  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);
  const [editingCoachNote, setEditingCoachNote] = useState(null);
  const [coachForm, setCoachForm] = useState({
    dateIso: getLocalDateIso(),
    title: '',
    category: '個人課題',
    content: '',
    actionItemsText: '',
    linkTitle: '',
    linkUrl: '',
  });

  // テキスト貼付モーダル状態
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTargetMode, setPasteTargetMode] = useState('venue');
  const [pasteError, setPasteError] = useState('');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSaveApiKey = (val) => {
    setApiKey(val);
    if (val.trim()) {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, val.trim());
    } else {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    }
  };

  // サンプル一括読込
  const handleLoadSamples = () => {
    const res = loadSampleVaultData();
    setVenueDocs(res.venueDocs);
    setFitnessRecords(res.fitnessRecords);
    setCoachNotes(res.coachNotes);
    onVaultChanged?.();
    setAiError('');
    setAiStatusMsg('✨ 会場資料・体力測定・コーチ助言のサンプルデータを読み込みました！');
    setTimeout(() => setAiStatusMsg(''), 4000);
  };

  // PDF/画像 原本プレビューを開く
  const handleOpenAttachment = async (id, title) => {
    setPreviewLoading(true);
    try {
      const att = await getAttachmentFromIdb(id);
      if (!att || !att.dataUrl) {
        alert('添付ファイルのデータが見つかりませんでした（別端末で登録されたか削除された可能性があります）。');
        return;
      }
      setPreviewAttachment({
        id,
        title: title || att.fileName || '添付資料',
        dataUrl: att.dataUrl,
        mimeType: att.mimeType || 'image/jpeg',
        fileName: att.fileName || 'document',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  // PDF / 画像 AIアップロード自動解析 ＆ IndexedDB原本保存
  const handleAiFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setAiError('');
    setAiStatusMsg('');

    if (!apiKey.trim()) {
      setShowKeyConfig(true);
      setAiError('PDF・画像のAI自動解析にはGemini APIキーの設定が必要です（右上のキー設定から入力してください）。');
      return;
    }

    setAiLoading(true);
    try {
      const { base64, mimeType, previewUrl } = await fileToBase64(file);
      const parsed = await parseVaultDocumentWithGemini({
        base64,
        mimeType,
        targetMode: subTab,
        apiKey,
      });

      if (subTab === 'venue') {
        const { list, savedItem } = upsertVenueDoc({
          title: parsed.title || file.name,
          venueName: parsed.venueName || '',
          docType: parsed.docType || '駐車場ルール',
          summary: parsed.summary || '',
          parkingRules: parsed.parkingRules || '',
          cautions: Array.isArray(parsed.cautions) ? parsed.cautions : [],
          dateIso: getLocalDateIso(),
          hasAttachment: true,
          attachmentMimeType: mimeType,
          attachmentFileName: file.name,
        });
        await saveAttachmentToIdb(savedItem.id, {
          dataUrl: previewUrl,
          mimeType,
          fileName: file.name,
        });
        setVenueDocs(list);
        onVaultChanged?.();
        setAiStatusMsg(`✅ 「${savedItem.title}」をAI解析し、元のファイルと一緒に保存しました！`);
      } else if (subTab === 'fitness') {
        const extracted = Array.isArray(parsed?.records) ? parsed.records : [];
        if (extracted.length === 0) {
          throw new Error('測定記録の数値が読み取れませんでした。');
        }
        let latestList = getFitnessRecords();
        for (let i = 0; i < extracted.length; i++) {
          const rec = extracted[i];
          const { list, savedItem } = upsertFitnessRecord({
            dateIso: rec.dateIso || getLocalDateIso(),
            eventName: rec.eventName || '測定記録',
            value: rec.value,
            unit: rec.unit || '秒',
            category: rec.category || 'スピード',
            notes: rec.notes || `AI読取 (${file.name})`,
            hasAttachment: i === 0,
          });
          latestList = list;
          if (i === 0) {
            await saveAttachmentToIdb(savedItem.id, {
              dataUrl: previewUrl,
              mimeType,
              fileName: file.name,
            });
          }
        }
        setFitnessRecords(latestList);
        onVaultChanged?.();
        setAiStatusMsg(`✅ 体力測定の記録（${extracted.length}件）をAI抽出し、成長記録に追加しました！`);
      } else {
        const { list, savedItem } = upsertCoachNote({
          dateIso: getLocalDateIso(),
          title: parsed.title || file.name,
          category: parsed.category || '個人課題',
          content: parsed.content || '',
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          links: Array.isArray(parsed.links) ? parsed.links : [],
          hasAttachment: true,
          attachmentMimeType: mimeType,
        });
        await saveAttachmentToIdb(savedItem.id, {
          dataUrl: previewUrl,
          mimeType,
          fileName: file.name,
        });
        setCoachNotes(list);
        onVaultChanged?.();
        setAiStatusMsg(`✅ コーチ助言「${savedItem.title}」をAI要約して保存しました！`);
      }
    } catch (err) {
      setAiError(err.message || 'AI解析中にエラーが発生しました。');
    } finally {
      setAiLoading(false);
    }
  };

  // ==================== テキスト貼付AI解析 ＆ 手動転記ハンドラ ====================
  const handleOpenPasteModal = (mode = subTab) => {
    setPasteTargetMode(mode);
    setPasteText('');
    setPasteError('');
    setIsPasteModalOpen(true);
  };

  const handleProcessPastedText = async () => {
    if (!pasteText.trim()) {
      setPasteError('解析するテキストを入力または貼り付けてください。');
      return;
    }
    if (!apiKey.trim()) {
      setShowKeyConfig(true);
      setPasteError('テキストのAI自動解析にはGemini APIキーの設定が必要です（右上のキー設定から入力してください）。');
      return;
    }

    setPasteError('');
    setAiLoading(true);
    try {
      const parsed = await parseVaultDocumentWithGemini({
        text: pasteText.trim(),
        targetMode: pasteTargetMode,
        apiKey,
      });

      if (pasteTargetMode === 'venue') {
        const { list, savedItem } = upsertVenueDoc({
          title: parsed.title || '会場・駐車場案内',
          venueName: parsed.venueName || '',
          docType: parsed.docType || '駐車場ルール',
          summary: parsed.summary || '',
          parkingRules: parsed.parkingRules || '',
          cautions: Array.isArray(parsed.cautions) ? parsed.cautions : [],
          dateIso: getLocalDateIso(),
          hasAttachment: false,
        });
        setVenueDocs(list);
        onVaultChanged?.();
        setAiStatusMsg(`✅ 「${savedItem.title}」をテキストからAI解析・登録しました！`);
      } else if (pasteTargetMode === 'fitness') {
        const extracted = Array.isArray(parsed?.records) ? parsed.records : [];
        if (extracted.length === 0) {
          throw new Error('テキストから測定記録の数値を抽出できませんでした。手動フォームへの転記をお試しください。');
        }
        let latestList = getFitnessRecords();
        for (let i = 0; i < extracted.length; i++) {
          const rec = extracted[i];
          const { list } = upsertFitnessRecord({
            dateIso: rec.dateIso || getLocalDateIso(),
            eventName: rec.eventName || '測定記録',
            value: rec.value,
            unit: rec.unit || '秒',
            category: rec.category || 'スピード',
            notes: rec.notes || 'テキストAI解析登録',
            hasAttachment: false,
          });
          latestList = list;
        }
        setFitnessRecords(latestList);
        onVaultChanged?.();
        setAiStatusMsg(`✅ 体力測定の記録（${extracted.length}件）をテキストからAI抽出し、登録しました！`);
      } else {
        const { list, savedItem } = upsertCoachNote({
          dateIso: getLocalDateIso(),
          title: parsed.title || 'コーチからの助言',
          category: parsed.category || '個人課題',
          content: parsed.content || '',
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          links: Array.isArray(parsed.links) ? parsed.links : [],
          hasAttachment: false,
        });
        setCoachNotes(list);
        onVaultChanged?.();
        setAiStatusMsg(`✅ コーチ助言「${savedItem.title}」をテキストからAI要約・登録しました！`);
      }

      setIsPasteModalOpen(false);
      setPasteText('');
      setSubTab(pasteTargetMode);
    } catch (err) {
      setPasteError(err.message || 'AI解析中にエラーが発生しました。');
    } finally {
      setAiLoading(false);
    }
  };

  const handleTransferPasteToManual = () => {
    if (!pasteText.trim()) {
      setPasteError('転記するテキストが空です。');
      return;
    }
    const lines = pasteText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || '';

    setIsPasteModalOpen(false);

    if (pasteTargetMode === 'venue') {
      setEditingVenueDoc(null);
      setVenueAttachmentFile(null);
      setVenueForm({
        title: firstLine.slice(0, 30) || '会場連絡',
        venueName: '',
        docType: '駐車場ルール',
        summary: lines.slice(0, 2).join(' '),
        parkingRules: pasteText.trim(),
        cautionsText: '',
        dateIso: getLocalDateIso(),
      });
      setIsVenueModalOpen(true);
    } else if (pasteTargetMode === 'fitness') {
      setEditingFitness(null);
      setFitnessForm({
        dateIso: getLocalDateIso(),
        eventName: '30m走',
        value: '',
        unit: '秒',
        category: 'スピード',
        notes: pasteText.trim(),
      });
      setIsFitnessModalOpen(true);
    } else {
      setEditingCoachNote(null);
      setCoachForm({
        dateIso: getLocalDateIso(),
        title: firstLine.slice(0, 30) || 'コーチからの助言',
        category: '個人課題',
        content: pasteText.trim(),
        actionItemsText: '',
        linkTitle: '',
        linkUrl: '',
      });
      setIsCoachModalOpen(true);
    }
    setSubTab(pasteTargetMode);
  };

  // ==================== 1. 会場資料フィルタ＆ハンドラ ====================
  const filteredVenueDocs = useMemo(() => {
    return venueDocs.filter((doc) => {
      if (venueTypeFilter !== 'すべて' && doc.docType !== venueTypeFilter) return false;
      if (venueSearch.trim()) {
        const q = venueSearch.trim().toLowerCase();
        const hay = `${doc.title} ${doc.venueName} ${doc.summary} ${doc.parkingRules} ${(doc.cautions || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [venueDocs, venueTypeFilter, venueSearch]);

  const handleOpenVenueModal = (doc = null) => {
    setVenueAttachmentFile(null);
    if (doc) {
      setEditingVenueDoc(doc);
      setVenueForm({
        title: doc.title || '',
        venueName: doc.venueName || '',
        docType: doc.docType || '駐車場ルール',
        summary: doc.summary || '',
        parkingRules: doc.parkingRules || '',
        cautionsText: (doc.cautions || []).join('\n'),
        dateIso: doc.dateIso || getLocalDateIso(),
      });
    } else {
      setEditingVenueDoc(null);
      setVenueForm({
        title: '',
        venueName: highlightVenueName || '',
        docType: '駐車場ルール',
        summary: '',
        parkingRules: '',
        cautionsText: '',
        dateIso: getLocalDateIso(),
      });
    }
    setIsVenueModalOpen(true);
  };

  const handleSaveVenueModal = async (e) => {
    e.preventDefault();
    if (!venueForm.title.trim() && !venueForm.venueName.trim()) {
      alert('タイトルまたは会場名を入力してください');
      return;
    }

    let hasAtt = editingVenueDoc?.hasAttachment || false;
    let attMime = editingVenueDoc?.attachmentMimeType || '';
    let attName = editingVenueDoc?.attachmentFileName || '';
    let attDataUrl = null;

    if (venueAttachmentFile) {
      try {
        const converted = await fileToBase64(venueAttachmentFile);
        hasAtt = true;
        attMime = converted.mimeType;
        attName = venueAttachmentFile.name;
        attDataUrl = converted.previewUrl;
      } catch (_) {}
    }

    const cautions = venueForm.cautionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const { list, savedItem } = upsertVenueDoc({
      ...(editingVenueDoc || {}),
      title: venueForm.title.trim() || `${venueForm.venueName.trim()} 案内資料`,
      venueName: venueForm.venueName.trim(),
      docType: venueForm.docType,
      summary: venueForm.summary.trim(),
      parkingRules: venueForm.parkingRules.trim(),
      cautions,
      dateIso: venueForm.dateIso,
      hasAttachment: hasAtt,
      attachmentMimeType: attMime,
      attachmentFileName: attName,
    });

    if (attDataUrl) {
      await saveAttachmentToIdb(savedItem.id, {
        dataUrl: attDataUrl,
        mimeType: attMime,
        fileName: attName,
      });
    }

    setVenueDocs(list);
    onVaultChanged?.();
    setIsVenueModalOpen(false);
  };

  const handleDeleteVenue = (id, title) => {
    if (window.confirm(`「${title}」を削除してもよろしいですか？`)) {
      setVenueDocs(deleteVenueDoc(id));
      onVaultChanged?.();
    }
  };

  // ==================== 2. 体力測定フィルタ＆成長分析 ====================
  const analyzedFitness = useMemo(() => {
    return analyzeFitnessProgress(fitnessRecords);
  }, [fitnessRecords]);

  const fitnessEventNames = useMemo(() => {
    const names = new Set();
    fitnessRecords.forEach((r) => {
      if (r.eventName) names.add(r.eventName);
    });
    return ['すべて', ...Array.from(names)];
  }, [fitnessRecords]);

  const filteredFitness = useMemo(() => {
    if (fitnessEventFilter === 'すべて') return analyzedFitness;
    return analyzedFitness.filter((r) => r.eventName === fitnessEventFilter);
  }, [analyzedFitness, fitnessEventFilter]);

  // 特定種目選択時の成長サマリー（自己ベスト・初回からの成長幅・時系列推移）
  const selectedEventSummary = useMemo(() => {
    if (fitnessEventFilter === 'すべて' || filteredFitness.length === 0) return null;
    const chronological = [...filteredFitness].sort((a, b) =>
      (a.dateIso || '').localeCompare(b.dateIso || '')
    );
    const first = chronological[0];
    const latest = chronological[chronological.length - 1];
    const pbRecord = chronological.find((r) => r.isPersonalBest) || latest;
    const isTimeBased = (first.unit || '').includes('秒');
    const totalDiff = Number((latest.value - first.value).toFixed(2));

    const vals = chronological.map((r) => Number(r.value));
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);

    return {
      eventName: fitnessEventFilter,
      unit: first.unit,
      isTimeBased,
      pbValue: pbRecord.value,
      pbDate: pbRecord.dateIso,
      firstValue: first.value,
      latestValue: latest.value,
      totalDiff,
      chronological,
      minVal,
      maxVal,
    };
  }, [fitnessEventFilter, filteredFitness]);

  const handleOpenFitnessModal = (rec = null) => {
    if (rec) {
      setEditingFitness(rec);
      setFitnessForm({
        dateIso: rec.dateIso || getLocalDateIso(),
        eventName: rec.eventName || '30m走',
        value: String(rec.value ?? ''),
        unit: rec.unit || '秒',
        category: rec.category || 'スピード',
        notes: rec.notes || '',
      });
    } else {
      setEditingFitness(null);
      const defaultEvent = fitnessEventFilter !== 'すべて' ? fitnessEventFilter : '30m走';
      const preset = FITNESS_PRESETS.find((p) => p.eventName === defaultEvent) || FITNESS_PRESETS[0];
      setFitnessForm({
        dateIso: getLocalDateIso(),
        eventName: preset.eventName,
        value: '',
        unit: preset.unit,
        category: preset.category,
        notes: '',
      });
    }
    setIsFitnessModalOpen(true);
  };

  const handleSaveFitnessModal = (e) => {
    e.preventDefault();
    if (!fitnessForm.eventName.trim() || fitnessForm.value === '') {
      alert('種目名と測定値を入力してください');
      return;
    }
    const { list } = upsertFitnessRecord({
      ...(editingFitness || {}),
      dateIso: fitnessForm.dateIso,
      eventName: fitnessForm.eventName.trim(),
      value: parseFloat(fitnessForm.value),
      unit: fitnessForm.unit.trim() || '秒',
      category: fitnessForm.category,
      notes: fitnessForm.notes.trim(),
    });
    setFitnessRecords(list);
    onVaultChanged?.();
    setIsFitnessModalOpen(false);
  };

  const handleDeleteFitness = (id, label) => {
    if (window.confirm(`「${label}」の記録を削除してもよろしいですか？`)) {
      setFitnessRecords(deleteFitnessRecord(id));
      onVaultChanged?.();
    }
  };

  // ==================== 3. コーチ助言フィルタ＆ハンドラ ====================
  const filteredCoachNotes = useMemo(() => {
    return coachNotes.filter((note) => {
      if (coachCategoryFilter !== 'すべて' && note.category !== coachCategoryFilter) return false;
      if (coachSearch.trim()) {
        const q = coachSearch.trim().toLowerCase();
        const hay = `${note.title} ${note.content} ${(note.actionItems || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [coachNotes, coachCategoryFilter, coachSearch]);

  const handleOpenCoachModal = (note = null) => {
    if (note) {
      setEditingCoachNote(note);
      setCoachForm({
        dateIso: note.dateIso || getLocalDateIso(),
        title: note.title || '',
        category: note.category || '個人課題',
        content: note.content || '',
        actionItemsText: (note.actionItems || []).join('\n'),
        linkTitle: note.links?.[0]?.title || '',
        linkUrl: note.links?.[0]?.url || '',
      });
    } else {
      setEditingCoachNote(null);
      setCoachForm({
        dateIso: getLocalDateIso(),
        title: '',
        category: '個人課題',
        content: '',
        actionItemsText: '',
        linkTitle: '',
        linkUrl: '',
      });
    }
    setIsCoachModalOpen(true);
  };

  const handleSaveCoachModal = (e) => {
    e.preventDefault();
    if (!coachForm.title.trim() && !coachForm.content.trim()) {
      alert('タイトルまたはアドバイス内容を入力してください');
      return;
    }
    const actionItems = coachForm.actionItemsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const links = coachForm.linkUrl.trim()
      ? [{ title: coachForm.linkTitle.trim() || coachForm.linkUrl.trim(), url: coachForm.linkUrl.trim() }]
      : editingCoachNote?.links || [];

    const { list } = upsertCoachNote({
      ...(editingCoachNote || {}),
      dateIso: coachForm.dateIso,
      title: coachForm.title.trim() || 'コーチのアドバイス',
      category: coachForm.category,
      content: coachForm.content.trim(),
      actionItems,
      links,
    });
    setCoachNotes(list);
    onVaultChanged?.();
    setIsCoachModalOpen(false);
  };

  const handleDeleteCoachNote = (id, title) => {
    if (window.confirm(`「${title}」を削除してもよろしいですか？`)) {
      setCoachNotes(deleteCoachNote(id));
      onVaultChanged?.();
    }
  };

  // ==================== 4. 家族LINE共有ハンドラ ====================
  const handleSendAllToLine = async () => {
    setIsGeneratingShortUrl(true);
    try {
      const shortUrl = await getShortFamilyShareUrl(null, shareOptions);
      const targetUrl = shortUrl || generateFamilyShareUrl(null, shareOptions);
      if (!targetUrl) return;

      const parts = [];
      if (shareOptions.includeSchedules) parts.push('試合日程');
      if (shareOptions.includeVenue && venueDocs.length > 0) parts.push(`会場ルール${venueDocs.length}件`);
      if (shareOptions.includeFitness && fitnessRecords.length > 0) parts.push(`体力測定${fitnessRecords.length}件`);
      if (shareOptions.includeCoach && coachNotes.length > 0) parts.push(`コーチ助言${coachNotes.length}件`);
      const summaryText = parts.join('・') || 'チームノート';

      const lineUrl = createLineShareUrl(targetUrl, summaryText);
      window.location.href = lineUrl;
    } catch (e) {
      console.warn('Failed to share to line:', e);
    } finally {
      setIsGeneratingShortUrl(false);
    }
  };

  const handleCopyAllShareLink = async () => {
    setIsGeneratingShortUrl(true);
    try {
      const shortUrl = await getShortFamilyShareUrl(null, shareOptions);
      const targetUrl = shortUrl || generateFamilyShareUrl(null, shareOptions);
      if (!targetUrl) return;
      await navigator.clipboard.writeText(targetUrl);
      setShareCopyFeedback(true);
      setTimeout(() => setShareCopyFeedback(false), 3000);
    } catch (_) {
    } finally {
      setIsGeneratingShortUrl(false);
    }
  };

  const handleShareSingleVenue = (doc) => {
    const cautions = (doc.cautions || []).map((c) => `・${c}`).join('\n');
    const msg = `🏟️【会場・駐車場案内】${doc.title || doc.venueName}\n会場名：${doc.venueName || '未設定'}\n\n■ 🅿️ 駐車場ルール\n${doc.parkingRules || '特になし'}\n\n■ ⚠️ 注意事項\n${cautions || '特になし'}`;
    const enc = encodeURIComponent(msg);
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `line://msg/text/${enc}`;
    } else {
      window.open(`https://line.me/R/share?text=${enc}`, '_blank');
    }
  };

  const handleShareSingleFitness = (rec) => {
    const pbText = rec.isPersonalBest ? ' 🏆自己ベスト更新！' : '';
    const diffText = rec.diffFromPrev ? ` (前回比: ${rec.diffFromPrev > 0 ? `+${rec.diffFromPrev}` : rec.diffFromPrev}${rec.unit})` : '';
    const msg = `⚡【体力測定記録】${rec.eventName}\n測定日：${rec.dateIso}\n記録：${rec.value}${rec.unit}${pbText}${diffText}\nメモ：${rec.notes || 'なし'}`;
    const enc = encodeURIComponent(msg);
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `line://msg/text/${enc}`;
    } else {
      window.open(`https://line.me/R/share?text=${enc}`, '_blank');
    }
  };

  const handleShareSingleCoach = (note) => {
    const actions = (note.actionItems || []).map((a) => `・${a}`).join('\n');
    const linkText = note.links?.[0]?.url ? `\n🔗 参考URL: ${note.links[0].url}` : '';
    const msg = `💬【コーチ助言】${note.title}\n日付：${note.dateIso} (${note.category})\n\n■ 指導内容\n${note.content || 'なし'}\n\n■ 🎯 意識するアクション\n${actions || 'なし'}${linkText}`;
    const enc = encodeURIComponent(msg);
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `line://msg/text/${enc}`;
    } else {
      window.open(`https://line.me/R/share?text=${enc}`, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      {/* 🔝 ヘッダー ＆ サブタブ切り替え */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              <span>📚 チームノート（会場資料・体力測定・助言）</span>
            </h2>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              駐車場案内PDF、フィジカル測定結果、コーチからの助言をAIで一元蓄積
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsFamilyShareModalOpen(true)}
              className="text-xs font-black text-white bg-[#06C755] hover:bg-[#05b34c] px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>👨‍👩‍👦 家族にLINE共有</span>
            </button>
            <button
              type="button"
              onClick={handleLoadSamples}
              className="text-xs font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-1 transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>✨ サンプル読込</span>
            </button>
            <button
              type="button"
              onClick={() => setShowKeyConfig((v) => !v)}
              className={`text-xs font-extrabold px-3 py-2 rounded-xl border flex items-center gap-1 transition ${
                apiKey.trim()
                  ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>{apiKey.trim() ? 'AIキー設定済' : '🔑 Gemini APIキー設定'}</span>
            </button>
          </div>
        </div>

        {/* Gemini APIキー設定パネル */}
        {showKeyConfig && (
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-700">
                Google Gemini APIキー（日程表解析と共通・ブラウザ内のみ保存）
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <span>無料キーを取得</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowKeyConfig(false)}
                className="bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* 3つのサブタブ */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setSubTab('venue')}
            className={`py-2.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              subTab === 'venue'
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">🏟️ 会場・駐車場 ({venueDocs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('fitness')}
            className={`py-2.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              subTab === 'fitness'
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">⚡ 体力測定 ({fitnessRecords.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('coach')}
            className={`py-2.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              subTab === 'coach'
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="truncate">💬 コーチ助言 ({coachNotes.length})</span>
          </button>
        </div>

        {/* 📄 PDF / 画像 / テキスト スマートAI取込バー */}
        <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-sky-50/80 border border-emerald-200/90 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {subTab === 'venue' && '会場案内PDF・駐車場マップ画像・連絡テキストをAI自動要約'}
                {subTab === 'fitness' && '体力測定の表（PDF・写真・連絡文）から全種目をAI一括登録'}
                {subTab === 'coach' && 'コーチのプリント・写真・アドバイス文をAI要約＆蓄積'}
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-600">
              Gemini 3.8 Flash対応。ファイル読取のほか、LINEなどの連絡文をテキスト貼り付けして即時登録も可能です
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => handleOpenPasteModal(subTab)}
              className="w-full sm:w-auto bg-white hover:bg-emerald-50 active:scale-95 border border-emerald-300 text-emerald-900 font-black text-xs px-3.5 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition"
            >
              <ClipboardPaste className="w-4 h-4 text-emerald-600" />
              <span>テキスト貼付</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleAiFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>AI解析中...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>PDF / 画像取込</span>
                </>
              )}
            </button>
          </div>
        </div>

        {aiStatusMsg && (
          <div className="bg-emerald-600 text-white text-xs font-extrabold px-3.5 py-2.5 rounded-xl flex items-center justify-between">
            <span>{aiStatusMsg}</span>
            <button type="button" onClick={() => setAiStatusMsg('')} className="text-white/80 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {aiError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">{aiError}</div>
            <button type="button" onClick={() => setAiError('')} className="text-rose-500 font-bold">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ==================== サブタブ1: 🏟️ 会場・駐車場資料 ==================== */}
      {subTab === 'venue' && (
        <div className="space-y-3">
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {VENUE_DOC_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVenueTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      venueTypeFilter === t
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleOpenVenueModal()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>会場ルールを手動登録</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                placeholder="会場名・駐車ルール・注意事項で検索..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {filteredVenueDocs.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-dashed border-slate-300 space-y-2">
              <p className="text-xs font-bold text-slate-500">該当する会場・駐車場資料がありません</p>
              <button
                type="button"
                onClick={() => handleOpenVenueModal()}
                className="text-xs font-extrabold text-emerald-700 hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>最初の会場ルールを追加する</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVenueDocs.map((doc) => {
                const isHighlighted =
                  highlightVenueName &&
                  doc.venueName &&
                  (highlightVenueName.includes(doc.venueName) ||
                    doc.venueName.includes(highlightVenueName));
                return (
                  <div
                    key={doc.id}
                    className={`bg-white rounded-3xl p-4 shadow-sm border transition space-y-3 ${
                      isHighlighted
                        ? 'border-2 border-emerald-500 ring-2 ring-emerald-500/15'
                        : 'border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200">
                            {doc.docType}
                          </span>
                          {doc.venueName && (
                            <span className="text-[11px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-emerald-600" />
                              {doc.venueName}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">{doc.dateIso}</span>
                        </div>
                        <h3 className="text-sm font-black text-slate-900">{doc.title}</h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenVenueModal(doc)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVenue(doc.id, doc.title)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {doc.summary && (
                      <p className="text-xs font-bold text-slate-600 leading-relaxed">{doc.summary}</p>
                    )}

                    {doc.parkingRules && (
                      <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 space-y-1">
                        <div className="text-[11px] font-black text-amber-950 flex items-center gap-1.5">
                          <ParkingCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>🅿️ 駐車場・乗降ルール</span>
                        </div>
                        <p className="text-xs font-bold text-amber-900 leading-relaxed">
                          {doc.parkingRules}
                        </p>
                      </div>
                    )}

                    {doc.cautions && doc.cautions.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-1.5">
                        <div className="text-[11px] font-black text-slate-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          <span>⚠️ 会場での注意事項</span>
                        </div>
                        <ul className="space-y-1">
                          {doc.cautions.map((c, idx) => (
                            <li key={idx} className="text-xs font-bold text-slate-700 flex items-start gap-1.5">
                              <span className="text-emerald-600 font-black">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleShareSingleVenue(doc)}
                        className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95"
                      >
                        <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>LINEで送る</span>
                      </button>
                      {doc.hasAttachment && (
                        <button
                          type="button"
                          disabled={previewLoading}
                          onClick={() => handleOpenAttachment(doc.id, doc.title)}
                          className="text-xs font-extrabold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-sky-600" />
                          <span>📄 元のPDF/画像を開く</span>
                        </button>
                      )}
                      {onApplyVenueToCalc && (doc.venueName || doc.title) && (
                        <button
                          type="button"
                          onClick={() => onApplyVenueToCalc(doc.venueName || doc.title)}
                          className="text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition active:scale-95"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>🚀 この会場で出発時間を逆算</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== サブタブ2: ⚡ 体力測定・記録 ==================== */}
      {subTab === 'fitness' && (
        <div className="space-y-3">
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {fitnessEventNames.map((evName) => (
                  <button
                    key={evName}
                    type="button"
                    onClick={() => setFitnessEventFilter(evName)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      fitnessEventFilter === evName
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {evName}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleOpenFitnessModal()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>測定記録を追加</span>
              </button>
            </div>
          </div>

          {/* 特定種目フィルタ時の成長推移サマリーカード */}
          {selectedEventSummary && (
            <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 text-white rounded-3xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-black">
                    {selectedEventSummary.eventName} の成長推移サマリー
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-emerald-200">
                  計 {selectedEventSummary.chronological.length} 回測定
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/10 rounded-2xl p-2.5">
                  <div className="text-[10px] font-bold text-emerald-200">🏆 自己ベスト (PB)</div>
                  <div className="text-lg font-black text-amber-300">
                    {selectedEventSummary.pbValue}
                    <span className="text-xs ml-0.5">{selectedEventSummary.unit}</span>
                  </div>
                  <div className="text-[10px] text-white/70">{selectedEventSummary.pbDate}</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-2.5">
                  <div className="text-[10px] font-bold text-emerald-200">📍 最新記録</div>
                  <div className="text-lg font-black text-white">
                    {selectedEventSummary.latestValue}
                    <span className="text-xs ml-0.5">{selectedEventSummary.unit}</span>
                  </div>
                  <div className="text-[10px] text-white/70">初回: {selectedEventSummary.firstValue}{selectedEventSummary.unit}</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-2.5">
                  <div className="text-[10px] font-bold text-emerald-200">📈 初回からの成長幅</div>
                  <div className="text-lg font-black text-emerald-300">
                    {selectedEventSummary.totalDiff > 0
                      ? `+${selectedEventSummary.totalDiff}`
                      : selectedEventSummary.totalDiff}
                    <span className="text-xs ml-0.5">{selectedEventSummary.unit}</span>
                  </div>
                  <div className="text-[10px] text-white/70">
                    {selectedEventSummary.isTimeBased
                      ? selectedEventSummary.totalDiff < 0
                        ? 'タイム短縮！'
                        : '継続計測中'
                      : selectedEventSummary.totalDiff > 0
                      ? '記録伸長！'
                      : '継続計測中'}
                  </div>
                </div>
              </div>

              {/* 時系列推移バー表示 */}
              <div className="bg-white/10 rounded-2xl p-3 space-y-2">
                <div className="text-[11px] font-extrabold text-emerald-200">時系列推移</div>
                <div className="space-y-1.5">
                  {selectedEventSummary.chronological.map((rec) => {
                    const span = Math.max(0.01, selectedEventSummary.maxVal - selectedEventSummary.minVal);
                    // 秒数系は小さいほどバーが伸びる、回数系は大きいほどバーが伸びる
                    const ratio = selectedEventSummary.isTimeBased
                      ? (selectedEventSummary.maxVal - rec.value) / span
                      : (rec.value - selectedEventSummary.minVal) / span;
                    const widthPct = Math.round(35 + ratio * 65);
                    return (
                      <div key={rec.id} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-[11px] font-mono text-white/80 shrink-0">
                          {rec.dateIso}
                        </span>
                        <div className="flex-1 bg-white/10 rounded-lg h-5 overflow-hidden flex items-center">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className={`h-full rounded-lg flex items-center justify-end pr-2 text-[11px] font-black transition-all ${
                              rec.isPersonalBest
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-emerald-500/80 text-white'
                            }`}
                          >
                            {rec.value}
                            {rec.unit}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 記録カード一覧 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredFitness.map((rec) => {
              const isImproved =
                rec.diffFromPrev !== null &&
                (rec.isTimeBased ? rec.diffFromPrev < 0 : rec.diffFromPrev > 0);
              return (
                <div
                  key={rec.id}
                  className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/90 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          {rec.category || 'フィジカル'}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">{rec.dateIso}</span>
                        {rec.isPersonalBest && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                            🏆 自己ベスト (PB)
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-black text-slate-900 mt-1">{rec.eventName}</h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleShareSingleFitness(rec)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition"
                        title="LINEで送る"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenFitnessModal(rec)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFitness(rec.id, `${rec.dateIso} ${rec.eventName}`)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-900">{rec.value}</span>
                      <span className="text-xs font-extrabold text-slate-500">{rec.unit}</span>
                    </div>

                    {rec.diffFromPrev !== null && rec.diffFromPrev !== 0 && (
                      <span
                        className={`text-xs font-black px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                          isImproved
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>
                          前回比 {rec.diffFromPrev > 0 ? `+${rec.diffFromPrev}` : rec.diffFromPrev}
                          {rec.unit}
                        </span>
                      </span>
                    )}
                  </div>

                  {rec.notes && (
                    <p className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-xl">
                      📝 {rec.notes}
                    </p>
                  )}

                  {rec.hasAttachment && (
                    <button
                      type="button"
                      onClick={() => handleOpenAttachment(rec.id, `${rec.eventName} 測定表`)}
                      className="text-[11px] font-extrabold text-sky-700 hover:underline flex items-center gap-1 pt-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>📄 元の測定表ファイルを見る</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== サブタブ3: 💬 コーチ助言・リンク ==================== */}
      {subTab === 'coach' && (
        <div className="space-y-3">
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {COACH_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCoachCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      coachCategoryFilter === cat
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleOpenCoachModal()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>助言・リンクを追加</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={coachSearch}
                onChange={(e) => setCoachSearch(e.target.value)}
                placeholder="キーワード（例: 首振り、トラップ、補食）で検索..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredCoachNotes.map((note) => (
              <div
                key={note.id}
                className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/90 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 border border-sky-200">
                        {note.category}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{note.dateIso}</span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900 mt-1">{note.title}</h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenCoachModal(note)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCoachNote(note.id, note.title)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {note.content && (
                  <p className="text-xs font-bold text-slate-700 leading-relaxed whitespace-pre-line">
                    {note.content}
                  </p>
                )}

                {note.actionItems && note.actionItems.length > 0 && (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 space-y-1.5">
                    <div className="text-[11px] font-black text-emerald-950 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>🎯 意識するアクションポイント</span>
                    </div>
                    <ul className="space-y-1">
                      {note.actionItems.map((act, idx) => (
                        <li key={idx} className="text-xs font-extrabold text-emerald-900 flex items-start gap-1.5">
                          <span>✓</span>
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    {note.links?.map((lk, idx) => (
                      <a
                        key={idx}
                        href={lk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-black text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition"
                      >
                        <LinkIcon className="w-3.5 h-3.5 text-sky-600" />
                        <span>{lk.title || '参考リンク'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                    {note.hasAttachment && (
                      <button
                        type="button"
                        onClick={() => handleOpenAttachment(note.id, note.title)}
                        className="text-xs font-extrabold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>📄 元のプリント/画像</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleShareSingleCoach(note)}
                    className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition active:scale-95 ml-auto"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>LINEで送る</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== 会場資料 追加・編集モーダル ==================== */}
      {isVenueModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editingVenueDoc ? '会場・駐車場資料を編集' : '会場・駐車場資料を登録'}
              </h3>
              <button
                type="button"
                onClick={() => setIsVenueModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVenueModal} className="space-y-3">
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  会場・グラウンド名 *
                </label>
                <PlaceAutocompleteInput
                  id="vault-venue-name-input"
                  value={venueForm.venueName}
                  onChange={(val) => setVenueForm({ ...venueForm, venueName: val })}
                  onSelectSuggestion={(item) => {
                    const vName = item.title || item.fullQuery;
                    setVenueForm({
                      ...venueForm,
                      venueName: vName,
                      title: venueForm.title || `${vName} 駐車場・会場ルール`,
                    });
                    if (item.lat && item.lon) {
                      saveCachedCoords(vName, { lat: item.lat, lon: item.lon });
                    }
                  }}
                  placeholder="例: 羽生市中央公園 / つくばFC T-Field"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                  ringColorClass="focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">種別</label>
                  <select
                    value={venueForm.docType}
                    onChange={(e) => setVenueForm({ ...venueForm, docType: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {VENUE_DOC_TYPES.filter((t) => t !== 'すべて').map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">登録日</label>
                  <input
                    type="date"
                    value={venueForm.dateIso}
                    onChange={(e) => setVenueForm({ ...venueForm, dateIso: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">タイトル</label>
                <input
                  type="text"
                  value={venueForm.title}
                  onChange={(e) => setVenueForm({ ...venueForm, title: e.target.value })}
                  placeholder="例: 羽生市中央公園 駐車場・搬入ルール"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-amber-800 block mb-1">
                  🅿️ 駐車場ルール・台数制限・指定場所
                </label>
                <textarea
                  rows={2}
                  value={venueForm.parkingRules}
                  onChange={(e) => setVenueForm({ ...venueForm, parkingRules: e.target.value })}
                  placeholder="例: チーム5台まで。満車時は北側臨時Pへ。会場前路上乗降は厳禁。"
                  className="w-full p-2.5 bg-amber-50/50 border border-amber-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  ⚠️ 注意事項（1行に1項目）
                </label>
                <textarea
                  rows={2}
                  value={venueForm.cautionsText}
                  onChange={(e) => setVenueForm({ ...venueForm, cautionsText: e.target.value })}
                  placeholder={'スパイクでのアスファルト歩行禁止\nゴミは各自持ち帰り'}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">
                  📄 案内PDF・マップ画像の添付（任意）
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setVenueAttachmentFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVenueModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2 rounded-xl shadow"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== 体力測定 追加・編集モーダル ==================== */}
      {isFitnessModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editingFitness ? '体力測定記録を編集' : '⚡ 体力測定記録を追加'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFitnessModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* よく使う種目のワンタップ選択チップ */}
            <div>
              <div className="text-[11px] font-bold text-slate-500 mb-1.5">
                よく使う測定種目をワンタップ選択:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FITNESS_PRESETS.map((p) => (
                  <button
                    key={p.eventName}
                    type="button"
                    onClick={() =>
                      setFitnessForm({
                        ...fitnessForm,
                        eventName: p.eventName,
                        unit: p.unit,
                        category: p.category,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border transition ${
                      fitnessForm.eventName === p.eventName
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.eventName} ({p.unit})
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveFitnessModal} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">測定日</label>
                  <input
                    type="date"
                    required
                    value={fitnessForm.dateIso}
                    onChange={(e) => setFitnessForm({ ...fitnessForm, dateIso: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">カテゴリ</label>
                  <select
                    value={fitnessForm.category}
                    onChange={(e) => setFitnessForm({ ...fitnessForm, category: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {['スピード', '持久力', '技術・キック', 'アジリティ', '体格'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-xs font-black text-slate-700 block mb-1">種目名 *</label>
                  <input
                    type="text"
                    required
                    value={fitnessForm.eventName}
                    onChange={(e) => setFitnessForm({ ...fitnessForm, eventName: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-black text-emerald-800 block mb-1">記録数値 *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={fitnessForm.value}
                    onChange={(e) => setFitnessForm({ ...fitnessForm, value: e.target.value })}
                    placeholder="4.85"
                    className="w-full h-9 px-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-950"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-black text-slate-700 block mb-1">単位</label>
                  <input
                    type="text"
                    value={fitnessForm.unit}
                    onChange={(e) => setFitnessForm({ ...fitnessForm, unit: e.target.value })}
                    placeholder="秒 / 回 / cm"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">メモ</label>
                <input
                  type="text"
                  value={fitnessForm.notes}
                  onChange={(e) => setFitnessForm({ ...fitnessForm, notes: e.target.value })}
                  placeholder="例: 秋季フィジカル測定・追い風参考"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFitnessModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2 rounded-xl shadow"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== コーチ助言 追加・編集モーダル ==================== */}
      {isCoachModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editingCoachNote ? 'コーチ助言・リンクを編集' : '💬 コーチ助言・参考リンクを追加'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCoachModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCoachModal} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">カテゴリ</label>
                  <select
                    value={coachForm.category}
                    onChange={(e) => setCoachForm({ ...coachForm, category: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {COACH_CATEGORIES.filter((c) => c !== 'すべて').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 block mb-1">日付</label>
                  <input
                    type="date"
                    value={coachForm.dateIso}
                    onChange={(e) => setCoachForm({ ...coachForm, dateIso: e.target.value })}
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">タイトル *</label>
                <input
                  type="text"
                  required
                  value={coachForm.title}
                  onChange={(e) => setCoachForm({ ...coachForm, title: e.target.value })}
                  placeholder="例: パスを受ける前の首振りと半身の作り方"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">アドバイス本文・メモ</label>
                <textarea
                  rows={3}
                  value={coachForm.content}
                  onChange={(e) => setCoachForm({ ...coachForm, content: e.target.value })}
                  placeholder="コーチからの指導内容や試合の振り返りメモ"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-emerald-800 block mb-1">
                  🎯 意識するアクションポイント（1行に1項目）
                </label>
                <textarea
                  rows={2}
                  value={coachForm.actionItemsText}
                  onChange={(e) => setCoachForm({ ...coachForm, actionItemsText: e.target.value })}
                  placeholder={'味方が蹴る瞬間に首を振る\n利き足の前方にファーストタッチを置く'}
                  className="w-full p-2.5 bg-emerald-50/40 border border-emerald-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1 border-t border-slate-100">
                <label className="text-xs font-black text-slate-700 block">🔗 参考動画・URLリンク（任意）</label>
                <input
                  type="text"
                  value={coachForm.linkTitle}
                  onChange={(e) => setCoachForm({ ...coachForm, linkTitle: e.target.value })}
                  placeholder="リンク表示名（例: YouTube 解説動画）"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
                <input
                  type="url"
                  value={coachForm.linkUrl}
                  onChange={(e) => setCoachForm({ ...coachForm, linkUrl: e.target.value })}
                  placeholder="https://www.youtube.com/..."
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCoachModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2 rounded-xl shadow"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== 添付PDF/画像 原本プレビューモーダル ==================== */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900 truncate">
                  📄 {previewAttachment.title}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 truncate">
                  {previewAttachment.fileName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewAttachment.dataUrl}
                  download={previewAttachment.fileName || 'document'}
                  className="text-xs font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>保存</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-slate-100 flex items-center justify-center">
              {previewAttachment.mimeType === 'application/pdf' ? (
                <iframe
                  title={previewAttachment.title}
                  src={previewAttachment.dataUrl}
                  className="w-full h-[70vh] rounded-xl bg-white border border-slate-200"
                />
              ) : (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.title}
                  className="max-w-full max-h-[72vh] object-contain rounded-xl shadow"
                />
              )}
            </div>
          </div>
        </div>
      )}
      {/* ==================== テキスト貼り付け登録モーダル ==================== */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-gradient-to-r from-emerald-50/60 to-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <ClipboardPaste className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    テキスト貼り付け登録
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500">
                    LINE・メール・測定メモ等のテキストからAI要約または手動登録
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
              {/* カテゴリ選択タブ */}
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1.5">
                  登録先カテゴリ
                </label>
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setPasteTargetMode('venue');
                      setPasteError('');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition ${
                      pasteTargetMode === 'venue'
                        ? 'bg-white text-emerald-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>会場・駐車場</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasteTargetMode('fitness');
                      setPasteError('');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition ${
                      pasteTargetMode === 'fitness'
                        ? 'bg-white text-emerald-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    <span>体力測定</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasteTargetMode('coach');
                      setPasteError('');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition ${
                      pasteTargetMode === 'coach'
                        ? 'bg-white text-emerald-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                    <span>コーチ助言</span>
                  </button>
                </div>
              </div>

              {/* テキスト入力エリア */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black text-slate-700">
                    連絡文・メモを貼り付け
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPasteText(SAMPLE_PASTE_TEXTS[pasteTargetMode] || '')}
                      className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg transition"
                    >
                      💡 例文を挿入
                    </button>
                    {pasteText && (
                      <button
                        type="button"
                        onClick={() => setPasteText('')}
                        className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    if (pasteError) setPasteError('');
                  }}
                  placeholder={
                    pasteTargetMode === 'venue'
                      ? 'LINEの連絡文や案内メールをここにペースト...\n例:\n会場：〇〇グラウンド\n集合：8:30\n駐車場は各学年5台まで。第2駐車場を利用してください。\nスパイクでの舗装路歩行は禁止です。'
                      : pasteTargetMode === 'fitness'
                      ? '体力測定結果の連絡文やメモをここにペースト...\n例:\n春季体力測定\n30m走: 4.85秒\n50m走: 7.80秒\nシャトルラン: 85回\nリフティング: 250回'
                      : 'コーチからのメッセージや試合後のアドバイスをここにペースト...\n例:\n本日の試合の振り返り\nパスを受ける前に首を振って周囲を見ることを意識しましょう。\n利き足の前方にファーストタッチを置くこと。'
                  }
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition leading-relaxed"
                />
                <div className="text-right text-[10px] font-bold text-slate-400 mt-1">
                  {pasteText.length} 文字
                </div>
              </div>

              {pasteError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold px-3 py-2 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">{pasteError}</div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleTransferPasteToManual}
                disabled={!pasteText.trim()}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-black text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-40 transition"
              >
                ✍️ フォームに転記 (APIキー不要)
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  disabled={aiLoading || !pasteText.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60 text-white font-black text-xs px-4 py-2 rounded-xl shadow flex items-center justify-center gap-1.5 transition"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI解析中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>✨ AIで自動解析・登録</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 👨‍👩‍👦 家族一括LINE共有モーダル ==================== */}
      {isFamilyShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>👨‍👩‍👦 家族にまとめて共有</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFamilyShareModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 space-y-1">
              <div className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>1本の短縮URLで家族に一発同期</span>
              </div>
              <p className="text-[11px] font-bold text-emerald-800 leading-relaxed">
                共有したいデータを選択してLINEで送ると、相手がリンクを開くだけでカレンダーとチームノートに一括取り込まれます。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 block">共有に含めるデータ</label>
              <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                <label className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={shareOptions.includeSchedules}
                    onChange={(e) => setShareOptions({ ...shareOptions, includeSchedules: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-extrabold text-slate-800">📅 試合日程（直近〜未来の予定）</span>
                </label>
                <label className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={shareOptions.includeVenue}
                    onChange={(e) => setShareOptions({ ...shareOptions, includeVenue: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-extrabold text-slate-800">🏟️ 会場・駐車場ルール ({venueDocs.length}件)</span>
                </label>
                <label className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={shareOptions.includeFitness}
                    onChange={(e) => setShareOptions({ ...shareOptions, includeFitness: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-extrabold text-slate-800">⚡ 体力測定記録 ({fitnessRecords.length}件)</span>
                </label>
                <label className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={shareOptions.includeCoach}
                    onChange={(e) => setShareOptions({ ...shareOptions, includeCoach: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-extrabold text-slate-800">💬 コーチ助言・リンク ({coachNotes.length}件)</span>
                </label>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSendAllToLine}
                disabled={isGeneratingShortUrl || (!shareOptions.includeSchedules && !shareOptions.includeVenue && !shareOptions.includeFitness && !shareOptions.includeCoach)}
                className="w-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-black py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs disabled:opacity-60"
              >
                {isGeneratingShortUrl ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>短縮リンクを準備中...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>LINEで家族に送る</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyAllShareLink}
                disabled={isGeneratingShortUrl}
                className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold py-3 px-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition text-xs"
              >
                <Copy className="w-4 h-4" />
                <span>{shareCopyFeedback ? '✓ 共有リンクをコピーしました！' : '共有リンクをコピー'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

