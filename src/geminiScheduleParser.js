/**
 * Gemini API によるスケジュール画像の解析ユーティリティ
 */

export const GEMINI_API_KEY_STORAGE = 'soccer_pickup_gemini_api_key_v1';

// サンプルデータ（ユーザーが提供してくれた日程表画像の再現）
export const SAMPLE_SCHEDULE_EVENTS = [
  {
    id: 'sample-1',
    date: '10月10日',
    dateIso: '2026-10-10',
    title: '関東L vs ジェファ',
    category: '公式戦',
    time: '14:20',
    isKickoff: true,
    venue: 'つくばFC T-Field (茨城県つくば市)',
    rawText: '関東Lvsジェファ14:20ko@つくばTフィールド',
  },
  {
    id: 'sample-2',
    date: '10月10日',
    dateIso: '2026-10-10',
    title: '関東L vs 鹿島ノルテ',
    category: '公式戦',
    time: '10:30',
    isKickoff: true,
    venue: 'ひたちなか市総合運動公園 (茨城県ひたちなか市)',
    rawText: '関東L vs鹿島ノルテ 10:30ko @ひたちなか総合',
  },
  {
    id: 'sample-3',
    date: '10月11日',
    dateIso: '2026-10-11',
    title: '新人戦 vs ソルース',
    category: '新人戦',
    time: '10:00',
    isKickoff: true,
    venue: '羽生市中央公園 (埼玉県羽生市)',
    rawText: '新人戦vsソルース 10:00@羽生中央公園',
  },
  {
    id: 'sample-4',
    date: '10月11日',
    dateIso: '2026-10-11',
    title: '浦和美園 B',
    category: '練習試合',
    time: '14:00',
    isKickoff: false,
    venue: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
    rawText: '浦和美園 B 14:00',
  },
  {
    id: 'sample-5',
    date: '10月11日',
    dateIso: '2026-10-11',
    title: '浦和美園 A',
    category: '練習試合',
    time: '15:30',
    isKickoff: false,
    venue: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
    rawText: '浦和美園 A 15:30',
  },
  {
    id: 'sample-6',
    date: '10月12日',
    dateIso: '2026-10-12',
    title: 'クラ選 vs プロスペリダージ',
    category: 'クラブ選手権',
    time: '17:30',
    isKickoff: true,
    venue: '浦和東高校 (埼玉県さいたま市緑区)',
    rawText: 'クラ選vsプロスペリダージ 17:30ko@浦和東高校',
  },
  {
    id: 'sample-7',
    date: '10月12日',
    dateIso: '2026-10-12',
    title: '浦和美園',
    category: '練習/試合',
    time: '13:00',
    isKickoff: false,
    venue: 'J-foot浦和美園 (埼玉県さいたま市緑区)',
    rawText: '浦和美園 13:00',
  },
  {
    id: 'sample-8',
    date: '10月12日',
    dateIso: '2026-10-12',
    title: 'U10 アタドゥーラカップ',
    category: 'カップ戦',
    time: '',
    isKickoff: false,
    venue: '',
    rawText: 'U10アタドゥーラカップ',
  },
];

/**
 * ファイルオブジェクトをBase64文字列に変換（PDF対応 ＆ 画像は長辺1600px以内にクライアント圧縮）
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        return reject(new Error('ファイルのBase64変換に失敗しました'));
      }

      // PDFファイルの場合は画像リサイズ処理をスキップしてそのまま返す
      if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
        const base64Index = dataUrl.indexOf(',');
        return resolve({
          base64: base64Index !== -1 ? dataUrl.slice(base64Index + 1) : dataUrl,
          mimeType: 'application/pdf',
          previewUrl: dataUrl,
        });
      }

      // クライアントサイドでの画像リサイズ・軽量化（最大長辺 1600px, JPEG 0.85）
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDimension = 1600;
            let width = img.width;
            let height = img.height;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            const base64Index = compressedDataUrl.indexOf(',');
            if (base64Index !== -1) {
              return resolve({
                base64: compressedDataUrl.slice(base64Index + 1),
                mimeType: 'image/jpeg',
                previewUrl: compressedDataUrl,
              });
            }
          } catch (_) {}
          // Canvas失敗時はFileReaderの結果にフォールバック
          const base64Index = dataUrl.indexOf(',');
          resolve({
            base64: dataUrl.slice(base64Index + 1),
            mimeType: file.type || 'image/jpeg',
            previewUrl: dataUrl,
          });
        };
        img.onerror = () => {
          const base64Index = dataUrl.indexOf(',');
          resolve({
            base64: dataUrl.slice(base64Index + 1),
            mimeType: file.type || 'image/jpeg',
            previewUrl: dataUrl,
          });
        };
        img.src = dataUrl;
      } catch (_) {
        const base64Index = dataUrl.indexOf(',');
        resolve({
          base64: dataUrl.slice(base64Index + 1),
          mimeType: file.type || 'image/jpeg',
          previewUrl: dataUrl,
        });
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * キックオフ時刻から「○分前」の集合時刻を計算 (HH:mm)
 */
