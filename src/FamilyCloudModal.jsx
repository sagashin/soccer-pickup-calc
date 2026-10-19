import React, { useState } from 'react';
import {
  Cloud,
  Share2,
  Users,
  Copy,
  CheckCircle2,
  RefreshCw,
  X,
  Smartphone,
  KeyRound,
  LogOut,
  Sparkles,
} from 'lucide-react';
import {
  getSavedFamilyId,
  saveFamilyId,
  getSavedDeviceName,
  saveDeviceName,
  generateFamilyInviteUrl,
  pushAllToCloud,
  pullFromCloud,
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
  const [copiedInvite, setCopiedInvite] = useState(false);

  if (!isOpen) return null;

  // 家族合言葉を接続
  const handleConnect = async (e) => {
    e?.preventDefault?.();
    const cleanId = inputFamilyId.trim().toLowerCase();
    if (!cleanId) {
      alert('家族の合言葉（英数字またはひらがな）を入力してください');
      return;
    }

    setIsSyncing(true);
    setSyncFeedback('クラウドに接続中...');
    try {
      saveFamilyId(cleanId);
      saveDeviceName(deviceName);
      onFamilyIdChanged(cleanId);

      // 初回接続時にクラウドデータを取得マージ、またはローカルデータをプッシュ
      const pullRes = await pullFromCloud(cleanId);
      if (pullRes.success) {
        setSyncFeedback('✨ 家族クラウドに接続しました！');
        onManualSyncCompleted?.(pullRes);
      } else {
        setSyncFeedback('☁️ クラウドへ接続完了');
      }
    } catch (err) {
      alert(`接続エラー: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(''), 4000);
    }
  };

  // 接続解除
  const handleDisconnect = () => {
    if (window.confirm('家族クラウドとの接続を解除しますか？\n（※端末内の予定データは消えません）')) {
      saveFamilyId('');
      onFamilyIdChanged('');
      setInputFamilyId('');
      setSyncFeedback('');
    }
  };

  // 手動で今すぐ同期
  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncFeedback('クラウドと同期中...');
    try {
      // まずローカルデータをクラウドに送信
      await pushAllToCloud();
      // 次に最新のクラウドデータを取得
      const res = await pullFromCloud();
      setSyncFeedback('✅ 最新データに同期完了！');
      onManualSyncCompleted?.(res);
    } catch (err) {
      setSyncFeedback(`⚠️ 同期エラー: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(''), 4000);
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
    } catch (_) {
      window.prompt('以下の招待URLをコピーしてください:', inviteUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
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
            className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 同期ステータス案内 */}
        {familyId ? (
          <div className="space-y-3.5">
            <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-teal-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>リアルタイム自動同期中</span>
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
                🎉 お父さんや奥さんが予定・ノートを登録すると、相手のスマホにも自動でパッと反映されます！
              </p>
            </div>

            {/* フィードバック表示 */}
            {syncFeedback && (
              <div className="text-xs font-extrabold text-teal-700 text-center bg-teal-50 py-1.5 px-3 rounded-xl border border-teal-200">
                {syncFeedback}
              </div>
            )}

            {/* アクションボタン群 */}
            <div className="space-y-2">
              {/* LINEで家族を招待 */}
              <button
                type="button"
                onClick={handleInviteViaLine}
                className="w-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-black py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs"
              >
                <Share2 className="w-4 h-4" />
                <span>LINEで家族に招待リンクを送る</span>
              </button>

              {/* 招待リンクコピー */}
              <button
                type="button"
                onClick={handleCopyInviteUrl}
                className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold py-2.5 px-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedInvite ? '✓ 招待URLをコピーしました！' : '招待URLをコピー'}</span>
              </button>

              <div className="pt-1 flex items-center gap-2">
                {/* 今すぐ手動同期 */}
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold py-2.5 px-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition text-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? '同期中...' : '今すぐ同期'}</span>
                </button>

                {/* 切断 */}
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition text-xs font-bold"
                  title="接続を解除"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 未接続フォーム */
          <form onSubmit={handleConnect} className="space-y-3.5">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
              <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-600" />
                <span>家族の合言葉を決めましょう</span>
              </div>
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                ログインやパスワードは不要！家族で共通の「合言葉（ファミリーID）」を決めるだけで、家族全員のスマホと自動でつながります。
              </p>
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 block mb-1">
                家族の合言葉（半角英数字やひらがな）*
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="例: sato-family / さとう家"
                  value={inputFamilyId}
                  onChange={(e) => setInputFamilyId(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                ※あとからLINEで送れる招待リンクからも家族を一発参加させられます
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

