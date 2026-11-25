import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return (
    error?.name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const chunkError = isChunkLoadError(this.state.error);
    const compact = Boolean(this.props.compact);

    if (compact) {
      return (
        <div
          role="alert"
          className="bg-white rounded-3xl p-5 border border-rose-200 shadow-sm text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-900">
              {chunkError ? '画面の読み込みに失敗しました' : '表示中にエラーが発生しました'}
            </h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed">
              {chunkError
                ? 'アプリの更新または一時的な通信エラーの可能性があります。再読み込みをお試しください。'
                : '一時的な不具合が発生しました。再試行またはページを再読み込みしてください。'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            {!chunkError && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                再試行
              </button>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition inline-flex items-center gap-1.5 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>再読み込み</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className="min-h-screen bg-slate-100 flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-black text-slate-900">
              {chunkError ? 'ページの読み込みに失敗しました' : '予期しないエラーが発生しました'}
            </h1>
            <p className="text-xs font-bold text-slate-500 leading-relaxed">
              {chunkError
                ? '新しいバージョンが配信されたか、通信が不安定になっている可能性があります。下のボタンから再読み込みしてください。'
                : 'ご不便をおかけします。ページを再読み込みすると復旧する場合があります。'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-sm font-black shadow-md transition inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>ページを再読み込み</span>
          </button>
        </div>
      </div>
    );
  }
}
