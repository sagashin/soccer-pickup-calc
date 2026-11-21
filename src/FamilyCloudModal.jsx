import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Share2,
  Users,
  Copy,
  RefreshCw,
  X,
  Smartphone,
  KeyRound,
  LogOut,
  AlertCircle,
  Wand2,
} from 'lucide-react';
import {
  saveFamilyId,
  getSavedDeviceName,
  saveDeviceName,
  generateFamilyInviteUrl,
  validateFamilyId,
  generateRandomFamilyId,
  pullFromCloud,
  syncBidirectional,
} from './firebaseSync';
import { createLineShareUrl } from './scheduleStore';

export default function FamilyCloudModal({
  isOpen,
  onClose,
  familyId,
  onFamilyIdChanged,
  onManualSyncCompleted,
}) {
  const [inputFamilyId, setInputFamilyId] = useState(familyId || '');
  const [deviceName, setDeviceName] = useState(() => getSavedDeviceName());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('');
  const [syncError, setSyncError] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInputFamilyId(familyId || '');
      setSyncError('');
    }
  }, [isOpen, familyId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 家族合言葉を接続
  const handleConnect = async (e) => {
    e?.preventDefault?.();
    const check = validateFamilyId(inputFamilyId);
    if (!check.valid) {
      setSyncError(check.reason);
      return;
    }

    setIsSyncing(true);
    setSyncError('');
    setSyncFeedback('クラウドに接続中...');
    try {
      saveDeviceName(deviceName);
      const pullRes = await pullFromCloud(check.familyId);
      if (pullRes.success) {
        saveFamilyId(check.familyId);
        onFamilyIdChanged(check.familyId);
        setSyncFeedback('✨ 家族クラウドに接続しました！');
        onManualSyncCompleted?.(pullRes);
        setTimeout(() => setSyncFeedback(''), 4000);
      } else {
        setSyncFeedback('');
        setSyncError(pullRes.error || 'クラウドへの接続に失敗しました。しばらく経ってから再試行してください。');
      }
    } catch (err) {
      setSyncFeedback('');
      setSyncError(`接続エラー: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // 接続解除
  const handleDisconnect = () => {
    if (window.confirm('家族クラウドとの接続を解除しますか？\n（※端末内の予定データは消えません）')) {
      saveFamilyId('');
      onFamilyIdChanged('');
      setInputFamilyId('');
      setSyncFeedback('');
      setSyncError('');
    }
  };

  // 手動で今すぐ双方向同期（Pull & マージ → Push）
  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncError('');
    setSyncFeedback('クラウドと同期中...');
    try {
      const res = await syncBidirectional();
      if (res.success) {
        setSyncFeedback('✅ 最新データに同期完了！');
        onManualSyncCompleted?.(res);
        setTimeout(() => setSyncFeedback(''), 4000);
      } else {
        setSyncFeedback('');
        setSyncError(res.error || '同期に失敗しました。通信状況をご確認ください。');
      }
    } catch (err) {
      setSyncFeedback('');
      setSyncError(`同期エラー: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // LINEで招待
  const handleInviteViaLine = () => {
    const inviteUrl = generateFamilyInviteUrl(familyId);
    const lineUrl = createLineShareUrl(
      inviteUrl,
      `家族合言葉「${familyId}」のサッカー予定共有グループ`
    );
    window.location.href = lineUrl;
  };

  // 招待URLコピー
  const handleCopyInviteUrl = async () => {
    const inviteUrl = generateFamilyInviteUrl(familyId);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 3000);
    } catch {
      window.prompt('以下の招待URLをコピーしてください:', inviteUrl);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-cloud-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 id="family-cloud-modal-title" className="text-sm font-black text-slate-900 leading-tight">
                家族クラウド自動同期
              </h3>
              <p className="text-[10px] font-bold text-slate-500">
                LINEで送らなくても家族全員に自動反映
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* エラー表示 */}
        {syncError && (
          <div className="text-xs font-bold text-rose-800 bg-rose-50 py-2 px-3 rounded-xl border border-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{syncError}</span>
          </div>
        )}

        {/* 同期ステータス案内 */}
        {familyId ? (
          <div className="space-y-3.5">
            <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-teal-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>自動リアルタイム連携中</span>
                </span>
                <span className="text-[10px] font-extrabold text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-md">
                  Firestore接続済
                </span>
              </div>
              <div className="bg-white/80 rounded-xl p-2.5 border border-teal-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500">家族の合言葉</div>
                  <div className="text-sm font-black text-slate-900 tracking-wider">
                    {familyId}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-500">この端末のニックネーム</div>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => {
                      setDeviceName(e.target.value);
                      saveDeviceName(e.target.value);
                    }}
                    placeholder="例: パパのスマホ"
                    className="text-xs font-black text-slate-800 text-right bg-transparent border-b border-dashed border-teal-400 focus:outline-none max-w-[100px]"
                  />
                </div>
              </div>
              <p className="text-[10px] font-bold text-teal-800 leading-relaxed">
                🎉 お父さんや奥さんが予定・ノートを登録・削除すると、相手のスマホにも自動でパッと反映されます！
              </p>
            </div>

            {syncFeedback && (
              <div className="text-xs font-extrabold text-teal-700 text-center bg-teal-50 py-1.5 px-3 rounded-xl border border-teal-200">
                {syncFeedback}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleInviteViaLine}
                className="w-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-black py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs"
              >
                <Share2 className="w-4 h-4" />
                <span>LINEで家族に招待リンクを送る</span>
              </button>

              <button
                type="button"
                onClick={handleCopyInviteUrl}
                className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold py-2.5 px-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedInvite ? '✓ 招待URLをコピーしました！' : '招待URLをコピー'}</span>
              </button>

              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold py-2.5 px-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition text-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? '同期中...' : '今すぐ同期'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition text-xs font-bold"
                  title="接続を解除"
                  aria-label="接続を解除"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="space-y-3.5">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
              <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-600" />
                <span>家族の合言葉を決めましょう</span>
              </div>
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                ログイン不要！他のご家族と被らない「合言葉（4文字以上）」を決めるか自動生成するだけで、家族全員のスマホと自動でつながります。
              </p>
            </div>

            {syncFeedback && (
              <div className="text-xs font-extrabold text-teal-700 text-center bg-teal-50 py-1.5 px-3 rounded-xl border border-teal-200">
                {syncFeedback}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-black text-slate-700">
                  家族の合言葉（4〜64文字・スラッシュ不可）*
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setInputFamilyId(generateRandomFamilyId());
                    setSyncError('');
                  }}
                  className="text-[11px] font-extrabold text-teal-700 hover:text-teal-800 flex items-center gap-1 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>自動生成</span>
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="例: fam-8a2c91d0e4f2 / さとう家2026"
                  value={inputFamilyId}
                  onChange={(e) => {
                    setInputFamilyId(e.target.value);
                    if (syncError) setSyncError('');
                  }}
                  className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                ※セキュリティのため推測されにくい英数字（「自動生成」推奨）をおすすめします
              </span>
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 block mb-1">
                この端末の名前（ニックネーム）
              </label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="例: パパのスマホ / ママのiPhone"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSyncing || !inputFamilyId.trim()}
              className="w-full bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-black py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs disabled:opacity-50"
            >
              <Cloud className="w-4 h-4" />
              <span>{isSyncing ? '接続中...' : '家族クラウド同期を開始する'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
