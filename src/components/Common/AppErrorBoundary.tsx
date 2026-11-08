import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logRuntimeError } from '../../core/utils/runtimeErrorLog.ts';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    try {
      logRuntimeError({
        type: 'react_error_boundary',
        message: error?.message || 'React render error',
        stack: error?.stack || errorInfo?.componentStack || undefined,
      });
    } catch {
      // Safe guard
    }
  }

  handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      // Safe guard
    }
  };

  handleCopyDetails = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const text = [
      'Vyapar Books - Error Report',
      `Time: ${new Date().toISOString()}`,
      `Error: ${error?.name || 'Error'}: ${error?.message || 'Unknown error'}`,
      '\nStack:',
      error?.stack || 'No stack trace available',
      '\nComponent Stack:',
      errorInfo?.componentStack || 'No component stack available',
    ].join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.setState({ copied: true });
      setTimeout(() => {
        this.setState({ copied: false });
      }, 2000);
    } catch {
      // Safe guard
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, copied } = this.state;

      return (
        <div
          data-testid="app-error-boundary-fallback"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface text-on-surface overflow-y-auto"
        >
          <div className="w-full max-w-xl bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[28px]">warning</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
                  Vyapar Books
                </h1>
                <p className="text-xs text-on-surface-variant font-medium">
                  GST Billing, Accounting & POS
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-base sm:text-lg font-bold text-on-surface">
                Something went wrong
              </h2>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                An unexpected error occurred while rendering the application. You can reload the app
                or copy the error details to report the problem.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                data-testid="error-reload-btn"
                onClick={this.handleReload}
                className="px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs sm:text-sm hover:bg-primary-hover active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Reload App</span>
              </button>

              <button
                type="button"
                data-testid="error-copy-btn"
                onClick={this.handleCopyDetails}
                className="px-4 py-2.5 rounded-xl border border-outline-variant/50 hover:bg-surface-container-high text-on-surface font-semibold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied ? 'check' : 'content_copy'}
                </span>
                <span>{copied ? 'Copied!' : 'Copy Error Details'}</span>
              </button>
            </div>

            <details
              data-testid="error-details-collapsible"
              className="group border border-outline-variant/30 rounded-xl bg-surface-container-low/50 overflow-hidden text-xs"
            >
              <summary className="p-3 font-semibold text-on-surface-variant cursor-pointer select-none hover:text-on-surface flex items-center justify-between">
                <span>View error details & stack</span>
                <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-180">
                  expand_more
                </span>
              </summary>
              <div className="p-3 pt-0 border-t border-outline-variant/20 bg-surface-container-lowest font-mono text-[11px] text-rose-700 dark:text-rose-300 overflow-x-auto space-y-2 max-h-60">
                <p className="font-bold">{error?.toString() || 'Unknown Error'}</p>
                {error?.stack && (
                  <pre className="whitespace-pre-wrap text-[10px] text-on-surface-variant/80">
                    {error.stack}
                  </pre>
                )}
                {errorInfo?.componentStack && (
                  <pre className="whitespace-pre-wrap text-[10px] text-on-surface-variant/70 border-t border-outline-variant/20 pt-2">
                    {errorInfo.componentStack}
                  </pre>
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