export function calculateMeetingTime(kickoffTimeStr, leadMinutes) {
  if (!kickoffTimeStr || !kickoffTimeStr.includes(':')) return kickoffTimeStr || '';
  const [hh, mm] = kickoffTimeStr.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return kickoffTimeStr;

  let totalMinutes = hh * 60 + mm - Number(leadMinutes || 0);
  while (totalMinutes < 0) totalMinutes += 24 * 60;
  totalMinutes = totalMinutes % (24 * 60);

  const outH = Math.floor(totalMinutes / 60);
  const outM = totalMinutes % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

/**
 * モデル名から世代バージョン番号を抽出（例: "gemini-3.8-flash" -> 3.8）
 */
function extractGeminiVersion(modelName) {
  const match = (modelName || '').match(/gemini-(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * 最新Geminiモデル（gemini-3.8-flash最優先）でマルチモーダルJSON生成を行う共通関数
 */
export async function generateGeminiJson({ prompt, base64Data, mimeType, apiKey }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const parts = [{ text: prompt }];
  if (base64Data) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: base64Data,
      },
    });
  }

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  const preferredOrder = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-pro-preview',
    'gemini-pro-latest',
    'gemini-2.5-flash', // 旧プロジェクト用の最終フォールバックのみ
  ];

  const excludedTokens = [
    'embedding',
    'imagen',
    'tts',
    'audio',
    'live',
    'robotics',
    'veo',
    'lyria',
    'aqa',
    'gemma',
    '1.5',
    '2.0',
  ];

  // 1. Google APIからこのAPIキーで実際に使えるモデル一覧を動的に取得
  let candidateModels = [];
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData.models)) {
        const available = listData.models
          .filter((m) => {
            if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
            const name = (m.name || '').toLowerCase();
            if (!name.includes('gemini')) return false;
            return !excludedTokens.some((token) => name.includes(token));
          })
          .map((m) => m.name.replace(/^models\//, ''));

        candidateModels = available.sort((a, b) => {
          const idxA = preferredOrder.indexOf(a);
          const idxB = preferredOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;

          // バージョン番号が大きい（新しい世代）順を優先
          const verA = extractGeminiVersion(a);
          const verB = extractGeminiVersion(b);
          if (verA !== verB) return verB - verA;

          // preview や exp が付くモデルは安定版の後ろに配置
          const aUnstable = a.includes('preview') || a.includes('exp') ? 1 : 0;
          const bUnstable = b.includes('preview') || b.includes('exp') ? 1 : 0;
          if (aUnstable !== bUnstable) return aUnstable - bUnstable;

          return 0;
        });
      }
    } else if (listRes.status === 400 || listRes.status === 401 || listRes.status === 403) {
      const errText = await listRes.text();
      if (errText.includes('API_KEY_INVALID') || errText.includes('API key not valid')) {
        throw new Error('Gemini APIキーが無効です。Google AI Studioでキーをご確認ください。');
      }
      throw new Error(`Gemini APIキー認証エラー (${listRes.status}): ${errText}`);
    }
  } catch (err) {
    if (err.message?.includes('Gemini APIキー')) {
      throw err;
    }
    console.warn('ListModels failed, falling back to static list:', err);
  }

  // ListModelsが失敗した場合のフォールバック配列
  if (candidateModels.length === 0) {
    candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];
  }

  let lastError = null;

  for (const model of candidateModels) {
    for (const apiVersion of ['v1beta', 'v1']) {
      try {
        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey.trim()
        )}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const errorText = await res.text();
          // 404 (指定バージョンでモデル不在/廃止) や非対応モダリティエラーの場合は次の候補へ即座にフォールバック
          if (
            res.status === 404 ||
            (res.status === 400 &&
              (errorText.includes('modality is not enabled') ||
                errorText.includes('not supported') ||
                errorText.includes('responseMimeType')))
          ) {
            continue;
          }
          // 429（レート制限）はリトライしても意味がないので即座に中断して通知
          if (res.status === 429) {
            throw new Error('Gemini APIの利用上限（レート制限）に達しました。1分ほど待ってから再試行してください。');
          }
          // キーそのものが無効な場合
          if (
            res.status === 400 &&
            (errorText.includes('API_KEY_INVALID') || errorText.includes('API key not valid'))
          ) {
            throw new Error('Gemini APIキーが無効です。Google AI Studioでキーをご確認ください。');
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error(`Gemini API認証エラー (${res.status}): APIキーをご確認ください。`);
          }
          throw new Error(`Gemini API エラー (${res.status}): ${errorText}`);
        }

        const data = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!candidateText) {
          throw new Error('Gemini APIからテキスト応答が得られませんでした。');
        }

        const cleanJsonStr = candidateText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        return JSON.parse(cleanJsonStr);
      } catch (err) {
        lastError = err;
        // 致命的エラー（キー不正やクォータ枯渇など）はモデルループを継続せず即座にスロー
        if (
          err.message?.includes('利用上限') ||
          err.message?.includes('APIキーが無効') ||
          err.message?.includes('認証エラー')
        ) {
          throw err;
        }
      }
    }
  }

  throw (
    lastError ||
    new Error('利用可能なGeminiモデルが見つかりませんでした。APIキーが有効かご確認ください。')
  );
}

