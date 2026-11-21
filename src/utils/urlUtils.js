/**
 * URLサニタイズ & LINE共有ヘルパー
 */

/**
 * http: / https: プロトコルのみ許可し、javascript: や data: 等のXSSスキームを遮断する
 */
export function sanitizeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * スマホ / PC 判定して安全にLINE共有画面を開く
 */
export function openLineShare(message) {
  if (typeof window === 'undefined' || !message) return;
  const encoded = encodeURIComponent(String(message));
  const isMobile =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = `line://msg/text/${encoded}`;
  } else {
    window.open(`https://line.me/R/share?text=${encoded}`, '_blank', 'noopener,noreferrer');
  }
}
