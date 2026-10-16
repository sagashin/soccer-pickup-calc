export default async function handler(req, res) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GETクエリまたはPOSTボディからlongUrlを取得
  let longUrl = req.query?.url;
  if (!longUrl && req.body) {
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        longUrl = parsed.url;
      } catch (_) {
        longUrl = req.body;
      }
    } else if (req.body.url) {
      longUrl = req.body.url;
    }
  }

  if (!longUrl || typeof longUrl !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // 1. da.gd API (Viglink等の中間リダイレクトを挟まず直接302転送されるため、LINE内ブラウザでの400エラーを完全回避)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const dagdRes = await fetch(
      `https://da.gd/s?url=${encodeURIComponent(longUrl)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (dagdRes.ok) {
      const shortUrl = (await dagdRes.text()).trim();
      if (shortUrl.startsWith('https://da.gd/')) {
        return res.status(200).json({ shortUrl });
      }
    }
  } catch (err) {
    console.warn('da.gd failed, trying fallback provider:', err?.message || err);
  }

  // 2. TinyURL API (フォールバック: URLが短い場合のみ使用し、Viglink経由の8KB制限400エラーを防止)
  if (longUrl.length <= 2500) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const tinyRes = await fetch(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (tinyRes.ok) {
        const shortUrl = (await tinyRes.text()).trim();
        if (shortUrl.startsWith('http')) {
          return res.status(200).json({ shortUrl });
        }
      }
    } catch (err) {
      console.warn('TinyURL failed:', err?.message || err);
    }
  }

  // どちらも失敗した場合は元のURLを返却してフォールバック
  return res.status(200).json({ shortUrl: longUrl, fallback: true });
}