/**
 * Gemini API でスケジュール画像・PDFを解析
 */
export async function parseScheduleImageWithGemini(base64Data, mimeType, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const currentYear = new Date().getFullYear();
  const prompt = `あなたはジュニアサッカー・ユースサッカーのスケジュール管理の専門家です。
提供されたスケジュール画像またはPDF（日程表、予定表、カレンダー形式の表など）を解析し、含まれている個々の予定・試合情報を構造化JSONで抽出してください。

【抽出ルール】
1. 各予定ごとに以下の項目を抽出してください：
   - date: 日付（例: "10月10日"）。画像に年があれば含め、なければ現在の年度（${currentYear}年想定）で日付を解釈。
   - dateIso: "YYYY-MM-DD" 形式（例: "${currentYear}-10-10"）。年が不明なら今年度を補完。
   - title: 試合名・対戦相手・活動名（例: "関東L vs ジェファ", "新人戦 vs ソルース", "クラ選 vs プロスペリダージ", "浦和美園 B"）
   - category: 予定の種類（"公式戦", "練習試合", "練習", "応援", "カップ戦", "OFF" など）
   - time: 開始時刻またはキックオフ時刻を "HH:mm" 形式（24時間表記）で抽出（例: "14:20", "10:00", "17:30"）。複数ある場合は分割するか主要な時間を1つ。時間が明記されていない場合は空文字。
   - isKickoff: "ko", "KO", "キックオフ" などの記載がある、または試合開始時刻であれば true、練習や集合時間そのものであれば false。
   - venue: 会場・グラウンド名。@の後の文字（例: "@つくばTフィールド", "@羽生中央公園", "@浦和東高校"）や、場所と思われる施設名。
     【重要: 会場名の自動補正ルール】
     サッカーの試合・遠征会場なので、略称や愛称は「病院」や「一般施設」ではなく、正式な「運動公園・サッカー場・グラウンド・学校名（都道府県・市区町村付き）」に賢く補正してください：
     ・"@西武台第2" または "西武台第2グラウンド" → "西武台高校 第2グラウンド (埼玉県新座市大和田)" (※学校本体と別場所にあるサッカー部専用グラウンド)
     ・"@ひたちなか総合" → "ひたちなか市総合運動公園 (茨城県ひたちなか市)" (※病院ではなく運動公園・スポーツ施設に補正)
     ・"@羽生中央公園" → "羽生市中央公園 (埼玉県羽生市)"
     ・"@つくばTフィールド" → "つくばFC T-Field (茨城県つくば市)"
     ・"浦和美園" → "J-foot浦和美園 (埼玉県さいたま市緑区)"
     ・"@駒沢" → "駒沢オリンピック公園総合運動場 (東京都世田谷区)"
     ・"@大井ふ頭" → "大井ふ頭中央海浜公園スポーツの森 (東京都品川区)"
     ・高校やクラブの「第2グラウンド」「専用グラウンド」は学校本体と所在地が異なる場合が多いため、判別できる場合は「〇〇高校 第2グラウンド (都道府県・市区町村)」のように住所・自治体を補完してください。
     場所が全く不明な場合のみ空文字。
   - rawText: 画像内の元のセルに書かれていたテキストそのまま。

2. "OFF" などの休み情報や、"関東リーグ応援" などの応援情報も含めて抽出してください。

3. 出力は必ず以下のJSONスキーマのオブジェクトとし、余計な説明文やMarkdown引用符（\`\`\`json）を含めず純粋なJSONで返してください。
{
  "events": [
    {
      "date": "10月10日",
      "dateIso": "${currentYear}-10-10",
      "title": "関東L vs ジェファ",
      "category": "公式戦",
      "time": "14:20",
      "isKickoff": true,
      "venue": "つくばFC T-Field (茨城県つくば市)",
      "rawText": "関東Lvsジェファ14:20ko@つくばTフィールド"
    }
  ]
}`;

  const parsed = await generateGeminiJson({
    prompt,
    base64Data,
    mimeType,
    apiKey,
  });

  const events = Array.isArray(parsed?.events) ? parsed.events : [];

  // 各イベントに一意のIDを付与
  return events.map((ev, idx) => ({
    ...ev,
    id: `ai-event-${Date.now()}-${idx}`,
  }));
}
