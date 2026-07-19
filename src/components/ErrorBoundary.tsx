// Render-error containment: a throw anywhere in the workspace tree (e.g. a
// hand-edited .json that slips past parseBundle, a revoked file handle) shows
// this fallback instead of white-screening. The record lives in the folder's
// .json files, so a reload is always safe — that is the whole recovery story.
import { Component, type ReactNode } from 'react';
import { APP_NAME } from '../appMeta';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`${APP_NAME} render error:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg px-6">
        <div className="w-full max-w-[26rem] rounded-2xl border border-line bg-surface p-6 text-center shadow-[0_10px_40px_rgba(0,0,0,0.12)]">
          <h1 className="text-[1rem] font-extrabold">Something went wrong</h1>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-muted">
            {APP_NAME} hit an unexpected error. Your voyages are safe — the live record is the
            folder's .json files, and unsaved edits were at most a few keystrokes.
          </p>
          <p className="mt-3 break-words rounded-lg bg-rail px-3 py-2 font-mono text-[0.66rem] text-faint">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-cyan px-4 py-2 text-[0.78rem] font-semibold text-white hover:brightness-105"
          >
            Reload {APP_NAME}
          </button>
        </div>
      </div>
    );
  }
}
