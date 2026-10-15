export default async function handler(req, res) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const longUrl = req.query.url || (req.body && req.body.url);
  if (!longUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const tinyRes = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`
    );
    if (!tinyRes.ok) {
      throw new Error(`TinyURL responded with status ${tinyRes.status}`);
    }
    const shortUrl = await tinyRes.text();
    return res.status(200).json({ shortUrl: shortUrl.trim() });
  } catch (err) {
    console.error('Shorten error:', err);
    // 失敗した場合は元のURLを返却してフォールバック
    return res.status(200).json({ shortUrl: longUrl, fallback: true });
  }
}
